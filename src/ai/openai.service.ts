import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

type LlmProvider = 'groq' | 'openai';

function resolveLlmProvider(): LlmProvider {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === 'groq' || explicit === 'openai') {
    return explicit;
  }
  if (process.env.GROQ_API_KEY) {
    return 'groq';
  }
  return 'openai';
}

export class OpenAIService {
  /** Chat / JSON completions (Groq or OpenAI). */
  private readonly chatClient: OpenAI;
  /** TTS and image APIs — OpenAI only. */
  private readonly mediaClient: OpenAI | null;
  private readonly llmProvider: LlmProvider;
  private readonly model: string;
  private readonly ttsModel: string;
  private readonly imageModel: string;

  constructor() {
    const openaiKey = process.env.OPENAI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    this.llmProvider = resolveLlmProvider();

    if (this.llmProvider === 'groq') {
      if (!groqKey) {
        throw new Error('GROQ_API_KEY environment variable is required when LLM_PROVIDER=groq');
      }
      this.chatClient = new OpenAI({ apiKey: groqKey, baseURL: GROQ_BASE_URL });
      this.model = process.env.GROQ_MODEL ?? 'qwen/qwen3.6-27b';
    } else {
      if (!openaiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      this.chatClient = new OpenAI({ apiKey: openaiKey });
      this.model = process.env.OPENAI_MODEL ?? 'gpt-4o';
    }

    this.mediaClient = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;
    this.ttsModel = process.env.OPENAI_TTS_MODEL ?? 'tts-1';
    this.imageModel = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';
  }

  /**
   * Call the Chat Completions API with JSON mode and validate the response with a Zod-like validator.
   */
  async generateJSON<T>(
    userPrompt: string,
    systemPrompt: string,
    validator: (data: unknown) => T,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<T> {
    logger.info(`Calling ${this.llmProvider}/${this.model} for JSON generation...`);

    const defaultMaxTokens = this.llmProvider === 'groq' ? 4_096 : 16_384;
    const maxTokens = options?.maxTokens ?? defaultMaxTokens;

    let response;
    try {
      response = await this.chatClient.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: options?.temperature ?? 0.85,
        max_tokens: maxTokens,
      });
    } catch (error) {
      throw new Error(formatChatCompletionError(this.llmProvider, error));
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('LLM returned an empty response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`LLM returned invalid JSON: ${content.slice(0, 200)}`);
    }

    return validator(parsed);
  }

  /** Call the Chat Completions API and return plain text (no JSON mode). */
  async generateText(
    userPrompt: string,
    systemPrompt: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    logger.info(`Calling ${this.llmProvider}/${this.model} for text generation...`);

    const defaultMaxTokens = this.llmProvider === 'groq' ? 4_096 : 16_384;
    const maxTokens = options?.maxTokens ?? defaultMaxTokens;

    const response = await this.chatClient.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.7,
      max_tokens: maxTokens,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('LLM returned an empty response');
    }

    return content;
  }

  /**
   * Generate speech audio from text and save it as an MP3 file.
   */
  async generateSpeech(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    outputPath: string,
    speed = 0.85,
  ): Promise<void> {
    if (!this.mediaClient) {
      throw new Error('OPENAI_API_KEY is required for TTS (Groq does not support speech generation)');
    }

    const response = await this.mediaClient.audio.speech.create({
      model: this.ttsModel,
      voice,
      input: text,
      response_format: 'mp3',
      speed,
    });

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
  }

  /**
   * Generate an image using reference images for style/brand consistency.
   * Uses gpt-image-1 edit API with demo + brand asset references.
   */
  async generateImageEdit(
    prompt: string,
    referenceImages: Array<string | Buffer>,
    referenceNames?: string[],
    options?: { size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto' },
  ): Promise<Buffer> {
    if (!this.mediaClient) {
      throw new Error('OPENAI_API_KEY is required for image generation (Groq does not support images)');
    }

    logger.info(`Calling ${this.imageModel} for thumbnail generation...`);

    const images = await Promise.all(
      referenceImages.map(async (source, index) => {
        const buffer = Buffer.isBuffer(source) ? source : await fs.readFile(source);
        const filename =
          referenceNames?.[index] ??
          (Buffer.isBuffer(source) ? `reference-${index + 1}.png` : path.basename(source));
        return OpenAI.toFile(buffer, filename, { type: 'image/png' });
      }),
    );

    const response = await this.mediaClient.images.edit({
      model: this.imageModel,
      image: images.length === 1 ? images[0] : images,
      prompt,
      size: options?.size ?? '1536x1024',
      quality: 'high',
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('OpenAI returned no image data');
    }

    return Buffer.from(b64, 'base64');
  }
}

function formatChatCompletionError(provider: LlmProvider, error: unknown): string {
  if (error && typeof error === 'object') {
    const apiError = error as {
      message?: string;
      status?: number;
      error?: { message?: string; failed_generation?: string };
    };

    const failedGeneration = apiError.error?.failed_generation;
    const baseMessage = apiError.error?.message ?? apiError.message ?? String(error);

    if (failedGeneration) {
      return `${apiError.status ?? ''} ${baseMessage}\nfailed_generation: ${failedGeneration.slice(0, 500)}`.trim();
    }

    if (provider === 'groq' && apiError.status) {
      return `${apiError.status} ${baseMessage}`;
    }
  }

  return error instanceof Error ? error.message : String(error);
}

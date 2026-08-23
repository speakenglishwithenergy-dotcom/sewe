import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';
import {
  formatChatCompletionError,
  groqJsonModeExtras,
  isJsonValidateFailed,
} from './groq-json';
import {
  callWithQuotaFallback,
  isQuotaError,
  resolveChatBackends,
  type ChatBackendConfig,
} from './llm-providers';

const JSON_VALIDATE_ATTEMPTS = 3;

type ChatBackend = ChatBackendConfig & { client: OpenAI };

export class OpenAIService {
  /** Chat / JSON completions (Gemini → Groq → Cerebras, or a pinned provider). */
  private readonly backends: ChatBackend[];
  /** TTS and image APIs — OpenAI only. */
  private readonly mediaClient: OpenAI | null;
  private readonly ttsModel: string;
  private readonly imageModel: string;

  constructor() {
    this.backends = resolveChatBackends().map((config) => ({
      ...config,
      client: new OpenAI({
        apiKey: config.apiKey,
        ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      }),
    }));

    const openaiKey = process.env.OPENAI_API_KEY;
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
    return callWithQuotaFallback(
      this.backends,
      (backend) => this.completeJSON(backend, userPrompt, systemPrompt, validator, options),
      (from, to) => logger.warn(`${from} quota exceeded, falling back to ${to}`),
    );
  }

  /** Call the Chat Completions API and return plain text (no JSON mode). */
  async generateText(
    userPrompt: string,
    systemPrompt: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    return callWithQuotaFallback(
      this.backends,
      (backend) => this.completeText(backend, userPrompt, systemPrompt, options),
      (from, to) => logger.warn(`${from} quota exceeded, falling back to ${to}`),
    );
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
      throw new Error('OPENAI_API_KEY is required for TTS');
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
      throw new Error('OPENAI_API_KEY is required for image generation');
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

  private async completeJSON<T>(
    backend: ChatBackend,
    userPrompt: string,
    systemPrompt: string,
    validator: (data: unknown) => T,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<T> {
    logger.info(`Calling ${backend.name}/${backend.model} for JSON generation...`);

    const maxTokens = options?.maxTokens ?? backend.defaultMaxTokens;
    const groqExtras = backend.name === 'groq' ? groqJsonModeExtras(backend.model) : {};

    let response;
    let lastError: unknown;
    for (let attempt = 1; attempt <= JSON_VALIDATE_ATTEMPTS; attempt++) {
      try {
        response = await backend.client.chat.completions.create({
          model: backend.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: options?.temperature ?? 0.85,
          max_tokens: maxTokens,
          ...groqExtras,
        });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (isJsonValidateFailed(error) && attempt < JSON_VALIDATE_ATTEMPTS) {
          logger.warn(
            `${backend.name} JSON validation failed (attempt ${attempt}/${JSON_VALIDATE_ATTEMPTS}) — retrying...`,
          );
          continue;
        }
        throw wrapChatError(backend.name, error);
      }
    }
    if (!response) {
      throw wrapChatError(backend.name, lastError);
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

  private async completeText(
    backend: ChatBackend,
    userPrompt: string,
    systemPrompt: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    logger.info(`Calling ${backend.name}/${backend.model} for text generation...`);

    const maxTokens = options?.maxTokens ?? backend.defaultMaxTokens;

    let response;
    try {
      response = await backend.client.chat.completions.create({
        model: backend.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: options?.temperature ?? 0.7,
        max_tokens: maxTokens,
      });
    } catch (error) {
      throw wrapChatError(backend.name, error);
    }

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('LLM returned an empty response');
    }

    return content;
  }
}

function wrapChatError(provider: ChatBackend['name'], error: unknown): unknown {
  if (isQuotaError(error)) {
    return error;
  }
  return new Error(formatChatCompletionError(provider, error));
}

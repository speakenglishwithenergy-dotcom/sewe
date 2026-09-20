import OpenAI from 'openai';
import fs from 'fs/promises';
import { logger } from '../utils/logger';
import {
  formatChatCompletionError,
  groqJsonModeExtras,
  isJsonValidateFailed,
} from './groq-json';
import {
  callWithQuotaFallback,
  isQuotaError,
  isTransientError,
  resolveChatBackends,
  TRANSIENT_RETRY_ATTEMPTS,
  withTransientRetries,
  type ChatBackendConfig,
} from './llm-providers';

const JSON_VALIDATE_ATTEMPTS = 3;

type ChatBackend = ChatBackendConfig & { client: OpenAI };

export class OpenAIService {
  /** Chat / JSON completions (Gemini → Groq → Cerebras, or a pinned provider). */
  private readonly backends: ChatBackend[];
  /** Backend ids that hit quota during this process — skip on later calls. */
  private readonly quotaSkipped = new Set<string>();
  /** TTS — OpenAI only. */
  private readonly mediaClient: OpenAI | null;
  private readonly ttsModel: string;

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
      {
        skipped: this.quotaSkipped,
        onFallback: (from, to, reason) => logger.warn(fallbackMessage(from, to, reason)),
      },
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
      {
        skipped: this.quotaSkipped,
        onFallback: (from, to, reason) => logger.warn(fallbackMessage(from, to, reason)),
      },
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

  private async completeJSON<T>(
    backend: ChatBackend,
    userPrompt: string,
    systemPrompt: string,
    validator: (data: unknown) => T,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<T> {
    logger.info(`Calling ${backend.id}/${backend.model} for JSON generation...`);

    const maxTokens = options?.maxTokens ?? backend.defaultMaxTokens;
    const jsonExtras =
      backend.name === 'groq' || backend.name === 'cerebras'
        ? groqJsonModeExtras(backend.model)
        : {};

    let response;
    let lastError: unknown;
    for (let attempt = 1; attempt <= JSON_VALIDATE_ATTEMPTS; attempt++) {
      try {
        response = await withTransientRetries(
          () =>
            backend.client.chat.completions.create({
              model: backend.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              response_format: { type: 'json_object' },
              temperature: options?.temperature ?? 0.85,
              max_tokens: maxTokens,
              ...jsonExtras,
            }),
          {
            onRetry: (retry, delayMs, error) =>
              logger.warn(
                `${backend.id} ${formatChatCompletionError(backend.name, error)} — retry ${retry}/${TRANSIENT_RETRY_ATTEMPTS} in ${delayMs / 1000}s`,
              ),
          },
        );
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (isJsonValidateFailed(error) && attempt < JSON_VALIDATE_ATTEMPTS) {
          logger.warn(
            `${backend.id} JSON validation failed (attempt ${attempt}/${JSON_VALIDATE_ATTEMPTS}) — retrying...`,
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
    logger.info(`Calling ${backend.id}/${backend.model} for text generation...`);

    const maxTokens = options?.maxTokens ?? backend.defaultMaxTokens;

    let response;
    try {
      response = await withTransientRetries(
        () =>
          backend.client.chat.completions.create({
            model: backend.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: options?.temperature ?? 0.7,
            max_tokens: maxTokens,
          }),
        {
          onRetry: (retry, delayMs, error) =>
            logger.warn(
              `${backend.id} ${formatChatCompletionError(backend.name, error)} — retry ${retry}/${TRANSIENT_RETRY_ATTEMPTS} in ${delayMs / 1000}s`,
            ),
        },
      );
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
  if (isQuotaError(error) || isTransientError(error)) {
    return error;
  }
  return new Error(formatChatCompletionError(provider, error));
}

function fallbackMessage(from: string, to: string, reason: 'quota' | 'transient'): string {
  return reason === 'quota'
    ? `${from} quota exceeded, falling back to ${to}`
    : `${from} unavailable, falling back to ${to}`;
}

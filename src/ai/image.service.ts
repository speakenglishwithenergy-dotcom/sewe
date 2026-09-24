import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { Blob } from 'buffer';
import {
  cloudflareImageModel,
  resolveCloudflareAccounts,
  resolveImageProvider,
  type CloudflareAccount,
  type ImageProvider,
  type ImageProviderConfig,
} from './image-providers';
import { isQuotaError } from './llm-providers';
import { logger } from '../utils/logger';

export type ImageAspectRatio = '16:9' | '9:16' | '1:1' | '3:2' | '2:3';

export type ImageEditOptions = {
  /** OpenAI gpt-image size. Ignored by Gemini/Cloudflare (uses aspectRatio). */
  size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
  /** Native aspect ratio for Gemini / Cloudflare. Defaults from size when omitted. */
  aspectRatio?: ImageAspectRatio;
};

type GeminiInlinePart = {
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

/**
 * Thumbnail / background image generation with a pinned provider.
 * Thumbnails use text→image (no reference); channel logo is composited afterward.
 * No cross-provider fallback — set IMAGE_PROVIDER to choose explicitly.
 * Config resolves lazily so manual thumbnail mode can skip API keys.
 * Cloudflare: multiple ACCOUNT_ID/TOKEN pairs rotate on daily neuron quota exhaustion.
 */
export class ImageService {
  private resolved: ImageProviderConfig | null = null;
  private openaiClient: OpenAI | null = null;
  private readonly env: Record<string, string | undefined>;
  /** Cloudflare account ids that hit daily free allocation — skipped for rest of process. */
  private readonly cloudflareQuotaSkipped = new Set<string>();

  constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
  }

  get provider(): ImageProvider {
    return this.config.provider;
  }

  get model(): string {
    return this.config.model;
  }

  private get config(): ImageProviderConfig {
    if (!this.resolved) {
      this.resolved = resolveImageProvider(this.env);
      if (this.resolved.provider === 'openai') {
        this.openaiClient = new OpenAI({ apiKey: this.resolved.apiKey });
      }
    }
    return this.resolved;
  }

  /**
   * Text-to-image generation (no reference). Prefer this for thumbnails —
   * channel logo is composited afterward from assets.logo.
   */
  async generateImage(prompt: string, options?: ImageEditOptions): Promise<Buffer> {
    if (this.config.provider === 'gemini') {
      return this.generateWithGemini(prompt, [], options);
    }
    if (this.config.provider === 'cloudflare') {
      return this.generateWithCloudflare(prompt, [], options);
    }
    return this.generateWithOpenAIText(prompt, options);
  }

  /**
   * @deprecated Prefer generateImage + logo composite. Kept for callers that still pass refs.
   */
  async generateImageEdit(
    prompt: string,
    referenceImages: Array<string | Buffer>,
    referenceNames?: string[],
    options?: ImageEditOptions,
  ): Promise<Buffer> {
    if (this.config.provider === 'gemini') {
      return this.generateWithGemini(prompt, referenceImages, options);
    }
    if (this.config.provider === 'cloudflare') {
      return this.generateWithCloudflare(prompt, referenceImages, options);
    }
    if (referenceImages.length === 0) {
      return this.generateWithOpenAIText(prompt, options);
    }
    return this.generateWithOpenAIEdit(prompt, referenceImages, referenceNames, options);
  }

  private async generateWithOpenAIText(
    prompt: string,
    options?: ImageEditOptions,
  ): Promise<Buffer> {
    if (!this.openaiClient) {
      throw new Error('OPENAI_API_KEY is required for image generation');
    }

    logger.info(`Calling ${this.config.model} (openai text→image)...`);

    const response = await this.openaiClient.images.generate({
      model: this.config.model,
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

  private async generateWithOpenAIEdit(
    prompt: string,
    referenceImages: Array<string | Buffer>,
    referenceNames: string[] | undefined,
    options?: ImageEditOptions,
  ): Promise<Buffer> {
    if (!this.openaiClient) {
      throw new Error('OPENAI_API_KEY is required for image generation');
    }

    logger.info(`Calling ${this.config.model} (openai image edit)...`);

    const images = await Promise.all(
      referenceImages.map(async (source, index) => {
        const buffer = Buffer.isBuffer(source) ? source : await fs.readFile(source);
        const filename =
          referenceNames?.[index] ??
          (Buffer.isBuffer(source) ? `reference-${index + 1}.png` : path.basename(source));
        return OpenAI.toFile(buffer, filename, { type: 'image/png' });
      }),
    );

    const response = await this.openaiClient.images.edit({
      model: this.config.model,
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

  private async generateWithGemini(
    prompt: string,
    referenceImages: Array<string | Buffer>,
    options?: ImageEditOptions,
  ): Promise<Buffer> {
    const aspectRatio =
      options?.aspectRatio ?? aspectRatioFromSize(options?.size) ?? '16:9';

    logger.info(
      `Calling ${this.config.model} (gemini, ${aspectRatio}${referenceImages.length ? ', with refs' : ', text→image'})...`,
    );

    const parts: Array<Record<string, unknown>> = [];
    for (const source of referenceImages) {
      const buffer = Buffer.isBuffer(source) ? source : await fs.readFile(source);
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: buffer.toString('base64'),
        },
      });
    }
    parts.push({ text: prompt });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.config.model)}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio },
        },
      }),
    });

    const body = (await response.json()) as {
      error?: { message?: string; status?: string; code?: number };
      candidates?: Array<{ content?: { parts?: GeminiInlinePart[] } }>;
    };

    if (!response.ok) {
      const message = body.error?.message ?? response.statusText;
      const status = body.error?.status ?? '';
      const isQuota =
        response.status === 429 ||
        status === 'RESOURCE_EXHAUSTED' ||
        /quota|rate limit|resource exhausted/i.test(message);
      const err = new Error(
        isQuota
          ? `Gemini image generation failed — out of tokens/quota (no fallback): ${message}`
          : `Gemini image generation failed: ${message}`,
      ) as Error & { status?: number; code?: string };
      err.status = response.status;
      err.code = body.error?.status;
      throw err;
    }

    const responseParts = body.candidates?.[0]?.content?.parts ?? [];
    for (const part of responseParts) {
      const data = part.inlineData?.data ?? part.inline_data?.data;
      if (data) {
        return Buffer.from(data, 'base64');
      }
    }

    throw new Error('Gemini returned no image data');
  }

  private async generateWithCloudflare(
    prompt: string,
    referenceImages: Array<string | Buffer>,
    options?: ImageEditOptions,
  ): Promise<Buffer> {
    const accounts = resolveCloudflareAccounts(this.env);
    if (accounts.length === 0) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID is required for Cloudflare image generation');
    }

    const aspectRatio =
      options?.aspectRatio ?? aspectRatioFromSize(options?.size) ?? '16:9';
    const { width, height } = dimensionsForAspect(aspectRatio);
    const model = cloudflareImageModel(this.env);

    const usable = accounts.filter((a) => !this.cloudflareQuotaSkipped.has(a.id));
    const queue = usable.length > 0 ? usable : accounts; // if all skipped, retry all once
    if (usable.length === 0) {
      this.cloudflareQuotaSkipped.clear();
    }

    let lastError: Error | undefined;
    for (let i = 0; i < queue.length; i++) {
      const account = queue[i]!;
      try {
        logger.info(
          `Calling ${model} (cloudflare ${account.id}, ${width}x${height}) for image generation...`,
        );
        const form = await this.buildCloudflareForm(prompt, referenceImages, width, height);
        return await this.runCloudflareRequest(account, model, form);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (isQuotaError(error) && i < queue.length - 1) {
          this.cloudflareQuotaSkipped.add(account.id);
          const next = queue[i + 1]!;
          logger.warn(
            `${account.id} daily allocation exhausted, falling back to ${next.id}`,
          );
          continue;
        }
        throw lastError;
      }
    }

    throw lastError ?? new Error('Cloudflare image generation failed');
  }

  private async buildCloudflareForm(
    prompt: string,
    referenceImages: Array<string | Buffer>,
    width: number,
    height: number,
  ): Promise<FormData> {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('width', String(width));
    form.append('height', String(height));
    form.append('steps', '25');

    for (let i = 0; i < Math.min(referenceImages.length, 4); i++) {
      const source = referenceImages[i];
      const buffer = Buffer.isBuffer(source) ? source : await fs.readFile(source);
      form.append(
        `input_image_${i}`,
        new Blob([new Uint8Array(buffer)], { type: 'image/png' }),
        `reference-${i + 1}.png`,
      );
    }
    return form;
  }

  private async runCloudflareRequest(
    account: CloudflareAccount,
    model: string,
    form: FormData,
  ): Promise<Buffer> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/${model}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.apiKey}` },
      body: form,
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('image/')) {
      return Buffer.from(await response.arrayBuffer());
    }

    const body = (await response.json()) as {
      success?: boolean;
      errors?: Array<{ message?: string; code?: number }>;
      result?: { image?: string } | string;
    };

    if (!response.ok || body.success === false) {
      const message = body.errors?.[0]?.message ?? response.statusText;
      const err = new Error(`Cloudflare image generation failed: ${message}`) as Error & {
        status?: number;
        code?: string;
      };
      err.status = response.status;
      throw err;
    }

    const imageB64 =
      typeof body.result === 'string'
        ? body.result
        : typeof body.result === 'object' && body.result
          ? body.result.image
          : undefined;

    if (!imageB64) {
      throw new Error('Cloudflare returned no image data');
    }

    return Buffer.from(imageB64, 'base64');
  }
}

function aspectRatioFromSize(
  size: ImageEditOptions['size'] | undefined,
): ImageAspectRatio | undefined {
  if (size === '1024x1536') return '9:16';
  if (size === '1536x1024') return '16:9';
  if (size === '1024x1024') return '1:1';
  return undefined;
}

function dimensionsForAspect(aspectRatio: ImageAspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 720, height: 1280 };
    case '1:1':
      return { width: 1024, height: 1024 };
    case '3:2':
      return { width: 1536, height: 1024 };
    case '2:3':
      return { width: 1024, height: 1536 };
    case '16:9':
    default:
      return { width: 1280, height: 720 };
  }
}

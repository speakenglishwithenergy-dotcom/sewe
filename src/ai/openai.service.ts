import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';

export class OpenAIService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly ttsModel: string;
  private readonly imageModel: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL ?? 'gpt-4o';
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
    options?: { temperature?: number },
  ): Promise<T> {
    logger.info(`Calling ${this.model} for JSON generation...`);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: options?.temperature ?? 0.85,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned an empty response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`OpenAI returned invalid JSON: ${content.slice(0, 200)}`);
    }

    return validator(parsed);
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
    const response = await this.client.audio.speech.create({
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
  ): Promise<Buffer> {
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

    const response = await this.client.images.edit({
      model: this.imageModel,
      image: images.length === 1 ? images[0] : images,
      prompt,
      // gpt-image-1 only supports 3:2 landscape; reference is letterboxed to 16:9 center band
      size: '1536x1024',
      quality: 'high',
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('OpenAI returned no image data');
    }

    return Buffer.from(b64, 'base64');
  }
}

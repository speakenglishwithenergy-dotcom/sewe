import OpenAI from 'openai';
import fs from 'fs/promises';
import { logger } from '../utils/logger';

export class OpenAIService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly ttsModel: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL ?? 'gpt-4o';
    this.ttsModel = process.env.OPENAI_TTS_MODEL ?? 'tts-1';
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
}

import { OpenAIService } from './openai.service';
import { PodcastScript, PodcastScriptSchema } from '../types';
import { buildScriptPrompt } from '../prompts/script.prompt';
import { logger } from '../utils/logger';

export class ScriptService {
  constructor(private readonly openai: OpenAIService) {}

  async generate(topic: string): Promise<PodcastScript> {
    logger.info(`Generating podcast script for topic: "${topic}"`);

    const script = await this.openai.generateJSON(
      buildScriptPrompt(topic),
      'You are a professional podcast script writer. Respond only with valid JSON matching the requested structure exactly.',
      (data) => PodcastScriptSchema.parse(data),
    );

    logger.success(
      `Script ready — "${script.title}" (${script.script.length} dialogue lines)`,
    );

    return script;
  }
}

import { OpenAIService } from './openai.service';
import { PodcastScript, ShortScript, ShortScriptSchema } from '../types';
import { buildShortScriptPrompt } from '../prompts/short-script.prompt';
import { logger } from '../utils/logger';

export class ShortScriptService {
  constructor(private readonly openai: OpenAIService) {}

  async generate(podcastScript: PodcastScript, topic: string): Promise<ShortScript> {
    logger.info(`Generating short script from podcast: "${podcastScript.title}"`);

    const script = await this.openai.generateJSON(
      buildShortScriptPrompt(podcastScript, topic),
      'You are a professional short-form video script writer who creates punchy, logical mini-conversations — never podcast summaries. Respond only with valid JSON matching the requested structure exactly.',
      (data) => ShortScriptSchema.parse(data),
    );

    logger.success(
      `Short script ready — "${script.title}" (${script.script.length} dialogue lines)`,
    );

    return script;
  }
}

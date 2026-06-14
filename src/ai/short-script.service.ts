import { OpenAIService } from './openai.service';
import { PodcastScript, ShortScript, ShortScriptSchema } from '../types';
import {
  buildShortScriptPrompt,
  buildShortScriptReviewPrompt,
} from '../prompts/short-script.prompt';
import { logger } from '../utils/logger';

export class ShortScriptService {
  constructor(private readonly openai: OpenAIService) {}

  async generate(podcastScript: PodcastScript, topic: string): Promise<ShortScript> {
    logger.info(`Generating short script from podcast: "${podcastScript.title}"`);

    const draft = await this.openai.generateJSON(
      buildShortScriptPrompt(podcastScript, topic),
      'You are a professional short-form video script writer who creates cohesive self-help Shorts: Victor opens with one short punchy hook (6–12 words), Lisa narrates the rest — never podcast summaries or back-and-forth dialogue. Respond only with valid JSON matching the requested structure exactly.',
      (data) => ShortScriptSchema.parse(data),
    );

    logger.info('Reviewing short script for flow, pacing, and natural spoken rhythm…');

    const script = await this.openai.generateJSON(
      buildShortScriptReviewPrompt(draft, topic),
      'You are a senior short-form script editor. Revise the draft for natural flow, connected beats, and a gradual close — not a rushed ending. Respond only with valid JSON matching the requested structure exactly.',
      (data) => ShortScriptSchema.parse(data),
    );

    logger.success(
      `Short script ready — "${script.title}" (${script.script.length} beats)`,
    );

    return script;
  }
}

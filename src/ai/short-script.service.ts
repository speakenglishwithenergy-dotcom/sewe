import { OpenAIService } from './openai.service';
import { ChannelContext } from '../channel/channel.types';
import { asSpeakerTuple, buildShortScriptSchema, PodcastScript, ShortScript } from '../types';
import {
  buildShortScriptPrompt,
  buildShortScriptReviewPrompt,
} from '../prompts/short-script.prompt';
import { logger } from '../utils/logger';

export class ShortScriptService {
  private readonly speakers: [string, ...string[]];

  constructor(
    private readonly openai: OpenAIService,
    private readonly ctx: ChannelContext,
  ) {
    this.speakers = asSpeakerTuple(ctx.speakers);
  }

  async generate(podcastScript: PodcastScript, topic: string): Promise<ShortScript> {
    const { minLines, maxLines } = this.ctx.config.short;
    const schema = buildShortScriptSchema(this.speakers, minLines, maxLines);

    logger.info(`Generating short script from podcast: "${podcastScript.title}"`);

    const draft = await this.openai.generateJSON(
      buildShortScriptPrompt(this.ctx, podcastScript, topic),
      'You are a professional short-form video script writer. Respond only with valid JSON matching the requested structure exactly.',
      (data) => schema.parse(data),
    );

    logger.info('Reviewing short script for flow, pacing, and natural spoken rhythm…');

    const script = await this.openai.generateJSON(
      buildShortScriptReviewPrompt(this.ctx, draft, topic),
      'You are a senior short-form script editor. Revise the draft for natural flow. Respond only with valid JSON matching the requested structure exactly.',
      (data) => schema.parse(data),
    );

    logger.success(
      `Short script ready — "${script.title}" (${script.script.length} beats)`,
    );

    return script;
  }
}

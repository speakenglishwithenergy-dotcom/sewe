import { OpenAIService } from './openai.service';
import { ChannelContext } from '../channel/channel.types';
import { asSpeakerTuple, buildShortScriptSchema, PodcastScript, ShortScript } from '../types';
import {
  buildShortScriptPrompt,
  buildShortScriptReviewPrompt,
} from '../prompts/short-script.prompt';
import { logger } from '../utils/logger';

const MAX_ATTEMPTS = 3;
const SYSTEM_PROMPT =
  'You are a professional short-form video script writer. Respond only with valid JSON matching the requested structure exactly.';
const REVIEW_SYSTEM_PROMPT =
  'You are a senior short-form script editor. Revise the draft for natural flow. Respond only with valid JSON matching the requested structure exactly.';

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

    const draft = await this.generateWithRetries(
      (tooFewLines) => buildShortScriptPrompt(this.ctx, podcastScript, topic, tooFewLines),
      schema,
      minLines,
      SYSTEM_PROMPT,
      'Short script draft',
    );

    logger.info('Reviewing short script for flow, pacing, and natural spoken rhythm…');

    const script = await this.generateWithRetries(
      (tooFewLines) => buildShortScriptReviewPrompt(this.ctx, draft, topic, tooFewLines),
      schema,
      minLines,
      REVIEW_SYSTEM_PROMPT,
      'Short script review',
    );

    logger.success(
      `Short script ready — "${script.title}" (${script.script.length} beats)`,
    );

    return script;
  }

  private async generateWithRetries(
    buildPrompt: (tooFewLines?: number) => string,
    schema: ReturnType<typeof buildShortScriptSchema>,
    minLines: number,
    systemPrompt: string,
    label: string,
  ): Promise<ShortScript> {
    let tooFewLines: number | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const raw = await this.openai.generateJSON(
        buildPrompt(tooFewLines),
        systemPrompt,
        (data) => data,
      );

      const result = schema.safeParse(raw);
      if (result.success) {
        return result.data;
      }

      const lineCount = countScriptLines(raw);
      if (lineCount < minLines && attempt < MAX_ATTEMPTS) {
        tooFewLines = lineCount;
        logger.warn(
          `${label} too short: ${lineCount}/${minLines} beats — retry ${attempt}/${MAX_ATTEMPTS}`,
        );
        continue;
      }

      throw result.error;
    }

    throw new Error(`${label} failed after ${MAX_ATTEMPTS} attempts`);
  }
}

function countScriptLines(data: unknown): number {
  if (!data || typeof data !== 'object' || !('script' in data)) {
    return 0;
  }

  const script = (data as { script?: unknown }).script;
  return Array.isArray(script) ? script.length : 0;
}

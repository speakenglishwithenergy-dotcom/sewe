import { z } from 'zod';
import { OpenAIService } from '../ai/openai.service';
import {
  asSpeakerTuple,
  buildPodcastScriptSchema,
  DialogueLine,
  DialogueLineSchema,
  PodcastScript,
} from '../types';
import {
  buildShadowingScriptPrompt,
  SHADOWING_SCRIPT_SYSTEM_PROMPT,
} from '../prompts/shadowing/shadowing-script.prompt';
import {
  buildShadowingReviewPrompt,
  SHADOWING_REVIEW_SYSTEM_PROMPT,
} from '../prompts/shadowing/shadowing-review.prompt';
import { logger } from '../utils/logger';
import { parseShadowingReview } from './shadowing-review.util';
import { splitDraftIntoLines, titleFromDraft } from './shadowing-split.util';

const ShadowingScriptResponseSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  script: z.array(DialogueLineSchema).min(1),
});

export class ShadowingScriptService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly speakerName: string,
  ) {}

  async generateReviewFromDraft(draft: string, titleOverride?: string): Promise<string> {
    const trimmed = draft.trim();
    if (!trimmed) {
      throw new Error('Draft is empty');
    }

    logger.info(`Draft → review markdown (${this.speakerName} monologue)...`);

    const markdown = await this.openai.generateText(
      buildShadowingReviewPrompt(trimmed, this.speakerName, titleOverride),
      SHADOWING_REVIEW_SYSTEM_PROMPT,
      { temperature: 0.7 },
    );

    logger.success('Review markdown ready — edit script.md before continuing');
    return markdown;
  }

  async generateFromReview(reviewMarkdown: string, titleOverride?: string): Promise<PodcastScript> {
    const parsed = parseShadowingReview(reviewMarkdown);
    const title = titleOverride ?? parsed.title;
    return this.generateFromDraft(parsed.script, title);
  }

  async generateFromDraft(draft: string, titleOverride?: string): Promise<PodcastScript> {
    const trimmed = draft.trim();
    if (!trimmed) {
      throw new Error('Draft is empty');
    }

    logger.info(`Formatting into shadowing script (${this.speakerName} only)...`);

    try {
      const script = await this.generateViaLlm(trimmed);
      this.assertSingleSpeaker(script.script);

      if (titleOverride) {
        script.title = titleOverride;
        script.description = titleOverride;
      }

      logger.success(
        `Script ready (LLM) — "${script.title}" (${script.script.length} lines)`,
      );
      return script;
    } catch (error) {
      logger.warn(
        `LLM rewrite failed (${error instanceof Error ? error.message : error}) — falling back to deterministic split`,
      );
      return this.generateViaSplit(trimmed, titleOverride);
    }
  }

  private async generateViaLlm(draft: string): Promise<PodcastScript> {
    const speakers = asSpeakerTuple([this.speakerName]);
    const schema = buildPodcastScriptSchema(speakers, 1);

    const result = await this.openai.generateJSON(
      buildShadowingScriptPrompt(draft, this.speakerName),
      SHADOWING_SCRIPT_SYSTEM_PROMPT,
      (data) => {
        const parsed = ShadowingScriptResponseSchema.parse(data);
        return schema.parse({
          ...parsed,
          description: parsed.description ?? parsed.title,
          thumbnailText: parsed.title.slice(0, 40).toUpperCase(),
        });
      },
      { temperature: 0.7 },
    );

    return result;
  }

  private generateViaSplit(draft: string, titleOverride?: string): PodcastScript {
    const script = splitDraftIntoLines(draft, this.speakerName);
    const title = titleOverride ?? titleFromDraft(draft);
    const result: PodcastScript = {
      title,
      description: title,
      thumbnailText: title.slice(0, 40).toUpperCase(),
      script,
    };

    logger.success(
      `Script ready (split) — "${result.title}" (${result.script.length} lines)`,
    );
    return result;
  }

  private assertSingleSpeaker(lines: DialogueLine[]): void {
    for (const line of lines) {
      if (line.speaker !== this.speakerName) {
        throw new Error(
          `Unexpected speaker "${line.speaker}" — only ${this.speakerName} is allowed`,
        );
      }
    }
  }
}

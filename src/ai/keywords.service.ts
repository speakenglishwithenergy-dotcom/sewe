import { z } from 'zod';
import { OpenAIService } from './openai.service';
import { DialogueLine } from '../types';
import {
  buildKeywordsBoostPrompt,
  buildKeywordsPrompt,
  KeywordsPromptContext,
} from '../prompts/keywords.prompt';
import {
  applyAlwaysHighlightPhrases,
  boostKeywordsLocally,
  dedupeKeywords,
  extractTopicTerms,
  keywordAppearsInText,
  MAX_KEYWORDS_PER_LINE,
  needsKeywordBoost,
  shouldAttemptGapFill,
} from './keywords.util';
import { logger } from '../utils/logger';

/** Bump when selection logic changes — triggers automatic re-generation on resume. */
export const KEYWORDS_GENERATOR_VERSION = 5;

const KeywordsBatchSchema = z.object({
  lines: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      keywords: z.array(z.string().min(1)).max(MAX_KEYWORDS_PER_LINE),
    }),
  ),
});

const BATCH_SIZE = 25;

export interface KeywordEnrichmentContext {
  topic: string;
  title: string;
}

export class KeywordsService {
  constructor(private readonly openai: OpenAIService) {}

  needsEnrichment(script: DialogueLine[], keywordsVersion?: number): boolean {
    if (keywordsVersion !== KEYWORDS_GENERATOR_VERSION) {
      return true;
    }
    return script.some((line) => line.keywords === undefined);
  }

  /** Fill keyword highlights on dialogue lines (mutates and returns the array). */
  async enrichScript(
    script: DialogueLine[],
    context: KeywordEnrichmentContext,
    regenerateAll = false,
  ): Promise<DialogueLine[]> {
    const topicTerms = extractTopicTerms(context.topic, context.title);
    const promptContext: KeywordsPromptContext = {
      ...context,
      topicTerms,
    };

    const batch = script
      .map((line, index) => ({ index, text: line.text, line }))
      .filter(({ line }) => regenerateAll || line.keywords === undefined);

    if (batch.length === 0) {
      return script;
    }

    logger.info(
      `Generating keyword highlights for ${batch.length} dialogue line(s) ` +
        `(topic: "${context.topic}")...`,
    );

    for (let offset = 0; offset < batch.length; offset += BATCH_SIZE) {
      const chunk = batch.slice(offset, offset + BATCH_SIZE);
      const keywordsByIndex = await this.generateBatch(
        chunk.map(({ index, text }) => ({ index, text })),
        promptContext,
      );

      for (const { index, text, line } of chunk) {
        const raw = keywordsByIndex.get(index) ?? [];
        line.keywords = finalizeKeywords(text, raw, topicTerms);
      }
    }

    await this.runBoostPass(script, promptContext, topicTerms);
    await this.runGapFillPass(script, promptContext, topicTerms);

    const withHighlights = script.filter((line) => (line.keywords?.length ?? 0) > 0).length;
    logger.success(
      `Keyword highlights ready (${withHighlights}/${script.length} lines with highlights)`,
    );
    return script;
  }

  private async runBoostPass(
    script: DialogueLine[],
    promptContext: KeywordsPromptContext,
    topicTerms: string[],
  ): Promise<void> {
    const sparse = script
      .map((line, index) => ({ index, text: line.text, line, current: line.keywords ?? [] }))
      .filter(({ text, current }) => needsKeywordBoost(text, current));

    if (sparse.length === 0) {
      return;
    }

    logger.info(`Boost pass for ${sparse.length} line(s) with too few highlights...`);

    for (let offset = 0; offset < sparse.length; offset += BATCH_SIZE) {
      const batch = sparse.slice(offset, offset + BATCH_SIZE);
      const boosted = await this.generateBoostBatch(
        batch.map(({ index, text, current }) => ({ index, text, current })),
        promptContext,
      );

      for (const { index, text, line, current } of batch) {
        const raw = boosted.get(index) ?? current;
        line.keywords = finalizeKeywords(text, raw, topicTerms);
      }
    }
  }

  private async runGapFillPass(
    script: DialogueLine[],
    promptContext: KeywordsPromptContext,
    topicTerms: string[],
  ): Promise<void> {
    const gapLines = script
      .map((line, index) => ({ index, text: line.text, line }))
      .filter(({ line, text }) => (line.keywords?.length ?? 0) === 0 && shouldAttemptGapFill(text));

    for (const { text, line } of gapLines) {
      line.keywords = finalizeKeywords(text, [], topicTerms);
    }

    if (gapLines.length > 0) {
      logger.info(`Local gap-fill applied to ${gapLines.length} line(s) still without highlights`);
    }
  }

  private async generateBatch(
    lines: { index: number; text: string }[],
    context: KeywordsPromptContext,
  ): Promise<Map<number, string[]>> {
    const result = await this.openai.generateJSON(
      buildKeywordsPrompt(lines, context),
      'You are an English teacher curating subtitle highlights for podcast learners. ' +
        'Be generous — aim for 2–4 useful highlights per substantive line. ' +
        'Only skip highlights for pure greetings or empty one-word reactions. ' +
        'Respond only with valid JSON matching the requested structure exactly.',
      (data) => KeywordsBatchSchema.parse(data),
      { temperature: 0.3 },
    );

    return this.mapBatchResult(result);
  }

  private async generateBoostBatch(
    lines: { index: number; text: string; current: string[] }[],
    context: KeywordsPromptContext,
  ): Promise<Map<number, string[]>> {
    const result = await this.openai.generateJSON(
      buildKeywordsBoostPrompt(lines, context),
      'You add more subtitle highlights for English learners. ' +
        'Return the full expanded keyword list (max 4). Be generous with topic words, idioms, and collocations. ' +
        'Respond only with valid JSON.',
      (data) => KeywordsBatchSchema.parse(data),
      { temperature: 0.25 },
    );

    return this.mapBatchResult(result);
  }

  private mapBatchResult(result: z.infer<typeof KeywordsBatchSchema>): Map<number, string[]> {
    const map = new Map<number, string[]>();
    for (const entry of result.lines) {
      map.set(
        entry.index,
        entry.keywords.map((keyword) => keyword.trim()).filter(Boolean),
      );
    }
    return map;
  }
}

function finalizeKeywords(text: string, raw: string[], topicTerms: string[]): string[] {
  const filtered = filterKeywordsForText(text, raw);
  const boosted = boostKeywordsLocally(text, filtered, topicTerms);
  return applyAlwaysHighlightPhrases(text, boosted);
}

/** Keep only keywords that actually appear in the sentence. */
export function filterKeywordsForText(text: string, keywords: string[]): string[] {
  const seen = new Set<string>();
  const valid: string[] = [];

  for (const keyword of keywords) {
    const normalized = keyword.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    if (keywordAppearsInText(text, normalized)) {
      seen.add(key);
      valid.push(normalized);
    }
  }

  return valid;
}

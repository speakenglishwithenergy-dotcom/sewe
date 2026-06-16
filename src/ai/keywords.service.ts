import { z } from 'zod';
import { OpenAIService } from './openai.service';
import { ChannelContext } from '../channel/channel.types';
import { DialogueLine } from '../types';
import {
  buildKeywordsBoostPrompt,
  buildKeywordsPrompt,
  getAlwaysHighlightPhrases,
  KeywordsPromptContext,
} from '../prompts/keywords.prompt';
import {
  applyAlwaysHighlightPhrases,
  boostKeywordsLocally,
  extractTopicTerms,
  keywordAppearsInText,
  MAX_KEYWORDS_PER_LINE,
  needsKeywordBoost,
  pruneSubsumedSingleWords,
  shouldAttemptGapFill,
  sortKeywordsByPhrasePriority,
} from './keywords.util';
import { logger } from '../utils/logger';

/** Bump when selection logic changes — triggers automatic re-generation on resume. */
export const KEYWORDS_GENERATOR_VERSION = 7;

const KeywordsBatchSchema = z.object({
  lines: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      keywords: z.array(z.string().min(1)).max(MAX_KEYWORDS_PER_LINE),
    }),
  ),
});

/** One API call when the script fits; split only when longer than this. */
const MAX_LINES_PER_KEYWORDS_REQUEST = 40;

export interface KeywordEnrichmentContext {
  topic: string;
  title: string;
}

export class KeywordsService {
  private readonly alwaysHighlightPhrases: string[];

  constructor(
    private readonly openai: OpenAIService,
    private readonly ctx: ChannelContext,
  ) {
    this.alwaysHighlightPhrases = getAlwaysHighlightPhrases(ctx);
  }

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

    const keywordsByIndex = await this.generateKeywordsInChunks(
      batch.map(({ index, text }) => ({ index, text })),
      promptContext,
      (lines, ctx) => this.generateBatch(lines, ctx),
    );

    for (const { index, text, line } of batch) {
      const raw = keywordsByIndex.get(index) ?? [];
      line.keywords = finalizeKeywords(text, raw, topicTerms, this.alwaysHighlightPhrases);
    }

    await this.runBoostPass(script, promptContext, topicTerms);
    await this.runGapFillPass(script, topicTerms);

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

    const boosted = await this.generateKeywordsInChunks(
      sparse.map(({ index, text, current }) => ({ index, text, current })),
      promptContext,
      (lines, ctx) => this.generateBoostBatch(lines, ctx),
    );

    for (const { index, text, line, current } of sparse) {
      const raw = boosted.get(index) ?? current;
      line.keywords = finalizeKeywords(text, raw, topicTerms, this.alwaysHighlightPhrases);
    }
  }

  private async runGapFillPass(
    script: DialogueLine[],
    topicTerms: string[],
  ): Promise<void> {
    const gapLines = script
      .map((line, index) => ({ index, text: line.text, line }))
      .filter(({ line, text }) => (line.keywords?.length ?? 0) === 0 && shouldAttemptGapFill(text));

    for (const { text, line } of gapLines) {
      line.keywords = finalizeKeywords(text, [], topicTerms, this.alwaysHighlightPhrases);
    }

    if (gapLines.length > 0) {
      logger.info(`Local gap-fill applied to ${gapLines.length} line(s) still without highlights`);
    }
  }

  private async generateKeywordsInChunks<T extends { index: number }>(
    lines: T[],
    context: KeywordsPromptContext,
    generate: (lines: T[], context: KeywordsPromptContext) => Promise<Map<number, string[]>>,
  ): Promise<Map<number, string[]>> {
    const chunks = chunkByMaxSize(lines, MAX_LINES_PER_KEYWORDS_REQUEST);
    const merged = new Map<number, string[]>();

    if (chunks.length > 1) {
      logger.info(
        `Keyword request split into ${chunks.length} batch(es) ` +
          `(max ${MAX_LINES_PER_KEYWORDS_REQUEST} lines each)`,
      );
    }

    for (const chunk of chunks) {
      const partial = await generate(chunk, context);
      for (const [index, keywords] of partial) {
        merged.set(index, keywords);
      }
    }

    return merged;
  }

  private async generateBatch(
    lines: { index: number; text: string }[],
    context: KeywordsPromptContext,
  ): Promise<Map<number, string[]>> {
    const result = await this.openai.generateJSON(
      buildKeywordsPrompt(this.ctx, lines, context),
      'You are an English teacher curating subtitle highlights for podcast learners. ' +
        'The #1 rule: if a learner reads only the highlights, the sentence meaning must not change. ' +
        'Prioritize multi-word phrases, idioms, and collocations over single words. ' +
        'Use up to 4 meaning-carrying highlights per substantive line; fewer is fine when that preserves meaning. ' +
        'Skip pure greetings or empty reactions. ' +
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
      buildKeywordsBoostPrompt(this.ctx, lines, context),
      'You add more subtitle highlights for English learners. ' +
        'The #1 rule: if a learner reads only the highlights, the sentence meaning must not change. ' +
        'Return the full expanded keyword list (max 4). Prefer phrases and collocations over single words. ' +
        'Do not add fragments just to reach 4 — keep the list unchanged if it already preserves meaning. ' +
        'Remove redundant single words already covered by a longer phrase. ' +
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

function finalizeKeywords(
  text: string,
  raw: string[],
  topicTerms: string[],
  alwaysHighlightPhrases: string[],
): string[] {
  const filtered = filterKeywordsForText(text, raw);
  const boosted = boostKeywordsLocally(text, filtered, topicTerms);
  const pruned = pruneSubsumedSingleWords(boosted);
  const prioritized = sortKeywordsByPhrasePriority(pruned);
  return applyAlwaysHighlightPhrases(text, prioritized, alwaysHighlightPhrases);
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

function chunkByMaxSize<T>(items: T[], maxSize: number): T[][] {
  if (items.length <= maxSize) {
    return [items];
  }

  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += maxSize) {
    chunks.push(items.slice(offset, offset + maxSize));
  }
  return chunks;
}

import { z } from 'zod';
import { OpenAIService } from './openai.service';
import { DialogueLine } from '../types';
import { buildKeywordsPrompt } from '../prompts/keywords.prompt';
import { logger } from '../utils/logger';

const KeywordsBatchSchema = z.object({
  lines: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      keywords: z.array(z.string().min(1)).min(1).max(3),
    }),
  ),
});

const BATCH_SIZE = 25;

export class KeywordsService {
  constructor(private readonly openai: OpenAIService) {}

  /** Fill missing keyword highlights on dialogue lines (mutates and returns the array). */
  async enrichScript(script: DialogueLine[]): Promise<DialogueLine[]> {
    const missing = script
      .map((line, index) => ({ index, text: line.text, line }))
      .filter(({ line }) => !line.keywords?.length);

    if (missing.length === 0) {
      return script;
    }

    logger.info(`Generating keyword highlights for ${missing.length} dialogue line(s)...`);

    for (let offset = 0; offset < missing.length; offset += BATCH_SIZE) {
      const batch = missing.slice(offset, offset + BATCH_SIZE);
      const keywordsByIndex = await this.generateBatch(
        batch.map(({ index, text }) => ({ index, text })),
      );

      for (const { index, text, line } of batch) {
        const raw = keywordsByIndex.get(index);
        if (!raw?.length) {
          throw new Error(`Keyword generation missing result for line index ${index}`);
        }
        const filtered = filterKeywordsForText(text, raw);
        line.keywords = filtered.length > 0 ? filtered : fallbackKeywords(text);
      }
    }

    logger.success('Keyword highlights ready');
    return script;
  }

  private async generateBatch(
    lines: { index: number; text: string }[],
  ): Promise<Map<number, string[]>> {
    const result = await this.openai.generateJSON(
      buildKeywordsPrompt(lines),
      'You are an English teacher selecting subtitle highlights for learners. Respond only with valid JSON matching the requested structure exactly.',
      (data) => KeywordsBatchSchema.parse(data),
      { temperature: 0.2 },
    );

    const map = new Map<number, string[]>();
    for (const entry of result.lines) {
      map.set(entry.index, entry.keywords.map((keyword) => keyword.trim()).filter(Boolean));
    }
    return map;
  }
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

    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (regex.test(text)) {
      seen.add(key);
      valid.push(normalized);
    }
  }

  return valid;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'so', 'to', 'of', 'in', 'on', 'at', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'i', 'you', 'we', 'they', 'he', 'she', 'it', 'my', 'your', 'our', 'their', 'his', 'her', 'its',
  'this', 'that', 'these', 'those', 'here', 'there', 'today', 'really', 'very', 'just', 'about',
  'well', 'right', 'know', 'mean', 'actually', 'everyone', 'everybody',
]);

/** Pick the longest non-stop-word tokens when AI keywords fail validation. */
function fallbackKeywords(text: string): string[] {
  const candidates = text
    .match(/[A-Za-z']+/g)
    ?.map((word) => word.replace(/^'+|'+$/g, ''))
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word.toLowerCase()))
    .sort((a, b) => b.length - a.length) ?? [];

  return candidates.slice(0, 2);
}

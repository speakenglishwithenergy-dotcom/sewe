import { z } from 'zod';
import { OpenAIService } from './openai.service';
import { DialogueLine } from '../types';
import { buildIpaPrompt } from '../prompts/ipa.prompt';
import { logger } from '../utils/logger';

const IpaBatchSchema = z.object({
  lines: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      ipa: z.string().min(1),
    }),
  ),
});

const BATCH_SIZE = 5;
const MAX_BATCH_ATTEMPTS = 3;

export class IpaService {
  constructor(private readonly openai: OpenAIService) {}

  /** Fill missing IPA transcriptions on dialogue lines (mutates and returns the array). */
  async enrichScript(script: DialogueLine[]): Promise<DialogueLine[]> {
    const missing = script
      .map((line, index) => ({ index, text: line.text, line }))
      .filter(({ line }) => !line.ipa);

    if (missing.length === 0) {
      return script;
    }

    logger.info(`Generating IPA for ${missing.length} dialogue line(s)...`);

    for (let offset = 0; offset < missing.length; offset += BATCH_SIZE) {
      const batch = missing.slice(offset, offset + BATCH_SIZE);
      const ipaByIndex = await this.generateBatchWithRetry(
        batch.map(({ index, text }) => ({ index, text })),
      );

      for (const { index, line } of batch) {
        const ipa = ipaByIndex.get(index);
        if (!ipa) {
          throw new Error(`IPA generation missing result for line index ${index}`);
        }
        line.ipa = ipa;
      }
    }

    logger.success('IPA transcriptions ready');
    return script;
  }

  private async generateBatchWithRetry(
    lines: { index: number; text: string }[],
  ): Promise<Map<number, string>> {
    const merged = new Map<number, string>();
    let pending = lines;

    for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS && pending.length > 0; attempt++) {
      if (attempt > 1) {
        logger.warn(
          `IPA batch incomplete — retrying ${pending.length} line(s) (attempt ${attempt}/${MAX_BATCH_ATTEMPTS})...`,
        );
      }

      const partial = await this.generateBatch(pending);
      const stillMissing: typeof pending = [];

      for (const line of pending) {
        const ipa = partial.get(line.index);
        if (ipa) {
          merged.set(line.index, ipa);
        } else {
          stillMissing.push(line);
        }
      }

      pending = stillMissing;
    }

    return merged;
  }

  private async generateBatch(
    lines: { index: number; text: string }[],
  ): Promise<Map<number, string>> {
    const result = await this.openai.generateJSON(
      buildIpaPrompt(lines),
      'You are a linguist specializing in English phonetics. Respond only with valid JSON matching the requested structure exactly.',
      (data) => IpaBatchSchema.parse(data),
      { temperature: 0.2, maxTokens: 4_096 },
    );

    const map = new Map<number, string>();
    for (const entry of result.lines) {
      map.set(entry.index, normalizeIpa(entry.ipa));
    }
    return map;
  }
}

/** Ensure IPA is wrapped in slashes for consistent subtitle display. */
function normalizeIpa(ipa: string): string {
  const trimmed = ipa.trim();
  if (trimmed.startsWith('/') && trimmed.endsWith('/')) {
    return trimmed;
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

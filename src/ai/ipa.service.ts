import { z } from 'zod';
import { OpenAIService } from './openai.service';
import { prepareTextForIpa } from './ipa-text.util';
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

interface IpaLineRequest {
  index: number;
  text: string;
  ipaText: string;
  line: DialogueLine;
}

export class IpaService {
  constructor(private readonly openai: OpenAIService) {}

  /** Fill missing IPA transcriptions on dialogue lines (mutates and returns the array). */
  async enrichScript(script: DialogueLine[]): Promise<DialogueLine[]> {
    const pending = script
      .map((line, index) => ({ index, text: line.text, line }))
      .filter(({ line }) => !line.ipa);

    const missing: IpaLineRequest[] = [];
    let skipped = 0;

    for (const item of pending) {
      const ipaText = prepareTextForIpa(item.text);
      if (!ipaText) {
        skipped += 1;
        continue;
      }
      missing.push({ ...item, ipaText });
    }

    if (skipped > 0) {
      logger.info(`Skipping IPA for ${skipped} non-speech line(s) (e.g. ---)`);
    }

    if (missing.length === 0) {
      return script;
    }

    logger.info(`Generating IPA for ${missing.length} dialogue line(s)...`);

    for (let offset = 0; offset < missing.length; offset += BATCH_SIZE) {
      const batch = missing.slice(offset, offset + BATCH_SIZE);
      const ipaByIndex = await this.generateBatchWithRetry(
        batch.map(({ index, ipaText }) => ({ index, text: ipaText })),
      );

      for (const { index, line } of batch) {
        const ipa = ipaByIndex.get(index);
        if (!ipa) {
          logger.warn(`IPA unavailable for line ${index} — continuing without IPA`);
          continue;
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

      const partial = await this.generateBatchResilient(pending);
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

  private async generateBatchResilient(
    lines: { index: number; text: string }[],
  ): Promise<Map<number, string>> {
    try {
      return await this.generateBatch(lines);
    } catch (error) {
      if (lines.length === 1) {
        logger.warn(
          `IPA failed for line ${lines[0].index}: ${formatLlmError(error)}`,
        );
        return new Map();
      }

      logger.warn(
        `IPA batch failed (${lines.length} lines) — retrying one line at a time...`,
      );

      const merged = new Map<number, string>();
      for (const line of lines) {
        const partial = await this.generateBatchResilient([line]);
        partial.forEach((ipa, index) => merged.set(index, ipa));
      }
      return merged;
    }
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

function formatLlmError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** Ensure IPA is wrapped in slashes for consistent subtitle display. */
function normalizeIpa(ipa: string): string {
  const trimmed = ipa.trim();
  if (trimmed.startsWith('/') && trimmed.endsWith('/')) {
    return trimmed;
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

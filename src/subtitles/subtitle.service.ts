import fs from 'fs/promises';
import { AudioSegment } from '../types';
import { logger } from '../utils/logger';
import { buildPodcastAssDocument, buildShortAssDocument } from './subtitle-ass.util';
import {
  SHORT_HOOK_KEYWORD_COLOUR,
  highlightWrappedSubtitleText,
} from './subtitle-highlight.util';
import { formatIpaSubtitleText } from './subtitle-style';

export class SubtitleService {
  constructor(private readonly nonBreakingPhrases: string[] = []) {}
  /**
   * Generate an ASS subtitle file from the timed audio segments.
   * Each segment becomes one subtitle entry. Podcast mode includes IPA below English
   * with a distinct colour; ASS is required because FFmpeg ignores inline SRT overrides
   * when force_style is applied.
   * Long lines are wrapped more aggressively to stay readable on screen,
   * with orphan/widow lines rebalanced so a single word is not left alone.
   */
  async generate(
    segments: AudioSegment[],
    outputPath: string,
    lineWidth = 42,
    includeIpa = true,
  ): Promise<void> {
    logger.info('Generating ASS subtitle file...');

    const LINGER_SECONDS = 0.5;
    const SUBTITLE_LINE_WIDTH = lineWidth;

    const dialogues = segments.map((segment) => {
      const wrapped = wrapSubtitleText(segment.text, SUBTITLE_LINE_WIDTH, this.nonBreakingPhrases);
      const english = highlightWrappedSubtitleText(wrapped, segment.keywords);
      const text = includeIpa && segment.ipa
        ? `${english}\n${formatIpaSubtitleText(wrapSubtitleText(segment.ipa, SUBTITLE_LINE_WIDTH, this.nonBreakingPhrases))}`
        : english;

      return {
        startSeconds: segment.startTime,
        endSeconds: segment.startTime + segment.duration + LINGER_SECONDS,
        text,
      };
    });

    const assContent = buildPodcastAssDocument(dialogues);
    await fs.writeFile(outputPath, assContent, 'utf-8');

    logger.success(`Subtitles saved → ${outputPath}`);
  }

  /**
   * Generate an ASS subtitle file for short-form video with a dedicated Hook style
   * on the first segment. English only — no IPA.
   */
  async generateShort(
    segments: AudioSegment[],
    outputPath: string,
    lineWidth = 28,
  ): Promise<void> {
    logger.info('Generating ASS subtitle file for short video...');

    const LINGER_SECONDS = 0.3;

    const dialogues = segments.map((segment, i) => {
      const wrapped = wrapSubtitleText(segment.text, lineWidth, this.nonBreakingPhrases);
      const isHook = i === 0;
      const text = highlightWrappedSubtitleText(
        wrapped,
        segment.keywords,
        isHook ? SHORT_HOOK_KEYWORD_COLOUR : undefined,
      );

      return {
        startSeconds: segment.startTime,
        endSeconds: segment.startTime + segment.duration + LINGER_SECONDS,
        style: isHook ? 'Hook' as const : 'Default' as const,
        text,
      };
    });

    const assContent = buildShortAssDocument(dialogues);
    await fs.writeFile(outputPath, assContent, 'utf-8');

    logger.success(`Short subtitles saved → ${outputPath}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Phrases that must never be split across subtitle lines (channel branding). */
function protectNonBreakingPhrases(text: string, phrases: string[]): string {
  let result = text;

  for (const phrase of phrases) {
    const pattern = phrase
      .split(' ')
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+');
    const regex = new RegExp(pattern, 'gi');

    result = result.replace(regex, (match) => match.replace(/ /g, '\u00A0'));
  }

  return result;
}

/**
 * Wrap subtitle text to a narrower line width for better on-screen readability.
 * Rebalances lines afterward to avoid orphan/widow text (a single word alone on a line).
 */
function wrapSubtitleText(text: string, maxWidth: number, nonBreakingPhrases: string[]): string {
  const words = protectNonBreakingPhrases(text, nonBreakingPhrases).split(' ');
  if (words.length <= 1) {
    return text;
  }

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxWidth) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return avoidOrphanLines(lines).join('\n');
}

const MIN_WORDS_PER_LINE = 2;

/**
 * Pull words from the previous line onto an orphan last line until it has
 * at least MIN_WORDS_PER_LINE words. Also fixes a lone word on the first line.
 */
function avoidOrphanLines(lines: string[]): string[] {
  if (lines.length < 2) {
    return lines;
  }

  const result = [...lines];

  while (result.length >= 2) {
    const lastWords = result[result.length - 1].split(' ');
    if (lastWords.length >= MIN_WORDS_PER_LINE) {
      break;
    }

    const prevWords = result[result.length - 2].split(' ');
    if (prevWords.length <= 1) {
      break;
    }

    const moved = prevWords.pop()!;
    result[result.length - 2] = prevWords.join(' ');
    result[result.length - 1] = `${moved} ${result[result.length - 1]}`;
  }

  if (result.length === 2 && result[0].split(' ').length === 1) {
    const secondWords = result[1].split(' ');
    if (secondWords.length > 1) {
      const moved = secondWords.shift()!;
      result[0] = `${result[0]} ${moved}`;
      result[1] = secondWords.join(' ');
    }
  }

  return result;
}

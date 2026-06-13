import fs from 'fs/promises';
import { AudioSegment } from '../types';
import { logger } from '../utils/logger';

export class SubtitleService {
  /**
   * Generate an SRT subtitle file from the timed audio segments.
   * Each segment becomes one subtitle entry.
   * Long lines are wrapped more aggressively to stay readable on screen,
   * with orphan/widow lines rebalanced so a single word is not left alone.
   */
  async generate(segments: AudioSegment[], outputPath: string): Promise<void> {
    logger.info('Generating SRT subtitle file...');

    const LINGER_SECONDS = 0.5;
    const SUBTITLE_LINE_WIDTH = 42;

    const entries = segments.map((segment, i) => {
      const start = formatSRTTime(segment.startTime);
      const end = formatSRTTime(segment.startTime + segment.duration + LINGER_SECONDS);
      const text = wrapSubtitleText(segment.text, SUBTITLE_LINE_WIDTH);
      return `${i + 1}\n${start} --> ${end}\n${text}`;
    });

    const srtContent = entries.join('\n\n') + '\n';
    await fs.writeFile(outputPath, srtContent, 'utf-8');

    logger.success(`Subtitles saved → ${outputPath}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Phrases that must never be split across subtitle lines (channel branding). */
const NON_BREAKING_PHRASES = ['Speak English With Energy'];

/**
 * Replace spaces inside protected phrases with non-breaking spaces so line
 * wrapping treats each phrase as a single word.
 */
function protectNonBreakingPhrases(text: string): string {
  let result = text;

  for (const phrase of NON_BREAKING_PHRASES) {
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
 * Convert a time value (seconds, with ms precision) to SRT timestamp format.
 * Example: 3661.123  →  "01:01:01,123"
 */
function formatSRTTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const ms = Math.round((safeSeconds % 1) * 1000);

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(secs).padStart(2, '0'),
  ].join(':') + ',' + String(ms).padStart(3, '0');
}

/**
 * Wrap subtitle text to a narrower line width for better on-screen readability.
 * Rebalances lines afterward to avoid orphan/widow text (a single word alone on a line).
 */
function wrapSubtitleText(text: string, maxWidth: number): string {
  const words = protectNonBreakingPhrases(text).split(' ');
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

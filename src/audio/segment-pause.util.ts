import {
  DialogueLine,
  PAUSE_BETWEEN_SEGMENTS,
  SHORT_PAUSE_BETWEEN_SEGMENTS,
} from '../types';

export interface SegmentPauseOptions {
  shortPause?: number;
  longPause?: number;
}

/**
 * Pause inserted before line at `lineIndex` (0 for the first line).
 * Uses `continuesStory` when set; otherwise falls back to consecutive same speaker.
 */
export function pauseBeforeLine(
  script: DialogueLine[],
  lineIndex: number,
  options?: SegmentPauseOptions,
): number {
  const shortPause = options?.shortPause ?? SHORT_PAUSE_BETWEEN_SEGMENTS;
  const longPause = options?.longPause ?? PAUSE_BETWEEN_SEGMENTS;

  if (lineIndex === 0) {
    return 0;
  }

  const line = script[lineIndex];
  const prev = script[lineIndex - 1];

  if (line.continuesStory === true) {
    return shortPause;
  }
  if (line.continuesStory === false) {
    return longPause;
  }

  // Cached scripts without LLM metadata — same speaker mid-turn → shorter pause
  if (line.speaker === prev.speaker) {
    return shortPause;
  }

  return longPause;
}

/** Pause after segment at `index` (0 for the last segment). */
export function pauseAfterLine(
  script: DialogueLine[],
  index: number,
  options?: SegmentPauseOptions,
): number {
  if (index >= script.length - 1) {
    return 0;
  }
  return pauseBeforeLine(script, index + 1, options);
}

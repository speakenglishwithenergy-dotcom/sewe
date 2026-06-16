import {
  DialogueLine,
  PAUSE_BETWEEN_SEGMENTS,
  SHORT_PAUSE_BETWEEN_SEGMENTS,
} from '../types';

/**
 * Pause inserted before line at `lineIndex` (0 for the first line).
 * Uses `continuesStory` when set; otherwise falls back to consecutive same speaker.
 */
export function pauseBeforeLine(
  script: DialogueLine[],
  lineIndex: number,
): number {
  if (lineIndex === 0) {
    return 0;
  }

  const line = script[lineIndex];
  const prev = script[lineIndex - 1];

  if (line.continuesStory === true) {
    return SHORT_PAUSE_BETWEEN_SEGMENTS;
  }
  if (line.continuesStory === false) {
    return PAUSE_BETWEEN_SEGMENTS;
  }

  // Cached scripts without LLM metadata — same speaker mid-turn → shorter pause
  if (line.speaker === prev.speaker) {
    return SHORT_PAUSE_BETWEEN_SEGMENTS;
  }

  return PAUSE_BETWEEN_SEGMENTS;
}

/** Pause after segment at `index` (0 for the last segment). */
export function pauseAfterLine(script: DialogueLine[], index: number): number {
  if (index >= script.length - 1) {
    return 0;
  }
  return pauseBeforeLine(script, index + 1);
}

/**
 * Infer whether a shadowing line continues the previous spoken beat.
 * Used for TTS pause timing (see segment-pause.util).
 */
export function inferContinuesStory(
  previousLineText: string | null,
  blankBlockquoteLinesBefore = 1,
): boolean {
  if (!previousLineText) {
    return false;
  }

  // Draft authors use double blank blockquote lines for mid-thought splits.
  if (blankBlockquoteLinesBefore >= 2) {
    return true;
  }

  const trimmed = previousLineText.trim();
  if (/[,;:—–-]$/.test(trimmed)) {
    return true;
  }

  if (!/[.!?]$/.test(trimmed)) {
    return true;
  }

  return false;
}

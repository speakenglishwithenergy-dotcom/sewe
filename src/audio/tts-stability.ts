import fs from 'fs/promises';

/** Denoising steps for Supertonic (5–12). Higher = more stable, slower. */
export const DEFAULT_TTS_TOTAL_STEPS = Number(process.env.SUPERTONIC_TOTAL_STEPS ?? 10);

/** Max synthesis attempts when output looks corrupted (skip/repeat). */
export const DEFAULT_TTS_MAX_RETRIES = Number(process.env.SUPERTONIC_TTS_RETRIES ?? 3);

/** Spoken-word rate at speed 1.0 (~105 wpm from script calibration). */
const WORDS_PER_MINUTE_AT_SPEED_1 = 105;

/** Average characters per spoken word in podcast dialogue. */
const AVG_CHARS_PER_WORD = 5;

function charsPerSecondAtSpeed(speed: number): number {
  return (WORDS_PER_MINUTE_AT_SPEED_1 / 60) * AVG_CHARS_PER_WORD / speed;
}

/** Normalize dialogue text before sending to Supertonic. */
export function prepareTextForTts(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lower bound for plausible segment duration (seconds). */
export function estimateMinDurationSeconds(text: string, speed: number): number {
  const charsPerSecond = charsPerSecondAtSpeed(speed);
  const estimated = text.length / charsPerSecond;
  return Math.max(0.15, estimated * 0.45);
}

/** Upper bound — catches repeat loops and runaway synthesis. */
export function estimateMaxDurationSeconds(text: string, speed: number): number {
  const charsPerSecond = charsPerSecondAtSpeed(speed);
  const estimated = text.length / charsPerSecond;
  return Math.max(1.5, estimated * 2.8);
}

export function isSuspiciousSegmentDuration(
  text: string,
  durationSeconds: number,
  speed: number,
): boolean {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return true;
  }

  const prepared = prepareTextForTts(text);
  if (!prepared) {
    return true;
  }

  const minDuration = estimateMinDurationSeconds(prepared, speed);
  const maxDuration = estimateMaxDurationSeconds(prepared, speed);

  return durationSeconds < minDuration || durationSeconds > maxDuration;
}

/** Minimum WAV payload size for a non-empty clip (44-byte header + ~50ms of audio). */
const MIN_WAV_BYTES = 44 + 4410;

export async function isWavFilePlausible(
  filePath: string,
  minDurationSeconds: number,
): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    const minBytes = Math.max(MIN_WAV_BYTES, Math.floor(minDurationSeconds * 44100 * 2) + 44);
    return stat.size >= minBytes;
  } catch {
    return false;
  }
}

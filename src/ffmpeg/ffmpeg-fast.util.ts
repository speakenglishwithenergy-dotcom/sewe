/** Valid libx264 presets (slowest → fastest). */
const LIBX264_PRESETS = new Set([
  'placebo',
  'veryslow',
  'slower',
  'slow',
  'medium',
  'fast',
  'faster',
  'veryfast',
  'superfast',
  'ultrafast',
]);

export function isCiEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CI === 'true' || env.CI === '1';
}

function envFlag(
  env: NodeJS.ProcessEnv,
  key: string,
): boolean | undefined {
  const raw = env[key]?.trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return undefined;
}

/**
 * libx264 preset: FFMPEG_X264_PRESET → ultrafast on CI → medium locally.
 * Faster presets keep free GitHub Actions (ubuntu-latest) usable without paid runners.
 */
export function resolveLibx264Preset(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.FFMPEG_X264_PRESET?.trim().toLowerCase();
  if (raw && LIBX264_PRESETS.has(raw)) return raw;
  if (isCiEnv(env)) return 'ultrafast';
  return 'medium';
}

/**
 * Skip Ken Burns / grain / particles — huge win for long podcast encodes on CPU-only CI.
 * Default: on when CI=true. Override with FFMPEG_DISABLE_MOTION=true|false.
 */
export function isFfmpegMotionDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFlag(env, 'FFMPEG_DISABLE_MOTION') ?? isCiEnv(env);
}

/**
 * Skip showwaves overlay — expensive per-frame filter on long videos.
 * Default: on when CI=true. Override with FFMPEG_SKIP_WAVE=true|false.
 */
export function isFfmpegWaveDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFlag(env, 'FFMPEG_SKIP_WAVE') ?? isCiEnv(env);
}

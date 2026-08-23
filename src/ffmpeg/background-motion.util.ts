import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import sharp from 'sharp';
import type { BackgroundMotionConfig } from '../channel/channel.types';
import type { SlideshowSegment } from '../video/background-slideshow.util';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 30;

const DEFAULT_MAX_ZOOM = 1.04;
const DEFAULT_GRAIN_STRENGTH = 6;
const DEFAULT_PARTICLES_OPACITY = 0.06;
const DEFAULT_SLIDE_CROSSFADE = 1;

export interface ResolvedBackgroundMotion {
  kenBurns: { enabled: boolean; maxZoom: number };
  grain: { enabled: boolean; strength: number };
  particles: { enabled: boolean; path?: string; opacity: number };
  slideCrossfadeSeconds: number;
}

export interface BackgroundMotionBuildResult {
  filters: string[];
  bgLabel: string;
  isFiniteBackground: boolean;
}

export interface PodcastBackgroundInputs {
  args: string[];
  bgInputIndices: number[];
  particlesInputIndex?: number;
}

export interface ResolvedPodcastBackground {
  path: string;
  mode: 'image' | 'slideshow';
  segments?: SlideshowSegment[];
  motion?: ResolvedBackgroundMotion;
  podcastDurationSeconds?: number;
}

/** Resolve motion settings; returns undefined when all effects are disabled. */
export function resolveBackgroundMotion(
  config: BackgroundMotionConfig | undefined,
  channelDir: string,
): ResolvedBackgroundMotion | undefined {
  const kenBurnsEnabled = config?.kenBurns?.enabled ?? false;
  const grainEnabled = config?.overlay?.grain?.enabled ?? true;
  const particlesEnabled = config?.overlay?.particles?.enabled ?? true;

  if (!kenBurnsEnabled && !grainEnabled && !particlesEnabled) {
    return undefined;
  }

  const particlesAsset = config?.overlay?.particles?.asset ?? 'assets/particles-overlay.webm';

  return {
    kenBurns: {
      enabled: kenBurnsEnabled,
      maxZoom: config?.kenBurns?.maxZoom ?? DEFAULT_MAX_ZOOM,
    },
    grain: {
      enabled: grainEnabled,
      strength: config?.overlay?.grain?.strength ?? DEFAULT_GRAIN_STRENGTH,
    },
    particles: {
      enabled: particlesEnabled,
      path: particlesEnabled ? path.join(channelDir, particlesAsset) : undefined,
      opacity: config?.overlay?.particles?.opacity ?? DEFAULT_PARTICLES_OPACITY,
    },
    slideCrossfadeSeconds: config?.slideCrossfadeSeconds ?? DEFAULT_SLIDE_CROSSFADE,
  };
}

export function isMotionActive(motion?: ResolvedBackgroundMotion): boolean {
  if (!motion) {
    return false;
  }
  return motion.kenBurns.enabled || motion.grain.enabled || motion.particles.enabled;
}

/** Ken Burns zoom rate so maxZoom is reached at end of segment. Uses `on` (output frame index). */
export function buildKenBurnsFilter(durationSec: number, maxZoom: number, fps = VIDEO_FPS): string {
  const totalFrames = Math.max(Math.round(durationSec * fps), 1);
  const rate = (maxZoom - 1) / totalFrames;
  return (
    `zoompan=z='min(1+on*${rate.toFixed(10)},${maxZoom})':` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
    `d=1:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${fps}`
  );
}

/** Upscale with headroom for zoompan — crop to maxZoom size, NOT output size. */
export function buildScaleForKenBurns(maxZoom: number): string {
  const w = Math.ceil(VIDEO_WIDTH * maxZoom);
  const h = Math.ceil(VIDEO_HEIGHT * maxZoom);
  return (
    `scale=${w}:${h}:force_original_aspect_ratio=increase,` +
    `crop=${w}:${h}:(iw-${w})/2:(ih-${h})/2`
  );
}

function applyGrain(inputLabel: string, outputLabel: string, strength: number): string {
  return `[${inputLabel}]noise=alls=${strength}:allf=t+u[${outputLabel}]`;
}

function applyParticlesOverlay(
  bgLabel: string,
  particlesInputIndex: number,
  outputLabel: string,
  opacity: number,
): string[] {
  const alpha = opacity.toFixed(3);
  return [
    `[${particlesInputIndex}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},` +
      `format=yuva420p,colorchannelmixer=aa=${alpha}[particles_a]`,
    `[${bgLabel}][particles_a]overlay=0:0:format=auto[${outputLabel}]`,
  ];
}

function buildPostMotionFilters(
  rawLabel: string,
  motion: ResolvedBackgroundMotion,
  particlesInputIndex?: number,
): { filters: string[]; bgLabel: string } {
  const filters: string[] = [];
  let current = rawLabel;

  if (motion.grain.enabled) {
    const out = motion.particles.enabled && particlesInputIndex !== undefined ? 'bg_grain' : 'bg';
    filters.push(applyGrain(current, out, motion.grain.strength));
    current = out;
  }

  if (motion.particles.enabled && particlesInputIndex !== undefined) {
    filters.push(...applyParticlesOverlay(current, particlesInputIndex, 'bg', motion.particles.opacity));
    current = 'bg';
  } else if (current !== 'bg') {
    filters.push(`[${current}]null[bg]`);
    current = 'bg';
  }

  return { filters, bgLabel: current };
}

/** Static image background with optional Ken Burns + overlays. */
export function buildStaticMotionFilters(
  inputIndex: number,
  durationSec: number,
  motion: ResolvedBackgroundMotion,
  particlesInputIndex?: number,
): BackgroundMotionBuildResult {
  const filters: string[] = [];
  let rawLabel = 'bg_raw';

  if (motion.kenBurns.enabled) {
    const scale = buildScaleForKenBurns(motion.kenBurns.maxZoom);
    const kenBurns = buildKenBurnsFilter(durationSec, motion.kenBurns.maxZoom);
    filters.push(
      `[${inputIndex}:v]${scale},${kenBurns},fps=${VIDEO_FPS}[${rawLabel}]`,
    );
  } else {
    filters.push(
      `[${inputIndex}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},fps=${VIDEO_FPS}[${rawLabel}]`,
    );
  }

  const post = buildPostMotionFilters(rawLabel, motion, particlesInputIndex);
  filters.push(...post.filters);

  return { filters, bgLabel: post.bgLabel, isFiniteBackground: false };
}

/** Slideshow with per-slide Ken Burns and crossfades. */
export function buildSlideshowMotionFilters(
  bgInputIndices: readonly number[],
  segments: readonly SlideshowSegment[],
  motion: ResolvedBackgroundMotion,
  particlesInputIndex?: number,
): BackgroundMotionBuildResult {
  if (segments.length !== bgInputIndices.length) {
    throw new Error('Slideshow segment count must match background input count');
  }

  const filters: string[] = [];
  const slideFade = motion.slideCrossfadeSeconds;

  for (let i = 0; i < segments.length; i++) {
    const segLabel = `vseg${i}`;
    const segment = segments[i];
    const inputIndex = bgInputIndices[i];

    if (motion.kenBurns.enabled) {
      const scale = buildScaleForKenBurns(motion.kenBurns.maxZoom);
      const kenBurns = buildKenBurnsFilter(segment.durationSeconds, motion.kenBurns.maxZoom);
      filters.push(
        `[${inputIndex}:v]${scale},${kenBurns},fps=${VIDEO_FPS}[${segLabel}]`,
      );
    } else {
      filters.push(
        `[${inputIndex}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},fps=${VIDEO_FPS}[${segLabel}]`,
      );
    }
  }

  let videoLabel = 'vseg0';
  if (segments.length === 1) {
    filters.push('[vseg0]null[bg_raw]');
  } else {
    let cumulative = 0;
    for (let i = 1; i < segments.length; i++) {
      cumulative += segments[i - 1].durationSeconds;
      const offset = cumulative - i * slideFade;
      const outLabel = i === segments.length - 1 ? 'bg_raw' : `vx${i}`;
      filters.push(
        `[${videoLabel}][vseg${i}]xfade=transition=fade:duration=${slideFade}:offset=${offset.toFixed(3)}[${outLabel}]`,
      );
      videoLabel = outLabel;
    }
  }

  const post = buildPostMotionFilters('bg_raw', motion, particlesInputIndex);
  filters.push(...post.filters);

  return { filters, bgLabel: post.bgLabel, isFiniteBackground: true };
}

/** FFmpeg input args for podcast background (static, legacy concat, or motion slideshow). */
export function buildPodcastBackgroundInputs(
  mode: 'image' | 'slideshow',
  backgroundPath: string,
  segments: readonly SlideshowSegment[] | undefined,
  motion: ResolvedBackgroundMotion | undefined,
  particlesPath?: string,
): PodcastBackgroundInputs {
  const args: string[] = [];
  const bgInputIndices: number[] = [];
  let nextIndex = 0;

  const useMotionSlideshow = mode === 'slideshow' && segments && isMotionActive(motion);

  if (useMotionSlideshow) {
    for (const segment of segments) {
      bgInputIndices.push(nextIndex);
      args.push(
        '-loop', '1',
        '-framerate', String(VIDEO_FPS),
        '-t', segment.durationSeconds.toFixed(3),
        '-i', segment.imagePath,
      );
      nextIndex += 1;
    }
  } else if (mode === 'slideshow') {
    bgInputIndices.push(nextIndex);
    args.push('-f', 'concat', '-safe', '0', '-i', backgroundPath);
    nextIndex += 1;
  } else {
    bgInputIndices.push(nextIndex);
    args.push('-loop', '1', '-framerate', String(VIDEO_FPS), '-i', backgroundPath);
    nextIndex += 1;
  }

  let particlesInputIndex: number | undefined;
  if (motion?.particles.enabled && particlesPath) {
    particlesInputIndex = nextIndex;
    args.push('-stream_loop', '-1', '-i', particlesPath);
    nextIndex += 1;
  }

  return { args, bgInputIndices, particlesInputIndex };
}

export interface FinalVideoInputLayout {
  intro: number;
  thumb: number;
  thumbAudio: number;
  bgInputIndices: number[];
  particlesInputIndex?: number;
  podcastAudio: number;
  outro: number;
}

/** Input indices for generateFinalVideo when background inputs are appended after thumb audio. */
export function buildFinalVideoInputLayout(
  bgInputCount: number,
  hasParticles: boolean,
): FinalVideoInputLayout {
  const intro = 0;
  const thumb = 1;
  const thumbAudio = 2;
  const bgStart = 3;
  const bgInputIndices = Array.from({ length: bgInputCount }, (_, i) => bgStart + i);
  let next = bgStart + bgInputCount;
  const particlesInputIndex = hasParticles ? next++ : undefined;
  const podcastAudio = next++;
  const outro = next;

  return {
    intro,
    thumb,
    thumbAudio,
    bgInputIndices,
    particlesInputIndex,
    podcastAudio,
    outro,
  };
}

/** Generate a subtle looping particles overlay (WebM with alpha) if missing. */
export async function ensureParticlesOverlay(
  outputPath: string,
  ffmpegBin = 'ffmpeg',
): Promise<void> {
  try {
    await fs.access(outputPath);
    return;
  } catch {
    // generate below
  }

  logger.info(`Generating particles overlay → ${outputPath}`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const fps = VIDEO_FPS;
  const durationSec = 10;
  const frameCount = fps * durationSec;
  const particleCount = 22;
  const tmpDir = path.join(path.dirname(outputPath), '_particles_frames');
  await fs.mkdir(tmpDir, { recursive: true });

  const particles = Array.from({ length: particleCount }, () => ({
    x: Math.random() * VIDEO_WIDTH,
    y: Math.random() * VIDEO_HEIGHT,
    size: 2 + Math.random() * 3.5,
    speedX: (Math.random() - 0.5) * 18,
    speedY: -(8 + Math.random() * 14),
    opacity: 0.25 + Math.random() * 0.45,
  }));

  try {
    for (let frame = 0; frame < frameCount; frame++) {
      const circles = particles.map((p) => {
        const t = frame / fps;
        const x = (p.x + p.speedX * t + VIDEO_WIDTH) % VIDEO_WIDTH;
        const y = (p.y + p.speedY * t + VIDEO_HEIGHT) % VIDEO_HEIGHT;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${p.size.toFixed(1)}" fill="white" opacity="${p.opacity.toFixed(2)}"/>`;
      });

      const svg = `<svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">${circles.join('')}</svg>`;
      const framePath = path.join(tmpDir, `frame_${String(frame).padStart(4, '0')}.png`);
      await sharp(Buffer.from(svg)).png().toFile(framePath);
    }

    await execFileAsync(
      ffmpegBin,
      [
        '-framerate', String(fps),
        '-i', path.join(tmpDir, 'frame_%04d.png'),
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuva420p',
        '-b:v', '200k',
        '-an',
        '-y',
        outputPath,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );

    logger.success(`Particles overlay ready → ${outputPath}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

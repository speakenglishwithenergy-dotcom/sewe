import fs from 'fs/promises';
import path from 'path';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export interface BackgroundSlideshowConfig {
  directory: string;
  minIntervalSeconds?: number;
  maxIntervalSeconds?: number;
}

export interface SlideshowSegment {
  imagePath: string;
  durationSeconds: number;
}

const DEFAULT_MIN_INTERVAL = 60;
const DEFAULT_MAX_INTERVAL = 120;

export async function listBackgroundImages(directory: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  await walk(directory);
  return results.sort();
}

export function buildRandomSlideshowSchedule(
  images: readonly string[],
  totalDurationSeconds: number,
  minInterval = DEFAULT_MIN_INTERVAL,
  maxInterval = DEFAULT_MAX_INTERVAL,
): SlideshowSegment[] {
  if (images.length === 0) {
    throw new Error('No background images found for slideshow');
  }
  if (totalDurationSeconds <= 0) {
    throw new Error('Podcast duration must be positive for background slideshow');
  }
  if (minInterval <= 0 || maxInterval < minInterval) {
    throw new Error('Invalid slideshow interval range');
  }

  const segments: SlideshowSegment[] = [];
  let remaining = totalDurationSeconds;
  let lastImage: string | null = null;

  while (remaining > 0.05) {
    const interval =
      remaining <= maxInterval
        ? remaining
        : minInterval + Math.random() * (maxInterval - minInterval);
    const durationSeconds = Math.min(interval, remaining);

    let candidates = images;
    if (lastImage && images.length > 1) {
      candidates = images.filter((imagePath) => imagePath !== lastImage);
    }
    const imagePath = candidates[Math.floor(Math.random() * candidates.length)];
    lastImage = imagePath;

    segments.push({ imagePath, durationSeconds });
    remaining -= durationSeconds;
  }

  return segments;
}

/** Escape a path for FFmpeg concat demuxer `file` directives. */
function escapeConcatPath(filePath: string): string {
  return `'${filePath.replace(/'/g, "'\\''")}'`;
}

/**
 * Write an ffconcat list so FFmpeg can hold still images for timed durations
 * without a separate H.264 encode pass.
 */
export async function writeSlideshowConcatFile(
  segments: readonly SlideshowSegment[],
  outputPath: string,
): Promise<void> {
  if (segments.length === 0) {
    throw new Error('Slideshow requires at least one segment');
  }

  const lines = ['ffconcat version 1.0'];
  for (const segment of segments) {
    lines.push(`file ${escapeConcatPath(path.resolve(segment.imagePath))}`);
    lines.push(`duration ${segment.durationSeconds.toFixed(3)}`);
  }
  // Concat demuxer applies duration only when the next file is seen — repeat last.
  const last = segments[segments.length - 1];
  lines.push(`file ${escapeConcatPath(path.resolve(last.imagePath))}`);

  await fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf-8');
}

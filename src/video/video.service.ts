import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import {
  scaleShortThumbnailToVideoSize,
  SHORT_THUMB_HEIGHT,
  SHORT_THUMB_WIDTH,
} from '../ai/thumbnail-image.util';
import { FFmpegService } from '../ffmpeg/ffmpeg.service';
import { logger } from '../utils/logger';

const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;
const SHORT_VIDEO_WIDTH = SHORT_THUMB_WIDTH;
const SHORT_VIDEO_HEIGHT = SHORT_THUMB_HEIGHT;
const THUMBNAIL_VIDEO_DURATION = 5;

export class VideoService {
  constructor(private readonly ffmpeg: FFmpegService) {}

  async generatePodcastVideo(
    audioPath: string,
    subtitlesPath: string,
    backgroundPath: string,
    outputPath: string,
  ): Promise<void> {
    await this.ensureBackground(backgroundPath);

    await this.ffmpeg.generateVideo(
      backgroundPath,
      audioPath,
      subtitlesPath,
      outputPath,
    );

    logger.success(`Podcast video saved → ${outputPath}`);
  }

  async generateThumbnailVideo(thumbnailPath: string, outputPath: string): Promise<void> {
    await this.ffmpeg.generateImageVideo(thumbnailPath, outputPath, THUMBNAIL_VIDEO_DURATION);
    logger.success(`Thumbnail video saved → ${outputPath}`);
  }

  async composeFinalVideo(
    introPath: string,
    thumbnailVideoPath: string,
    podcastVideoPath: string,
    outroPath: string,
    outputPath: string,
  ): Promise<void> {
    await this.ffmpeg.composeFinalVideo(
      [introPath, thumbnailVideoPath, podcastVideoPath, outroPath],
      outputPath,
    );
    logger.success(`Final video saved → ${outputPath}`);
  }

  async generateShortVideo(
    audioPath: string,
    subtitlesPath: string,
    thumbnailPath: string,
    outputPath: string,
  ): Promise<void> {
    const resolvedThumbnail = await this.ensureShortThumbnailBackground(thumbnailPath);

    if (await this.fileExists(outputPath)) {
      logger.info('Existing short video found — removing to force regeneration');
      await fs.unlink(outputPath);
    }

    await this.ffmpeg.generateShortVideo(
      resolvedThumbnail,
      audioPath,
      subtitlesPath,
      outputPath,
    );

    logger.success(`Short video saved → ${outputPath}`);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureBackground(backgroundPath: string): Promise<void> {
    try {
      await fs.access(backgroundPath);
      logger.info(`Using background: ${backgroundPath}`);
    } catch {
      logger.warn('assets/background.png not found — generating default background...');
      await fs.mkdir(path.dirname(backgroundPath), { recursive: true });
      await this.generateDefaultBackground(backgroundPath);
    }
  }

  private async generateDefaultBackground(outputPath: string): Promise<void> {
    const svg = `<svg
  width="${VIDEO_WIDTH}"
  height="${VIDEO_HEIGHT}"
  xmlns="http://www.w3.org/2000/svg"
>
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#0f0c29"/>
      <stop offset="50%"  stop-color="#302b63"/>
      <stop offset="100%" stop-color="#24243e"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="25%">
      <stop offset="0%"   stop-color="#6c63ff" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#6c63ff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="url(#bg)"/>
  <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="url(#glow)"/>

  <!-- Decorative ring -->
  <circle cx="960" cy="420" r="140" fill="none" stroke="#6c63ff" stroke-width="3" opacity="0.4"/>
  <circle cx="960" cy="420" r="105" fill="none" stroke="#6c63ff" stroke-width="1.5" opacity="0.25"/>

  <!-- Microphone icon (simple geometric) -->
  <rect x="935" y="355" width="50" height="80" rx="25" fill="#6c63ff" opacity="0.85"/>
  <path d="M910 430 Q910 490 960 490 Q1010 490 1010 430" fill="none" stroke="#6c63ff" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
  <line x1="960" y1="490" x2="960" y2="520" stroke="#6c63ff" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
  <line x1="930" y1="520" x2="990" y2="520" stroke="#6c63ff" stroke-width="6" stroke-linecap="round" opacity="0.85"/>

  <!-- Channel name -->
  <text x="960" y="610"
    font-family="Arial, Helvetica, sans-serif"
    font-size="80"
    font-weight="bold"
    fill="#ffffff"
    text-anchor="middle"
    letter-spacing="2">Speak English</text>
  <text x="960" y="710"
    font-family="Arial, Helvetica, sans-serif"
    font-size="80"
    font-weight="bold"
    fill="#6c63ff"
    text-anchor="middle"
    letter-spacing="2">With Energy</text>

  <!-- Tagline -->
  <text x="960" y="790"
    font-family="Arial, Helvetica, sans-serif"
    font-size="34"
    fill="#a0a0d0"
    text-anchor="middle"
    letter-spacing="1">English Podcast for Learners</text>
</svg>`;

    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    logger.success(`Default background generated → ${outputPath}`);
  }

  /**
   * Normalize the short thumbnail to 1080×1920 for use as video background.
   */
  private async ensureShortThumbnailBackground(thumbnailPath: string): Promise<string> {
    await fs.access(thumbnailPath);
    logger.info(`Using short thumbnail as background: ${thumbnailPath}`);

    const meta = await sharp(thumbnailPath).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    const normalizedPath = path.join(
      path.dirname(thumbnailPath),
      '_short-thumbnail-background.png',
    );

    const raw = await fs.readFile(thumbnailPath);
    const scaled = await scaleShortThumbnailToVideoSize(raw);
    await fs.writeFile(normalizedPath, scaled);

    logger.info(
      `Short thumbnail scaled ${width}x${height} → ${SHORT_VIDEO_WIDTH}x${SHORT_VIDEO_HEIGHT} (full image, no crop)`,
    );
    return normalizedPath;
  }
}

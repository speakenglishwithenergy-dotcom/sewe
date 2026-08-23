import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import {
  scaleShortThumbnailToVideoSize,
  SHORT_THUMB_HEIGHT,
  SHORT_THUMB_WIDTH,
} from '../ai/thumbnail-image.util';
import type { BackgroundMotionConfig, BackgroundSlideshowConfig } from '../channel/channel.types';
import { FFmpegService } from '../ffmpeg/ffmpeg.service';
import {
  ensureParticlesOverlay,
  isMotionActive,
  resolveBackgroundMotion,
  type ResolvedPodcastBackground,
} from '../ffmpeg/background-motion.util';
import { logger } from '../utils/logger';
import {
  buildRandomSlideshowSchedule,
  listBackgroundImages,
  type SlideshowSegment,
  writeSlideshowConcatFile,
} from './background-slideshow.util';

export type { ResolvedPodcastBackground } from '../ffmpeg/background-motion.util';

const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;
const SHORT_VIDEO_WIDTH = SHORT_THUMB_WIDTH;
const SHORT_VIDEO_HEIGHT = SHORT_THUMB_HEIGHT;

export class VideoService {
  constructor(
    private readonly ffmpeg: FFmpegService,
    private readonly channelName = 'Podcast',
  ) {}

  async generatePodcastVideo(
    audioPath: string,
    subtitlesPath: string,
    background: ResolvedPodcastBackground,
    outputPath: string,
  ): Promise<void> {
    if (background.mode === 'image') {
      await this.ensureBackground(background.path);
    }

    await this.ffmpeg.generateVideo(
      background,
      audioPath,
      subtitlesPath,
      outputPath,
    );

    logger.success(`Podcast video saved → ${outputPath}`);
  }

  async resolvePodcastBackground(
    staticBackgroundPath: string,
    audioPath: string,
    projectDir: string,
    slideshow?: BackgroundSlideshowConfig,
    slideshowDirectory?: string,
    motionConfig?: BackgroundMotionConfig,
    channelDir?: string,
  ): Promise<ResolvedPodcastBackground> {
    const motion = channelDir
      ? resolveBackgroundMotion(motionConfig, channelDir)
      : undefined;

    if (motion?.particles.enabled && motion.particles.path) {
      await ensureParticlesOverlay(motion.particles.path, this.ffmpeg.getFfmpegBin());
    }

    const podcastDuration = await this.ffmpeg.getMediaDuration(audioPath);

    if (!slideshow || !slideshowDirectory) {
      await this.ensureBackground(staticBackgroundPath);
      return {
        path: staticBackgroundPath,
        mode: 'image',
        motion,
        podcastDurationSeconds: podcastDuration,
      };
    }

    const images = await listBackgroundImages(slideshowDirectory);
    if (images.length === 0) {
      logger.warn(
        `No images in ${slideshowDirectory} — falling back to static background`,
      );
      await this.ensureBackground(staticBackgroundPath);
      return {
        path: staticBackgroundPath,
        mode: 'image',
        motion,
        podcastDurationSeconds: podcastDuration,
      };
    }

    // Extra second so the finite slideshow outlives podcast audio + outro xfade.
    const slideshowDuration = podcastDuration + 1;
    const schedule = buildRandomSlideshowSchedule(
      images,
      slideshowDuration,
      slideshow.minIntervalSeconds,
      slideshow.maxIntervalSeconds,
    );

    if (isMotionActive(motion) && schedule.length > 1) {
      const crossfadePad = (schedule.length - 1) * motion!.slideCrossfadeSeconds;
      schedule[schedule.length - 1].durationSeconds += crossfadePad;
    }

    const concatPath = path.join(projectDir, '_background-slideshow.concat.txt');
    await writeSlideshowConcatFile(schedule, concatPath);

    if (isMotionActive(motion)) {
      const parts: string[] = [];
      if (motion!.kenBurns.enabled) {
        parts.push(`Ken Burns ${motion!.kenBurns.maxZoom}x`);
      }
      if (motion!.grain.enabled) {
        parts.push(`grain ${motion!.grain.strength}`);
      }
      if (motion!.particles.enabled) {
        parts.push(`particles ${(motion!.particles.opacity * 100).toFixed(0)}%`);
      }
      logger.info(
        `Background slideshow: ${schedule.length} slides over ${podcastDuration.toFixed(1)}s ` +
          `(${parts.join(' + ')}, ${motion!.slideCrossfadeSeconds}s crossfade)`,
      );
      return {
        path: staticBackgroundPath,
        mode: 'slideshow',
        segments: schedule,
        motion,
        podcastDurationSeconds: podcastDuration,
      };
    }

    logger.info(
      `Background slideshow: ${schedule.length} switches over ${podcastDuration.toFixed(1)}s ` +
        `(concat list, no pre-encode)`,
    );

    return {
      path: concatPath,
      mode: 'slideshow',
      motion,
      podcastDurationSeconds: podcastDuration,
    };
  }

  async generateFinalVideo(
    introPath: string,
    thumbnailPath: string,
    background: ResolvedPodcastBackground,
    audioPath: string,
    subtitlesPath: string,
    outroPath: string,
    outputPath: string,
    thumbnailAudioPath?: string,
  ): Promise<void> {
    if (background.mode === 'image') {
      await this.ensureBackground(background.path);
    }

    await this.ffmpeg.generateFinalVideo(
      introPath,
      thumbnailPath,
      background,
      audioPath,
      subtitlesPath,
      outroPath,
      outputPath,
      thumbnailAudioPath,
    );

    logger.success(`Final video saved → ${outputPath}`);
  }

  async generateThumbnailVideo(
    thumbnailPath: string,
    outputPath: string,
    thumbnailAudioPath?: string,
  ): Promise<void> {
    await this.ffmpeg.generateImageVideo(
      thumbnailPath,
      outputPath,
      undefined,
      undefined,
      undefined,
      thumbnailAudioPath,
    );
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
      [thumbnailVideoPath, introPath, podcastVideoPath, outroPath],
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
  <text x="960" y="660"
    font-family="Arial, Helvetica, sans-serif"
    font-size="72"
    font-weight="bold"
    fill="#ffffff"
    text-anchor="middle"
    letter-spacing="2">${this.channelName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>

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

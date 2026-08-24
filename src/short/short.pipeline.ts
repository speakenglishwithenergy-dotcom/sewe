import path from 'path';
import fs from 'fs/promises';
import { ShortScriptService } from '../ai/short-script.service';
import { KeywordsService, KEYWORDS_GENERATOR_VERSION } from '../ai/keywords.service';
import { ThumbnailService } from '../ai/thumbnail.service';
import { DISABLE_THUMBNAIL_GENERATION } from '../ai/thumbnail.config';
import { TTSService } from '../audio/tts.service';
import { SubtitleService } from '../subtitles/subtitle.service';
import { KEYWORD_HIGHLIGHTS_ENABLED } from '../subtitles/subtitle-highlight.util';
import { FFmpegService } from '../ffmpeg/ffmpeg.service';
import { VideoService } from '../video/video.service';
import {
  PodcastScript,
  Project,
  SHORT_PAUSE_BETWEEN_SEGMENTS,
  ShortScript,
} from '../types';
import { buildShortVideoPath } from '../utils/filename.util';
import { logger } from '../utils/logger';

export interface ShortPipelinePaths {
  projectDir: string;
  scriptPath: string;
  shortScriptPath: string;
  shortThumbnailPath: string;
  shortAudioDir: string;
  shortAudioPath: string;
  shortSubtitlesPath: string;
  shortVideoPath: string;
}

export interface ShortPipelineServices {
  shortScriptService: ShortScriptService;
  keywordsService: KeywordsService;
  thumbnailService: ThumbnailService;
  ttsService: TTSService;
  subtitleService: SubtitleService;
  ffmpegService: FFmpegService;
  videoService: VideoService;
}

const SHORT_TARGET_MIN_SECONDS = 90;
const SHORT_TARGET_MAX_SECONDS = 120;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function buildShortPaths(projectDir: string): ShortPipelinePaths {
  return {
    projectDir,
    scriptPath: path.join(projectDir, 'script.json'),
    shortScriptPath: path.join(projectDir, 'short-script.json'),
    shortThumbnailPath: path.join(projectDir, 'short-thumbnail.png'),
    shortAudioDir: path.join(projectDir, 'short', 'audio'),
    shortAudioPath: path.join(projectDir, 'short.mp3'),
    shortSubtitlesPath: path.join(projectDir, 'short-subtitles.ass'),
    shortVideoPath: path.join(projectDir, 'short.mp4'), // replaced once short script title is known
  };
}

export async function runShortPipeline(
  project: Project,
  podcastScript: PodcastScript,
  services: ShortPipelineServices,
  paths: ShortPipelinePaths,
): Promise<ShortScript> {
  const totalSteps = 6;

  // ── Step 1: Short script ─────────────────────────────────────────────────
  logger.step(1, totalSteps, 'Generating short script from podcast...');
  let shortScript: ShortScript;
  if (await fileExists(paths.shortScriptPath)) {
    logger.info('⏭  Short script already exists — loading from cache');
    const raw = await fs.readFile(paths.shortScriptPath, 'utf-8');
    shortScript = JSON.parse(raw) as ShortScript;
  } else {
    shortScript = await services.shortScriptService.generate(podcastScript, project.topic);
    await fs.writeFile(paths.shortScriptPath, JSON.stringify(shortScript, null, 2), 'utf-8');
    logger.info(`Short script saved → ${paths.shortScriptPath}`);
  }

  paths.shortVideoPath = buildShortVideoPath(paths.projectDir, podcastScript.title);

  if (
    KEYWORD_HIGHLIGHTS_ENABLED &&
    services.keywordsService.needsEnrichment(shortScript.script, shortScript.keywordsVersion)
  ) {
    const regenerateAll = shortScript.keywordsVersion !== KEYWORDS_GENERATOR_VERSION;
    shortScript.script = await services.keywordsService.enrichScript(
      shortScript.script,
      { topic: project.topic, title: shortScript.title },
      regenerateAll,
    );
    shortScript.keywordsVersion = KEYWORDS_GENERATOR_VERSION;
    await fs.writeFile(paths.shortScriptPath, JSON.stringify(shortScript, null, 2), 'utf-8');
    logger.info(`Short keywords saved → ${paths.shortScriptPath}`);

    if (await fileExists(paths.shortSubtitlesPath)) {
      await fs.unlink(paths.shortSubtitlesPath);
      logger.info('Removed cached short subtitles — will regenerate with updated keywords');
    }
  }

  // ── Step 2: Short thumbnail ──────────────────────────────────────────────
  logger.step(
    2,
    totalSteps,
    DISABLE_THUMBNAIL_GENERATION
      ? 'Waiting for manual short thumbnail (ChatGPT)...'
      : 'Generating short thumbnail (9:16)...',
  );
  await services.thumbnailService.generateShort(
    shortScript,
    { title: podcastScript.title, thumbnailText: podcastScript.thumbnailText, thumbnailScene: podcastScript.thumbnailScene },
    project.topic,
    paths.shortThumbnailPath,
  );

  // ── Step 3: TTS ──────────────────────────────────────────────────────────
  logger.step(3, totalSteps, 'Generating short voice audio...');
  await fs.mkdir(paths.shortAudioDir, { recursive: true });

  const shortAudioExists = await fileExists(paths.shortAudioPath);
  const shortSubtitlesExist = await fileExists(paths.shortSubtitlesPath);
  const needShortTts = !shortAudioExists || !shortSubtitlesExist;

  let segments;
  if (!needShortTts) {
    logger.info('⏭  Short audio already exists — skipping TTS');
  } else {
    segments = await services.ttsService.generateSegments(
      shortScript.script,
      paths.shortAudioDir,
      SHORT_PAUSE_BETWEEN_SEGMENTS,
    );

    const totalDuration = segments.reduce(
      (sum, s) => sum + s.duration + s.pauseAfter,
      0,
    );
    if (totalDuration < SHORT_TARGET_MIN_SECONDS) {
      logger.warn(
        `Short audio is ${totalDuration.toFixed(1)}s — below ${SHORT_TARGET_MIN_SECONDS}s target`,
      );
    } else if (totalDuration > SHORT_TARGET_MAX_SECONDS) {
      logger.warn(
        `Short audio is ${totalDuration.toFixed(1)}s — exceeds ${SHORT_TARGET_MAX_SECONDS}s target`,
      );
    }
  }

  // ── Step 4: Subtitles ────────────────────────────────────────────────────
  logger.step(4, totalSteps, 'Generating short subtitle file...');
  if (shortSubtitlesExist) {
    logger.info('⏭  Short subtitles already exist — skipping');
  } else {
    if (!segments) {
      throw new Error('Cannot generate short subtitles without audio segments');
    }
    await services.subtitleService.generateShort(segments, paths.shortSubtitlesPath);
  }

  // ── Step 5: Merge audio ──────────────────────────────────────────────────
  logger.step(5, totalSteps, 'Merging short audio segments...');
  if (shortAudioExists) {
    logger.info('⏭  Short merged audio already exists — skipping');
  } else {
    if (!segments) {
      throw new Error('Cannot merge short audio without audio segments');
    }
    const audioFiles = segments.map((s) => s.filePath);
    await services.ffmpegService.mergeAudioFiles(
      audioFiles,
      paths.shortAudioPath,
      SHORT_PAUSE_BETWEEN_SEGMENTS,
    );
    logger.success(`Short audio saved → ${paths.shortAudioPath}`);
  }

  // ── Step 6: Short video ──────────────────────────────────────────────────
  logger.step(6, totalSteps, 'Rendering short video (9:16)...');
  await fs.mkdir(path.dirname(paths.shortVideoPath), { recursive: true });
  if (await fileExists(paths.shortVideoPath)) {
    logger.info('⏭  Short video already exists — skipping');
  } else {
    await services.videoService.generateShortVideo(
      paths.shortAudioPath,
      paths.shortSubtitlesPath,
      paths.shortThumbnailPath,
      paths.shortVideoPath,
    );
  }

  return shortScript;
}

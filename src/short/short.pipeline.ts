import path from 'path';
import fs from 'fs/promises';
import { ShortScriptService } from '../ai/short-script.service';
import { ThumbnailService } from '../ai/thumbnail.service';
import { IpaService } from '../ai/ipa.service';
import { TTSService } from '../audio/tts.service';
import { SubtitleService } from '../subtitles/subtitle.service';
import { FFmpegService } from '../ffmpeg/ffmpeg.service';
import { VideoService } from '../video/video.service';
import {
  PodcastScript,
  Project,
  SHORT_PAUSE_BETWEEN_SEGMENTS,
  ShortScript,
} from '../types';
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
  thumbnailService: ThumbnailService;
  ipaService: IpaService;
  ttsService: TTSService;
  subtitleService: SubtitleService;
  ffmpegService: FFmpegService;
  videoService: VideoService;
}

const SHORT_TARGET_MAX_SECONDS = 60;

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
    shortSubtitlesPath: path.join(projectDir, 'short-subtitles.srt'),
    shortVideoPath: path.join(projectDir, 'short.mp4'),
  };
}

export async function runShortPipeline(
  project: Project,
  podcastScript: PodcastScript,
  services: ShortPipelineServices,
  paths: ShortPipelinePaths,
): Promise<ShortScript> {
  const totalSteps = 7;

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

  // ── Step 2: Short thumbnail ──────────────────────────────────────────────
  logger.step(2, totalSteps, 'Generating short thumbnail (9:16)...');
  if (await fileExists(paths.shortThumbnailPath)) {
    logger.info('⏭  Short thumbnail already exists — skipping');
  } else {
    await services.thumbnailService.generateShort(
      shortScript,
      project.topic,
      paths.shortThumbnailPath,
    );
  }

  // ── Step 3: IPA enrich ───────────────────────────────────────────────────
  logger.step(3, totalSteps, 'Enriching short script IPA...');
  if (!shortScript.script.every((line) => line.ipa)) {
    shortScript.script = await services.ipaService.enrichScript(shortScript.script);
    await fs.writeFile(paths.shortScriptPath, JSON.stringify(shortScript, null, 2), 'utf-8');
    logger.info(`IPA saved → ${paths.shortScriptPath}`);
  }

  // ── Step 4: TTS ──────────────────────────────────────────────────────────
  logger.step(4, totalSteps, 'Generating short voice audio...');
  await fs.mkdir(paths.shortAudioDir, { recursive: true });
  const segments = await services.ttsService.generateSegments(
    shortScript.script,
    paths.shortAudioDir,
    SHORT_PAUSE_BETWEEN_SEGMENTS,
  );

  const totalDuration = segments.reduce(
    (sum, s, i) =>
      sum + s.duration + (i < segments.length - 1 ? SHORT_PAUSE_BETWEEN_SEGMENTS : 0),
    0,
  );
  if (totalDuration > SHORT_TARGET_MAX_SECONDS) {
    logger.warn(
      `Short audio is ${totalDuration.toFixed(1)}s — exceeds ${SHORT_TARGET_MAX_SECONDS}s target`,
    );
  }

  // ── Step 5: Subtitles ────────────────────────────────────────────────────
  logger.step(5, totalSteps, 'Generating short subtitle file...');
  if (await fileExists(paths.shortSubtitlesPath)) {
    logger.info('⏭  Short subtitles already exist — skipping');
  } else {
    await services.subtitleService.generate(segments, paths.shortSubtitlesPath, 28);
  }

  // ── Step 6: Merge audio ──────────────────────────────────────────────────
  logger.step(6, totalSteps, 'Merging short audio segments...');
  if (await fileExists(paths.shortAudioPath)) {
    logger.info('⏭  Short merged audio already exists — skipping');
  } else {
    const audioFiles = segments.map((s) => s.filePath);
    await services.ffmpegService.mergeAudioFiles(
      audioFiles,
      paths.shortAudioPath,
      SHORT_PAUSE_BETWEEN_SEGMENTS,
    );
    logger.success(`Short audio saved → ${paths.shortAudioPath}`);
  }

  // ── Step 7: Short video ──────────────────────────────────────────────────
  logger.step(7, totalSteps, 'Rendering short video (9:16)...');
  if (await fileExists(paths.shortVideoPath)) {
    logger.info('Existing short video found — removing to force regeneration');
    await fs.unlink(paths.shortVideoPath);
  }
  await services.videoService.generateShortVideo(
    paths.shortAudioPath,
    paths.shortSubtitlesPath,
    paths.shortThumbnailPath,
    paths.shortVideoPath,
  );

  return shortScript;
}

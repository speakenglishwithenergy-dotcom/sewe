import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';

import { OpenAIService } from './ai/openai.service';
import { ScriptService } from './ai/script.service';
import { TTSService } from './audio/tts.service';
import { SubtitleService } from './subtitles/subtitle.service';
import { FFmpegService } from './ffmpeg/ffmpeg.service';
import { VideoService } from './video/video.service';
import { logger } from './utils/logger';

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT_DIR = process.cwd();
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const AUDIO_DIR = path.join(OUTPUT_DIR, 'audio');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');

const BACKGROUND_PATH = path.join(ASSETS_DIR, 'background.png');
const SCRIPT_PATH = path.join(OUTPUT_DIR, 'script.json');
const PODCAST_AUDIO_PATH = path.join(OUTPUT_DIR, 'podcast.mp3');
const SUBTITLES_PATH = path.join(OUTPUT_DIR, 'subtitles.srt');
const VIDEO_PATH = path.join(OUTPUT_DIR, 'video.mp4');

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

function parseTopic(): string {
  const args = process.argv.slice(2);
  const topicArg = args.find((a) => a.startsWith('--topic='));

  if (!topicArg) {
    logger.error('Missing required argument --topic');
    logger.info('Usage: npm run generate -- --topic="Why Smart People Stay Stuck"');
    process.exit(1);
  }

  // Strip surrounding quotes that the shell may have left in
  const topic = topicArg.replace('--topic=', '').replace(/^["']|["']$/g, '').trim();

  if (!topic) {
    logger.error('--topic value cannot be empty');
    process.exit(1);
  }

  return topic;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const topic = parseTopic();

  logger.divider('═');
  console.log('  🎙  Speak English With Energy — Podcast Generator');
  logger.divider('═');
  logger.info(`Topic: "${topic}"`);
  logger.info('');

  // Ensure output directories exist before anything writes to them
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(AUDIO_DIR, { recursive: true });

  // ── Wire up services ──────────────────────────────────────────────────────
  const openaiService = new OpenAIService();
  const ffmpegService = new FFmpegService();
  const scriptService = new ScriptService(openaiService);
  const ttsService = new TTSService(openaiService, ffmpegService);
  const subtitleService = new SubtitleService();
  const videoService = new VideoService(ffmpegService);

  // ── Step 0: Preflight ─────────────────────────────────────────────────────
  await ffmpegService.checkDependencies();
  logger.success('FFmpeg dependencies verified');

  // ── Step 1: Script ────────────────────────────────────────────────────────
  logger.step(1, 5, 'Generating podcast script...');
  const podcastScript = await scriptService.generate(topic);
  await fs.writeFile(SCRIPT_PATH, JSON.stringify(podcastScript, null, 2), 'utf-8');
  logger.info(`Script saved → ${SCRIPT_PATH}`);

  // ── Step 2: Voices ────────────────────────────────────────────────────────
  logger.step(2, 5, 'Generating voice audio...');
  const segments = await ttsService.generateSegments(podcastScript.script, AUDIO_DIR);

  // ── Step 3: Subtitles ─────────────────────────────────────────────────────
  logger.step(3, 5, 'Generating subtitle file...');
  await subtitleService.generate(segments, SUBTITLES_PATH);

  // ── Step 4: Merge audio ───────────────────────────────────────────────────
  logger.step(4, 5, 'Merging audio segments...');
  const audioFiles = segments.map((s) => s.filePath);
  await ffmpegService.mergeAudioFiles(audioFiles, PODCAST_AUDIO_PATH, 0.5);
  logger.success(`Podcast audio saved → ${PODCAST_AUDIO_PATH}`);

  // ── Step 5: Video ─────────────────────────────────────────────────────────
  logger.step(5, 5, 'Rendering video...');
  await videoService.generate(PODCAST_AUDIO_PATH, SUBTITLES_PATH, BACKGROUND_PATH, VIDEO_PATH);

  // ── Done ──────────────────────────────────────────────────────────────────
  logger.info('');
  logger.divider('═');
  logger.success('All done! Your podcast is ready.');
  logger.divider('═');
  console.log(`
  Title       : ${podcastScript.title}
  Thumbnail   : ${podcastScript.thumbnailText}
  Segments    : ${segments.length} dialogue lines
  Script      : ${SCRIPT_PATH}
  Audio       : ${PODCAST_AUDIO_PATH}
  Subtitles   : ${SUBTITLES_PATH}
  Video       : ${VIDEO_PATH}
  `);
  logger.info('YouTube Description:\n');
  console.log(podcastScript.description);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Fatal: ${message}`);
  if (err instanceof Error && err.stack) {
    logger.error(err.stack);
  }
  process.exit(1);
});

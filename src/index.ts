import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';

import { OpenAIService } from './ai/openai.service';
import { ScriptService } from './ai/script.service';
import { TTSService } from './audio/tts.service';
import { SupertonicService } from './audio/supertonic.service';
import { SubtitleService } from './subtitles/subtitle.service';
import { FFmpegService } from './ffmpeg/ffmpeg.service';
import { VideoService } from './video/video.service';
import { ProjectService } from './project/project.service';
import { PodcastScript, Project } from './types';
import { logger } from './utils/logger';

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT_DIR = process.cwd();
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const BACKGROUND_PATH = path.join(ASSETS_DIR, 'background.png');
const SUPERTONIC_DIR = path.join(ASSETS_DIR, 'supertonic-3');
const SUPERTONIC_ONNX_DIR = process.env.SUPERTONIC_ONNX_DIR ?? path.join(SUPERTONIC_DIR, 'onnx');
const SUPERTONIC_VOICES_DIR = process.env.SUPERTONIC_VOICES_DIR ?? path.join(SUPERTONIC_DIR, 'voice_styles');

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

type CliArgs =
  | { mode: 'new'; topic: string; test: boolean }
  | { mode: 'resume'; projectId: string; test: boolean }
  | { mode: 'list' };

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const test = args.includes('--test');

  if (args.includes('--list')) return { mode: 'list' };

  const projectArg = args.find((a) => a.startsWith('--project='));
  if (projectArg) {
    const projectId = projectArg.replace('--project=', '').trim();
    if (!projectId) {
      logger.error('--project value cannot be empty');
      process.exit(1);
    }
    return { mode: 'resume', projectId, test };
  }

  const topicArg = args.find((a) => a.startsWith('--topic='));
  if (!topicArg) {
    logger.error('Missing required argument: --topic, --project, or --list');
    logger.info('Usage:');
    logger.info('  npm run generate -- --topic="Why Smart People Stay Stuck"  # new project');
    logger.info('  npm run generate -- --topic="..." --test                    # quick test (script only)');
    logger.info('  npm run generate -- --project=20260612-143022               # resume project');
    logger.info('  npm run generate -- --list                                  # list all projects');
    process.exit(1);
  }

  const topic = topicArg.replace('--topic=', '').replace(/^["']|["']$/g, '').trim();
  if (!topic) {
    logger.error('--topic value cannot be empty');
    process.exit(1);
  }
  return { mode: 'new', topic, test };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // track time
  console.time('Total execution time');
  const args = parseArgs();
  const projectService = new ProjectService();

  // ── List projects ─────────────────────────────────────────────────────────
  if (args.mode === 'list') {
    const projects = await projectService.list();
    if (projects.length === 0) {
      logger.info('No projects found. Create one with --topic="..."');
      return;
    }
    logger.divider('─');
    logger.info(`Found ${projects.length} project(s):\n`);
    for (const p of projects) {
      console.log(`  ID      : ${p.id}`);
      console.log(`  Topic   : ${p.topic}`);
      console.log(`  Title   : ${p.title ?? '(script not yet generated)'}`);
      console.log(`  Created : ${new Date(p.createdAt).toLocaleString()}`);
      console.log(`  Updated : ${new Date(p.updatedAt).toLocaleString()}`);
      logger.divider('─');
    }
    return;
  }

  // ── Load or create project ────────────────────────────────────────────────
  let project: Project;

  if (args.mode === 'resume') {
    try {
      project = await projectService.load(args.projectId);
    } catch {
      logger.error(`Project "${args.projectId}" not found.`);
      logger.info('Use --list to see available projects.');
      process.exit(1);
    }
    logger.divider('═');
    console.log('  🎙  Speak English With Energy — Podcast Generator');
    logger.divider('═');
    logger.info(`Resuming project : ${project.id}`);
    logger.info(`Topic            : "${project.topic}"`);
    if (args.test) logger.info('Mode             : TEST (script only)');
  } else {
    project = await projectService.create(args.topic);
    logger.divider('═');
    console.log('  🎙  Speak English With Energy — Podcast Generator');
    logger.divider('═');
    logger.info(`New project      : ${project.id}`);
    logger.info(`Topic            : "${project.topic}"`);
    if (args.test) logger.info('Mode             : TEST (script only)');
  }

  logger.info('');

  // ── Derive paths from project ─────────────────────────────────────────────
  const PROJECT_DIR = projectService.getDir(project.id);
  const AUDIO_DIR = path.join(PROJECT_DIR, 'audio');
  const SCRIPT_PATH = path.join(PROJECT_DIR, 'script.json');
  const PODCAST_AUDIO_PATH = path.join(PROJECT_DIR, 'podcast.mp3');
  const SUBTITLES_PATH = path.join(PROJECT_DIR, 'subtitles.srt');
  const VIDEO_PATH = path.join(PROJECT_DIR, 'video.mp4');

  await fs.mkdir(AUDIO_DIR, { recursive: true });

  // ── Wire up services ──────────────────────────────────────────────────────
  const openaiService = new OpenAIService();
  const ffmpegService = new FFmpegService();
  const scriptService = new ScriptService(openaiService);

  // ── Step 0: Preflight ─────────────────────────────────────────────────────
  await ffmpegService.checkDependencies();
  logger.success('FFmpeg dependencies verified');

  // ── Step 1: Script ────────────────────────────────────────────────────────
  const totalSteps = args.test ? 1 : 5;
  logger.step(1, totalSteps, 'Generating podcast script...');
  let podcastScript: PodcastScript;
  if (await fileExists(SCRIPT_PATH)) {
    logger.info(`⏭  Script already exists — loading from cache`);
    const raw = await fs.readFile(SCRIPT_PATH, 'utf-8');
    podcastScript = JSON.parse(raw);
  } else {
    podcastScript = await scriptService.generate(project.topic, args.test);
    await fs.writeFile(SCRIPT_PATH, JSON.stringify(podcastScript, null, 2), 'utf-8');
    logger.info(`Script saved → ${SCRIPT_PATH}`);
  }

  // Persist title/description into project metadata if not yet saved
  if (!project.title) {
    project.title = podcastScript.title;
    project.description = podcastScript.description;
    project.thumbnailText = podcastScript.thumbnailText;
    await projectService.save(project);
  }

  // ── Test mode: stop after script ─────────────────────────────────────────
  if (args.test) {
    logger.info('');
    logger.divider('═');
    logger.success('[TEST] Script generated successfully.');
    logger.divider('═');
    console.log(`
  Project ID : ${project.id}
  Title      : ${podcastScript.title}
  Lines      : ${podcastScript.script.length} dialogue lines
  Script     : ${SCRIPT_PATH}
  `);
    console.log('First 3 lines:');
    podcastScript.script.slice(0, 3).forEach((l) => console.log(`  ${l.speaker}: ${l.text}`));
    return;
  }

  // ── Wire up TTS / video services ─────────────────────────────────────────
  const supertonicService = new SupertonicService(SUPERTONIC_ONNX_DIR, SUPERTONIC_VOICES_DIR);
  const ttsService = new TTSService(supertonicService, ffmpegService);
  const subtitleService = new SubtitleService();
  const videoService = new VideoService(ffmpegService);

  // ── Step 2: Voices ───────────────────────────────────────────────────────────
  logger.step(2, totalSteps, 'Generating voice audio...');
  const segments = await ttsService.generateSegments(podcastScript.script, AUDIO_DIR);

  // ── Step 3: Subtitles ─────────────────────────────────────────────────────
  logger.step(3, totalSteps, 'Generating subtitle file...');
  if (await fileExists(SUBTITLES_PATH)) {
    logger.info(`⏭  Subtitles already exist — skipping`);
  } else {
    await subtitleService.generate(segments, SUBTITLES_PATH);
  }

  // ── Step 4: Merge audio ───────────────────────────────────────────────────
  logger.step(4, totalSteps, 'Merging audio segments...');
  if (await fileExists(PODCAST_AUDIO_PATH)) {
    logger.info(`⏭  Merged audio already exists — skipping`);
  } else {
    const audioFiles = segments.map((s) => s.filePath);
    await ffmpegService.mergeAudioFiles(audioFiles, PODCAST_AUDIO_PATH, 0.5);
    logger.success(`Podcast audio saved → ${PODCAST_AUDIO_PATH}`);
  }

  // ── Step 5: Video ─────────────────────────────────────────────────────────
  logger.step(5, totalSteps, 'Rendering video...');
  if (await fileExists(VIDEO_PATH)) {
    // logger.info(`⏭  Video already exists — skipping`);
    // remove existing video to force regeneration, since we may have updated the script or audio
    logger.info(`Existing video found — removing to force regeneration`);
    await fs.unlink(VIDEO_PATH);
  } else {
  }
  await videoService.generate(PODCAST_AUDIO_PATH, SUBTITLES_PATH, BACKGROUND_PATH, VIDEO_PATH);

  // ── Done ──────────────────────────────────────────────────────────────────
  logger.info('');
  logger.divider('═');
  logger.success('All done! Your podcast is ready.');
  logger.divider('═');
  console.log(`
  Project ID  : ${project.id}
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
  console.timeEnd('Total execution time');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Fatal: ${message}`);
  if (err instanceof Error && err.stack) {
    logger.error(err.stack);
  }
  process.exit(1);
});

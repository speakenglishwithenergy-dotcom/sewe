import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';

import { OpenAIService } from './ai/openai.service';
import { IpaService } from './ai/ipa.service';
import { KeywordsService, KEYWORDS_GENERATOR_VERSION } from './ai/keywords.service';
import { ScriptService } from './ai/script.service';
import { ShortScriptService } from './ai/short-script.service';
import { ThumbnailService } from './ai/thumbnail.service';
import { TTSService } from './audio/tts.service';
import { SupertonicService } from './audio/supertonic.service';
import { SubtitleService } from './subtitles/subtitle.service';
import { KEYWORD_HIGHLIGHTS_ENABLED } from './subtitles/subtitle-highlight.util';
import { FFmpegService } from './ffmpeg/ffmpeg.service';
import { VideoService } from './video/video.service';
import { ProjectService } from './project/project.service';
import { SocialMetadataService } from './social/social-metadata.service';
import {
  SOCIAL_METADATA_JSON,
  YOUTUBE_DESCRIPTION_TXT,
  YOUTUBE_SHORT_CAPTION_TXT,
  YOUTUBE_TAGS_TXT,
} from './social/social-metadata.export';
import { buildShortPaths, runShortPipeline } from './short/short.pipeline';
import { PodcastScript, Project } from './types';
import { logger } from './utils/logger';

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT_DIR = process.cwd();
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const BACKGROUND_PATH = path.join(ASSETS_DIR, 'background.png');
const INTRO_PATH = path.join(ASSETS_DIR, 'intro.mp4');
const OUTRO_PATH = path.join(ASSETS_DIR, 'outro.mp4');
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
  | { mode: 'new'; topic: string; test: boolean; short: boolean; force: boolean }
  | { mode: 'resume'; projectId: string; test: boolean; short: boolean; force: boolean }
  | { mode: 'list' };

async function removeIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // already absent
  }
}

async function removeDirIfExists(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // already absent
  }
}

/** Clear cached outputs so the pipeline re-runs; keeps thumbnail.png and short-thumbnail.png. */
async function clearProjectCache(
  projectDir: string,
  opts: { shortOnly: boolean },
): Promise<void> {
  const shortArtifacts = [
    path.join(projectDir, 'short-script.json'),
    path.join(projectDir, 'short.mp3'),
    path.join(projectDir, 'short-subtitles.ass'),
    path.join(projectDir, 'short.mp4'),
    path.join(projectDir, 'short'),
  ];

  const podcastArtifacts = [
    path.join(projectDir, 'script.json'),
    path.join(projectDir, 'audio'),
    path.join(projectDir, 'podcast.mp3'),
    path.join(projectDir, 'subtitles.ass'),
    path.join(projectDir, 'podcast-video.mp4'),
    path.join(projectDir, 'thumbnail-video.mp4'),
    path.join(projectDir, 'final.mp4'),
  ];

  const targets = opts.shortOnly ? shortArtifacts : [...podcastArtifacts, ...shortArtifacts];

  for (const target of targets) {
    const stat = await fs.stat(target).catch(() => null);
    if (!stat) continue;
    if (stat.isDirectory()) {
      await removeDirIfExists(target);
    } else {
      await removeIfExists(target);
    }
  }

  logger.info('Cleared cached artifacts (thumbnails preserved, script will regenerate)');
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const test = args.includes('--test');
  const short = args.includes('--short');
  const force = args.includes('--force');

  if (args.includes('--list')) return { mode: 'list' };

  const projectArg = args.find((a) => a.startsWith('--project='));
  if (projectArg) {
    const projectId = projectArg.replace('--project=', '').trim();
    if (!projectId) {
      logger.error('--project value cannot be empty');
      process.exit(1);
    }
    if (force && test) {
      logger.error('--force cannot be used with --test');
      process.exit(1);
    }
    return { mode: 'resume', projectId, test, short, force };
  }

  const topicArg = args.find((a) => a.startsWith('--topic='));
  if (!topicArg) {
    logger.error('Missing required argument: --topic, --project, or --list');
    logger.info('Usage:');
    logger.info('  npm run generate -- --topic="Why Smart People Stay Stuck"  # new project (podcast + short)');
    logger.info('  npm run generate -- --topic="..." --test                    # quick test (script only)');
    logger.info('  npm run generate -- --topic="..." --short                   # script + short only');
    logger.info('  npm run generate -- --project=20260612-143022               # resume project (podcast + short)');
    logger.info('  npm run generate -- --project=20260612-143022 --force         # re-run from scratch (keep thumbnails)');
    logger.info('  npm run generate -- --project=20260612-143022 --short       # short only');
    logger.info('  npm run generate -- --project=20260612-143022 --short --force # re-run short only');
    logger.info('  npm run generate -- --list                                  # list all projects');
    process.exit(1);
  }

  const topic = topicArg.replace('--topic=', '').replace(/^["']|["']$/g, '').trim();
  if (!topic) {
    logger.error('--topic value cannot be empty');
    process.exit(1);
  }
  if (force) {
    logger.error('--force requires --project (use it to re-run an existing project)');
    process.exit(1);
  }
  return { mode: 'new', topic, test, short, force };
}

function printSocialMetadataSummary(projectDir: string, hasShort: boolean): void {
  console.log(`
  Social Meta   : ${path.join(projectDir, SOCIAL_METADATA_JSON)}
  YT Desc       : ${path.join(projectDir, YOUTUBE_DESCRIPTION_TXT)}
  YT Tags       : ${path.join(projectDir, YOUTUBE_TAGS_TXT)}`);
  if (hasShort) {
    console.log(`  YT Short Cap  : ${path.join(projectDir, YOUTUBE_SHORT_CAPTION_TXT)}`);
  }
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
    if (args.short) logger.info('Mode             : SHORT only');
    if (args.force) logger.info('Mode             : FORCE (re-run, keep thumbnails)');
  } else {
    project = await projectService.create(args.topic);
    logger.divider('═');
    console.log('  🎙  Speak English With Energy — Podcast Generator');
    logger.divider('═');
    logger.info(`New project      : ${project.id}`);
    logger.info(`Topic            : "${project.topic}"`);
    if (args.test) logger.info('Mode             : TEST (script only)');
    if (args.short) logger.info('Mode             : SHORT only');
  }

  logger.info('');

  // ── Derive paths from project ─────────────────────────────────────────────
  const PROJECT_DIR = projectService.getDir(project.id);
  const AUDIO_DIR = path.join(PROJECT_DIR, 'audio');
  const SCRIPT_PATH = path.join(PROJECT_DIR, 'script.json');
  const PODCAST_AUDIO_PATH = path.join(PROJECT_DIR, 'podcast.mp3');
  const SUBTITLES_PATH = path.join(PROJECT_DIR, 'subtitles.ass');
  const THUMBNAIL_PATH = path.join(PROJECT_DIR, 'thumbnail.png');
  const FINAL_VIDEO_PATH = path.join(PROJECT_DIR, 'final.mp4');

  await fs.mkdir(AUDIO_DIR, { recursive: true });

  if (args.mode === 'resume' && args.force) {
    await clearProjectCache(PROJECT_DIR, { shortOnly: args.short });
  }

  // ── Wire up services ──────────────────────────────────────────────────────
  const openaiService = new OpenAIService();
  const ffmpegService = new FFmpegService();
  const scriptService = new ScriptService(openaiService);
  const shortScriptService = new ShortScriptService(openaiService);
  const thumbnailService = new ThumbnailService(openaiService, ASSETS_DIR);
  const socialMetadataService = new SocialMetadataService(openaiService);

  // ── Step 0: Preflight ─────────────────────────────────────────────────────
  await ffmpegService.checkDependencies();
  logger.success('FFmpeg dependencies verified');

  // ── Step 1: Script ────────────────────────────────────────────────────────
  logger.step(1, args.test ? 1 : 6, 'Generating podcast script...');
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

  // Persist title/description into project metadata
  const shouldUpdateMeta =
    !project.title || (args.mode === 'resume' && args.force && !args.short);
  if (shouldUpdateMeta) {
    project.title = podcastScript.title;
    project.description = podcastScript.description;
    project.thumbnailText = podcastScript.thumbnailText;
    await projectService.save(project);
  }

  // ── Test mode: stop after script ─────────────────────────────────────────
  if (args.test) {
    const socialMeta = await socialMetadataService.loadOrGenerate(
      PROJECT_DIR,
      podcastScript,
      project.topic,
    );

    logger.info('');
    logger.divider('═');
    logger.success('[TEST] Script generated successfully.');
    logger.divider('═');
    console.log(`
  Project ID : ${project.id}
  Title      : ${podcastScript.title}
  Thumbnail  : ${podcastScript.thumbnailText}
  Lines      : ${podcastScript.script.length} dialogue lines
  Script     : ${SCRIPT_PATH}`);
    printSocialMetadataSummary(PROJECT_DIR, false);
    console.log(`
  `);
    console.log('First 3 lines:');
    podcastScript.script.slice(0, 3).forEach((l) => console.log(`  ${l.speaker}: ${l.text}`));
    logger.info('\nYouTube Description (copy-paste ready):\n');
    console.log(socialMeta.youtube.description);
    logger.info('\nPinned comment:\n');
    console.log(socialMeta.youtube.pinnedComment);
    return;
  }

  // ── Short-only mode: script + short pipeline, skip podcast ───────────────
  if (args.short) {
    const supertonicService = new SupertonicService(SUPERTONIC_ONNX_DIR, SUPERTONIC_VOICES_DIR);
    const ttsService = new TTSService(supertonicService, ffmpegService);
    const keywordsService = new KeywordsService(openaiService);
    const subtitleService = new SubtitleService();
    const videoService = new VideoService(ffmpegService);
    const shortPaths = buildShortPaths(PROJECT_DIR);

    const shortScript = await runShortPipeline(project, podcastScript, {
      shortScriptService,
      keywordsService,
      thumbnailService,
      ttsService,
      subtitleService,
      ffmpegService,
      videoService,
    }, shortPaths);

    const socialMeta = await socialMetadataService.loadOrGenerate(
      PROJECT_DIR,
      podcastScript,
      project.topic,
      { shortScript },
    );

    logger.info('');
    logger.divider('═');
    logger.success('Short video ready!');
    logger.divider('═');
    console.log(`
  Project ID      : ${project.id}
  Short Title     : ${shortScript.title}
  Hook            : ${shortScript.hook}
  Thumbnail Text  : ${shortScript.thumbnailText}
  Lines           : ${shortScript.script.length} dialogue lines
  Short Script    : ${shortPaths.shortScriptPath}
  Short Thumbnail : ${shortPaths.shortThumbnailPath}
  Short Audio     : ${shortPaths.shortAudioPath}
  Short Subtitles : ${shortPaths.shortSubtitlesPath}
  Short Video     : ${shortPaths.shortVideoPath}`);
    printSocialMetadataSummary(PROJECT_DIR, true);
    console.log(`
  `);
    logger.info('YouTube Description:\n');
    console.log(socialMeta.youtube.description);
    if (socialMeta.youtubeShort) {
      logger.info('\nYouTube Short Caption:\n');
      console.log(`${socialMeta.youtubeShort.caption}\n\n${socialMeta.youtubeShort.hashtags.join(' ')}`);
      logger.info('\nShort pinned comment:\n');
      console.log(socialMeta.youtubeShort.pinnedComment);
    }
    console.timeEnd('Total execution time');
    return;
  }

  // ── Step 2: Thumbnail ─────────────────────────────────────────────────────
  const totalSteps = 6;
  logger.step(2, totalSteps, 'Generating YouTube thumbnail...');
  if (await fileExists(THUMBNAIL_PATH)) {
    logger.info(`⏭  Thumbnail already exists — skipping`);
  } else {
    await thumbnailService.generate(podcastScript, project.topic, THUMBNAIL_PATH);
  }

  // ── Wire up TTS / video services ─────────────────────────────────────────
  const supertonicService = new SupertonicService(SUPERTONIC_ONNX_DIR, SUPERTONIC_VOICES_DIR);
  const ttsService = new TTSService(supertonicService, ffmpegService);
  const ipaService = new IpaService(openaiService);
  const keywordsService = new KeywordsService(openaiService);
  const subtitleService = new SubtitleService();
  const videoService = new VideoService(ffmpegService);

  // ── Step 2: Voices ───────────────────────────────────────────────────────────
  logger.step(3, totalSteps, 'Generating voice audio...');

  if (!podcastScript.script.every((line) => line.ipa)) {
    podcastScript.script = await ipaService.enrichScript(podcastScript.script);
    await fs.writeFile(SCRIPT_PATH, JSON.stringify(podcastScript, null, 2), 'utf-8');
    logger.info(`IPA saved → ${SCRIPT_PATH}`);
  }

  if (
    KEYWORD_HIGHLIGHTS_ENABLED &&
    keywordsService.needsEnrichment(podcastScript.script, podcastScript.keywordsVersion)
  ) {
    const regenerateAll = podcastScript.keywordsVersion !== KEYWORDS_GENERATOR_VERSION;
    podcastScript.script = await keywordsService.enrichScript(
      podcastScript.script,
      { topic: project.topic, title: podcastScript.title },
      regenerateAll,
    );
    podcastScript.keywordsVersion = KEYWORDS_GENERATOR_VERSION;
    await fs.writeFile(SCRIPT_PATH, JSON.stringify(podcastScript, null, 2), 'utf-8');
    logger.info(`Keywords saved → ${SCRIPT_PATH}`);

    if (await fileExists(SUBTITLES_PATH)) {
      await fs.unlink(SUBTITLES_PATH);
      logger.info('Removed cached subtitles — will regenerate with updated keywords');
    }
  }

  const segments = await ttsService.generateSegments(podcastScript.script, AUDIO_DIR);

  // ── Step 4: Subtitles ─────────────────────────────────────────────────────
  logger.step(4, totalSteps, 'Generating subtitle file...');
  if (!KEYWORD_HIGHLIGHTS_ENABLED && await fileExists(SUBTITLES_PATH)) {
    await fs.unlink(SUBTITLES_PATH);
    logger.info('Removed cached subtitles — highlights disabled, will regenerate plain text');
  }
  if (await fileExists(SUBTITLES_PATH)) {
    logger.info(`⏭  Subtitles already exist — skipping`);
  } else {
    await subtitleService.generate(segments, SUBTITLES_PATH);
  }

  // ── Step 5: Merge audio ───────────────────────────────────────────────────
  logger.step(5, totalSteps, 'Merging audio segments...');
  if (await fileExists(PODCAST_AUDIO_PATH)) {
    logger.info(`⏭  Merged audio already exists — skipping`);
  } else {
    const audioFiles = segments.map((s) => s.filePath);
    await ffmpegService.mergeAudioFiles(audioFiles, PODCAST_AUDIO_PATH, 0.5);
    logger.success(`Podcast audio saved → ${PODCAST_AUDIO_PATH}`);
  }

  // ── Step 6: Final video + Short (parallel) ────────────────────────────────
  logger.step(6, totalSteps, 'Rendering final video + short (parallel)...');

  if (await fileExists(FINAL_VIDEO_PATH)) {
    logger.info('Existing final video found — removing to force regeneration');
    await fs.unlink(FINAL_VIDEO_PATH);
  }

  const shortPaths = buildShortPaths(PROJECT_DIR);

  const [shortScript] = await Promise.all([
    runShortPipeline(project, podcastScript, {
      shortScriptService,
      keywordsService,
      thumbnailService,
      ttsService,
      subtitleService,
      ffmpegService,
      videoService,
    }, shortPaths),
    videoService.generateFinalVideo(
      INTRO_PATH,
      THUMBNAIL_PATH,
      BACKGROUND_PATH,
      PODCAST_AUDIO_PATH,
      SUBTITLES_PATH,
      OUTRO_PATH,
      FINAL_VIDEO_PATH,
    ),
  ]);

  const socialMeta = await socialMetadataService.loadOrGenerate(
    PROJECT_DIR,
    podcastScript,
    project.topic,
    { shortScript, segments },
  );

  // ── Done ──────────────────────────────────────────────────────────────────
  logger.info('');
  logger.divider('═');
  logger.success('All done! Your podcast and short are ready.');
  logger.divider('═');
  console.log(`
  Project ID  : ${project.id}
  Title       : ${podcastScript.title}
  Thumbnail   : ${podcastScript.thumbnailText}
  Segments    : ${segments.length} dialogue lines
  Script      : ${SCRIPT_PATH}
  Thumbnail   : ${THUMBNAIL_PATH}
  Audio       : ${PODCAST_AUDIO_PATH}
  Subtitles   : ${SUBTITLES_PATH}
  Final Video : ${FINAL_VIDEO_PATH}

  Short Title     : ${shortScript.title}
  Short Thumbnail : ${shortPaths.shortThumbnailPath}
  Short Video     : ${shortPaths.shortVideoPath}`);
  printSocialMetadataSummary(PROJECT_DIR, true);
  console.log(`
  `);
  logger.info('YouTube Description (copy-paste ready):\n');
  console.log(socialMeta.youtube.description);
  logger.info('\nYouTube Tags:\n');
  console.log(socialMeta.youtube.tags.join(', '));
  logger.info('\nPinned comment:\n');
  console.log(socialMeta.youtube.pinnedComment);
  if (socialMeta.youtubeShort) {
    logger.info('\nYouTube Short Caption:\n');
    console.log(`${socialMeta.youtubeShort.caption}\n\n${socialMeta.youtubeShort.hashtags.join(' ')}`);
    logger.info('\nShort pinned comment:\n');
    console.log(socialMeta.youtubeShort.pinnedComment);
  }
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

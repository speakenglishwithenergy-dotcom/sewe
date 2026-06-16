import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';

import { OpenAIService } from './ai/openai.service';
import { IpaService } from './ai/ipa.service';
import { KeywordsService, KEYWORDS_GENERATOR_VERSION } from './ai/keywords.service';
import { ScriptService } from './ai/script.service';
import { ShortScriptService } from './ai/short-script.service';
import { ThumbnailService } from './ai/thumbnail.service';
import { DISABLE_THUMBNAIL_GENERATION } from './ai/thumbnail.config';
import { TTSService } from './audio/tts.service';
import { SupertonicService } from './audio/supertonic.service';
import { SubtitleService } from './subtitles/subtitle.service';
import { resolveSubtitleStyle } from './subtitles/subtitle-config.util';
import { resolveWaveVisualizer } from './ffmpeg/wave-config.util';
import { KEYWORD_HIGHLIGHTS_ENABLED } from './subtitles/subtitle-highlight.util';
import { FFmpegService } from './ffmpeg/ffmpeg.service';
import { VideoService } from './video/video.service';
import { ProjectService } from './project/project.service';
import { ChannelService } from './channel/channel.service';
import { ChannelContext } from './channel/channel.types';
import { SocialMetadataService } from './social/social-metadata.service';
import {
  FACEBOOK_LONG_CAPTION,
  FACEBOOK_LONG_FIRST_COMMENT,
  FACEBOOK_SHORT_CAPTION,
  FACEBOOK_SHORT_FIRST_COMMENT,
  TIKTOK_SHORT_CAPTION,
  getPublishOutputDir,
  resolveSocialMetadataPath,
  YOUTUBE_LONG_DESCRIPTION,
  YOUTUBE_LONG_PINNED_COMMENT,
  YOUTUBE_LONG_TAGS,
  YOUTUBE_LONG_TITLE,
  YOUTUBE_SHORT_CAPTION,
  YOUTUBE_SHORT_PINNED_COMMENT,
  YOUTUBE_SHORT_TITLE,
} from './social/social-metadata.export';
import { formatChannelShortCaption, formatFacebookShortCaption } from './social/social-metadata.normalize';
import { buildShortPaths, runShortPipeline } from './short/short.pipeline';
import { SocialPublisherService } from './social/social-publisher.service';
import { PublishFormat } from './social/publish.types';
import { PodcastScript, Project, ShortScript } from './types';
import { buildPodcastVideoPath, buildShortVideoPath } from './utils/filename.util';
import { logger } from './utils/logger';

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT_DIR = process.cwd();
const SUPERTONIC_DIR = path.join(ROOT_DIR, 'assets', 'supertonic-3');
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

type CacheScope = 'all' | 'short' | 'podcast';

/** normalize = re-export from cache; generate = LLM; auto = normalize if cache exists else generate */
type MetadataRegenMode = 'auto' | 'normalize' | 'generate';

type CliArgs =
  | {
      mode: 'new';
      channelId: string;
      topic: string;
      test: boolean;
      short: boolean;
      podcast: boolean;
      force: boolean;
      metadataRegen?: MetadataRegenMode;
      publish?: boolean;
      forcePublish?: boolean;
    }
  | {
      mode: 'resume';
      projectId: string;
      test: boolean;
      short: boolean;
      podcast: boolean;
      force: boolean;
      metadataRegen?: MetadataRegenMode;
      publish?: boolean;
      forcePublish?: boolean;
    }
  | { mode: 'list'; channelId?: string }
  | { mode: 'list-channels' };

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

/** Resolve podcast/short video paths (title-based + legacy generic names). */
async function resolveVideoOutputPaths(projectDir: string): Promise<{
  podcast: string[];
  short: string[];
}> {
  const podcast = [path.join(projectDir, 'final.mp4')];
  const short = [path.join(projectDir, 'short.mp4')];

  const scriptPath = path.join(projectDir, 'script.json');
  if (await fileExists(scriptPath)) {
    const script = JSON.parse(await fs.readFile(scriptPath, 'utf-8')) as PodcastScript;
    podcast.push(buildPodcastVideoPath(projectDir, script.title));
    short.push(buildShortVideoPath(projectDir, script.title));
  }

  return { podcast, short };
}

/** Clear cached outputs so the pipeline re-runs; keeps thumbnail.png and short-thumbnail.png. */
async function clearProjectCache(
  projectDir: string,
  scope: CacheScope,
): Promise<void> {
  const videoPaths = await resolveVideoOutputPaths(projectDir);

  const shortArtifacts = [
    path.join(projectDir, 'short-script.json'),
    path.join(projectDir, 'short.mp3'),
    path.join(projectDir, 'short-subtitles.ass'),
    path.join(projectDir, 'short'),
    ...videoPaths.short,
  ];

  const podcastArtifacts = [
    path.join(projectDir, 'script.json'),
    path.join(projectDir, 'audio'),
    path.join(projectDir, 'podcast.mp3'),
    path.join(projectDir, 'subtitles.ass'),
    path.join(projectDir, 'podcast-video.mp4'),
    path.join(projectDir, 'thumbnail-video.mp4'),
    ...videoPaths.podcast,
  ];

  const targets =
    scope === 'short'
      ? shortArtifacts
      : scope === 'podcast'
        ? podcastArtifacts
        : [...podcastArtifacts, ...shortArtifacts];

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

function parseMetadataRegenArg(args: string[]): MetadataRegenMode | undefined {
  const valued = args.find((a) => a.startsWith('--regenerate-metadata='));
  if (valued) {
    const mode = valued.replace('--regenerate-metadata=', '').trim();
    if (mode === 'normalize' || mode === 'generate') return mode;
    logger.error('--regenerate-metadata must be "normalize" or "generate"');
    process.exit(1);
  }
  if (args.includes('--regenerate-metadata')) return 'auto';
  return undefined;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const test = args.includes('--test');
  const short = args.includes('--short');
  const podcast = args.includes('--podcast');
  const force = args.includes('--force');
  const publish = args.includes('--publish');
  const forcePublish = args.includes('--force-publish');
  const metadataRegen = parseMetadataRegenArg(args);

  if (short && podcast) {
    logger.error('--short and --podcast cannot be used together');
    process.exit(1);
  }

  if (metadataRegen && (test || short || podcast || force)) {
    logger.error('--regenerate-metadata cannot be combined with --test, --short, --podcast, or --force');
    process.exit(1);
  }

  if (publish && test) {
    logger.error('--publish cannot be used with --test (no video is generated in test mode)');
    process.exit(1);
  }

  if (args.includes('--list-channels')) return { mode: 'list-channels' };

  const listChannelArg = args.find((a) => a.startsWith('--list'));
  if (listChannelArg === '--list') {
    const channelFilter = args.find((a) => a.startsWith('--channel='));
    return {
      mode: 'list',
      channelId: channelFilter?.replace('--channel=', '').trim() || undefined,
    };
  }

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
    if (metadataRegen) {
      return { mode: 'resume', projectId, test: false, short: false, podcast: false, force: false, metadataRegen, publish, forcePublish };
    }
    return { mode: 'resume', projectId, test, short, podcast, force, publish, forcePublish };
  }

  const topicArg = args.find((a) => a.startsWith('--topic='));
  if (!topicArg) {
    logger.error('Missing required argument: --channel + --topic, --project, --list, or --list-channels');
    logger.info('Usage:');
    logger.info('  npm run generate -- --channel=speak-english-with-energy --topic="..."');
    logger.info('  npm run generate -- --list-channels');
    logger.info('  npm run generate -- --list [--channel=ID]');
    logger.info('  npm run generate -- --project=20260612-143022');
    process.exit(1);
  }

  const channelArg = args.find((a) => a.startsWith('--channel='));
  if (!channelArg) {
    logger.error('Missing required argument: --channel=CHANNEL_ID (required for new projects)');
    logger.info('Run `npm run generate -- --list-channels` to see available channels.');
    process.exit(1);
  }
  const channelId = channelArg.replace('--channel=', '').trim();
  if (!channelId) {
    logger.error('--channel value cannot be empty');
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
  if (metadataRegen) {
    logger.error('--regenerate-metadata requires --project');
    process.exit(1);
  }
  return { mode: 'new', channelId, topic, test, short, podcast, force, publish, forcePublish };
}

async function resolveMetadataRegenerate(
  projectDir: string,
  mode: MetadataRegenMode,
): Promise<boolean> {
  if (mode === 'generate') return true;
  if (mode === 'normalize') return false;
  return (await resolveSocialMetadataPath(projectDir)) === null;
}

function printSocialMetadataSummary(projectDir: string, hasShort: boolean): void {
  const publishDir = getPublishOutputDir(projectDir);
  console.log(`
  Publish Meta  : ${publishDir}
  YT Long Title : ${path.join(publishDir, YOUTUBE_LONG_TITLE)}
  YT Long Desc  : ${path.join(publishDir, YOUTUBE_LONG_DESCRIPTION)}
  YT Long Tags  : ${path.join(publishDir, YOUTUBE_LONG_TAGS)}
  YT Long Pin   : ${path.join(publishDir, YOUTUBE_LONG_PINNED_COMMENT)}
  FB Long Cap   : ${path.join(publishDir, FACEBOOK_LONG_CAPTION)}
  FB Long Pin   : ${path.join(publishDir, FACEBOOK_LONG_FIRST_COMMENT)}`);
  if (hasShort) {
    console.log(`  YT Short Title: ${path.join(publishDir, YOUTUBE_SHORT_TITLE)}
  YT Short Cap  : ${path.join(publishDir, YOUTUBE_SHORT_CAPTION)}
  YT Short Pin  : ${path.join(publishDir, YOUTUBE_SHORT_PINNED_COMMENT)}
  FB Short Cap  : ${path.join(publishDir, FACEBOOK_SHORT_CAPTION)}
  FB Short Pin  : ${path.join(publishDir, FACEBOOK_SHORT_FIRST_COMMENT)}
  TikTok Cap    : ${path.join(publishDir, TIKTOK_SHORT_CAPTION)}`);
  }
}

async function maybePublishProject(
  ctx: ChannelContext,
  projectDir: string,
  socialMeta: Awaited<ReturnType<SocialMetadataService['loadOrGenerate']>>,
  podcastScript: PodcastScript,
  shortScript: ShortScript | undefined,
  options: { publish?: boolean; forcePublish?: boolean; formats?: PublishFormat[] },
): Promise<void> {
  if (!options.publish) return;

  logger.info('');
  logger.info('Publishing to YouTube, Facebook, TikTok...');
  const publisher = new SocialPublisherService();
  const results = await publisher.publishProject(
    ctx,
    projectDir,
    socialMeta,
    podcastScript,
    { force: options.forcePublish, formats: options.formats },
    shortScript,
  );

  if (results.length === 0) {
    logger.info('Nothing new published (already uploaded — use --force-publish to re-upload).');
    return;
  }

  logger.success(`Published ${results.length} video(s):`);
  for (const result of results) {
    console.log(`  ${result.platform} ${result.format}: ${result.url}`);
  }
}

function printSocialMetadataPreview(
  socialMeta: Awaited<ReturnType<SocialMetadataService['loadOrGenerate']>>,
  pub: ChannelContext['publish'],
): void {
  logger.info('\nYouTube Description (copy-paste ready):\n');
  console.log(socialMeta.youtube.description);
  logger.info('\nYouTube Tags:\n');
  console.log(socialMeta.youtube.tags.join(', '));
  logger.info('\nPinned comment:\n');
  console.log(socialMeta.youtube.pinnedComment);
  if (socialMeta.youtubeShort) {
    logger.info('\nYouTube Short Caption:\n');
    console.log(formatChannelShortCaption(socialMeta.youtubeShort, pub));
    logger.info('\nShort pinned comment:\n');
    console.log(socialMeta.youtubeShort.pinnedComment);
  }
  if (socialMeta.facebook) {
    logger.info('\nFacebook Caption:\n');
    console.log(socialMeta.facebook.caption);
    logger.info('\nFacebook first comment:\n');
    console.log(socialMeta.facebook.firstComment);
  }
  if (socialMeta.facebookShort) {
    logger.info('\nFacebook Reel Caption:\n');
    console.log(formatFacebookShortCaption(socialMeta.facebookShort, pub));
    logger.info('\nFacebook Reel first comment:\n');
    console.log(socialMeta.facebookShort.firstComment);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.time('Total execution time');
  const args = parseArgs();
  const projectService = new ProjectService();
  const channelService = new ChannelService();

  if (args.mode === 'list-channels') {
    const channels = await channelService.listChannels();
    if (channels.length === 0) {
      logger.info('No channels found. Add a folder under channels/ with channel.yaml');
      return;
    }
    logger.divider('─');
    logger.info(`Found ${channels.length} channel(s):\n`);
    for (const channel of channels) {
      console.log(`  ID    : ${channel.id}`);
      console.log(`  Name  : ${channel.name}`);
      console.log(`  Niche : ${channel.niche}`);
      console.log(`  Short : ${channel.short.enabled ? 'enabled' : 'disabled'}`);
      logger.divider('─');
    }
    return;
  }

  if (args.mode === 'list') {
    const projects = await projectService.list(args.channelId);
    if (projects.length === 0) {
      logger.info('No projects found. Create one with --channel=... --topic="..."');
      return;
    }
    logger.divider('─');
    logger.info(`Found ${projects.length} project(s):\n`);
    for (const p of projects) {
      console.log(`  ID      : ${p.id}`);
      console.log(`  Channel : ${p.channelId}`);
      console.log(`  Topic   : ${p.topic}`);
      console.log(`  Title   : ${p.title ?? '(script not yet generated)'}`);
      console.log(`  Created : ${new Date(p.createdAt).toLocaleString()}`);
      console.log(`  Updated : ${new Date(p.updatedAt).toLocaleString()}`);
      logger.divider('─');
    }
    return;
  }

  let project: Project;

  if (args.mode === 'resume') {
    try {
      project = await projectService.load(args.projectId);
    } catch {
      logger.error(`Project "${args.projectId}" not found.`);
      logger.info('Use --list to see available projects.');
      process.exit(1);
    }
  } else {
    try {
      await channelService.loadChannel(args.channelId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(message);
      process.exit(1);
    }
    project = await projectService.create(args.topic, args.channelId);
  }

  let channelCtx: ChannelContext;
  try {
    channelCtx = await channelService.loadChannel(project.channelId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(message);
    process.exit(1);
  }

  const shortEnabled = channelCtx.config.short.enabled;

  if (args.short && !shortEnabled) {
    logger.error(`Channel "${channelCtx.config.id}" has short generation disabled in channel.yaml`);
    process.exit(1);
  }

  logger.divider('═');
  console.log(`  🎙  ${channelCtx.config.name} — Podcast Generator`);
  logger.divider('═');
  if (args.mode === 'resume') {
    logger.info(`Resuming project : ${project.id}`);
    if (args.metadataRegen) {
      logger.info(
        `Mode             : METADATA ONLY (${args.metadataRegen === 'generate' ? 'LLM' : args.metadataRegen === 'normalize' ? 'normalize' : 'auto'})`,
      );
    }
    if (args.force) logger.info('Mode             : FORCE (re-run, keep thumbnails)');
  } else {
    logger.info(`New project      : ${project.id}`);
  }
  logger.info(`Channel          : ${channelCtx.config.id}`);
  logger.info(`Topic            : "${project.topic}"`);
  if (args.test) logger.info('Mode             : TEST (script only)');
  if (args.short) logger.info('Mode             : SHORT only');
  if (args.podcast) logger.info('Mode             : PODCAST only');
  if (!shortEnabled && !args.podcast && !args.test && !args.short) {
    logger.info('Mode             : PODCAST only (short disabled for this channel)');
  }

  logger.info('');

  if (DISABLE_THUMBNAIL_GENERATION) {
    logger.info('Thumbnail mode     : MANUAL (DISABLE_THUMBNAIL_GENERATION — use ChatGPT, then save PNG to project folder)');
  }

  const PROJECT_DIR = projectService.getDir(project);
  const channelAssets = channelCtx.assets;
  const AUDIO_DIR = path.join(PROJECT_DIR, 'audio');
  const SCRIPT_PATH = path.join(PROJECT_DIR, 'script.json');
  const PODCAST_AUDIO_PATH = path.join(PROJECT_DIR, 'podcast.mp3');
  const SUBTITLES_PATH = path.join(PROJECT_DIR, 'subtitles.ass');
  const THUMBNAIL_PATH = path.join(PROJECT_DIR, 'thumbnail.png');
  const BACKGROUND_PATH = path.join(PROJECT_DIR, 'background.png');

  await fs.mkdir(AUDIO_DIR, { recursive: true });

  if (args.mode === 'resume' && args.force) {
    const scope: CacheScope = args.short ? 'short' : args.podcast ? 'podcast' : 'all';
    await clearProjectCache(PROJECT_DIR, scope);
  }

  const openaiService = new OpenAIService();
  const ffmpegService = new FFmpegService(resolveWaveVisualizer(channelCtx.config.branding));
  const scriptService = new ScriptService(openaiService, channelCtx);
  const shortScriptService = new ShortScriptService(openaiService, channelCtx);
  const thumbnailService = new ThumbnailService(openaiService, channelCtx);
  const socialMetadataService = new SocialMetadataService(openaiService, channelCtx);

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

  // ── Metadata-only mode ────────────────────────────────────────────────────
  if (args.mode === 'resume' && args.metadataRegen) {
    const regenerate = await resolveMetadataRegenerate(PROJECT_DIR, args.metadataRegen);
    logger.info(
      regenerate
        ? 'Mode             : REGENERATE METADATA (LLM)'
        : 'Mode             : REGENERATE METADATA (normalize from cache)',
    );

    const SHORT_SCRIPT_PATH = path.join(PROJECT_DIR, 'short-script.json');
    let shortScript: ShortScript | undefined;
    if (await fileExists(SHORT_SCRIPT_PATH)) {
      shortScript = JSON.parse(await fs.readFile(SHORT_SCRIPT_PATH, 'utf-8')) as ShortScript;
    }

    let segments;
    const firstSegmentPath = path.join(AUDIO_DIR, '001.wav');
    if (await fileExists(firstSegmentPath)) {
      const supertonicService = new SupertonicService(SUPERTONIC_ONNX_DIR, SUPERTONIC_VOICES_DIR);
      const ttsService = new TTSService(supertonicService, ffmpegService, channelCtx.voiceMap);
      segments = await ttsService.generateSegments(podcastScript.script, AUDIO_DIR);
    }

    const socialMeta = await socialMetadataService.loadOrGenerate(
      PROJECT_DIR,
      podcastScript,
      project.topic,
      { shortScript, segments, regenerate },
    );

    logger.info('');
    logger.divider('═');
    logger.success('Social metadata updated.');
    logger.divider('═');
    console.log(`
  Project ID : ${project.id}
  Title      : ${podcastScript.title}`);
    printSocialMetadataSummary(PROJECT_DIR, !!shortScript);
    console.log(`
  `);
    printSocialMetadataPreview(socialMeta, channelCtx.publish);
    await maybePublishProject(channelCtx, PROJECT_DIR, socialMeta, podcastScript, shortScript, {
      publish: args.publish,
      forcePublish: args.forcePublish,
    });
    console.timeEnd('Total execution time');
    return;
  }
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
    printSocialMetadataPreview(socialMeta, channelCtx.publish);
    return;
  }

  // ── Short-only mode: script + short pipeline, skip podcast ───────────────
  if (args.short) {
    const supertonicService = new SupertonicService(SUPERTONIC_ONNX_DIR, SUPERTONIC_VOICES_DIR);
    const ttsService = new TTSService(supertonicService, ffmpegService, channelCtx.voiceMap);
    const keywordsService = new KeywordsService(openaiService, channelCtx);
    const subtitleService = new SubtitleService(
      resolveSubtitleStyle(channelCtx.config.branding),
      [channelCtx.config.name],
    );
    const videoService = new VideoService(ffmpegService, channelCtx.config.name);
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
    printSocialMetadataPreview(socialMeta, channelCtx.publish);
    await maybePublishProject(channelCtx, PROJECT_DIR, socialMeta, podcastScript, shortScript, {
      publish: args.publish,
      forcePublish: args.forcePublish,
      formats: ['short'],
    });
    console.timeEnd('Total execution time');
    return;
  }
  const totalSteps = 6;
  logger.step(
    2,
    totalSteps,
    DISABLE_THUMBNAIL_GENERATION
      ? 'Waiting for manual YouTube thumbnail (ChatGPT)...'
      : 'Generating YouTube thumbnail...',
  );
  await thumbnailService.generate(podcastScript, project.topic, THUMBNAIL_PATH);

  const videoBackgroundPath = channelCtx.config.perEpisodeBackground
    ? BACKGROUND_PATH
    : channelAssets.background;

  if (channelCtx.config.perEpisodeBackground) {
    await thumbnailService.generateBackground(
      podcastScript,
      project.topic,
      BACKGROUND_PATH,
      channelAssets.background,
    );
  }

  // ── Wire up TTS / video services ─────────────────────────────────────────
  const supertonicService = new SupertonicService(SUPERTONIC_ONNX_DIR, SUPERTONIC_VOICES_DIR);
  const ttsService = new TTSService(supertonicService, ffmpegService, channelCtx.voiceMap);
  const ipaService = new IpaService(openaiService);
  const keywordsService = new KeywordsService(openaiService, channelCtx);
  const subtitleService = new SubtitleService(
    resolveSubtitleStyle(channelCtx.config.branding),
    [channelCtx.config.name],
  );
  const videoService = new VideoService(ffmpegService, channelCtx.config.name);

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

  // ── Step 6: Final video (+ short unless --podcast) ───────────────────────
  logger.step(
    6,
    totalSteps,
    args.podcast || !shortEnabled
      ? 'Rendering final video...'
      : 'Rendering final video + short (parallel)...',
  );

  const FINAL_VIDEO_PATH = buildPodcastVideoPath(PROJECT_DIR, podcastScript.title);
  await fs.mkdir(path.dirname(FINAL_VIDEO_PATH), { recursive: true });

  if (await fileExists(FINAL_VIDEO_PATH)) {
    logger.info('Existing final video found — removing to force regeneration');
    await fs.unlink(FINAL_VIDEO_PATH);
  }

  let shortScript: ShortScript | undefined;

  if (args.podcast || !shortEnabled) {
    await videoService.generateFinalVideo(
      channelAssets.intro,
      THUMBNAIL_PATH,
      videoBackgroundPath,
      PODCAST_AUDIO_PATH,
      SUBTITLES_PATH,
      channelAssets.outro,
      FINAL_VIDEO_PATH,
    );
  } else {
    const shortPaths = buildShortPaths(PROJECT_DIR);

    if (DISABLE_THUMBNAIL_GENERATION) {
      shortScript = await runShortPipeline(
        project,
        podcastScript,
        {
          shortScriptService,
          keywordsService,
          thumbnailService,
          ttsService,
          subtitleService,
          ffmpegService,
          videoService,
        },
        shortPaths,
      );
      await videoService.generateFinalVideo(
        channelAssets.intro,
        THUMBNAIL_PATH,
        videoBackgroundPath,
        PODCAST_AUDIO_PATH,
        SUBTITLES_PATH,
        channelAssets.outro,
        FINAL_VIDEO_PATH,
      );
    } else {
      [shortScript] = await Promise.all([
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
          channelAssets.intro,
          THUMBNAIL_PATH,
          videoBackgroundPath,
          PODCAST_AUDIO_PATH,
          SUBTITLES_PATH,
          channelAssets.outro,
          FINAL_VIDEO_PATH,
        ),
      ]);
    }
  }

  const socialMeta = await socialMetadataService.loadOrGenerate(
    PROJECT_DIR,
    podcastScript,
    project.topic,
    shortScript ? { shortScript, segments } : { segments },
  );

  // ── Done ──────────────────────────────────────────────────────────────────
  logger.info('');
  logger.divider('═');
  logger.success(
    args.podcast || !shortEnabled
      ? 'All done! Your podcast is ready.'
      : 'All done! Your podcast and short are ready.',
  );
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
  Final Video : ${FINAL_VIDEO_PATH}`);
  if (shortScript) {
    const shortPaths = buildShortPaths(PROJECT_DIR);
    console.log(`
  Short Title     : ${shortScript.title}
  Short Thumbnail : ${shortPaths.shortThumbnailPath}
  Short Video     : ${shortPaths.shortVideoPath}`);
  }
  printSocialMetadataSummary(PROJECT_DIR, !!shortScript);
  console.log(`
  `);
  printSocialMetadataPreview(socialMeta, channelCtx.publish);
  await maybePublishProject(channelCtx, PROJECT_DIR, socialMeta, podcastScript, shortScript, {
    publish: args.publish,
    forcePublish: args.forcePublish,
  });
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

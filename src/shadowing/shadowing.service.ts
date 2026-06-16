import path from 'path';
import fs from 'fs/promises';
import { OpenAIService } from '../ai/openai.service';
import { IpaService } from '../ai/ipa.service';
import { SupertonicService } from '../audio/supertonic.service';
import { TTSService } from '../audio/tts.service';
import { FFmpegService } from '../ffmpeg/ffmpeg.service';
import { resolveWaveVisualizer } from '../ffmpeg/wave-config.util';
import { ChannelBranding } from '../channel/channel.types';
import { SubtitleService } from '../subtitles/subtitle.service';
import { resolveSubtitleStyle } from '../subtitles/subtitle-config.util';
import { VideoService } from '../video/video.service';
import { PodcastScript } from '../types';
import { logger } from '../utils/logger';
import {
  AUDIO_DIR_NAME,
  PODCAST_AUDIO_FILE,
  SUBTITLES_FILE,
  VIDEO_FILE,
} from './shadowing.constants';
import { ShadowingProfileService } from './shadowing-profile.service';
import { ShadowingScriptService } from './shadowing-script.service';
import { ShadowingContext, ShadowingWorkspace } from './shadowing.types';
import { ShadowingWorkspaceService } from './shadowing-workspace.service';

const ROOT_DIR = process.cwd();
const SUPERTONIC_DIR = path.join(ROOT_DIR, 'assets', 'supertonic-3');
const SUPERTONIC_ONNX_DIR = process.env.SUPERTONIC_ONNX_DIR ?? path.join(SUPERTONIC_DIR, 'onnx');
const SUPERTONIC_VOICES_DIR = process.env.SUPERTONIC_VOICES_DIR ?? path.join(SUPERTONIC_DIR, 'voice_styles');

export type MediaRegenMode = 'none' | 'audio' | 'subtitles' | 'all';

export interface ShadowingRunOptions {
  test?: boolean;
  force?: boolean;
  mediaRegen?: MediaRegenMode;
  title?: string;
}

export interface ShadowingReviewOptions {
  force?: boolean;
  title?: string;
}

export class ShadowingService {
  private readonly profileService: ShadowingProfileService;
  private readonly workspaceService: ShadowingWorkspaceService;

  constructor(private readonly rootDir = process.cwd()) {
    this.profileService = new ShadowingProfileService(rootDir);
    this.workspaceService = new ShadowingWorkspaceService(rootDir);
  }

  async createWorkspace(draftPath: string, title?: string): Promise<ShadowingWorkspace> {
    const resolved = path.resolve(draftPath);
    const content = await fs.readFile(resolved, 'utf-8');
    if (!content.trim()) {
      throw new Error(`Draft file is empty: ${resolved}`);
    }

    const workspace = await this.workspaceService.create(content, title);
    logger.info(`Workspace created → ${this.workspaceService.getDir(workspace)}`);
    return workspace;
  }

  async generateReview(
    workspaceId: string,
    options: ShadowingReviewOptions = {},
  ): Promise<ShadowingWorkspace> {
    const ctx = await this.profileService.loadDefaults();
    const workspace = await this.workspaceService.load(workspaceId);
    const reviewPath = this.workspaceService.getReviewPath(workspace);

    if (!options.force && (await this.fileExists(reviewPath))) {
      logger.info(`⏭  Review already exists — edit before continuing`);
      this.printReviewSummary(workspace);
      return workspace;
    }

    const draft = await this.workspaceService.readDraft(workspace);
    const title = options.title ?? workspace.title;

    logger.step(1, 1, 'Generating review markdown from draft...');
    const openai = new OpenAIService();
    const scriptService = new ShadowingScriptService(openai, ctx.speakerName);
    const markdown = await scriptService.generateReviewFromDraft(draft, title);
    await fs.writeFile(reviewPath, markdown, 'utf-8');
    logger.info(`Review saved → ${reviewPath}`);

    this.printReviewSummary(workspace);
    return workspace;
  }

  async run(workspaceId: string, options: ShadowingRunOptions = {}): Promise<void> {
    const ctx = await this.profileService.loadDefaults();
    const workspace = await this.workspaceService.load(workspaceId);
    const title = options.title ?? workspace.title;

    const reviewReady = await this.ensureReviewReady(workspace, title, options.force ?? false);
    if (!reviewReady) {
      return;
    }

    console.time('Shadowing pipeline');

    const script = await this.loadOrGenerateScript(ctx, workspace, title, options);
    workspace.title = script.title;
    await this.workspaceService.save(workspace);

    if (options.test) {
      this.printTestSummary(workspace, script);
      console.timeEnd('Shadowing pipeline');
      return;
    }

    const mediaRegen: MediaRegenMode =
      (options.force ?? false) ? 'all' : (options.mediaRegen ?? 'none');
    const result = await this.generateMedia(workspace, ctx, script, mediaRegen);

    logger.info('');
    logger.divider('═');
    if (result.video) {
      logger.success('Shadowing video ready.');
    } else if (result.audio) {
      logger.success('Podcast audio ready.');
    } else if (result.subtitles) {
      logger.success('Subtitles ready.');
    } else {
      logger.success('Shadowing pipeline complete.');
    }
    logger.divider('═');
    console.log(`
  Workspace : ${workspace.id}
  Title     : ${script.title}
  Lines     : ${script.script.length}${result.video ? `\n  Video     : ${this.getVideoPath(workspace)}` : ''}${result.audio ? `\n  Audio     : ${path.join(this.workspaceService.getShadowingDir(workspace), PODCAST_AUDIO_FILE)}` : ''}${result.subtitles ? `\n  Subtitles : ${path.join(this.workspaceService.getShadowingDir(workspace), SUBTITLES_FILE)}` : ''}
`);
    console.timeEnd('Shadowing pipeline');
  }

  async listWorkspaces(): Promise<ShadowingWorkspace[]> {
    return this.workspaceService.list();
  }

  private async ensureReviewReady(
    workspace: ShadowingWorkspace,
    title: string | undefined,
    force: boolean,
  ): Promise<boolean> {
    const reviewPath = this.workspaceService.getReviewPath(workspace);
    const scriptPath = this.workspaceService.getScriptPath(workspace);

    if (await this.fileExists(reviewPath)) {
      return true;
    }

    if (await this.fileExists(scriptPath)) {
      return true;
    }

    logger.info('No script.md yet — generating review from draft first...');
    await this.generateReview(workspace.id, { force, title });
    return false;
  }

  private async loadOrGenerateScript(
    ctx: ShadowingContext,
    workspace: ShadowingWorkspace,
    title: string | undefined,
    options: ShadowingRunOptions,
  ): Promise<PodcastScript> {
    const scriptPath = this.workspaceService.getScriptPath(workspace);
    const reviewPath = this.workspaceService.getReviewPath(workspace);

    if (!options.force && !options.test) {
      try {
        await fs.access(scriptPath);
        logger.info(`⏭  Script already exists — loading from cache`);
        return JSON.parse(await fs.readFile(scriptPath, 'utf-8')) as PodcastScript;
      } catch {
        // generate
      }
    } else if (options.force) {
      try {
        await fs.unlink(scriptPath);
      } catch {
        // not cached
      }
    }

    if (!(await this.fileExists(reviewPath))) {
      throw new Error(
        `Review file not found: ${reviewPath}\nRun review generation first, then edit script.md before continuing.`,
      );
    }

    const review = await this.workspaceService.readReview(workspace);

    logger.step(1, options.test ? 1 : 4, 'Formatting review into script.json...');
    const openai = new OpenAIService();
    const scriptService = new ShadowingScriptService(openai, ctx.speakerName);
    const script = await scriptService.generateFromReview(review, title);
    await fs.writeFile(scriptPath, JSON.stringify(script, null, 2), 'utf-8');
    logger.info(`Script saved → ${scriptPath}`);
    return script;
  }

  private async generateMedia(
    workspace: ShadowingWorkspace,
    ctx: ShadowingContext,
    script: PodcastScript,
    mode: MediaRegenMode,
  ): Promise<{ audio: boolean; subtitles: boolean; video: boolean }> {
    const regenAudio = mode === 'all' || mode === 'audio';
    const regenSubtitles = mode === 'all' || mode === 'subtitles';
    const regenVideo = mode === 'all' || mode === 'subtitles';

    const shadowingDir = this.workspaceService.getShadowingDir(workspace);
    const audioDir = path.join(shadowingDir, AUDIO_DIR_NAME);
    const podcastPath = path.join(shadowingDir, PODCAST_AUDIO_FILE);
    const subtitlesPath = path.join(shadowingDir, SUBTITLES_FILE);
    const videoPath = this.getVideoPath(workspace);
    const scriptPath = this.workspaceService.getScriptPath(workspace);

    await fs.mkdir(audioDir, { recursive: true });

    const branding = ctx.profile.branding as ChannelBranding;
    const wave = resolveWaveVisualizer(branding);
    const ffmpegService = new FFmpegService(wave);
    await ffmpegService.checkDependencies();

    const supertonicService = new SupertonicService(SUPERTONIC_ONNX_DIR, SUPERTONIC_VOICES_DIR);
    const voiceMap = { [ctx.speakerName]: ctx.voiceName };
    const ttsService = new TTSService(supertonicService, ffmpegService, voiceMap);
    const openai = new OpenAIService();
    const ipaService = new IpaService(openai);
    const subtitleService = new SubtitleService(
      resolveSubtitleStyle(branding),
      [ctx.profile.name],
    );
    const videoService = new VideoService(ffmpegService, ctx.profile.name);

    if (!script.script.every((line) => line.ipa)) {
      logger.step(2, 4, 'Generating IPA...');
      script.script = await ipaService.enrichScript(script.script);
      await fs.writeFile(scriptPath, JSON.stringify(script, null, 2), 'utf-8');
      logger.info(`IPA saved → ${scriptPath}`);
    } else {
      logger.step(2, 4, 'IPA already present — skipping');
    }

    if (regenAudio) {
      logger.step(3, 4, 'Generating voice audio...');
      await this.clearAudioCache(audioDir, podcastPath);
    } else {
      logger.step(3, 4, 'Loading voice audio...');
    }

    if (regenSubtitles) {
      await this.unlinkIfExists(subtitlesPath);
      await this.unlinkIfExists(videoPath);
    }

    const segments = await ttsService.generateSegments(script.script, audioDir);

    let didAudio = false;
    if (!(await this.fileExists(podcastPath)) || regenAudio) {
      const audioFiles = segments.map((s) => s.filePath);
      const pauses = segments.slice(0, -1).map((s) => s.pauseAfter);
      await ffmpegService.mergeAudioFiles(audioFiles, podcastPath, pauses);
      logger.success(`Audio saved → ${podcastPath}`);
      didAudio = true;
    } else {
      logger.info(`⏭  Merged audio already exists — skipping`);
    }

    let didSubtitles = false;
    if (!(await this.fileExists(subtitlesPath)) || regenSubtitles) {
      await subtitleService.generateShadowing(segments, subtitlesPath, script.title);
      logger.success(`Subtitles saved → ${subtitlesPath}`);
      didSubtitles = true;
    } else {
      logger.info(`⏭  Subtitles already exist — skipping`);
    }

    let didVideo = false;
    if (regenVideo || !(await this.fileExists(videoPath))) {
      logger.step(4, 4, 'Rendering shadowing video...');
      if (regenVideo && (await this.fileExists(videoPath))) {
        await this.unlinkIfExists(videoPath);
      }
      if (!(await this.fileExists(videoPath))) {
        await videoService.generatePodcastVideo(
          podcastPath,
          subtitlesPath,
          ctx.backgroundPath,
          videoPath,
        );
        didVideo = true;
      } else {
        logger.info(`⏭  Video already exists — skipping`);
      }
    } else {
      logger.step(4, 4, 'Video');
      logger.info(`⏭  Video already exists — skipping`);
    }

    return { audio: didAudio, subtitles: didSubtitles, video: didVideo };
  }

  private getVideoPath(workspace: ShadowingWorkspace): string {
    return path.join(this.workspaceService.getShadowingDir(workspace), VIDEO_FILE);
  }

  private printReviewSummary(workspace: ShadowingWorkspace): void {
    logger.info('');
    logger.divider('═');
    logger.success('Review ready — edit script.md, then continue.');
    logger.divider('═');
    console.log(`
  Workspace : ${workspace.id}
  Review    : ${this.workspaceService.getReviewPath(workspace)}

  Next steps:
    1. Open script.md and edit the "## Script" section (apply or ignore AI suggestions).
    2. Preview script.json only:
         npm run shadowing -- --workspace=${workspace.id} --test
    3. Generate full video:
         npm run shadowing -- --workspace=${workspace.id}
`);
  }

  private printTestSummary(workspace: ShadowingWorkspace, script: PodcastScript): void {
    logger.info('');
    logger.divider('═');
    logger.success('[TEST] Script formatted successfully.');
    logger.divider('═');
    console.log(`
  Workspace : ${workspace.id}
  Title     : ${script.title}
  Lines     : ${script.script.length}
  Script    : ${this.workspaceService.getScriptPath(workspace)}
`);
    console.log('First 3 lines:');
    script.script.slice(0, 3).forEach((line) => console.log(`  ${line.speaker}: ${line.text}`));
  }

  private async clearAudioCache(audioDir: string, podcastPath: string): Promise<void> {
    await this.unlinkIfExists(podcastPath);

    try {
      const files = await fs.readdir(audioDir);
      await Promise.all(
        files.map((file) => fs.unlink(path.join(audioDir, file))),
      );
    } catch {
      // no audio dir
    }
  }

  private async unlinkIfExists(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // missing
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

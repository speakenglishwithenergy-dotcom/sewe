import path from 'path';
import fs from 'fs/promises';
import { ChannelContext } from '../channel/channel.types';
import { FFmpegService } from '../ffmpeg/ffmpeg.service';
import { SupertonicService } from '../audio/supertonic.service';
import { TTSService } from '../audio/tts.service';
import { IpaService } from '../ai/ipa.service';
import { KeywordsService, KEYWORDS_GENERATOR_VERSION } from '../ai/keywords.service';
import { OpenAIService } from '../ai/openai.service';
import { SubtitleService } from '../subtitles/subtitle.service';
import { resolveSubtitleStyle } from '../subtitles/subtitle-config.util';
import { VideoService } from '../video/video.service';
import { AudioSegment, PodcastScript } from '../types';
import {
  SHADOWING_AUDIO_DIR,
  SHADOWING_MP3,
  SHADOWING_SUBTITLES,
  SHADOWING_VIDEO,
} from './studio.constants';
import { StudioContext } from './studio.types';
import { logger } from '../utils/logger';

export class StudioShadowingService {
  constructor(
    private readonly ctx: StudioContext,
    private readonly ffmpeg: FFmpegService,
    private readonly supertonic: SupertonicService,
    private readonly openai: OpenAIService,
  ) {}

  async generate(
    script: PodcastScript,
    topic: string,
    shadowingDir: string,
  ): Promise<{
    segments: AudioSegment[];
    audioPath: string;
    subtitlesPath: string;
    videoPath: string;
  }> {
    logger.info('Generating shadowing media (TTS → subtitles → video)...');

    const audioDir = path.join(shadowingDir, SHADOWING_AUDIO_DIR);
    await fs.mkdir(audioDir, { recursive: true });

    let enrichedScript = { ...script, script: [...script.script] };

    const includeIpa = this.ctx.config.branding.subtitleStyle?.includeIpa ?? false;
    if (includeIpa) {
      const ipaService = new IpaService(this.openai);
      enrichedScript.script = await ipaService.enrichScript(enrichedScript.script);
    }

    const keywordsService = new KeywordsService(
      this.openai,
      minimalChannelContext(this.ctx),
    );
    enrichedScript.script = await keywordsService.enrichScript(enrichedScript.script, {
      topic,
      title: enrichedScript.title,
    });
    enrichedScript.keywordsVersion = KEYWORDS_GENERATOR_VERSION;

    const ttsService = new TTSService(this.supertonic, this.ffmpeg, this.ctx.voiceMap);
    const segments = await ttsService.generateSegments(enrichedScript.script, audioDir);

    const audioPath = path.join(shadowingDir, SHADOWING_MP3);
    const audioFiles = segments.map((s) => s.filePath);
    const pauses = segments.slice(0, -1).map((s) => s.pauseAfter);
    await this.ffmpeg.mergeAudioFiles(audioFiles, audioPath, pauses);

    const brandingForSubtitle = {
      subtitleColors: this.ctx.config.branding.subtitleColors,
      subtitleStyle: this.ctx.config.branding.subtitleStyle,
      thumbnail: {
        brandColors: '',
        logoLockRules: '',
        logoUnchanged: '',
        badgeUnchanged: '',
        shortLogoUnchanged: '',
        shortBadgeUnchanged: '',
        artStyle: '',
      },
    };

    const subtitleService = new SubtitleService(
      resolveSubtitleStyle(brandingForSubtitle),
      [this.ctx.config.name],
    );

    const subtitlesPath = path.join(shadowingDir, SHADOWING_SUBTITLES);
    await subtitleService.generate(segments, subtitlesPath);

    const videoPath = path.join(shadowingDir, SHADOWING_VIDEO);
    const videoService = new VideoService(this.ffmpeg, this.ctx.config.name);
    await videoService.generatePodcastVideo(
      audioPath,
      subtitlesPath,
      this.ctx.assets.background,
      videoPath,
    );

    logger.success(`Shadowing video saved → ${videoPath}`);

    return { segments, audioPath, subtitlesPath, videoPath };
  }
}

function minimalChannelContext(ctx: StudioContext): ChannelContext {
  return {
    config: {
      name: ctx.config.name,
      script: { languageLevel: ctx.config.script.languageLevel },
    },
    speakers: ctx.speakers,
  } as ChannelContext;
}

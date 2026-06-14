import fs from 'fs/promises';
import path from 'path';
import { OpenAIService } from '../ai/openai.service';
import {
  AudioSegment,
  FacebookMetadataSchema,
  FacebookShortMetadataSchema,
  PodcastScript,
  ShortScript,
  SocialMetadata,
  SocialMetadataSchema,
  YouTubeMetadataSchema,
  YouTubeShortMetadataSchema,
} from '../types';
import {
  buildFacebookMetadataPrompt,
  buildFacebookShortMetadataPrompt,
  buildYouTubeMetadataPrompt,
  buildYouTubeShortMetadataPrompt,
} from '../prompts/social-metadata.prompt';
import { refineChapterTimes } from './chapters.util';
import { normalizeSocialMetadata } from './social-metadata.normalize';
import { resolveSocialMetadataPath, writeSocialMetadataExports } from './social-metadata.export';
import { logger } from '../utils/logger';

const SYSTEM_PROMPT =
  'You are a social media SEO specialist for an English learning channel. Respond only with valid JSON matching the requested structure exactly.';

export class SocialMetadataService {
  constructor(private readonly openai: OpenAIService) {}

  async loadOrGenerate(
    projectDir: string,
    podcastScript: PodcastScript,
    topic: string,
    options?: { shortScript?: ShortScript; segments?: AudioSegment[]; regenerate?: boolean },
  ): Promise<SocialMetadata> {
    const cachePath = options?.regenerate ? null : await resolveSocialMetadataPath(projectDir);

    if (cachePath) {
      const raw = await fs.readFile(cachePath, 'utf-8');
      const cached = SocialMetadataSchema.parse(JSON.parse(raw));
      const merged = await this.fillMissingMetadata(cached, podcastScript, topic, options);

      if (merged === cached) {
        logger.info('⏭  Social metadata already exists — loading from cache');
        await writeSocialMetadataExports(projectDir, cached);
        return normalizeSocialMetadata(cached);
      }

      await writeSocialMetadataExports(projectDir, merged);
      return normalizeSocialMetadata(merged);
    }

    if (options?.regenerate) {
      logger.info('Regenerating social metadata (LLM)...');
    } else {
      logger.info('Generating social metadata...');
    }

    const meta = await this.generateAllMetadata(podcastScript, topic, options);
    await writeSocialMetadataExports(projectDir, meta);
    logger.success(`Social metadata saved → ${path.join(projectDir, 'publish')}`);
    return normalizeSocialMetadata(meta);
  }

  private async fillMissingMetadata(
    cached: SocialMetadata,
    podcastScript: PodcastScript,
    topic: string,
    options?: { shortScript?: ShortScript; segments?: AudioSegment[] },
  ): Promise<SocialMetadata> {
    let merged: SocialMetadata = { ...cached };
    let changed = false;

    if (options?.shortScript && !cached.youtubeShort) {
      logger.info('Social metadata exists but missing YouTube Short — generating Short section...');
      merged = {
        ...merged,
        youtubeShort: await this.generateShortMetadata(options.shortScript, podcastScript, topic),
      };
      changed = true;
    }

    if (!cached.facebook) {
      logger.info('Social metadata exists but missing Facebook — generating Facebook section...');
      merged = {
        ...merged,
        facebook: await this.generateFacebookMetadata(podcastScript, topic),
      };
      changed = true;
    }

    if (options?.shortScript && !cached.facebookShort) {
      logger.info('Social metadata exists but missing Facebook Reel — generating Reel section...');
      merged = {
        ...merged,
        facebookShort: await this.generateFacebookShortMetadata(
          options.shortScript,
          podcastScript,
          topic,
        ),
      };
      changed = true;
    }

    return changed ? merged : cached;
  }

  private async generateAllMetadata(
    podcastScript: PodcastScript,
    topic: string,
    options?: { shortScript?: ShortScript; segments?: AudioSegment[] },
  ): Promise<SocialMetadata> {
    const [youtube, facebook] = await Promise.all([
      this.generateYouTubeMetadata(podcastScript, topic, options?.segments),
      this.generateFacebookMetadata(podcastScript, topic),
    ]);

    let youtubeShort;
    let facebookShort;
    if (options?.shortScript) {
      logger.info('Generating YouTube Short + Facebook Reel social metadata...');
      [youtubeShort, facebookShort] = await Promise.all([
        this.generateShortMetadata(options.shortScript, podcastScript, topic),
        this.generateFacebookShortMetadata(options.shortScript, podcastScript, topic),
      ]);
    }

    return { youtube, youtubeShort, facebook, facebookShort };
  }

  private async generateYouTubeMetadata(
    podcastScript: PodcastScript,
    topic: string,
    segments?: AudioSegment[],
  ) {
    const raw = await this.openai.generateJSON(
      buildYouTubeMetadataPrompt(podcastScript, topic),
      SYSTEM_PROMPT,
      (data) => YouTubeMetadataSchema.parse(data),
      { temperature: 0.7 },
    );

    if (segments && segments.length > 0) {
      return {
        ...raw,
        chapters: refineChapterTimes(raw.chapters, segments),
        description: injectChapterBlock(raw.description, refineChapterTimes(raw.chapters, segments)),
      };
    }

    return raw;
  }

  private async generateShortMetadata(
    shortScript: ShortScript,
    podcastScript: PodcastScript,
    topic: string,
  ) {
    return this.openai.generateJSON(
      buildYouTubeShortMetadataPrompt(shortScript, podcastScript, topic),
      SYSTEM_PROMPT,
      (data) => YouTubeShortMetadataSchema.parse(data),
      { temperature: 0.75 },
    );
  }

  private async generateFacebookMetadata(podcastScript: PodcastScript, topic: string) {
    return this.openai.generateJSON(
      buildFacebookMetadataPrompt(podcastScript, topic),
      SYSTEM_PROMPT,
      (data) => FacebookMetadataSchema.parse(data),
      { temperature: 0.7 },
    );
  }

  private async generateFacebookShortMetadata(
    shortScript: ShortScript,
    podcastScript: PodcastScript,
    topic: string,
  ) {
    return this.openai.generateJSON(
      buildFacebookShortMetadataPrompt(shortScript, podcastScript, topic),
      SYSTEM_PROMPT,
      (data) => FacebookShortMetadataSchema.parse(data),
      { temperature: 0.75 },
    );
  }
}

function injectChapterBlock(description: string, chapters: { time: string; label: string }[]): string {
  const chapterBlock = chapters.map((c) => `${c.time} ${c.label}`).join('\n');
  const placeholderPattern = /⏱\s*Chapters?:[\s\S]*?(?=\n\n|$)/i;

  if (placeholderPattern.test(description)) {
    return description.replace(
      placeholderPattern,
      `⏱ Chapters:\n${chapterBlock}`,
    );
  }

  return description;
}

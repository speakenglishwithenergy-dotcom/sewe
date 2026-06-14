import fs from 'fs/promises';
import path from 'path';
import { OpenAIService } from '../ai/openai.service';
import {
  AudioSegment,
  PodcastScript,
  ShortScript,
  SocialMetadata,
  SocialMetadataSchema,
  YouTubeMetadataSchema,
  YouTubeShortMetadataSchema,
} from '../types';
import {
  buildYouTubeMetadataPrompt,
  buildYouTubeShortMetadataPrompt,
} from '../prompts/social-metadata.prompt';
import { refineChapterTimes } from './chapters.util';
import { resolveSocialMetadataPath, writeSocialMetadataExports } from './social-metadata.export';
import { logger } from '../utils/logger';

const SYSTEM_PROMPT =
  'You are a social media SEO specialist for an English learning YouTube channel. Respond only with valid JSON matching the requested structure exactly.';

export class SocialMetadataService {
  constructor(private readonly openai: OpenAIService) {}

  async loadOrGenerate(
    projectDir: string,
    podcastScript: PodcastScript,
    topic: string,
    options?: { shortScript?: ShortScript; segments?: AudioSegment[] },
  ): Promise<SocialMetadata> {
    const cachePath = await resolveSocialMetadataPath(projectDir);

    if (cachePath) {
      const raw = await fs.readFile(cachePath, 'utf-8');
      const cached = SocialMetadataSchema.parse(JSON.parse(raw));

      const needsShort =
        options?.shortScript && !cached.youtubeShort;
      if (!needsShort) {
        logger.info('⏭  Social metadata already exists — loading from cache');
        return cached;
      }

      logger.info('Social metadata exists but missing Short — generating Short section...');
      const youtubeShort = await this.generateShortMetadata(
        options.shortScript!,
        podcastScript,
        topic,
      );
      const merged: SocialMetadata = { ...cached, youtubeShort };
      await writeSocialMetadataExports(projectDir, merged);
      return merged;
    }

    logger.info('Generating YouTube social metadata...');
    const youtube = await this.generateYouTubeMetadata(
      podcastScript,
      topic,
      options?.segments,
    );

    let youtubeShort;
    if (options?.shortScript) {
      logger.info('Generating YouTube Short social metadata...');
      youtubeShort = await this.generateShortMetadata(
        options.shortScript,
        podcastScript,
        topic,
      );
    }

    const meta: SocialMetadata = { youtube, youtubeShort };
    await writeSocialMetadataExports(projectDir, meta);
    logger.success(`Social metadata saved → ${path.join(projectDir, 'publish')}`);
    return meta;
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

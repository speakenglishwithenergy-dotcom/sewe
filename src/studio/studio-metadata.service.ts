import fs from 'fs/promises';
import path from 'path';
import { OpenAIService } from '../ai/openai.service';
import { buildStudioYouTubeMetadataPrompt } from '../prompts/studio/studio-metadata.prompt';
import { buildViralBriefPrompt } from '../prompts/studio/viral-brief.prompt';
import {
  formatChannelDescription,
  formatYouTubeTags,
  normalizeSocialMetadata,
} from '../social/social-metadata.normalize';
import {
  PUBLISH_OUTPUT_SUBDIR,
  SOCIAL_METADATA_JSON,
  YOUTUBE_LONG_DESCRIPTION,
  YOUTUBE_LONG_PINNED_COMMENT,
  YOUTUBE_LONG_TAGS,
  YOUTUBE_LONG_TITLE,
} from '../social/social-metadata.export';
import {
  AudioSegment,
  PodcastScript,
  SocialMetadata,
  SocialMetadataSchema,
  YouTubeMetadataSchema,
} from '../types';
import { refineStudioChapterTimes } from './studio-chapters.util';
import {
  AssetsBrief,
  Outline,
  StudioContext,
  ViralBrief,
  ViralBriefSchema,
} from './studio.types';
import { VIRAL_BRIEF_FILE } from './studio.constants';
import { logger } from '../utils/logger';

const SYSTEM_PROMPT =
  'You are a YouTube SEO and growth specialist. Respond only with valid JSON matching the requested structure exactly.';

export class StudioMetadataService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly ctx: StudioContext,
  ) {}

  async generate(
    workspaceDir: string,
    topic: string,
    outline: Outline,
    script: PodcastScript,
    options?: {
      assetsBrief?: AssetsBrief;
      segments?: AudioSegment[];
      viralBrief?: ViralBrief;
    },
  ): Promise<{ social: SocialMetadata; viralBrief: ViralBrief }> {
    logger.info('Generating YouTube metadata...');

    let youtube = await this.openai.generateJSON(
      buildStudioYouTubeMetadataPrompt(this.ctx, script, topic),
      SYSTEM_PROMPT,
      (data) => YouTubeMetadataSchema.parse(data),
      { temperature: 0.7 },
    );

    if (options?.segments && options.segments.length > 0) {
      const chapters = refineStudioChapterTimes(this.ctx, youtube.chapters, options.segments);
      youtube = {
        ...youtube,
        chapters,
        description: injectChapterBlock(youtube.description, chapters),
      };
    }

    const titleVariants = [youtube.title, ...youtube.titleVariants];
    const viralBrief =
      options?.viralBrief ??
      await this.generateViralBrief(topic, outline, script, options?.assetsBrief, titleVariants);

    const topTitle = viralBrief.titleRanking.find((t) => t.rank === 1)?.title;
    if (topTitle) {
      youtube = { ...youtube, title: topTitle };
    }

    const social: SocialMetadata = { youtube };
    const normalized = normalizeSocialMetadata(social, this.ctx.publish);

    const publishDir = path.join(workspaceDir, PUBLISH_OUTPUT_SUBDIR);
    await fs.mkdir(publishDir, { recursive: true });

    await fs.writeFile(
      path.join(publishDir, SOCIAL_METADATA_JSON),
      JSON.stringify(normalized, null, 2),
      'utf-8',
    );

    await fs.writeFile(
      path.join(publishDir, VIRAL_BRIEF_FILE),
      JSON.stringify(viralBrief, null, 2),
      'utf-8',
    );

    await this.writeExports(publishDir, normalized);

    logger.success(`Metadata saved → ${publishDir}`);

    return { social: normalized, viralBrief };
  }

  async generateViralBrief(
    topic: string,
    outline: Outline,
    script: PodcastScript,
    assetsBrief?: AssetsBrief,
    titleVariants?: string[],
  ): Promise<ViralBrief> {
    logger.info('Generating viral optimization brief...');

    const brief = await this.openai.generateJSON(
      buildViralBriefPrompt(this.ctx, topic, outline, script, assetsBrief, titleVariants),
      SYSTEM_PROMPT,
      (data) => ViralBriefSchema.parse(data),
      { temperature: 0.75 },
    );

    logger.success(`Viral brief ready — hook score: ${brief.hookScore}/10`);
    return brief;
  }

  async loadSocial(workspaceDir: string): Promise<SocialMetadata | null> {
    const metaPath = path.join(workspaceDir, PUBLISH_OUTPUT_SUBDIR, SOCIAL_METADATA_JSON);
    try {
      const raw = await fs.readFile(metaPath, 'utf-8');
      return SocialMetadataSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  private async writeExports(publishDir: string, meta: SocialMetadata): Promise<void> {
    const pub = this.ctx.publish;
    const files: Record<string, string> = {
      [YOUTUBE_LONG_TITLE]: meta.youtube.title,
      [YOUTUBE_LONG_DESCRIPTION]: formatChannelDescription(meta.youtube, pub),
      [YOUTUBE_LONG_TAGS]: formatYouTubeTags(meta.youtube.tags),
      [YOUTUBE_LONG_PINNED_COMMENT]: meta.youtube.pinnedComment,
    };

    await Promise.all(
      Object.entries(files).map(async ([relativePath, content]) => {
        const outputPath = path.join(publishDir, relativePath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, content, 'utf-8');
      }),
    );
  }
}

function injectChapterBlock(
  description: string,
  chapters: { time: string; label: string }[],
): string {
  const chapterBlock = chapters.map((c) => `${c.time} ${c.label}`).join('\n');
  const placeholderPattern = /⏱\s*Chapters?:[\s\S]*?(?=\n\n|$)/i;

  if (placeholderPattern.test(description)) {
    return description.replace(placeholderPattern, `⏱ Chapters:\n${chapterBlock}`);
  }

  return description;
}

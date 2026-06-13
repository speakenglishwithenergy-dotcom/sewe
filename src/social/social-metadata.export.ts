import fs from 'fs/promises';
import path from 'path';
import { SocialMetadata, YouTubeMetadata, YouTubeShortMetadata } from '../types';

export const SOCIAL_METADATA_JSON = 'social-metadata.json';
export const YOUTUBE_DESCRIPTION_TXT = 'youtube-description.txt';
export const YOUTUBE_TAGS_TXT = 'youtube-tags.txt';
export const YOUTUBE_SHORT_CAPTION_TXT = 'youtube-short-caption.txt';

export function formatYouTubeDescription(meta: YouTubeMetadata): string {
  const chapterBlock = meta.chapters.map((c) => `${c.time} ${c.label}`).join('\n');
  const hashtagLine = meta.hashtags.join(' ');

  const body = meta.description.trim();
  const hasChapters = body.includes('⏱') || body.toLowerCase().includes('chapter');
  const hasHashtags = meta.hashtags.some((tag) => body.includes(tag));

  let result = body;

  if (!hasChapters && chapterBlock) {
    result += `\n\n⏱ Chapters:\n${chapterBlock}`;
  }

  if (!hasHashtags && hashtagLine) {
    result += `\n\n${hashtagLine}`;
  }

  return result.trim();
}

export function formatYouTubeShortCaption(meta: YouTubeShortMetadata): string {
  return `${meta.caption.trim()}\n\n${meta.hashtags.join(' ')}`.trim();
}

export function buildExportBundle(meta: SocialMetadata): Record<string, string> {
  const files: Record<string, string> = {
    [YOUTUBE_DESCRIPTION_TXT]: formatYouTubeDescription(meta.youtube),
    [YOUTUBE_TAGS_TXT]: meta.youtube.tags.join('\n'),
  };

  if (meta.youtubeShort) {
    files[YOUTUBE_SHORT_CAPTION_TXT] = formatYouTubeShortCaption(meta.youtubeShort);
  }

  return files;
}

export async function writeSocialMetadataExports(
  projectDir: string,
  meta: SocialMetadata,
): Promise<void> {
  await fs.writeFile(
    path.join(projectDir, SOCIAL_METADATA_JSON),
    JSON.stringify(meta, null, 2),
    'utf-8',
  );

  const files = buildExportBundle(meta);
  await Promise.all(
    Object.entries(files).map(([filename, content]) =>
      fs.writeFile(path.join(projectDir, filename), content, 'utf-8'),
    ),
  );
}

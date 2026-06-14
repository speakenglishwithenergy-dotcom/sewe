import fs from 'fs/promises';
import path from 'path';
import { SocialMetadata } from '../types';
import { normalizeSocialMetadata, formatChannelDescription, formatChannelShortCaption } from './social-metadata.normalize';

export const PUBLISH_OUTPUT_SUBDIR = 'publish';
export const SOCIAL_METADATA_JSON = 'social-metadata.json';
export const YOUTUBE_TITLE_TXT = 'youtube-title.txt';
export const YOUTUBE_DESCRIPTION_TXT = 'youtube-description.txt';
export const YOUTUBE_TAGS_TXT = 'youtube-tags.txt';
export const YOUTUBE_PINNED_COMMENT_TXT = 'youtube-pinned-comment.txt';
export const YOUTUBE_SHORT_TITLE_TXT = 'youtube-short-title.txt';
export const YOUTUBE_SHORT_CAPTION_TXT = 'youtube-short-caption.txt';
export const YOUTUBE_SHORT_PINNED_COMMENT_TXT = 'youtube-short-pinned-comment.txt';

export function getPublishOutputDir(projectDir: string): string {
  return path.join(projectDir, PUBLISH_OUTPUT_SUBDIR);
}

export function getSocialMetadataPath(projectDir: string): string {
  return path.join(getPublishOutputDir(projectDir), SOCIAL_METADATA_JSON);
}

/** Resolve cached social metadata (publish/ first, then legacy project root). */
export async function resolveSocialMetadataPath(projectDir: string): Promise<string | null> {
  const publishPath = getSocialMetadataPath(projectDir);
  try {
    await fs.access(publishPath);
    return publishPath;
  } catch {
    // fall through
  }

  const legacyPath = path.join(projectDir, SOCIAL_METADATA_JSON);
  try {
    await fs.access(legacyPath);
    return legacyPath;
  } catch {
    return null;
  }
}

export function buildExportBundle(meta: SocialMetadata): Record<string, string> {
  const files: Record<string, string> = {
    [YOUTUBE_TITLE_TXT]: meta.youtube.title,
    [YOUTUBE_DESCRIPTION_TXT]: formatChannelDescription(meta.youtube),
    [YOUTUBE_TAGS_TXT]: meta.youtube.tags.join('\n'),
    [YOUTUBE_PINNED_COMMENT_TXT]: meta.youtube.pinnedComment,
  };

  if (meta.youtubeShort) {
    files[YOUTUBE_SHORT_TITLE_TXT] = meta.youtubeShort.title;
    files[YOUTUBE_SHORT_CAPTION_TXT] = formatChannelShortCaption(meta.youtubeShort);
    files[YOUTUBE_SHORT_PINNED_COMMENT_TXT] = meta.youtubeShort.pinnedComment;
  }

  return files;
}

export async function writeSocialMetadataExports(
  projectDir: string,
  meta: SocialMetadata,
): Promise<void> {
  const normalized = normalizeSocialMetadata(meta);
  const publishDir = getPublishOutputDir(projectDir);
  await fs.mkdir(publishDir, { recursive: true });

  await fs.writeFile(
    path.join(publishDir, SOCIAL_METADATA_JSON),
    JSON.stringify(normalized, null, 2),
    'utf-8',
  );

  const files = buildExportBundle(normalized);
  await Promise.all(
    Object.entries(files).map(([filename, content]) =>
      fs.writeFile(path.join(publishDir, filename), content, 'utf-8'),
    ),
  );
}

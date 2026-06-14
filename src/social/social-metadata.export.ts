import fs from 'fs/promises';
import path from 'path';
import { SocialMetadata } from '../types';
import { normalizeSocialMetadata, formatChannelDescription, formatChannelShortCaption, formatFacebookCaption, formatFacebookShortCaption, formatYouTubeTags } from './social-metadata.normalize';

export const PUBLISH_OUTPUT_SUBDIR = 'publish';
export const SOCIAL_METADATA_JSON = 'social-metadata.json';
export const LONG_YOUTUBE_TITLE_TXT = 'long-youtube-title.txt';
export const LONG_YOUTUBE_DESCRIPTION_TXT = 'long-youtube-description.txt';
export const LONG_YOUTUBE_TAGS_TXT = 'long-youtube-tags.txt';
export const LONG_YOUTUBE_PINNED_COMMENT_TXT = 'long-youtube-pinned-comment.txt';
export const SHORT_YOUTUBE_TITLE_TXT = 'short-youtube-title.txt';
export const SHORT_YOUTUBE_CAPTION_TXT = 'short-youtube-caption.txt';
export const SHORT_YOUTUBE_PINNED_COMMENT_TXT = 'short-youtube-pinned-comment.txt';
export const LONG_FACEBOOK_CAPTION_TXT = 'long-facebook-caption.txt';
export const LONG_FACEBOOK_FIRST_COMMENT_TXT = 'long-facebook-first-comment.txt';
export const SHORT_FACEBOOK_CAPTION_TXT = 'short-facebook-caption.txt';
export const SHORT_FACEBOOK_FIRST_COMMENT_TXT = 'short-facebook-first-comment.txt';

/** Previous export filenames — removed on re-export to avoid duplicates. */
const LEGACY_PUBLISH_TXT_FILES = [
  'youtube-title.txt',
  'youtube-description.txt',
  'youtube-tags.txt',
  'youtube-pinned-comment.txt',
  'youtube-short-title.txt',
  'youtube-short-caption.txt',
  'youtube-short-pinned-comment.txt',
  'facebook-caption.txt',
  'facebook-first-comment.txt',
  'facebook-short-caption.txt',
  'facebook-short-first-comment.txt',
] as const;

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
    [LONG_YOUTUBE_TITLE_TXT]: meta.youtube.title,
    [LONG_YOUTUBE_DESCRIPTION_TXT]: formatChannelDescription(meta.youtube),
    [LONG_YOUTUBE_TAGS_TXT]: formatYouTubeTags(meta.youtube.tags),
    [LONG_YOUTUBE_PINNED_COMMENT_TXT]: meta.youtube.pinnedComment,
  };

  if (meta.youtubeShort) {
    files[SHORT_YOUTUBE_TITLE_TXT] = meta.youtubeShort.title;
    files[SHORT_YOUTUBE_CAPTION_TXT] = formatChannelShortCaption(meta.youtubeShort);
    files[SHORT_YOUTUBE_PINNED_COMMENT_TXT] = meta.youtubeShort.pinnedComment;
  }

  if (meta.facebook) {
    files[LONG_FACEBOOK_CAPTION_TXT] = formatFacebookCaption(meta.facebook);
    files[LONG_FACEBOOK_FIRST_COMMENT_TXT] = meta.facebook.firstComment;
  }

  if (meta.facebookShort) {
    files[SHORT_FACEBOOK_CAPTION_TXT] = formatFacebookShortCaption(meta.facebookShort);
    files[SHORT_FACEBOOK_FIRST_COMMENT_TXT] = meta.facebookShort.firstComment;
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

  await Promise.all(
    LEGACY_PUBLISH_TXT_FILES.map(async (filename) => {
      try {
        await fs.unlink(path.join(publishDir, filename));
      } catch {
        // ignore missing legacy files
      }
    }),
  );

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

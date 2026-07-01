import fs from 'fs/promises';
import path from 'path';
import { ResolvedPublishCopy } from '../channel/channel.types';
import { SocialMetadata } from '../types';
import {
  normalizeSocialMetadata,
  formatChannelDescription,
  formatChannelShortCaption,
  formatFacebookCaption,
  formatFacebookShortCaption,
  formatTikTokShortCaption,
  formatYouTubeTags,
} from './social-metadata.normalize';

export const PUBLISH_OUTPUT_SUBDIR = 'publish';
export const SOCIAL_METADATA_JSON = 'social-metadata.json';

export const PUBLISH_YOUTUBE_LONG_DIR = path.join('youtube', 'long');
export const PUBLISH_YOUTUBE_SHORT_DIR = path.join('youtube', 'short');
export const PUBLISH_FACEBOOK_LONG_DIR = path.join('facebook', 'long');
export const PUBLISH_FACEBOOK_SHORT_DIR = path.join('facebook', 'short');
export const PUBLISH_TIKTOK_SHORT_DIR = path.join('tiktok', 'short');

export const PUBLISH_TITLE_TXT = 'title.txt';
export const PUBLISH_DESCRIPTION_TXT = 'description.txt';
export const PUBLISH_TAGS_TXT = 'tags.txt';
export const PUBLISH_PINNED_COMMENT_TXT = 'pinned-comment.txt';
export const PUBLISH_CAPTION_TXT = 'caption.txt';
export const PUBLISH_FIRST_COMMENT_TXT = 'first-comment.txt';

export const YOUTUBE_LONG_TITLE = path.join(PUBLISH_YOUTUBE_LONG_DIR, PUBLISH_TITLE_TXT);
export const YOUTUBE_LONG_DESCRIPTION = path.join(PUBLISH_YOUTUBE_LONG_DIR, PUBLISH_DESCRIPTION_TXT);
export const YOUTUBE_LONG_TAGS = path.join(PUBLISH_YOUTUBE_LONG_DIR, PUBLISH_TAGS_TXT);
export const YOUTUBE_LONG_PINNED_COMMENT = path.join(PUBLISH_YOUTUBE_LONG_DIR, PUBLISH_PINNED_COMMENT_TXT);
export const YOUTUBE_SHORT_TITLE = path.join(PUBLISH_YOUTUBE_SHORT_DIR, PUBLISH_TITLE_TXT);
export const YOUTUBE_SHORT_CAPTION = path.join(PUBLISH_YOUTUBE_SHORT_DIR, PUBLISH_CAPTION_TXT);
export const YOUTUBE_SHORT_PINNED_COMMENT = path.join(PUBLISH_YOUTUBE_SHORT_DIR, PUBLISH_PINNED_COMMENT_TXT);
export const FACEBOOK_LONG_CAPTION = path.join(PUBLISH_FACEBOOK_LONG_DIR, PUBLISH_CAPTION_TXT);
export const FACEBOOK_LONG_FIRST_COMMENT = path.join(PUBLISH_FACEBOOK_LONG_DIR, PUBLISH_FIRST_COMMENT_TXT);
export const FACEBOOK_SHORT_CAPTION = path.join(PUBLISH_FACEBOOK_SHORT_DIR, PUBLISH_CAPTION_TXT);
export const FACEBOOK_SHORT_FIRST_COMMENT = path.join(PUBLISH_FACEBOOK_SHORT_DIR, PUBLISH_FIRST_COMMENT_TXT);
export const TIKTOK_SHORT_CAPTION = path.join(PUBLISH_TIKTOK_SHORT_DIR, PUBLISH_CAPTION_TXT);

/** Previous flat export filenames — removed on re-export to avoid duplicates. */
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
  'long-youtube-title.txt',
  'long-youtube-description.txt',
  'long-youtube-tags.txt',
  'long-youtube-pinned-comment.txt',
  'short-youtube-title.txt',
  'short-youtube-caption.txt',
  'short-youtube-pinned-comment.txt',
  'long-facebook-caption.txt',
  'long-facebook-first-comment.txt',
  'short-facebook-caption.txt',
  'short-facebook-first-comment.txt',
] as const;

/** Previous folder layouts — removed on re-export to avoid duplicates. */
const LEGACY_PUBLISH_RELATIVE_PATHS = [
  'long/youtube/title.txt',
  'long/youtube/description.txt',
  'long/youtube/tags.txt',
  'long/youtube/pinned-comment.txt',
  'long/facebook/caption.txt',
  'long/facebook/first-comment.txt',
  'short/youtube/title.txt',
  'short/youtube/caption.txt',
  'short/youtube/pinned-comment.txt',
  'short/facebook/caption.txt',
  'short/facebook/first-comment.txt',
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

export function buildExportBundle(meta: SocialMetadata, pub: ResolvedPublishCopy): Record<string, string> {
  const files: Record<string, string> = {
    [YOUTUBE_LONG_TITLE]: meta.youtube.title,
    [YOUTUBE_LONG_DESCRIPTION]: formatChannelDescription(meta.youtube, pub),
    [YOUTUBE_LONG_TAGS]: formatYouTubeTags(meta.youtube.tags),
    [YOUTUBE_LONG_PINNED_COMMENT]: meta.youtube.pinnedComment,
  };

  if (meta.youtubeShort) {
    files[YOUTUBE_SHORT_TITLE] = meta.youtubeShort.title;
    files[YOUTUBE_SHORT_CAPTION] = formatChannelShortCaption(meta.youtubeShort, pub);
    files[YOUTUBE_SHORT_PINNED_COMMENT] = meta.youtubeShort.pinnedComment;
    files[TIKTOK_SHORT_CAPTION] = formatTikTokShortCaption(meta.youtubeShort, pub);
  }

  if (meta.facebook) {
    files[FACEBOOK_LONG_CAPTION] = formatFacebookCaption(meta.facebook, pub);
    files[FACEBOOK_LONG_FIRST_COMMENT] = meta.facebook.firstComment;
  }

  if (meta.facebookShort) {
    files[FACEBOOK_SHORT_CAPTION] = formatFacebookShortCaption(meta.facebookShort, pub);
    files[FACEBOOK_SHORT_FIRST_COMMENT] = meta.facebookShort.firstComment;
  }

  return files;
}

async function removeLegacyPublishFiles(publishDir: string): Promise<void> {
  await Promise.all(
    [...LEGACY_PUBLISH_TXT_FILES, ...LEGACY_PUBLISH_RELATIVE_PATHS].map(async (relativePath) => {
      try {
        await fs.unlink(path.join(publishDir, relativePath));
      } catch {
        // ignore missing legacy files
      }
    }),
  );
}

export async function writeSocialMetadataExports(
  projectDir: string,
  meta: SocialMetadata,
  pub: ResolvedPublishCopy,
  topic?: string,
): Promise<void> {
  const normalized = normalizeSocialMetadata(meta, pub, topic);
  const publishDir = getPublishOutputDir(projectDir);
  await fs.mkdir(publishDir, { recursive: true });
  await removeLegacyPublishFiles(publishDir);

  await fs.writeFile(
    path.join(publishDir, SOCIAL_METADATA_JSON),
    JSON.stringify(normalized, null, 2),
    'utf-8',
  );

  const files = buildExportBundle(normalized, pub);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const outputPath = path.join(publishDir, relativePath);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, content, 'utf-8');
    }),
  );
}

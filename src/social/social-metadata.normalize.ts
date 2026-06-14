import {
  PUBLISH_CORE_HASHTAGS,
  PUBLISH_CORE_TAGS,
  PUBLISH_DESCRIPTION,
  PUBLISH_LIMITS,
  PUBLISH_SHORT_CORE_HASHTAGS,
} from './publish.config';
import { SocialMetadata, YouTubeMetadata, YouTubeShortMetadata } from '../types';

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/^#/, '');
}

function normalizeHashtag(tag: string): string {
  const trimmed = tag.trim();
  const body = trimmed.replace(/^#+/, '');
  if (!body) return '';
  return `#${body}`;
}

function mergeUniqueTags(core: readonly string[], episode: string[], max: number): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const tag of [...core, ...episode]) {
    const normalized = normalizeTag(tag);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
    if (merged.length >= max) break;
  }

  return merged;
}

function mergeUniqueHashtags(core: readonly string[], episode: string[], max: number): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const tag of [...core, ...episode]) {
    const normalized = normalizeHashtag(tag);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
    if (merged.length >= max) break;
  }

  return merged;
}

function truncateAtWord(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const slice = trimmed.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.6) {
    return slice.slice(0, lastSpace).trim();
  }
  return slice.trim();
}

function extractHook(description: string): string {
  const beforeLearn = description.split(PUBLISH_DESCRIPTION.learnHeader)[0]?.trim() ?? description.trim();
  const hook = beforeLearn.split('\n\n')[0]?.trim() ?? beforeLearn;
  return truncateAtWord(hook, PUBLISH_LIMITS.hookMaxChars);
}

function extractBullets(description: string): string[] {
  const learnPattern = new RegExp(
    `${escapeRegExp(PUBLISH_DESCRIPTION.learnHeader)}\\s*\\n([\\s\\S]*?)(?=\\n\\n${escapeRegExp(PUBLISH_DESCRIPTION.chaptersHeader)}|\\n\\n🔔|$)`,
  );
  const match = description.match(learnPattern);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the canonical channel description layout from structured metadata. */
export function formatChannelDescription(meta: YouTubeMetadata): string {
  const hook = extractHook(meta.description);
  const bullets = extractBullets(meta.description);
  const hashtags = mergeUniqueHashtags(
    PUBLISH_CORE_HASHTAGS,
    meta.hashtags,
    PUBLISH_LIMITS.youtubeHashtagsMax,
  );
  const chapterBlock = meta.chapters.map((chapter) => `${chapter.time} ${chapter.label}`).join('\n');

  const bulletBlock =
    bullets.length > 0
      ? bullets.map((bullet) => `• ${bullet}`).join('\n')
      : '• Practical English tips you can use today';

  return [
    hook,
    '',
    PUBLISH_DESCRIPTION.learnHeader,
    bulletBlock,
    '',
    PUBLISH_DESCRIPTION.chaptersHeader,
    chapterBlock,
    '',
    PUBLISH_DESCRIPTION.subscribeCta,
    PUBLISH_DESCRIPTION.shortCta,
    '',
    hashtags.join(' '),
  ]
    .join('\n')
    .trim();
}

export function formatChannelShortCaption(meta: YouTubeShortMetadata): string {
  const caption = truncateAtWord(meta.caption.trim(), PUBLISH_LIMITS.shortCaptionMaxChars);
  const hashtags = mergeUniqueHashtags(
    PUBLISH_SHORT_CORE_HASHTAGS,
    meta.hashtags,
    PUBLISH_LIMITS.shortHashtagsMax,
  );

  return `${caption}\n\n${hashtags.join(' ')}`.trim();
}

function normalizeYouTubeMetadata(meta: YouTubeMetadata): YouTubeMetadata {
  const hashtags = mergeUniqueHashtags(
    PUBLISH_CORE_HASHTAGS,
    meta.hashtags,
    PUBLISH_LIMITS.youtubeHashtagsMax,
  );
  const normalized: YouTubeMetadata = {
    ...meta,
    title: truncateAtWord(meta.title, PUBLISH_LIMITS.youtubeTitleMax),
    titleVariants: meta.titleVariants.map((title) =>
      truncateAtWord(title, PUBLISH_LIMITS.youtubeTitleMax),
    ),
    tags: mergeUniqueTags(PUBLISH_CORE_TAGS, meta.tags, PUBLISH_LIMITS.youtubeTagsMax),
    hashtags,
    pinnedComment: meta.pinnedComment.trim(),
  };

  return {
    ...normalized,
    description: formatChannelDescription(normalized),
  };
}

function normalizeYouTubeShortMetadata(meta: YouTubeShortMetadata): YouTubeShortMetadata {
  return {
    ...meta,
    title: truncateAtWord(meta.title, PUBLISH_LIMITS.youtubeShortTitleMax),
    caption: truncateAtWord(meta.caption.trim(), PUBLISH_LIMITS.shortCaptionMaxChars),
    hashtags: mergeUniqueHashtags(
      PUBLISH_SHORT_CORE_HASHTAGS,
      meta.hashtags,
      PUBLISH_LIMITS.shortHashtagsMax,
    ),
    pinnedComment: meta.pinnedComment.trim(),
  };
}

export function normalizeSocialMetadata(meta: SocialMetadata): SocialMetadata {
  const youtube = normalizeYouTubeMetadata(meta.youtube);
  const youtubeShort = meta.youtubeShort
    ? normalizeYouTubeShortMetadata(meta.youtubeShort)
    : undefined;

  return { youtube, youtubeShort };
}

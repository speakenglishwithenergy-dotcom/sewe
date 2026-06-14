import {
  PUBLISH_CHAPTER_LABELS,
  PUBLISH_CORE_HASHTAGS,
  PUBLISH_CORE_TAGS,
  PUBLISH_DEFAULT_BULLETS,
  PUBLISH_DESCRIPTION,
  PUBLISH_FACEBOOK,
  PUBLISH_FACEBOOK_CORE_HASHTAGS,
  PUBLISH_FACEBOOK_SHORT_CORE_HASHTAGS,
  PUBLISH_LIMITS,
  PUBLISH_SHORT_CORE_HASHTAGS,
  PUBLISH_SHORT_LINKS,
  PUBLISH_YOUTUBE_TITLE_BASE_MAX,
  PUBLISH_YOUTUBE_TITLE_SUFFIX,
} from './publish.config';
import {
  FacebookMetadata,
  FacebookShortMetadata,
  SocialMetadata,
  YouTubeMetadata,
  YouTubeShortMetadata,
} from '../types';

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

/** Remove hashtag-only lines and trailing inline hashtags from LLM caption text. */
function stripEmbeddedHashtags(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^(\s*#\w+\s*)+$/.test(line.trim()))
    .map((line) => line.replace(/\s+#\w+(?:\s+#\w+)*\s*$/g, '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractHook(description: string, learnHeader: string): string {
  const beforeLearn = description.split(learnHeader)[0]?.trim() ?? description.trim();
  const hook = beforeLearn.split('\n\n')[0]?.trim() ?? beforeLearn;
  return truncateAtWord(hook, PUBLISH_LIMITS.hookMaxChars);
}

function extractBullets(description: string, learnHeader: string): string[] {
  const learnPattern = new RegExp(
    `${escapeRegExp(learnHeader)}\\s*\\n([\\s\\S]*?)(?=\\n\\n${escapeRegExp(PUBLISH_DESCRIPTION.chaptersHeader)}|\\n\\n👍|\\n\\n🔔|$)`,
  );
  const match = description.match(learnPattern);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}

/** Always return exactly 3 bullets — pad with channel defaults if needed. */
function normalizeBullets(bullets: string[]): string[] {
  const trimmed = bullets.map((bullet) => bullet.trim()).filter(Boolean).slice(0, 3);
  while (trimmed.length < 3) {
    trimmed.push(PUBLISH_DEFAULT_BULLETS[trimmed.length]);
  }
  return trimmed;
}

function normalizeChapterLabels(
  chapters: YouTubeMetadata['chapters'],
): YouTubeMetadata['chapters'] {
  if (chapters.length !== PUBLISH_CHAPTER_LABELS.length) return chapters;

  return chapters.map((chapter, index) => ({
    time: chapter.time,
    label: PUBLISH_CHAPTER_LABELS[index],
  }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripYouTubeTitleSuffix(title: string): string {
  const suffixPattern = new RegExp(`${escapeRegExp(PUBLISH_YOUTUBE_TITLE_SUFFIX)}$`);
  return title.replace(suffixPattern, '').trim();
}

/** Append channel title suffix; total length stays within youtubeTitleMax. */
export function formatYouTubeTitle(title: string): string {
  const base = truncateAtWord(stripYouTubeTitleSuffix(title), PUBLISH_YOUTUBE_TITLE_BASE_MAX);
  return `${base}${PUBLISH_YOUTUBE_TITLE_SUFFIX}`;
}

export function formatYouTubeTags(tags: string[]): string {
  return tags.join(', ');
}

function formatShortLinksFooter(): string {
  return [PUBLISH_SHORT_LINKS.youtubeLine, PUBLISH_SHORT_LINKS.facebookLine].join('\n');
}

/** Build the canonical channel description layout from structured metadata. */
export function formatChannelDescription(meta: YouTubeMetadata): string {
  const hook = extractHook(meta.description, PUBLISH_DESCRIPTION.learnHeader);
  const bullets = normalizeBullets(extractBullets(meta.description, PUBLISH_DESCRIPTION.learnHeader));
  const hashtags = mergeUniqueHashtags(
    PUBLISH_CORE_HASHTAGS,
    meta.hashtags,
    PUBLISH_LIMITS.youtubeHashtagsMax,
  );
  const chapters = normalizeChapterLabels(meta.chapters);
  const chapterBlock = chapters.map((chapter) => `${chapter.time} ${chapter.label}`).join('\n');

  const bulletBlock = bullets.map((bullet) => `• ${bullet}`).join('\n');

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
    PUBLISH_DESCRIPTION.linksHeader,
    PUBLISH_DESCRIPTION.youtubeLinkLine,
    PUBLISH_DESCRIPTION.facebookLinkLine,
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

  return [caption, '', hashtags.join(' '), '', formatShortLinksFooter()].join('\n').trim();
}

/** Build the canonical Facebook podcast post caption from structured metadata. */
export function formatFacebookCaption(meta: FacebookMetadata): string {
  const hook = extractHook(meta.caption, PUBLISH_FACEBOOK.learnHeader);
  const bullets = normalizeBullets(extractBullets(meta.caption, PUBLISH_FACEBOOK.learnHeader));
  const hashtags = mergeUniqueHashtags(
    PUBLISH_FACEBOOK_CORE_HASHTAGS,
    meta.hashtags,
    PUBLISH_LIMITS.facebookHashtagsMax,
  );
  const bulletBlock = bullets.map((bullet) => `• ${bullet}`).join('\n');

  return [
    hook,
    '',
    PUBLISH_FACEBOOK.learnHeader,
    bulletBlock,
    '',
    PUBLISH_FACEBOOK.followCta,
    PUBLISH_FACEBOOK.youtubeCta,
    '',
    hashtags.join(' '),
  ]
    .join('\n')
    .trim();
}

export function formatFacebookShortCaption(meta: FacebookShortMetadata): string {
  const caption = truncateAtWord(meta.caption.trim(), PUBLISH_LIMITS.facebookShortCaptionMaxChars);
  const hashtags = mergeUniqueHashtags(
    PUBLISH_FACEBOOK_SHORT_CORE_HASHTAGS,
    meta.hashtags,
    PUBLISH_LIMITS.facebookShortHashtagsMax,
  );

  return [caption, '', hashtags.join(' '), '', PUBLISH_SHORT_LINKS.youtubeLine].join('\n').trim();
}

function normalizeYouTubeMetadata(meta: YouTubeMetadata): YouTubeMetadata {
  const hashtags = mergeUniqueHashtags(
    PUBLISH_CORE_HASHTAGS,
    meta.hashtags,
    PUBLISH_LIMITS.youtubeHashtagsMax,
  );
  const normalized: YouTubeMetadata = {
    ...meta,
    title: formatYouTubeTitle(meta.title),
    titleVariants: meta.titleVariants.map((title) => formatYouTubeTitle(title)),
    tags: mergeUniqueTags(PUBLISH_CORE_TAGS, meta.tags, PUBLISH_LIMITS.youtubeTagsMax),
    chapters: normalizeChapterLabels(meta.chapters),
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
    caption: truncateAtWord(stripEmbeddedHashtags(meta.caption.trim()), PUBLISH_LIMITS.shortCaptionMaxChars),
    hashtags: mergeUniqueHashtags(
      PUBLISH_SHORT_CORE_HASHTAGS,
      meta.hashtags,
      PUBLISH_LIMITS.shortHashtagsMax,
    ),
    pinnedComment: meta.pinnedComment.trim(),
  };
}

function normalizeFacebookMetadata(meta: FacebookMetadata): FacebookMetadata {
  const normalized: FacebookMetadata = {
    ...meta,
    hashtags: mergeUniqueHashtags(
      PUBLISH_FACEBOOK_CORE_HASHTAGS,
      meta.hashtags,
      PUBLISH_LIMITS.facebookHashtagsMax,
    ),
    firstComment: meta.firstComment.trim(),
  };

  return {
    ...normalized,
    caption: formatFacebookCaption(normalized),
  };
}

function normalizeFacebookShortMetadata(meta: FacebookShortMetadata): FacebookShortMetadata {
  return {
    ...meta,
    caption: truncateAtWord(
      stripEmbeddedHashtags(meta.caption.trim()),
      PUBLISH_LIMITS.facebookShortCaptionMaxChars,
    ),
    hashtags: mergeUniqueHashtags(
      PUBLISH_FACEBOOK_SHORT_CORE_HASHTAGS,
      meta.hashtags,
      PUBLISH_LIMITS.facebookShortHashtagsMax,
    ),
    firstComment: meta.firstComment.trim(),
  };
}

export function normalizeSocialMetadata(meta: SocialMetadata): SocialMetadata {
  const youtube = normalizeYouTubeMetadata(meta.youtube);
  const youtubeShort = meta.youtubeShort
    ? normalizeYouTubeShortMetadata(meta.youtubeShort)
    : undefined;
  const facebook = meta.facebook ? normalizeFacebookMetadata(meta.facebook) : undefined;
  const facebookShort = meta.facebookShort
    ? normalizeFacebookShortMetadata(meta.facebookShort)
    : undefined;

  return { youtube, youtubeShort, facebook, facebookShort };
}

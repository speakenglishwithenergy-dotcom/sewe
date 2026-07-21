import { ResolvedPublishCopy } from '../channel/channel.types';
import { PUBLISH_LIMITS } from './publish.limits';
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
    `${escapeRegExp(learnHeader)}\\s*\\n([\\s\\S]*?)(?=\\n\\n${escapeRegExp('⏱ Chapters:')}|\\n\\n👍|\\n\\n🔔|$)`,
  );
  const match = description.match(learnPattern);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}

function normalizeBullets(bullets: string[], pub: ResolvedPublishCopy): string[] {
  const trimmed = bullets.map((bullet) => bullet.trim()).filter(Boolean).slice(0, 3);
  while (trimmed.length < 3) {
    trimmed.push(pub.defaultBullets[trimmed.length] ?? pub.defaultBullets[0]);
  }
  return trimmed;
}

function normalizeChapterLabels(
  chapters: YouTubeMetadata['chapters'],
  pub: ResolvedPublishCopy,
): YouTubeMetadata['chapters'] {
  if (chapters.length !== pub.chapterLabels.length) return chapters;

  return chapters.map((chapter, index) => ({
    time: chapter.time,
    label: pub.chapterLabels[index] ?? chapter.label,
  }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripYouTubeTitleSuffix(title: string, suffix: string): string {
  const suffixPattern = new RegExp(`${escapeRegExp(suffix)}$`);
  return title.replace(suffixPattern, '').trim();
}

export function formatYouTubeTitle(title: string, pub: ResolvedPublishCopy): string {
  const base = truncateAtWord(stripYouTubeTitleSuffix(title, pub.titleSuffix), pub.titleBaseMax);
  return `${base}${pub.titleSuffix}`;
}

export function formatYouTubeTags(tags: string[]): string {
  return tags.join(', ');
}

function formatShortLinksFooter(pub: ResolvedPublishCopy): string {
  const lines = [pub.shortLinks.youtubeLine, pub.shortLinks.facebookLine];
  if (pub.includeTikTok) lines.push(pub.shortLinks.tiktokLine);
  return lines.join('\n');
}

export function formatChannelDescription(meta: YouTubeMetadata, pub: ResolvedPublishCopy): string {
  const desc = pub.description;
  const hook = extractHook(meta.description, desc.learnHeader);
  const bullets = normalizeBullets(extractBullets(meta.description, desc.learnHeader), pub);
  const hashtags = mergeUniqueHashtags(
    pub.coreHashtags,
    meta.hashtags,
    PUBLISH_LIMITS.youtubeHashtagsMax,
  );
  const chapters = normalizeChapterLabels(meta.chapters, pub);
  const chapterBlock = chapters.map((chapter) => `${chapter.time} ${chapter.label}`).join('\n');
  const bulletBlock = bullets.map((bullet) => `• ${bullet}`).join('\n');

  const linkLines = [desc.youtubeLinkLine, desc.facebookLinkLine];
  if (pub.includeTikTok) linkLines.push(desc.tiktokLinkLine);

  return [
    hook,
    '',
    desc.learnHeader,
    bulletBlock,
    '',
    desc.chaptersHeader,
    chapterBlock,
    '',
    desc.subscribeCta,
    desc.shortCta,
    '',
    desc.linksHeader,
    ...linkLines,
    '',
    hashtags.join(' '),
  ]
    .join('\n')
    .trim();
}

export function formatChannelShortCaption(
  meta: YouTubeShortMetadata,
  pub: ResolvedPublishCopy,
): string {
  const caption = truncateAtWord(meta.caption.trim(), PUBLISH_LIMITS.shortCaptionMaxChars);
  const hashtags = mergeUniqueHashtags(
    pub.shortCoreHashtags,
    meta.hashtags,
    PUBLISH_LIMITS.shortHashtagsMax,
  );

  return [caption, '', hashtags.join(' '), '', formatShortLinksFooter(pub)].join('\n').trim();
}

export function formatTikTokShortCaption(
  meta: YouTubeShortMetadata,
  pub: ResolvedPublishCopy,
): string {
  const caption = truncateAtWord(meta.caption.trim(), PUBLISH_LIMITS.shortCaptionMaxChars);
  const hashtags = mergeUniqueHashtags(
    pub.shortCoreHashtags,
    meta.hashtags,
    PUBLISH_LIMITS.shortHashtagsMax,
  );

  return [caption, '', hashtags.join(' ')].join('\n').trim();
}

export function formatFacebookCaption(meta: FacebookMetadata, pub: ResolvedPublishCopy): string {
  const fb = pub.facebook;
  const hook = extractHook(meta.caption, fb.learnHeader);
  const bullets = normalizeBullets(extractBullets(meta.caption, fb.learnHeader), pub);
  const hashtags = mergeUniqueHashtags(
    pub.facebookCoreHashtags,
    meta.hashtags,
    PUBLISH_LIMITS.facebookHashtagsMax,
  );
  const bulletBlock = bullets.map((bullet) => `• ${bullet}`).join('\n');

  const ctaLines = [fb.followCta, fb.youtubeCta];
  if (pub.includeTikTok) ctaLines.push(fb.tiktokCta);

  return [
    hook,
    '',
    fb.learnHeader,
    bulletBlock,
    '',
    ...ctaLines,
    '',
    hashtags.join(' '),
  ]
    .join('\n')
    .trim();
}

export function formatFacebookShortCaption(
  meta: FacebookShortMetadata,
  pub: ResolvedPublishCopy,
): string {
  const caption = truncateAtWord(meta.caption.trim(), PUBLISH_LIMITS.facebookShortCaptionMaxChars);
  const hashtags = mergeUniqueHashtags(
    pub.facebookShortCoreHashtags,
    meta.hashtags,
    PUBLISH_LIMITS.facebookShortHashtagsMax,
  );

  return [caption, '', hashtags.join(' '), '', formatShortLinksFooter(pub)].join('\n').trim();
}

function normalizeYouTubeMetadata(
  meta: YouTubeMetadata,
  pub: ResolvedPublishCopy,
  topic?: string,
): YouTubeMetadata {
  const hashtags = mergeUniqueHashtags(
    pub.coreHashtags,
    meta.hashtags,
    PUBLISH_LIMITS.youtubeHashtagsMax,
  );
  const normalized: YouTubeMetadata = {
    ...meta,
    title: formatYouTubeTitle(topic ?? meta.title, pub),
    titleVariants: meta.titleVariants.map((title) => formatYouTubeTitle(title, pub)),
    tags: mergeUniqueTags(pub.coreTags, meta.tags, PUBLISH_LIMITS.youtubeTagsMax),
    chapters: normalizeChapterLabels(meta.chapters, pub),
    hashtags,
    pinnedComment: meta.pinnedComment.trim(),
  };

  return {
    ...normalized,
    description: formatChannelDescription(normalized, pub),
  };
}

function normalizeYouTubeShortMetadata(
  meta: YouTubeShortMetadata,
  pub: ResolvedPublishCopy,
): YouTubeShortMetadata {
  return {
    ...meta,
    title: truncateAtWord(meta.title, PUBLISH_LIMITS.youtubeShortTitleMax),
    caption: truncateAtWord(stripEmbeddedHashtags(meta.caption.trim()), PUBLISH_LIMITS.shortCaptionMaxChars),
    hashtags: mergeUniqueHashtags(
      pub.shortCoreHashtags,
      meta.hashtags,
      PUBLISH_LIMITS.shortHashtagsMax,
    ),
    pinnedComment: meta.pinnedComment.trim(),
  };
}

function normalizeFacebookMetadata(
  meta: FacebookMetadata,
  pub: ResolvedPublishCopy,
): FacebookMetadata {
  const normalized: FacebookMetadata = {
    ...meta,
    hashtags: mergeUniqueHashtags(
      pub.facebookCoreHashtags,
      meta.hashtags,
      PUBLISH_LIMITS.facebookHashtagsMax,
    ),
    firstComment: meta.firstComment.trim(),
  };

  return {
    ...normalized,
    caption: formatFacebookCaption(normalized, pub),
  };
}

function normalizeFacebookShortMetadata(
  meta: FacebookShortMetadata,
  pub: ResolvedPublishCopy,
): FacebookShortMetadata {
  return {
    ...meta,
    caption: truncateAtWord(
      stripEmbeddedHashtags(meta.caption.trim()),
      PUBLISH_LIMITS.facebookShortCaptionMaxChars,
    ),
    hashtags: mergeUniqueHashtags(
      pub.facebookShortCoreHashtags,
      meta.hashtags,
      PUBLISH_LIMITS.facebookShortHashtagsMax,
    ),
    firstComment: meta.firstComment.trim(),
  };
}

export function normalizeSocialMetadata(
  meta: SocialMetadata,
  pub: ResolvedPublishCopy,
  topic?: string,
): SocialMetadata {
  const youtube = normalizeYouTubeMetadata(meta.youtube, pub, topic);
  const youtubeShort = meta.youtubeShort
    ? normalizeYouTubeShortMetadata(meta.youtubeShort, pub)
    : undefined;
  const facebook = meta.facebook ? normalizeFacebookMetadata(meta.facebook, pub) : undefined;
  const facebookShort = meta.facebookShort
    ? normalizeFacebookShortMetadata(meta.facebookShort, pub)
    : undefined;

  return { youtube, youtubeShort, facebook, facebookShort };
}

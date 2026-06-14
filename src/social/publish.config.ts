import { CHANNEL_NAME } from '../prompts/script.prompt';

/** Tags always included on every podcast upload (episode-specific tags are appended). */
export const PUBLISH_CORE_TAGS = [
  'learn english',
  'english podcast',
  'speak english with energy',
  'english speaking',
  'english fluency',
] as const;

/** Hashtags always included on every podcast description. */
export const PUBLISH_CORE_HASHTAGS = [
  '#LearnEnglish',
  `#${CHANNEL_NAME.replace(/\s+/g, '')}`,
] as const;

/** Hashtags always included on every Short caption. */
export const PUBLISH_SHORT_CORE_HASHTAGS = [
  '#LearnEnglish',
  `#${CHANNEL_NAME.replace(/\s+/g, '')}`,
  '#Shorts',
] as const;

/** Standard chapter labels — same wording on every episode (timestamps vary). */
export const PUBLISH_CHAPTER_LABELS = [
  'Intro',
  'Main idea 1',
  'Main idea 2',
  'Main idea 3',
  'Closing',
] as const;

/** Fallback bullets when the model returns fewer than 3 takeaways. */
export const PUBLISH_DEFAULT_BULLETS = [
  'Practical English tips you can use today',
  'Clear examples you can repeat out loud',
  'Confidence-building phrases for real conversations',
] as const;

/** Fixed copy blocks — keep identical across all episodes. */
export const PUBLISH_DESCRIPTION = {
  learnHeader: "📌 In this episode you'll learn:",
  chaptersHeader: '⏱ Chapters:',
  subscribeCta: '🔔 Subscribe for more English tips with energy!',
  shortCta: '🎧 Watch the Short version for a quick recap.',
} as const;

export const PUBLISH_LIMITS = {
  youtubeTitleMax: 70,
  youtubeShortTitleMax: 50,
  youtubeTagsMax: 15,
  youtubeHashtagsMax: 5,
  shortHashtagsMax: 5,
  hookMaxChars: 125,
  shortCaptionMaxChars: 150,
} as const;

/** Suffix appended to every podcast YouTube title (included in youtubeTitleMax). */
export const PUBLISH_YOUTUBE_TITLE_SUFFIX = ' | English Podcast for Learning';

/** Max characters for the episode-specific title before the suffix is appended. */
export const PUBLISH_YOUTUBE_TITLE_BASE_MAX =
  PUBLISH_LIMITS.youtubeTitleMax - PUBLISH_YOUTUBE_TITLE_SUFFIX.length;

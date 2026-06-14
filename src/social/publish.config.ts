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
  '#Shorts',
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

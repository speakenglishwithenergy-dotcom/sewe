/** Platform publish limits — not channel-specific. */
export const PUBLISH_LIMITS = {
  youtubeTitleMax: 70,
  youtubeShortTitleMax: 50,
  youtubeTagsMax: 15,
  youtubeHashtagsMax: 5,
  shortHashtagsMax: 5,
  facebookHashtagsMax: 5,
  facebookShortHashtagsMax: 5,
  hookMaxChars: 125,
  shortCaptionMaxChars: 150,
  facebookShortCaptionMaxChars: 150,
} as const;

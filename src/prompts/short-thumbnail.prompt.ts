import {
  THUMBNAIL_ART_STYLE,
  THUMBNAIL_BRANDING_LOCK_RULE,
  THUMBNAIL_BRAND_COLORS,
  THUMBNAIL_CHARACTERS_EXPRESSION_GUIDANCE,
  THUMBNAIL_CHARACTERS_UNCHANGED,
  THUMBNAIL_EXPRESSION_MODERATION,
  THUMBNAIL_LISA_EXPRESSION_GUIDANCE,
  THUMBNAIL_SHORT_BADGE_UNCHANGED,
  THUMBNAIL_SHORT_LOGO_UNCHANGED,
  THUMBNAIL_TOPIC_RELEVANCE,
  THUMBNAIL_VICTOR_EXPRESSION_GUIDANCE,
} from './thumbnail-brand';

export interface ShortThumbnailPromptInput {
  topic: string;
  episodeTitle: string;
  thumbnailText: string;
  thumbnailScene: string;
}

export function buildShortThumbnailImagePrompt(input: ShortThumbnailPromptInput): string {
  const { topic, episodeTitle, thumbnailText, thumbnailScene } = input;

  return `Edit the provided reference thumbnail template for the "Speak English With Energy" English-learning channel — VERTICAL 9:16 short-form format.

This is a STRICT TEMPLATE EDIT. Keep the vertical reference layout and branding identical. Only change the headline text and topic-specific context.

${THUMBNAIL_BRANDING_LOCK_RULE}

KEEP UNCHANGED (match the provided vertical reference exactly):
- Vertical 9:16 portrait composition with safe margins — nothing touches the frame edges
- TOP ~30%: stacked headline area centered (same typography style, spacing, and colors as reference)
- MIDDLE/BOTTOM ~70%: Victor and Lisa at the podcast desk — same character designs, positions, and core props
${THUMBNAIL_SHORT_LOGO_UNCHANGED}
${THUMBNAIL_SHORT_BADGE_UNCHANGED}
${THUMBNAIL_CHARACTERS_UNCHANGED}
- Desk: wooden table, two black condenser mics on stands, small white succulent, open notebook with pen
- Art style: ${THUMBNAIL_ART_STYLE}
- Brand colors: ${THUMBNAIL_BRAND_COLORS}

CHANGE ONLY — headline text at the top:

Episode title: "${episodeTitle}"

Replace the reference headline with this new stacked ALL-CAPS text (spell exactly, preserve \\n line breaks):
"${thumbnailText}"
Use the same treatment as the reference: navy sans-serif lines, one keyword in large bright orange, one line in white on a thick navy horizontal brush-stroke banner.

CHANGE ONLY — topic context on the characters:

Episode topic: "${topic}"
Every expression, gesture, prop, and scene detail below MUST connect to this topic.

${thumbnailScene}

${THUMBNAIL_CHARACTERS_EXPRESSION_GUIDANCE}

High contrast, readable on a phone screen, no watermarks, no extra text beyond what is specified.`;
}

export function buildShortThumbnailScenePrompt(
  topic: string,
  episodeTitle: string,
  thumbnailText: string,
): string {
  return `You are an art director for the "Speak English With Energy" YouTube Short / TikTok channel.

Episode title: "${episodeTitle}"
Topic: "${topic}"
Thumbnail headline: "${thumbnailText}"

The thumbnail uses a fixed VERTICAL 9:16 template (Victor and Lisa at a podcast desk, headline at top). Write ONLY the topic-specific changes — not the full scene. Every detail must relate to the topic above.

${THUMBNAIL_TOPIC_RELEVANCE}

Describe what to change from the default template — all choices driven by topic "${topic}":
${THUMBNAIL_EXPRESSION_MODERATION}
${THUMBNAIL_VICTOR_EXPRESSION_GUIDANCE}
${THUMBNAIL_LISA_EXPRESSION_GUIDANCE}
- Victor's expression + gesture: a specific learner moment FROM this topic
- Lisa's expression + gesture: coaches Victor through THIS topic's insight
- One topic-specific visual metaphor (prop, gesture, or small comic element — thought bubble only when confusion is the hook)
- Three book spine titles on the desk stack — short uppercase words directly about this episode
- Optional subtle background accents that reflect this episode's topic

Do NOT describe Victor/Lisa appearance, mugs, mics, logo, badge, or desk layout — those stay fixed. Never ask to redraw or regenerate logo icons (microphone, book) or the badge microphone.

Return ONLY valid JSON:
{
  "thumbnailScene": "..."
}`;
}

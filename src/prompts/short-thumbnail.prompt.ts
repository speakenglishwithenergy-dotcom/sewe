import {
  THUMBNAIL_ART_STYLE,
  THUMBNAIL_BRAND_COLORS,
  THUMBNAIL_CHARACTERS_EXPRESSION_GUIDANCE,
  THUMBNAIL_CHARACTERS_UNCHANGED,
  THUMBNAIL_LISA_EXPRESSION_GUIDANCE,
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

KEEP UNCHANGED (match the provided vertical reference exactly):
- Vertical 9:16 portrait composition with safe margins — nothing touches the frame edges
- TOP ~30%: stacked headline area centered (same typography style, spacing, and colors as reference)
- MIDDLE/BOTTOM ~70%: Victor and Lisa at the podcast desk — same character designs, positions, and core props
- TOP: "Speak ENGLISH WITH ENERGY" logo with microphone and book icons (compact for vertical)
- BOTTOM: green rounded badge with microphone icon — "ENGLISH PODCAST" and "FOR LEARNING ENGLISH"
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
${thumbnailScene}

${THUMBNAIL_CHARACTERS_EXPRESSION_GUIDANCE}

Episode topic: "${topic}"

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

The thumbnail uses a fixed VERTICAL 9:16 template (Victor and Lisa at a podcast desk, headline at top). Write ONLY the topic-specific changes — not the full scene.

Describe what to change from the default template:
${THUMBNAIL_VICTOR_EXPRESSION_GUIDANCE}
${THUMBNAIL_LISA_EXPRESSION_GUIDANCE}
- One visual metaphor tied to the topic (prop, gesture, or small comic element — thought bubble only when confusion is the hook)
- Three book spine titles on the desk stack — short uppercase words related to the topic
- Optional subtle background accents that reflect the topic

Do NOT describe Victor/Lisa appearance, mugs, mics, logo, badge, or desk layout — those stay fixed.

Return ONLY valid JSON:
{
  "thumbnailScene": "..."
}`;
}

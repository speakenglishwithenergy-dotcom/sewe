import {
  THUMBNAIL_ART_STYLE,
  THUMBNAIL_BADGE_UNCHANGED,
  THUMBNAIL_BRANDING_LOCK_RULE,
  THUMBNAIL_BRAND_COLORS,
  THUMBNAIL_CHARACTERS_EXPRESSION_GUIDANCE,
  THUMBNAIL_CHARACTERS_UNCHANGED,
  THUMBNAIL_EXPRESSION_MODERATION,
  THUMBNAIL_LISA_EXPRESSION_GUIDANCE,
  THUMBNAIL_LOGO_UNCHANGED,
  THUMBNAIL_TOPIC_RELEVANCE,
  THUMBNAIL_VICTOR_EXPRESSION_GUIDANCE,
} from './thumbnail-brand';

export interface ThumbnailPromptInput {
  topic: string;
  episodeTitle: string;
  thumbnailText: string;
  thumbnailScene: string;
}

export function buildThumbnailImagePrompt(input: ThumbnailPromptInput): string {
  const { topic, episodeTitle, thumbnailText, thumbnailScene } = input;

  return `Edit the provided reference thumbnail template for the "Speak English With Energy" English-learning podcast.

This is a STRICT TEMPLATE EDIT. Copy the reference image's fixed branding blocks exactly. Only replace (1) the left headline text and (2) Victor + Lisa topic context.

${THUMBNAIL_BRANDING_LOCK_RULE}

═══ DO NOT MODIFY — copy pixel-perfect from reference ═══

${THUMBNAIL_LOGO_UNCHANGED}

${THUMBNAIL_BADGE_UNCHANGED}

ALSO UNCHANGED:
- Landscape 16:9 composition with safe margins — nothing touches frame edges
${THUMBNAIL_CHARACTERS_UNCHANGED}
- Desk layout: wooden table, two black condenser mics on stands, succulent, open notebook with pen
- Art style: ${THUMBNAIL_ART_STYLE}
- Brand colors: ${THUMBNAIL_BRAND_COLORS}

═══ CHANGE ONLY — left headline (keep demo typography styles) ═══

The reference image currently shows this demo title on the left (find and replace this text only):
"WHY\\nSMART\\nPEOPLE STAY\\nSTUCK?"
Demo color treatment: "WHY" white, "SMART" orange, "PEOPLE STAY" white, "STUCK?" white on navy brush-stroke banner.

Episode title: "${episodeTitle}"

Replace the demo title above with this new stacked ALL-CAPS text (spell exactly, preserve \\n line breaks):
"${thumbnailText}"

Typography MUST match the reference demo exactly:
- LEFT ~40%: stacked, left-aligned, bold heavy sans-serif
- One keyword line in large bright orange #FF7A00 (same size/weight as "SMART" in the demo)
- Other lines in white
- Final line (or emphasis line) in white on a thick dark-navy horizontal brush-stroke banner with distressed/torn edges — same shape and placement as demo "STUCK?" treatment
- Same line spacing, font weight, and relative sizes as the reference demo

═══ CHANGE ONLY — Victor + Lisa scene context (right ~60%) ═══

Episode topic: "${topic}"
Every expression, gesture, prop, and scene detail below MUST connect to this topic.

${thumbnailScene}

${THUMBNAIL_CHARACTERS_EXPRESSION_GUIDANCE}

High contrast, readable at small size, no watermarks, no extra text beyond what is specified.`;
}

export function buildThumbnailScenePrompt(
  topic: string,
  episodeTitle: string,
  thumbnailText: string,
): string {
  return `You are an art director for the YouTube channel "Speak English With Energy".

Episode title: "${episodeTitle}"
Topic: "${topic}"
Thumbnail headline: "${thumbnailText}"

The thumbnail uses a fixed template. Logo (top right) and badge (bottom left) are locked — never describe redrawing or regenerating logo icons (microphone, book) or the badge microphone. Write ONLY the Victor + Lisa scene changes for this episode. Every detail must relate to the topic above.

${THUMBNAIL_TOPIC_RELEVANCE}

Describe what to change from the default template — all choices driven by topic "${topic}":
${THUMBNAIL_EXPRESSION_MODERATION}
${THUMBNAIL_VICTOR_EXPRESSION_GUIDANCE}
${THUMBNAIL_LISA_EXPRESSION_GUIDANCE}
- Victor's expression + gesture: a specific learner moment FROM this topic
- Lisa's expression + gesture: coaches Victor through THIS topic's insight
- One topic-specific visual metaphor (prop, gesture, or small comic element — thought bubble only when confusion is the hook)
- Three book spine titles on the desk stack — short uppercase phrases directly about this episode (replace MINDSET / FOCUS / GROWTH)
- Background/shelf accents that subtly reflect this episode's topic

Do NOT describe Victor/Lisa core appearance, mugs, mics, logo, badge, headline, or desk layout — those stay fixed. Never describe redrawing or regenerating logo icons (microphone, book) or the badge microphone.

Return ONLY valid JSON:
{
  "thumbnailScene": "..."
}`;
}

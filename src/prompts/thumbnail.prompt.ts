import {
  THUMBNAIL_ART_STYLE,
  THUMBNAIL_BRAND_COLORS,
  THUMBNAIL_CHARACTERS_UNCHANGED,
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

═══ DO NOT MODIFY — copy pixel-perfect from reference ═══

TOP RIGHT — logo block (untouched):
- Microphone icon above the wordmark
- "Speak" and "ENGLISH" in dark navy #0D1B3D bold sans-serif
- Orange #FF7A00 "WITH ENERGY" banner treatment
- Open book icon below
- Same size, position, spacing, colors, and fonts as reference — zero changes

BOTTOM LEFT — badge block (untouched):
- Circular teal/green icon with white microphone
- Green rounded pill with white "ENGLISH PODCAST" in bold caps
- "FOR LEARNING ENGLISH" subtitle below in dark navy
- Same size, position, spacing, colors, and fonts as reference — zero changes

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

${thumbnailScene}

Episode topic: "${topic}"

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

The thumbnail uses a fixed template. Logo (top right) and badge (bottom left) are locked. Write ONLY the Victor + Lisa scene changes for this episode.

Describe what to change from the default template:
- Victor's expression and pose — reflect the listener's problem from the episode title
- Thought bubble — one visual metaphor tied to the episode topic (scribble, chart, clock, question mark, etc.)
- Lisa's expression and gesture — teaching, pointing, encouraging
- Three book spine titles on the desk stack — short uppercase phrases related to the episode (replace MINDSET / FOCUS / GROWTH)
- Background/shelf accents on the wall that subtly reflect the episode topic

Do NOT describe Victor/Lisa core appearance, mugs, mics, logo, badge, headline, or desk layout — those stay fixed.

Return ONLY valid JSON:
{
  "thumbnailScene": "..."
}`;
}

export interface ThumbnailPromptInput {
  topic: string;
  thumbnailText: string;
  thumbnailScene: string;
}

export function buildThumbnailImagePrompt(input: ThumbnailPromptInput): string {
  const { topic, thumbnailText, thumbnailScene } = input;

  return `Edit the provided reference thumbnail template for the "Speak English With Energy" English-learning podcast.

This is a TEMPLATE EDIT — keep the reference image layout and branding identical. Only change the headline text and topic-specific context.

KEEP UNCHANGED (match reference exactly):
- Landscape 16:9 composition with safe margins — nothing touches the frame edges
- LEFT ~40%: stacked headline area (same typography style, spacing, and colors as reference)
- RIGHT ~60%: Victor and Lisa at the podcast desk — same character designs, positions, and core props
- TOP RIGHT: "Speak ENGLISH WITH ENERGY" logo with microphone and book icons
- BOTTOM LEFT: green rounded badge with microphone icon — "ENGLISH PODCAST" and "FOR LEARNING ENGLISH"
- Victor: male, brown hair, beard, forest green sweater, black headphones, navy mug labeled "Victor"
- Lisa: female, long wavy brown hair, orange sweater, black headphones, orange mug labeled "Lisa"
- Desk: wooden table, two black condenser mics on stands, small white succulent, open notebook with pen
- Art style: modern clean digital illustration, warm beige studio, soft shading, not photorealistic
- Brand colors: Dark Navy #0D1B3D, Royal Blue #1E3A8A, Bright Orange #FF7A00, Off-white #F2F4F7

CHANGE ONLY — headline text on the left:
Replace the reference title with this new stacked headline (spell exactly):
"${thumbnailText}"
Use the same treatment as the reference: navy sans-serif lines, one keyword in large bright orange, one line in white on a thick navy horizontal brush-stroke banner.

CHANGE ONLY — topic context on the right:
${thumbnailScene}

Episode topic: "${topic}"

High contrast, readable at small size, no watermarks, no extra text beyond what is specified.`;
}

export function buildThumbnailScenePrompt(topic: string, thumbnailText: string): string {
  return `You are an art director for the YouTube channel "Speak English With Energy".

Topic: "${topic}"
Thumbnail headline: "${thumbnailText}"

The thumbnail uses a fixed template (Victor and Lisa at a podcast desk). Write ONLY the topic-specific changes — not the full scene.

Describe what to change from the default template:
- Victor's expression and pose (listener's problem: confused, stuck, worried, etc.)
- Thought bubble content — one visual metaphor tied to the topic (scribble, chart, clock, etc.)
- Lisa's expression and gesture (teaching, pointing, encouraging)
- Three book spine titles on the desk stack — short uppercase words related to the topic (replace MINDSET / FOCUS / GROWTH)
- Optional subtle background accents on the shelf/wall that reflect the topic

Do NOT describe Victor/Lisa appearance, mugs, mics, logo, badge, or desk layout — those stay fixed.

Return ONLY valid JSON:
{
  "thumbnailScene": "..."
}`;
}

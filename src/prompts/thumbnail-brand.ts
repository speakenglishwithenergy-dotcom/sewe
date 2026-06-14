export const THUMBNAIL_BRAND_COLORS =
  'Dark Navy #0D1B3D, Royal Blue #1E3A8A, Bright Orange #FF7A00, Off-white #F2F4F7';

export const THUMBNAIL_VICTOR =
  'male, brown hair, beard, forest green / olive green sweater (NOT navy, NOT black, NOT dark blue), black headphones, navy mug labeled "Victor"';

export const THUMBNAIL_LISA =
  'female, long wavy brown hair, bright orange #FF7A00 sweater, black headphones, orange mug labeled "Lisa"';

export const THUMBNAIL_CHARACTERS_UNCHANGED = `- Victor: ${THUMBNAIL_VICTOR}
- Lisa: ${THUMBNAIL_LISA}`;

/** Landscape 16:9 — top-right logo block. AI must copy from reference; never redraw icons. */
export const THUMBNAIL_LOGO_UNCHANGED = `TOP RIGHT — logo block (ABSOLUTELY UNTOUCHED — copy verbatim from reference):
- CRITICAL: Do NOT generate, redraw, reinterpret, restyle, or "fix" ANY part of this logo block
- CRITICAL: The microphone icon above the wordmark MUST be the exact same graphic from the reference — never invent, replace, or regenerate a new microphone
- "Speak" and "ENGLISH" in dark navy #0D1B3D bold sans-serif — same glyphs and layout as reference
- Orange #FF7A00 "WITH ENERGY" banner treatment — same shape and placement as reference
- Open book icon below — exact same icon from reference; do NOT redraw or regenerate
- Same size, position, spacing, colors, fonts, and icon shapes as reference — ZERO changes`;

/** Landscape 16:9 — bottom-left badge block. */
export const THUMBNAIL_BADGE_UNCHANGED = `BOTTOM LEFT — badge block (ABSOLUTELY UNTOUCHED — copy verbatim from reference):
- CRITICAL: Do NOT regenerate the circular microphone icon inside the badge — use the reference graphic exactly
- Circular teal/green icon with white microphone
- Green rounded pill with white "ENGLISH PODCAST" in bold caps
- "FOR LEARNING ENGLISH" subtitle below in dark navy
- Same size, position, spacing, colors, and fonts as reference — ZERO changes`;

/** Vertical 9:16 — compact top logo. */
export const THUMBNAIL_SHORT_LOGO_UNCHANGED = `TOP — "Speak ENGLISH WITH ENERGY" logo block (ABSOLUTELY UNTOUCHED — copy verbatim from reference):
- CRITICAL: Do NOT generate, redraw, reinterpret, or replace ANY logo icons — especially the microphone and book icons
- Microphone icon and open book icon MUST match the reference exactly; never invent new icon graphics
- Same wordmark layout, colors, spacing, and compact vertical sizing as reference — ZERO changes`;

/** Vertical 9:16 — bottom badge. */
export const THUMBNAIL_SHORT_BADGE_UNCHANGED = `BOTTOM — green rounded badge block (ABSOLUTELY UNTOUCHED — copy verbatim from reference):
- CRITICAL: Do NOT regenerate the microphone icon inside the badge — use the reference graphic exactly
- Green rounded badge with microphone icon — "ENGLISH PODCAST" and "FOR LEARNING ENGLISH"
- Same size, position, spacing, colors, and fonts as reference — ZERO changes`;

export const THUMBNAIL_BRANDING_LOCK_RULE =
  'LOGO AND BADGE ARE LOCKED ASSETS: copy them pixel-for-pixel from the reference image. Never redraw, regenerate, or reinterpret any logo icon (microphone, book) or badge icon.';

export const THUMBNAIL_ART_STYLE =
  'modern clean digital illustration, warm beige studio, soft shading, not photorealistic';

export const THUMBNAIL_CHARACTER_COLOR_REFERENCE = `CHARACTER COLORS — must match the landscape podcast thumbnail reference exactly:
- Victor sweater: forest green / olive green — NEVER navy, black, or dark blue
- Lisa sweater: bright orange #FF7A00
If the vertical template shows Victor in navy, replace it with the landscape reference green.`;

/** Every editable scene element must connect to the episode topic — no generic filler. */
export const THUMBNAIL_TOPIC_RELEVANCE = `TOPIC RELEVANCE — REQUIRED for every change you make:
- Episode topic drives ALL creative choices: Victor's expression, Lisa's expression, gestures, props, visual metaphors, book spines, and background accents
- Pick expressions that fit THIS episode's specific problem or insight — not a random reaction from a menu
- Props and desk objects must clearly symbolize the topic (e.g. clock for time, tangled cord for confusion, calendar for planning)
- Gestures and body language must act out the topic moment — not generic podcast posing
- Book spine titles must be short uppercase phrases directly about the episode theme
- Background/shelf accents should subtly echo the topic — not unrelated decor
- AVOID: random props, generic emotions, decorative objects with no link to the topic, reusing the same metaphor regardless of episode`;

/** Keep Victor/Lisa readable on thumbnails without cartoonish over-acting. */
export const THUMBNAIL_EXPRESSION_MODERATION = `EXPRESSION INTENSITY — warm and clear at thumbnail size, but natural and moderate:
- Subtle-to-medium expressiveness — like a real podcast moment, not a cartoon reaction shot
- NOT over-the-top, NOT exaggerated YouTube-face, NOT clownish or melodramatic
- AVOID: jaw-drop, screaming/open mouth, huge wild gestures, hands on head meltdown, fist pumps, dramatic arm flailing, comic shock faces`;

/** Shared art-direction for Victor — engaged but not over-acted; expression must match the topic. */
export const THUMBNAIL_VICTOR_EXPRESSION_GUIDANCE = `Victor's expression — pick ONE clear, moderate reaction that fits THIS episode's topic and hook. Victor is warm and energetic, NOT introspective or theatrical. The emotion must show a relatable learner moment FROM this topic — not a generic face.
GOOD examples (choose what fits the topic — do NOT pick at random):
- mild surprise — when the topic reveals an unexpected truth
- soft embarrassed laugh — caught in a habit the topic calls out
- light frustration — stuck on the problem the episode solves
- pleased realization — understands the topic's key insight
- skeptical — doubts a claim the episode challenges
- curious pushback — questions the topic's premise with a modest gesture
- hopeful relief — sees a way forward the topic offers
AVOID: pensive, thoughtful, contemplative, chin-on-hand, staring into distance, calm confused stare
AVOID: exaggerated shock, jaw-drop, wide screaming mouth, huge gestures, comic overwhelm
AVOID: expressions or props unrelated to the episode topic
Visual hook: one small prop or subtle gesture that symbolizes the topic — thought bubble only when confusion is truly the hook`;

/** Shared art-direction for Lisa — coaching energy without over-acting; reaction must match the topic. */
export const THUMBNAIL_LISA_EXPRESSION_GUIDANCE = `Lisa's expression — pick ONE clear, moderate coaching reaction that pairs with Victor's topic moment. Lisa is practical and insightful, NOT a static teacher always pointing. Her emotion and gesture must coach THROUGH this episode's specific insight — not a generic teaching pose.
GOOD examples (choose what fits the topic — do NOT pick at random):
- confident insight — explains the topic's key idea with gentle finger-up or open palm
- engaged lean-in — discovers the topic's point alongside Victor
- warm empathy — relates to the struggle the topic addresses
- friendly coach — reacts to Victor's topic-specific habit with a knowing small smirk
- attentive seriousness — focuses on the topic's hard truth, firm but kind
- quiet celebration — Victor grasps the topic's breakthrough
- sharing a key idea — leans in to deliver the episode's main takeaway
- demonstrating — holds a prop or mini sketch that illustrates the topic
- supportive agreement — nods at the topic's solution
- curious question — probes the topic's surprising angle
AVOID: always pointing at Victor, passive listener pose, flat polite smile, hands folded calmly
AVOID: exaggerated teaching poses, dramatic pointing, big theatrical grins, over-animated cheering
AVOID: expressions, props, or gestures unrelated to the episode topic`;

export const THUMBNAIL_CHARACTERS_EXPRESSION_GUIDANCE = `${THUMBNAIL_TOPIC_RELEVANCE}

${THUMBNAIL_EXPRESSION_MODERATION}

${THUMBNAIL_VICTOR_EXPRESSION_GUIDANCE}

${THUMBNAIL_LISA_EXPRESSION_GUIDANCE}`;

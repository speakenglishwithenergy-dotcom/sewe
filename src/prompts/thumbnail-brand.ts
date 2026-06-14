export const THUMBNAIL_BRAND_COLORS =
  'Dark Navy #0D1B3D, Royal Blue #1E3A8A, Bright Orange #FF7A00, Off-white #F2F4F7';

export const THUMBNAIL_VICTOR =
  'male, brown hair, beard, forest green / olive green sweater (NOT navy, NOT black, NOT dark blue), black headphones, navy mug labeled "Victor"';

export const THUMBNAIL_LISA =
  'female, long wavy brown hair, bright orange #FF7A00 sweater, black headphones, orange mug labeled "Lisa"';

export const THUMBNAIL_CHARACTERS_UNCHANGED = `- Victor: ${THUMBNAIL_VICTOR}
- Lisa: ${THUMBNAIL_LISA}`;

export const THUMBNAIL_ART_STYLE =
  'modern clean digital illustration, warm beige studio, soft shading, not photorealistic';

export const THUMBNAIL_CHARACTER_COLOR_REFERENCE = `CHARACTER COLORS — must match the landscape podcast thumbnail reference exactly:
- Victor sweater: forest green / olive green — NEVER navy, black, or dark blue
- Lisa sweater: bright orange #FF7A00
If the vertical template shows Victor in navy, replace it with the landscape reference green.`;

/** Shared art-direction for Victor — avoids default pensive/contemplative thumbnails. */
export const THUMBNAIL_VICTOR_EXPRESSION_GUIDANCE = `Victor's expression — pick ONE bold, exaggerated YouTube-thumbnail reaction that matches the episode hook. Victor is warm and energetic, NOT introspective.
GOOD (rotate — do NOT default to the same one every episode):
- surprised / jaw-drop at a hard truth
- embarrassed laugh — caught in a bad habit
- frustrated — hands on head or comic overwhelm
- excited eureka — big grin, fist pump, lightbulb moment
- skeptical — raised eyebrow, unconvinced smirk
- playful shock — wide eyes, hands up "wait, what?"
- relieved hope — warm big smile, thumbs up
AVOID: pensive, thoughtful, contemplative, chin-on-hand, staring into distance, calm confused stare
Visual hook: prefer a prop, gesture, or small comic metaphor (chart, clock, tangled cord) — only use a thought bubble when confusion is truly the hook`;

/** Shared art-direction for Lisa — avoids default "pointing at Victor" every episode. */
export const THUMBNAIL_LISA_EXPRESSION_GUIDANCE = `Lisa's expression — pick ONE bold, dynamic coaching reaction that pairs with Victor's moment. Lisa is practical and insightful, NOT a static teacher always pointing.
GOOD (rotate — do NOT default to the same one every episode):
- confident breakthrough — finger up "here's the key", bright eyes
- excited lean-in — discovers the insight alongside Victor
- warm empathy — hand on heart, reassuring smile
- playful coach — knowing smirk, eyebrow raised at Victor's mess
- firm but kind — arms crossed, serious "listen up" energy
- celebrating — clapping, big grin "you've got this!"
- revealing secret — leaning toward camera, whisper gesture
- demonstrating — holding a prop or mini whiteboard sketch tied to the topic
- supportive nod — open palm "exactly!", vigorous agree
- curious pushback — tilted head, surprised "wait, really?" (sparks curiosity)
AVOID: always pointing at Victor, passive listener pose, flat polite smile, hands folded calmly`;

export const THUMBNAIL_CHARACTERS_EXPRESSION_GUIDANCE = `${THUMBNAIL_VICTOR_EXPRESSION_GUIDANCE}

${THUMBNAIL_LISA_EXPRESSION_GUIDANCE}`;

import { DialogueLine } from '../types';

/** Target spoken length for the main podcast (excludes intro/outro/thumbnail clips). */
export const SCRIPT_TARGET_MIN_WORDS = 1_300;
export const SCRIPT_TARGET_MIN_LINES = 75;

export const CHANNEL_NAME = 'Speak English With Energy';

export const CHANNEL_CLOSING_TEXT = `Thanks for listening — see you next time on ${CHANNEL_NAME}!`;

export function scriptHasChannelClosing(script: DialogueLine[]): boolean {
  return script
    .slice(-3)
    .some((line) => line.text.toLowerCase().includes(CHANNEL_NAME.toLowerCase()));
}

export function appendChannelClosing(script: DialogueLine[]): DialogueLine[] {
  if (scriptHasChannelClosing(script)) {
    return script;
  }

  const lastSpeaker = script.at(-1)?.speaker ?? 'Victor';
  const speaker = lastSpeaker === 'Victor' ? 'Lisa' : 'Victor';

  return [...script, { speaker, text: CHANNEL_CLOSING_TEXT }];
}

export function countScriptWords(script: DialogueLine[]): number {
  return script.reduce(
    (sum, line) => sum + line.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
}

export function buildScriptPrompt(
  topic: string,
  test = false,
  retry?: { lines: number; words: number },
): string {
  if (test) {
    return `You are a professional podcast script writer.

Write a very short podcast script (TEST MODE) on this topic: "${topic}"

Hosts: Victor (male) and Lisa (female).

Requirements:
- Exactly 12 dialogue lines total
- English level: A2-B1
- Natural conversation, short sentences
- Include an "ipa" field for every line: General American English IPA in slashes

Return ONLY a valid JSON object:
{
  "title": "Episode title",
  "description": "Short description.",
  "thumbnailText": "WHY\\nSMART\\nPEOPLE STAY\\nSTUCK?",
  "thumbnailScene": "Victor confused with tangled scribble in thought bubble. Lisa points at him explaining. Book spines: MINDSET, FOCUS, GROWTH.",
  "script": [
    { "speaker": "Victor", "text": "...", "ipa": "/.../" },
    { "speaker": "Lisa", "text": "...", "ipa": "/.../" }
  ]
}`;
  }

  const retryNote = retry
    ? `
CRITICAL — PREVIOUS ATTEMPT REJECTED (too short: ${retry.lines} lines, ${retry.words} words):
You MUST deliver the FULL 8–10 minute episode. At least ${SCRIPT_TARGET_MIN_LINES} dialogue lines and ${SCRIPT_TARGET_MIN_WORDS.toLocaleString()} words total. Do NOT summarize, compress, or stop early.
`
    : '';

  return `You are a professional podcast script writer for the YouTube channel "Speak English With Energy".

The podcast features two hosts:
- Victor: male, warm, enthusiastic, uses real-life examples, encouraging
- Lisa: female, thoughtful, asks insightful questions, relatable, practical

Write a complete podcast script on this topic: "${topic}"
${retryNote}
REQUIREMENTS:
- English level: A2-B1 (clear vocabulary, common expressions, short sentences)
- Length: 8–10 minutes of spoken podcast audio (approximately 1,300–1,700 words total across ALL lines in the script array)
- Style: natural conversation, self-improvement focus, sounds human not AI-generated
- Only Victor and Lisa speak — no other characters, no narrator
- Open with one host greeting the audience and introducing the topic
- Close with a recap, an actionable tip, and a call to subscribe
- End with a warm sign-off that explicitly says the channel name "${CHANNEL_NAME}" (e.g. "See you next time on ${CHANNEL_NAME}!") — this MUST appear in the final 1–2 dialogue lines
- Use natural filler words: "well", "you know", "actually", "I mean", "right"
- Include short personal anecdotes and relatable everyday examples
- Keep turns short: 2–4 sentences per speaker turn (allows natural back-and-forth)
- Minimum ${SCRIPT_TARGET_MIN_LINES} dialogue lines in the script array — do NOT stop early, write ALL lines
- IMPORTANT: Count your words as you write. The script array MUST contain at least ${SCRIPT_TARGET_MIN_LINES} complete dialogue lines and ${SCRIPT_TARGET_MIN_WORDS.toLocaleString()}+ words before the episode ends
- Include an "ipa" field for every dialogue line: General American English IPA wrapped in slashes (e.g. "/həˈloʊ ˈɛvriwʌn/"), matching natural spoken pronunciation

EPISODE STRUCTURE — write every section in full (do not skip or merge sections):
1. Intro & hook (8–10 lines): greeting, topic intro, why it matters today
2. Main idea 1 (18–20 lines): core concept, Victor example, Lisa questions and pushback
3. Main idea 2 (18–20 lines): deeper insight, relatable everyday story, practical angle
4. Main idea 3 (18–20 lines): strategies, common mistakes, what to try this week
5. Closing (10–12 lines): recap, one clear actionable tip, warm subscribe CTA, final line naming "${CHANNEL_NAME}"

Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks):
{
  "title": "Episode title — catchy, YouTube-friendly, max 70 characters",
  "description": "YouTube video description with SEO keywords, 3 paragraphs, encourage subscribe",
  "thumbnailText": "Stacked headline for left side — 4 lines max, ALL CAPS, 5–8 words total, use \\n between lines. Match demo style: navy lines + one power word in largest orange + one line on navy brush stroke (e.g. WHY\\nSMART\\nPEOPLE STAY\\nSTUCK?)",
  "thumbnailScene": "Topic-specific changes only — Victor expression/thought bubble metaphor, Lisa gesture, 3 book spine titles (uppercase, topic-related). Do NOT describe desk layout, characters, or branding.",
  "script": [
    { "speaker": "Victor", "text": "...", "ipa": "/.../" },
    { "speaker": "Lisa", "text": "...", "ipa": "/.../" }
  ]
}`;
}

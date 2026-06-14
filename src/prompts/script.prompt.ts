import { DialogueLine } from '../types';

/**
 * Calibrated from Supertonic TTS at speed 0.85 (~105 spoken words/min).
 * 9–10.5 min final video ≈ 980–1,100 words of podcast dialogue.
 */
export const SCRIPT_TARGET_MIN_WORDS = 980;
export const SCRIPT_TARGET_MIN_LINES = 54;

export const CHANNEL_NAME = 'Speak English With Energy';

export const CHANNEL_CLOSING_TEXT = `Thanks for listening — see you next time on ${CHANNEL_NAME}!`;

export interface ScriptSectionDef {
  id: string;
  label: string;
  lineCount: number;
  brief: string;
}

/** Five sections → 56 dialogue lines when all quotas are met (~9.5–10 min at ~15–17 words/line). */
export const SCRIPT_SECTIONS: ScriptSectionDef[] = [
  {
    id: 'intro',
    label: 'Intro & hook',
    lineCount: 10,
    brief:
      'Warm greeting, introduce the topic, explain why it matters to English learners and self-improvement fans today.',
  },
  {
    id: 'main1',
    label: 'Main idea 1',
    lineCount: 12,
    brief:
      'Core concept of the topic. Victor tells a brief personal story — he may speak 2–3 lines in a row to finish it before Lisa reacts.',
  },
  {
    id: 'main2',
    label: 'Main idea 2',
    lineCount: 12,
    brief:
      'Second angle with a quick everyday example. Name one misconception and correct it without lingering.',
  },
  {
    id: 'main3',
    label: 'Main idea 3',
    lineCount: 12,
    brief:
      'Practical tips and one common mistake — what listeners can try this week. Stay actionable, not repetitive.',
  },
  {
    id: 'closing',
    label: 'Closing',
    lineCount: 10,
    brief:
      'Recap the three main points, one clear actionable tip, subscribe CTA, warm goodbye naming the channel.',
  },
];

const HOSTS_BLOCK = `The podcast features two hosts:
- Victor: male, warm, enthusiastic, uses real-life examples, encouraging
- Lisa: female, thoughtful, asks insightful questions, relatable, practical`;

const DIALOGUE_RULES = `- English level: A2-B1 (clear vocabulary, common expressions)
- Only Victor and Lisa speak — no narrator
- Natural spoken English — sound like two friends on a real podcast, not a scripted interview
- Each line: 1–2 short sentences (~12–18 words per line) — punchy, not one-liners
- Keep momentum: every line should move the conversation forward, not restate the same point
- Turn-taking is flexible: the same host MAY speak 2 consecutive lines when finishing a story, adding detail, or continuing a thought — do NOT force strict alternation
- When telling a story, let the storyteller finish it across consecutive lines instead of pausing mid-story for a prompt question
- Do NOT end a line with a dangling hook ("right?", "you know?") just to hand off the turn — that feels forced
- Lisa's questions should react to what was actually said, not mechanically prompt the next beat of a story Victor already started
- Avoid stiff ping-pong Q&A; mix reactions, follow-ups, and back-and-forth naturally
- Do NOT include IPA — text only`;

const DIALOGUE_FLOW_EXAMPLE = `Story flow — BAD (forced hand-off):
Victor: "Well, I remember a time in school where I spoke up in class, right?"
Lisa: "And did something happen that made you feel embarrassed?"
Victor: "Yeah, a few classmates laughed, and it really got to me."

Story flow — GOOD (storyteller continues naturally):
Victor: "Well, I remember a time in school where I spoke up in class."
Victor: "A few classmates laughed, and honestly, it really got to me."
Lisa: "Oh, that hurts — did it change how you spoke up after that?"`;

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

function formatRecentContext(lines: DialogueLine[], count = 6): string {
  if (lines.length === 0) {
    return '(Episode starts here — no prior dialogue.)';
  }

  return lines
    .slice(-count)
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');
}

export function buildMetadataPrompt(topic: string): string {
  return `You are a professional podcast script writer for the YouTube channel "${CHANNEL_NAME}".

${HOSTS_BLOCK}

Create episode metadata for a podcast on this topic: "${topic}"

Return ONLY a valid JSON object (no markdown):
{
  "title": "Episode title — catchy, YouTube-friendly, max 70 characters, main keyword near the front",
  "description": "YouTube SEO description using \\n line breaks:\\n1) Hook line ≤125 chars with main keyword\\n2) Blank line\\n3) 📌 In this episode you'll learn: + 3 bullet takeaways\\n4) Blank line\\n5) Warm 2-sentence summary\\n6) 🔔 Subscribe CTA for ${CHANNEL_NAME}",
  "thumbnailText": "Stacked headline — 4 lines max, ALL CAPS, 5–8 words total, use \\n between lines (e.g. WHY\\nSMART\\nPEOPLE STAY\\nSTUCK?)",
  "thumbnailScene": "Topic-specific changes only — Victor expression/thought bubble metaphor, Lisa gesture, 3 book spine titles (uppercase, topic-related)"
}`;
}

export function buildSectionPrompt(
  topic: string,
  section: ScriptSectionDef,
  previousLines: DialogueLine[],
  episodeTitle: string,
  shortfall?: number,
): string {
  const retryNote = shortfall
    ? `\nCRITICAL: Your last attempt had too few lines. You MUST write EXACTLY ${section.lineCount} dialogue lines this time.\n`
    : '';

  const closingNote =
    section.id === 'closing'
      ? `\nThe FINAL dialogue line MUST mention "${CHANNEL_NAME}" (e.g. "See you next time on ${CHANNEL_NAME}!").\n`
      : '';

  return `You are writing ONE section of a podcast script for "${CHANNEL_NAME}".

Episode topic: "${topic}"
Episode title: "${episodeTitle}"

${HOSTS_BLOCK}

SECTION TO WRITE: ${section.label}
${section.brief}
${retryNote}${closingNote}
${DIALOGUE_RULES}

${DIALOGUE_FLOW_EXAMPLE}

RECENT DIALOGUE (continue naturally from here — do not repeat):
${formatRecentContext(previousLines)}

REQUIREMENTS FOR THIS SECTION:
- Write EXACTLY ${section.lineCount} dialogue lines in the script array — count carefully
- Hit every point in the brief, but stay tight — no filler, no circling back to the same idea

Return ONLY a valid JSON object (no markdown):
{
  "script": [
    { "speaker": "Victor", "text": "..." },
    { "speaker": "Lisa", "text": "..." }
  ]
}`;
}

export function buildExpansionPrompt(
  topic: string,
  episodeTitle: string,
  previousLines: DialogueLine[],
  linesNeeded: number,
): string {
  return `You are continuing a podcast script for "${CHANNEL_NAME}".

Episode topic: "${topic}"
Episode title: "${episodeTitle}"

${HOSTS_BLOCK}

The episode is still too short. Add MORE dialogue before the closing.

${DIALOGUE_RULES}

${DIALOGUE_FLOW_EXAMPLE}

RECENT DIALOGUE (continue from here):
${formatRecentContext(previousLines, 8)}

Write EXACTLY ${linesNeeded} additional dialogue lines — a fresh example or sharper Q&A, not more recap.
Do NOT write a recap or closing yet.

Return ONLY a valid JSON object:
{
  "script": [
    { "speaker": "Victor", "text": "..." },
    { "speaker": "Lisa", "text": "..." }
  ]
}`;
}

export function buildScriptPrompt(topic: string, test = false): string {
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

  throw new Error('buildScriptPrompt without test=true is deprecated — use sectional generation');
}

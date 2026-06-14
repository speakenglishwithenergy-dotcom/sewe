import { CHANNEL_NAME } from './script.prompt';

export interface KeywordsPromptContext {
  topic: string;
  title: string;
  /** Key terms and phrases from the episode theme — prioritize these when they appear in a line */
  topicTerms: string[];
}

export function buildKeywordsPrompt(
  lines: { index: number; text: string }[],
  context: KeywordsPromptContext,
): string {
  const payload = lines.map((line) => ({ index: line.index, text: line.text }));
  const topicTermsBlock =
    context.topicTerms.length > 0
      ? context.topicTerms.map((term) => `- ${term}`).join('\n')
      : '- (derive from episode topic and title)';

  return `Select subtitle highlights for an English-learning podcast episode.

Episode topic: "${context.topic}"
Episode title: "${context.title}"

ALWAYS HIGHLIGHT (whenever the exact phrase appears in the line):
- "${CHANNEL_NAME}"

CORE TOPIC TERMS (highlight whenever they appear):
${topicTermsBlock}

GOAL: help A2–B1 learners follow along quickly — be GENEROUS with highlights. Learners benefit from seeing several useful words/phrases per line.

DEFAULT: aim for 2–4 highlights per line. Single-word reactions and pure greetings are the ONLY exceptions.

WHAT TO HIGHLIGHT (single words OR short phrases, verbatim in the sentence):
1. ALL topic-related words and phrases in the line
2. Idioms and natural expressions ("make sense", "look back", "rose-colored glasses", "living in the moment", "fall into the trap", "highlight reel")
3. Strong verbs, key nouns, and adjectives that carry meaning
4. Useful collocations learners should notice ("share memories", "communication skills", "gratitude journal")

WHEN TO USE FEWER OR NO HIGHLIGHTS:
- Pure greeting/sign-off ONLY ("Hey everyone!", "See you next time!", "Take care!")
- Very short empty reactions with zero content ("Exactly.", "Right.", "I see.")

Even short questions or transitions should get at least 1 highlight if they contain a topic word or useful phrase.

RULES:
- keywords must appear EXACTLY in the sentence (same words, ignoring case)
- Prefer phrases over single filler words when both appear
- Up to 4 highlights per line — use the full budget on rich sentences
- Skip speaker names ("Victor", "Lisa") — but ALWAYS include "${CHANNEL_NAME}" when it appears

Examples:
- "Well, today we're diving into why we romanticize the past."
  → ["diving into", "romanticize the past", "romanticize"]
- "That makes sense. I mean, when we share memories, it often brings us closer."
  → ["makes sense", "share memories", "memories", "closer"]
- "Hey everyone! Welcome to another episode. I'm Victor, and I'm excited today."
  → []
- "Yeah, for sure, Lisa. Many people think life was simpler back then, but that's not always true."
  → ["simpler", "back then", "always true"] or ["simpler", "life", "true"]

Input lines:
${JSON.stringify(payload, null, 2)}

Return ONLY valid JSON — one entry per input index:
{
  "lines": [
    { "index": 0, "keywords": ["romanticize the past", "diving into"] },
    { "index": 1, "keywords": [] }
  ]
}`;
}

/** Second pass: boost lines that still have too few highlights. */
export function buildKeywordsBoostPrompt(
  lines: { index: number; text: string; current: string[] }[],
  context: KeywordsPromptContext,
): string {
  const payload = lines.map((line) => ({
    index: line.index,
    text: line.text,
    current: line.current,
  }));

  return `These podcast lines need MORE subtitle highlights — the current selection is too sparse.

Episode topic: "${context.topic}"
Episode title: "${context.title}"

For each line, ADD 1–3 more keywords/phrases (keep existing ones, return the full combined list, max 4 total).
Look for: topic vocabulary, idioms, phrasal verbs, collocations, and strong content words still not highlighted.

Only keep a sparse list for pure greetings/sign-offs.

Topic terms: ${context.topicTerms.join(', ') || context.topic}

Lines:
${JSON.stringify(payload, null, 2)}

Return ONLY valid JSON:
{
  "lines": [
    { "index": 0, "keywords": ["makes sense", "memories", "closer"] }
  ]
}`;
}

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

GOAL: help A2–B1 learners follow along quickly — highlight useful PHRASES and collocations they can reuse, not isolated vocabulary crumbs.

DEFAULT: aim for 2–4 highlights per line, mostly multi-word phrases. Single-word reactions and pure greetings are the ONLY exceptions.

PHRASE-FIRST (most important):
- Prefer 2–4 word phrases over single words whenever the sentence contains them
- Idioms, phrasal verbs, collocations, and topic expressions are the best highlights
- Do NOT add a single word if it is already part of a longer highlighted phrase
  (e.g. if you highlight "romanticize the past", do NOT also add "romanticize")
- Single words are a last resort — only when no good phrase covers that idea

WHAT TO HIGHLIGHT (verbatim in the sentence):
1. Topic phrases and multi-word expressions in the line
2. Idioms and natural expressions ("make sense", "look back", "rose-colored glasses", "living in the moment", "fall into the trap", "highlight reel")
3. Useful collocations learners should notice ("share memories", "communication skills", "gratitude journal", "affects us all", "fascinating topic")
4. Single strong content words ONLY when no phrase in the line captures them

WHEN TO USE FEWER OR NO HIGHLIGHTS:
- Pure greeting/sign-off ONLY ("Hey everyone!", "See you next time!", "Take care!")
- Very short empty reactions with zero content ("Exactly.", "Right.", "I see.")

Even short questions or transitions should get at least 1 phrase highlight if they contain a useful expression.

RULES:
- keywords must appear EXACTLY in the sentence (same words, ignoring case)
- At least half the highlights on a line should be phrases (2+ words) when the sentence allows it
- Up to 4 highlights per line — spend the budget on phrases, not redundant single words
- Skip speaker names ("Victor", "Lisa") — but ALWAYS include "${CHANNEL_NAME}" when it appears

Examples:
- "Well, today we're diving into why we romanticize the past."
  → ["diving into", "romanticize the past"]
- "That makes sense. I mean, when we share memories, it often brings us closer."
  → ["makes sense", "share memories", "brings us closer"]
- "Hey everyone! Welcome to another episode. I'm Victor, and I'm excited today."
  → []
- "Yeah, for sure, Lisa. Many people think life was simpler back then, but that's not always true."
  → ["for sure", "back then", "always true"]
- "We're so excited to talk about a fascinating topic today, one that affects us all."
  → ["excited to talk", "fascinating topic", "affects us all"]

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

For each line, ADD 1–3 more PHRASES (keep existing ones, return the full combined list, max 4 total).
Look for: multi-word topic expressions, idioms, phrasal verbs, and collocations still not highlighted.
Prefer adding phrases over single words. Remove redundant single words that are already covered by a longer phrase.

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

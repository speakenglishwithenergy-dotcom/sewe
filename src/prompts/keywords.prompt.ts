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

MOST IMPORTANT RULE — SEMANTIC COHERENCE:
If a learner reads ONLY the highlighted words/phrases (in the order they appear in the sentence), the core meaning of the line must stay the same as the full sentence.
- Before adding any highlight, ask: "Does this set still tell the same story?"
- Prefer fewer, meaning-carrying phrases over more fragments that look useful but change or obscure the message
- Do NOT add isolated words or collocations just to reach a quota if they do not help preserve meaning
- Bad: "We've all felt that way sometimes." → ["felt", "way", "sometimes"] (meaning lost)
- Good: "Overthinking can stop us from speaking up." → ["Overthinking", "speaking up"] (meaning preserved)
- Good: "Right! But most people are busy with their own lives." → ["most people", "busy with their own lives"]

ALWAYS HIGHLIGHT (whenever the exact phrase appears in the line):
- "${CHANNEL_NAME}"

CORE TOPIC TERMS (highlight whenever they appear):
${topicTermsBlock}

GOAL: help A2–B1 learners follow along quickly — highlight useful PHRASES and collocations they can reuse, not isolated vocabulary crumbs.

DEFAULT: up to 4 highlights per line when they collectively preserve meaning — mostly multi-word phrases. Use fewer (even 1–2) when that is all that passes the semantic coherence test. Single-word reactions and pure greetings are the ONLY exceptions for zero highlights.

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
- Every highlight set MUST pass the semantic coherence test above — this overrides all other rules
- Prefer phrases (2+ words) when they carry meaning; avoid single-word crumbs unless they are essential to the line's message
- Up to 4 highlights per line — spend the budget on meaning-carrying phrases, not redundant single words
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

MOST IMPORTANT RULE — SEMANTIC COHERENCE:
If a learner reads ONLY the highlighted words/phrases, the core meaning must stay the same as the full sentence.
Only add highlights that help preserve meaning — never add fragments just to fill slots.

For each line, ADD 1–3 more PHRASES only when they improve meaning coverage (keep existing ones, return the full combined list, max 4 total).
Look for: multi-word topic expressions, idioms, phrasal verbs, and collocations still not highlighted.
Prefer adding phrases over single words. Remove redundant single words that are already covered by a longer phrase.
If the current set already passes the semantic coherence test, return it unchanged even if it has fewer than 4 highlights.

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

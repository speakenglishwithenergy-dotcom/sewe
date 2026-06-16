import { ChannelContext } from '../channel/channel.types';

export interface KeywordsPromptContext {
  topic: string;
  title: string;
  topicTerms: string[];
}

export function buildKeywordsPrompt(
  ctx: ChannelContext,
  lines: { index: number; text: string }[],
  context: KeywordsPromptContext,
): string {
  const channelName = ctx.config.name;
  const hostNames = ctx.speakers.join('", "');
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

ALWAYS HIGHLIGHT (whenever the exact phrase appears in the line):
- "${channelName}"

CORE TOPIC TERMS (highlight whenever they appear):
${topicTermsBlock}

GOAL: help ${ctx.config.script.languageLevel} learners follow along quickly — highlight useful PHRASES and collocations they can reuse.

DEFAULT: up to 4 highlights per line when they collectively preserve meaning — mostly multi-word phrases.

RULES:
- keywords must appear EXACTLY in the sentence (same words, ignoring case)
- Skip speaker names ("${hostNames}") — but ALWAYS include "${channelName}" when it appears

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

export function buildKeywordsBoostPrompt(
  ctx: ChannelContext,
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

For each line, ADD 1–3 more PHRASES only when they improve meaning coverage (keep existing ones, return the full combined list, max 4 total).

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

export function getAlwaysHighlightPhrases(ctx: ChannelContext): string[] {
  return [ctx.config.name];
}

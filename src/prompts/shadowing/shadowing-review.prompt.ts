export function buildShadowingReviewPrompt(
  draft: string,
  speaker: string,
  titleOverride?: string,
): string {
  const titleHint = titleOverride
    ? `\nPreferred title (use unless the draft suggests a clearly better one): "${titleOverride}"`
    : '';

  return `You are an expert English content editor for YouTube shadowing practice.

SOURCE DRAFT (raw notes, outline, or script — may include markdown, timestamps, visual cues, or non-English sections):
---
${draft.trim()}
---
${titleHint}

Task:
1. Read and understand the draft — extract the core message, story, and intent. Ignore production notes, timestamps, visuals, and non-English sections unless they clarify meaning.
2. Rewrite into a polished monologue for speaker "${speaker}" — same topic and key ideas, but sharper, more engaging, and more shareable.
3. In a separate suggestions section, propose concrete edits the author might still want (add / edit / remove).

WRITING RULES for the script:
- Sound like a real person talking to camera — conversational, confident, human
- Strong hooks, clear rhythm, short punchy sentences where they land
- Keep it authentic; no corporate buzzwords, no generic AI phrases ("in today's fast-paced world", "let's dive in", "game-changer", "without further ado", etc.)
- Preserve the speaker's voice and story — improve clarity and impact, don't replace their personality
- Write as flowing paragraphs (the pipeline will split into TTS lines later)

Return ONLY valid Markdown with EXACTLY this structure (no extra top-level sections):

# <catchy episode title>

> <one-sentence description>

## Script

<rewritten monologue as paragraphs — this is what the author will edit>

## AI Suggestions

### Add
- <optional bullet; use "-" alone if nothing to add>

### Edit
- <optional bullet; use "-" alone if nothing to edit>

### Remove
- <optional bullet; use "-" alone if nothing to remove>`;
}

export const SHADOWING_REVIEW_SYSTEM_PROMPT =
  'You are a skilled English script editor for shadowing practice. Rewrite drafts into natural, engaging spoken monologues. Respond only with the requested Markdown structure.';

export function buildShadowingScriptPrompt(draft: string, speaker: string): string {
  return `You are an expert English content editor for YouTube shadowing practice.

SOURCE DRAFT (raw notes, outline, or script — may include markdown, timestamps, visual cues, or non-English sections):
---
${draft.trim()}
---

Task:
1. Read and understand the draft — extract the core message, story, and intent. Ignore production notes, timestamps, visuals, and non-English sections unless they clarify meaning.
2. Rewrite into a polished monologue for speaker "${speaker}" — same topic and key ideas, but sharper, more engaging, and more shareable.
3. Split into speakable lines for TTS (roughly 1–2 sentences per line, ~14–20 words when possible). Split only at natural sentence boundaries.

WRITING RULES:
- Sound like a real person talking to camera — conversational, confident, human
- Strong hooks, clear rhythm, short punchy sentences where they land
- Keep it authentic; no corporate buzzwords, no generic AI phrases ("in today's fast-paced world", "let's dive in", "game-changer", "without further ado", etc.)
- Preserve the speaker's voice and story — improve clarity and impact, don't replace their personality
- Only ${speaker} speaks — set "speaker": "${speaker}" on every line

IPA RULES:
- Include an "ipa" field on EVERY line
- General American English pronunciation
- Wrap in forward slashes, e.g. /həˈloʊ ˈɛvriwʌn/
- Match spoken form: contractions, reduced vowels, natural connected speech

PAUSE RULES (continuesStory — controls silence between TTS lines):
- Every line MUST include "continuesStory" (boolean)
- continuesStory: true — this line continues the SAME story, anecdote, or thought from the previous line (still mid-flow, not a new beat)
- continuesStory: false — new beat: hook, intro, section transition, rhetorical pause, new topic, or a complete thought that deserves a breath before the next idea
- First line of the script: always continuesStory: false

Return ONLY a valid JSON object (no markdown):
{
  "title": "<catchy title for the rewritten script>",
  "description": "<one-sentence description for the episode>",
  "script": [
    { "speaker": "${speaker}", "text": "...", "ipa": "/.../", "continuesStory": false },
    { "speaker": "${speaker}", "text": "...", "ipa": "/.../", "continuesStory": true }
  ]
}`;
}

export const SHADOWING_SCRIPT_SYSTEM_PROMPT =
  'You are a skilled English script editor for shadowing practice. Rewrite drafts into natural, engaging spoken monologues. Respond only with valid JSON matching the requested structure exactly.';

export function buildKeywordsPrompt(lines: { index: number; text: string }[]): string {
  const payload = lines.map((line) => ({ index: line.index, text: line.text }));

  return `Pick the most important English words or short phrases to highlight in each sentence below.

These highlights help A2–B1 learners notice key vocabulary and core ideas while reading subtitles.

Rules:
- Return 1–3 keywords per line (prefer fewer when the sentence is short)
- Choose words that appear EXACTLY in the sentence (same spelling, ignoring case)
- Prefer topic vocabulary, strong verbs, and meaningful nouns/adjectives
- Skip filler words, pronouns, and generic words ("the", "really", "today", "everyone")
- Multi-word phrases are allowed only when they appear verbatim (e.g. "romanticize the past")
- Do NOT include speaker names unless they are the learning focus

Input lines:
${JSON.stringify(payload, null, 2)}

Return ONLY a valid JSON object:
{
  "lines": [
    { "index": 0, "keywords": ["romanticize", "past"] }
  ]
}`;
}

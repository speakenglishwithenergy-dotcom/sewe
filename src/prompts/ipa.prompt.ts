export function buildIpaPrompt(lines: { index: number; text: string }[]): string {
  const payload = lines.map((line) => ({ index: line.index, text: line.text }));

  return `Transcribe each English sentence below into IPA (International Phonetic Alphabet).

Rules:
- Use General American English pronunciation
- Wrap each transcription in forward slashes, e.g. /həˈloʊ ˈɛvriwʌn/
- Match the spoken form (contractions, reduced vowels, natural connected speech)
- Do NOT include speaker names or extra commentary
- Return one IPA string per input line, in the same order

Input lines:
${JSON.stringify(payload, null, 2)}

Return ONLY a valid JSON object:
{
  "lines": [
    { "index": 0, "ipa": "/.../" }
  ]
}`;
}

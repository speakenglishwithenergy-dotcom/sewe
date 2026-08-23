/** Normalize title/topic text for TTS (e.g. "A & B" → "A and B"). */
export function formatTopicForSpeech(text: string): string {
  return text.replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim();
}

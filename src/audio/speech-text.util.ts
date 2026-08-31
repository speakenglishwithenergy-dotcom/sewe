function titleCaseWord(word: string): string {
  if (!word) return word;
  return word
    .split('-')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
    .join('-');
}

/** Normalize title/topic text for TTS (symbols → words, title case for natural speech). */
export function formatTopicForSpeech(text: string): string {
  return text
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s*\/\s*/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(titleCaseWord)
    .join(' ');
}

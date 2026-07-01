import { splitIntoSentences } from './shadowing-split.util';

function endsSentence(text: string): boolean {
  return /[.!?]["']?\s*$/.test(text.trim());
}

/**
 * Split file content into sentences without dropping or rewriting text.
 * Wrapped lines are joined with a space; only sentence boundaries create new lines.
 */
export function sentencesFromTextFile(content: string): string[] {
  const sentences: string[] = [];
  let buffer = '';

  const emitBuffer = (): void => {
    if (!buffer.trim()) {
      buffer = '';
      return;
    }
    sentences.push(...splitIntoSentences(buffer));
    buffer = '';
  };

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      emitBuffer();
      continue;
    }

    buffer = buffer ? `${buffer} ${trimmed}` : trimmed;

    if (endsSentence(buffer)) {
      emitBuffer();
    }
  }

  emitBuffer();
  return sentences.filter(Boolean);
}

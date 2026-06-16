import { DialogueLine } from '../types';

/** Extract lowercase word tokens in order (punctuation-insensitive). */
export function extractWords(text: string): string[] {
  return text.toLowerCase().match(/[\w']+/g) ?? [];
}

export function scriptWords(lines: DialogueLine[]): string[] {
  return extractWords(lines.map((line) => line.text).join(' '));
}

export class ScriptFidelityError extends Error {
  constructor(
    message: string,
    readonly draftWordCount: number,
    readonly scriptWordCount: number,
  ) {
    super(message);
    this.name = 'ScriptFidelityError';
  }
}

/** Ensure script uses the same words as the draft, in the same order. */
export function assertScriptFidelity(draft: string, lines: DialogueLine[]): void {
  const draftWords = extractWords(draft);
  const outputWords = scriptWords(lines);

  if (draftWords.length === 0) {
    throw new ScriptFidelityError('Draft has no words', 0, outputWords.length);
  }

  if (draftWords.join('\0') !== outputWords.join('\0')) {
    throw new ScriptFidelityError(
      `Script text differs from draft (${draftWords.length} draft words vs ${outputWords.length} script words)`,
      draftWords.length,
      outputWords.length,
    );
  }
}

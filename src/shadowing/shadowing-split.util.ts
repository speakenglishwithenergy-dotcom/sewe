import { DialogueLine } from '../types';
import { DEFAULT_MAX_WORDS_PER_LINE } from './shadowing.constants';
import { inferContinuesStory } from './shadowing-continues.util';

export function splitIntoSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return sentences.length > 0 ? sentences : [trimmed];
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Split draft into Victor dialogue lines without changing any words. */
export function splitDraftIntoLines(
  draft: string,
  speaker: string,
  maxWordsPerLine = DEFAULT_MAX_WORDS_PER_LINE,
): DialogueLine[] {
  const sentences = splitIntoSentences(draft);
  if (sentences.length === 0) {
    throw new Error('Draft is empty');
  }

  const lines: DialogueLine[] = [];
  let buffer = '';
  let previousLineText: string | null = null;

  const pushLine = (text: string): void => {
    lines.push({
      speaker,
      text,
      continuesStory: inferContinuesStory(previousLineText),
    });
    previousLineText = text;
  };

  for (const sentence of sentences) {
    const combinedWords = buffer ? wordCount(`${buffer} ${sentence}`) : wordCount(sentence);

    if (!buffer || combinedWords <= maxWordsPerLine) {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
      continue;
    }

    pushLine(buffer);
    buffer = sentence;
  }

  if (buffer) {
    pushLine(buffer);
  }

  return lines;
}

export function titleFromDraft(draft: string, maxLength = 70): string {
  const firstSentence = splitIntoSentences(draft)[0] ?? draft.trim();
  if (firstSentence.length <= maxLength) {
    return firstSentence;
  }

  const truncated = firstSentence.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated).trim();
}

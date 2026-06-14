import {
  SUBTITLE_IPA_COLOUR,
  SUBTITLE_KEYWORD_COLOUR,
  formatKeywordHighlight,
} from './subtitle-style';
import { buildKeywordRegex } from '../ai/keywords.util';

interface TextRange {
  start: number;
  end: number;
}

function rangesOverlap(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Wrap matching keywords with ASS inline colour/bold overrides.
 * Longer phrases are matched first; overlapping shorter matches are skipped.
 */
export function highlightKeywordsInText(
  text: string,
  keywords: string[] | undefined,
  colour = SUBTITLE_KEYWORD_COLOUR,
): string {
  if (!keywords?.length) {
    return text;
  }

  const ranges: TextRange[] = [];
  const sorted = [...keywords].sort((a, b) => b.length - a.length);

  for (const keyword of sorted) {
    const trimmed = keyword.trim();
    if (!trimmed) {
      continue;
    }

    const regex = buildKeywordRegex(trimmed);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const candidate = { start: match.index, end: match.index + match[0].length };
      if (!ranges.some((range) => rangesOverlap(range, candidate))) {
        ranges.push(candidate);
      }
    }
  }

  if (ranges.length === 0) {
    return text;
  }

  ranges.sort((a, b) => b.start - a.start);

  let result = text;
  for (const { start, end } of ranges) {
    const word = result.slice(start, end);
    result =
      result.slice(0, start) +
      formatKeywordHighlight(word, colour) +
      result.slice(end);
  }

  return result;
}

/** Highlight keywords on each wrapped subtitle line separately. */
export function highlightWrappedSubtitleText(
  wrappedText: string,
  keywords: string[] | undefined,
  colour = SUBTITLE_KEYWORD_COLOUR,
): string {
  return wrappedText
    .split('\n')
    .map((line) => highlightKeywordsInText(line, keywords, colour))
    .join('\n');
}

/** Cyan keyword highlights read better on the orange Hook subtitle box. */
export const SHORT_HOOK_KEYWORD_COLOUR = SUBTITLE_IPA_COLOUR;

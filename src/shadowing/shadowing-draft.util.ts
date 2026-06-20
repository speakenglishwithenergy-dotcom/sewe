import { inferContinuesStory } from './shadowing-continues.util';

const AUDIO_MARKER = /^\s*\*\*Audio:?\*\*\s*$/i;
const VISUAL_MARKER = /^\s*\*\*Visual:?\*\*\s*$/i;
const SECTION_BREAK = /^---\s*$/;
const PART_HEADER = /^##\s+/;
const BLOCKQUOTE = /^\s*>\s*(.*)$/;

export interface ParsedAudioLine {
  text: string;
  continuesStory: boolean;
}

export interface ParsedShadowingDraft {
  title?: string;
  description?: string;
  /** Spoken lines extracted from **Audio:** blocks; empty if draft is plain text. */
  audioLines: ParsedAudioLine[];
}

/** Parse a shadowing draft — title, description, and Audio blockquote lines when present. */
export function parseShadowingDraft(markdown: string): ParsedShadowingDraft {
  const trimmed = markdown.trim();
  if (!trimmed) {
    throw new Error('Draft is empty');
  }

  const lines = trimmed.split('\n');
  let title: string | undefined;
  let description: string | undefined;

  for (const line of lines) {
    if (!title && line.startsWith('# ') && !line.startsWith('## ')) {
      title = line.slice(2).trim();
      continue;
    }
    if (!description && line.startsWith('> ')) {
      description = line.slice(2).trim();
      continue;
    }
    if (line.startsWith('## ') || AUDIO_MARKER.test(line.trim())) {
      break;
    }
  }

  const audioLines = extractAudioLinesFromDraft(trimmed);

  return { title, description, audioLines };
}

function extractAudioLinesFromDraft(markdown: string): ParsedAudioLine[] {
  if (!/\*\*Audio:?\*\*/i.test(markdown)) {
    return [];
  }

  const audioLines: ParsedAudioLine[] = [];
  let mode: 'none' | 'audio' | 'visual' = 'none';
  let previousLineText: string | null = null;
  let blankBlockquoteLines = 0;

  const resetStoryContext = (): void => {
    previousLineText = null;
    blankBlockquoteLines = 0;
  };

  for (const rawLine of markdown.split('\n')) {
    const trimmedLine = rawLine.trim();

    if (SECTION_BREAK.test(trimmedLine) || PART_HEADER.test(rawLine)) {
      resetStoryContext();
      if (mode === 'audio') {
        mode = 'none';
      }
      continue;
    }

    if (AUDIO_MARKER.test(trimmedLine)) {
      mode = 'audio';
      continue;
    }
    if (VISUAL_MARKER.test(trimmedLine)) {
      mode = 'visual';
      continue;
    }
    if (mode !== 'audio') {
      continue;
    }

    const match = rawLine.match(BLOCKQUOTE);
    if (!match) {
      continue;
    }

    const text = match[1].trim();
    if (!text) {
      blankBlockquoteLines++;
      continue;
    }

    const continuesStory = inferContinuesStory(previousLineText, blankBlockquoteLines);
    audioLines.push({ text, continuesStory });
    previousLineText = text;
    blankBlockquoteLines = 0;
  }

  return audioLines;
}

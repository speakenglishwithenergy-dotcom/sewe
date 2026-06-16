export interface ParsedShadowingReview {
  title?: string;
  description?: string;
  script: string;
}

const SUGGESTIONS_HEADERS = ['## ai suggestions', '## gợi ý', '## suggestions'];
const SCRIPT_HEADER = '## script';

/** Extract editable script body from a review markdown file. */
export function parseShadowingReview(markdown: string): ParsedShadowingReview {
  const trimmed = markdown.trim();
  if (!trimmed) {
    throw new Error('Review file is empty');
  }

  const lines = trimmed.split('\n');
  let title: string | undefined;
  let description: string | undefined;

  if (lines[0]?.startsWith('# ')) {
    title = lines[0].slice(2).trim();
  }

  const descriptionLine = lines.find((line) => line.startsWith('> '));
  if (descriptionLine) {
    description = descriptionLine.slice(2).trim();
  }

  const lower = trimmed.toLowerCase();
  const suggestionsIndex = findEarliestSectionIndex(lower, SUGGESTIONS_HEADERS);
  const scriptSectionStart = lower.indexOf(SCRIPT_HEADER);

  let script: string;
  if (scriptSectionStart >= 0) {
    const bodyStart = trimmed.indexOf('\n', scriptSectionStart);
    const rawBody =
      bodyStart >= 0 ? trimmed.slice(bodyStart + 1, suggestionsIndex) : '';
    script = rawBody.trim();
  } else {
    const bodyEnd = suggestionsIndex >= 0 ? suggestionsIndex : trimmed.length;
    const body = trimmed.slice(0, bodyEnd).trim();
    script = body
      .replace(/^#\s+.+\n?/m, '')
      .replace(/^>\s+.+\n?/m, '')
      .trim();
  }

  if (!script) {
    throw new Error(
      'Review file has no script content — edit the "## Script" section before continuing',
    );
  }

  return { title, description, script };
}

function findEarliestSectionIndex(text: string, headers: string[]): number {
  let earliest = -1;
  for (const header of headers) {
    const index = text.indexOf(`\n${header}`);
    if (index >= 0 && (earliest < 0 || index < earliest)) {
      earliest = index;
    }
  }
  return earliest;
}

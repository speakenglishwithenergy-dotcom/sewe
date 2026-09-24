import sharp from 'sharp';
import {
  SHORT_THUMB_HEIGHT,
  SHORT_THUMB_WIDTH,
  YOUTUBE_THUMB_HEIGHT,
  YOUTUBE_THUMB_WIDTH,
} from './thumbnail-image.util';

const NAVY = '#0D1B3D';
const ORANGE = '#FF7A00';
const CREAM = '#F2F4F7';

const PUNCH_SCALE = 1.06;
/** Conservative width for Arial Black ALL-CAPS. */
const CHAR_WIDTH = 0.8;

export type HeadlineOverlayKind = 'podcast' | 'short';

/**
 * Composite stacked CTR headline onto the left (podcast) or upper (short) area.
 * Image models are unreliable for text — we always paint the title ourselves.
 */
export async function compositeThumbnailHeadline(
  imageBuffer: Buffer,
  headline: string,
  kind: HeadlineOverlayKind = 'podcast',
): Promise<Buffer> {
  const lines = normalizeHeadlineLines(headline);
  if (lines.length === 0) return imageBuffer;

  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? (kind === 'short' ? SHORT_THUMB_WIDTH : YOUTUBE_THUMB_WIDTH);
  const height = meta.height ?? (kind === 'short' ? SHORT_THUMB_HEIGHT : YOUTUBE_THUMB_HEIGHT);

  const svg =
    kind === 'short'
      ? buildShortHeadlineSvg(width, height, lines)
      : buildPodcastHeadlineSvg(width, height, lines);

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

function normalizeHeadlineLines(headline: string): string[] {
  return headline
    .replace(/\\n/g, '\n')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);
}

/** Prefer quoted / forbidden-phrase lines as the orange punch. */
export function isPunchLine(line: string, index: number, lines: string[]): boolean {
  if (/["“”']/.test(line)) return true;
  if (/^(STOP|NEVER|DON'T|DONT|WHY|AVOID|QUIT|KILL|FAIL)$/i.test(line.trim())) {
    return false;
  }
  if (lines.length >= 3 && !lines.some((l) => /["“”']/.test(l))) {
    const lengths = lines.map((l) => l.length);
    const max = Math.max(...lengths);
    if (line.length === max && index > 0 && index < lines.length - 1) return true;
  }
  return false;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function estimateWidth(line: string, fontSize: number): number {
  return line.length * fontSize * CHAR_WIDTH;
}

function fitFontSize(
  lines: string[],
  maxWidth: number,
  maxHeight: number,
  preferred: number,
  minimum: number,
): number {
  let size = preferred;
  while (size > minimum) {
    let widest = 0;
    for (let i = 0; i < lines.length; i++) {
      const scale = isPunchLine(lines[i], i, lines) ? PUNCH_SCALE : 1;
      widest = Math.max(widest, estimateWidth(lines[i], size * scale));
    }
    const textH = lines.length * size * 1.25;
    if (widest <= maxWidth && textH <= maxHeight) return size;
    size -= 2;
  }
  return minimum;
}

function lineFontSize(base: number, punch: boolean, line: string, maxWidth: number): number {
  let size = punch ? Math.round(base * PUNCH_SCALE) : base;
  while (size > 28 && estimateWidth(line, size) > maxWidth) {
    size -= 1;
  }
  return size;
}

function buildPodcastHeadlineSvg(width: number, height: number, lines: string[]): string {
  const panelX = Math.round(width * 0.03);
  const panelY = Math.round(height * 0.1);
  const panelW = Math.round(width * 0.4);
  const panelH = Math.round(height * 0.6);
  const padX = 20;
  const maxTextW = panelW - padX * 2;

  const base = fitFontSize(lines, maxTextW, panelH - 36, 88, 36);
  const sizes = lines.map((line, i) =>
    lineFontSize(base, isPunchLine(line, i, lines), line, maxTextW),
  );
  const lineHeight = Math.round(Math.max(...sizes) * 1.2);
  const totalTextH = lineHeight * lines.length;
  const startY = panelY + Math.round((panelH - totalTextH) / 2) + Math.round(base * 0.8);
  const textX = panelX + padX;

  const nodes: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const punch = isPunchLine(line, i, lines);
    const size = sizes[i];
    const y = startY + i * lineHeight;
    // Always clamp to panel — compress glyphs if estimate was still short
    const textLen = maxTextW;
    nodes.push(
      `<text x="${textX}" y="${y}" fill="${punch ? ORANGE : CREAM}" font-size="${size}" font-family="Arial Black, Impact, Arial, sans-serif" font-weight="900" letter-spacing="-2" textLength="${textLen}" lengthAdjust="spacingAndGlyphs">${escapeXml(line)}</text>`,
    );
    if (punch) {
      nodes.push(
        `<rect x="${textX}" y="${y + Math.round(size * 0.08)}" width="${Math.round(maxTextW * 0.98)}" height="${Math.max(4, Math.round(size * 0.07))}" rx="2" fill="${ORANGE}"/>`,
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="24" ry="24" fill="${NAVY}" fill-opacity="0.94"/>
  ${nodes.join('\n  ')}
</svg>`;
}

function buildShortHeadlineSvg(width: number, height: number, lines: string[]): string {
  const panelX = Math.round(width * 0.05);
  const panelY = Math.round(height * 0.16);
  const panelW = Math.round(width * 0.9);
  const panelH = Math.round(height * 0.3);
  const padX = 18;
  const maxTextW = panelW - padX * 2;

  const base = fitFontSize(lines, maxTextW, panelH - 28, 76, 32);
  const sizes = lines.map((line, i) =>
    lineFontSize(base, isPunchLine(line, i, lines), line, maxTextW),
  );
  const lineHeight = Math.round(Math.max(...sizes) * 1.18);
  const totalTextH = lineHeight * lines.length;
  const startY = panelY + Math.round((panelH - totalTextH) / 2) + Math.round(base * 0.8);

  const nodes: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const punch = isPunchLine(line, i, lines);
    const size = sizes[i];
    const y = startY + i * lineHeight;
    const textLen = Math.min(maxTextW, Math.round(estimateWidth(line, size)));
    nodes.push(
      `<text x="${width / 2}" y="${y}" text-anchor="middle" fill="${punch ? ORANGE : CREAM}" font-size="${size}" font-family="Arial Black, Impact, Arial, sans-serif" font-weight="900" letter-spacing="-1" textLength="${textLen}" lengthAdjust="spacingAndGlyphs">${escapeXml(line)}</text>`,
    );
    if (punch) {
      nodes.push(
        `<rect x="${(width - textLen) / 2}" y="${y + Math.round(size * 0.08)}" width="${textLen}" height="${Math.max(4, Math.round(size * 0.07))}" rx="2" fill="${ORANGE}"/>`,
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="20" ry="20" fill="${NAVY}" fill-opacity="0.94"/>
  ${nodes.join('\n  ')}
</svg>`;
}

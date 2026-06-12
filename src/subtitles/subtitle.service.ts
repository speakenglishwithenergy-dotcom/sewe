import fs from 'fs/promises';
import { AudioSegment } from '../types';
import { logger } from '../utils/logger';

export class SubtitleService {
  /**
   * Generate an SRT subtitle file from the timed audio segments.
   * Each segment becomes one subtitle entry.
   * Long lines are word-wrapped at 80 characters for readability.
   */
  async generate(segments: AudioSegment[], outputPath: string): Promise<void> {
    logger.info('Generating SRT subtitle file...');

    const entries = segments.map((segment, i) => {
      const start = formatSRTTime(segment.startTime);
      const end = formatSRTTime(segment.startTime + segment.duration);
      const text = wrapText(`${segment.speaker}: ${segment.text}`, 80);
      return `${i + 1}\n${start} --> ${end}\n${text}`;
    });

    const srtContent = entries.join('\n\n') + '\n';
    await fs.writeFile(outputPath, srtContent, 'utf-8');

    logger.success(`Subtitles saved → ${outputPath}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a time value (seconds, with ms precision) to SRT timestamp format.
 * Example: 3661.123  →  "01:01:01,123"
 */
function formatSRTTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const ms = Math.round((safeSeconds % 1) * 1000);

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(secs).padStart(2, '0'),
  ].join(':') + ',' + String(ms).padStart(3, '0');
}

/**
 * Word-wrap text to a maximum character width per line.
 */
function wrapText(text: string, maxWidth: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxWidth) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines.join('\n');
}

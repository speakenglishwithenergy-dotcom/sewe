import { SCRIPT_SECTIONS } from '../prompts/script.prompt';
import { AudioSegment, YouTubeChapter } from '../types';

function formatChapterTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/**
 * Replace AI-estimated chapter times with actual audio timestamps
 * based on script section line boundaries.
 */
export function refineChapterTimes(
  chapters: YouTubeChapter[],
  segments: AudioSegment[],
): YouTubeChapter[] {
  if (segments.length === 0 || chapters.length === 0) {
    return chapters;
  }

  const sectionLabels = SCRIPT_SECTIONS.map((s) => s.label);
  let lineIndex = 0;

  return SCRIPT_SECTIONS.map((section, i) => {
    const segment = segments[Math.min(lineIndex, segments.length - 1)];
    const label = chapters[i]?.label ?? sectionLabels[i] ?? section.label;
    lineIndex += section.lineCount;
    return {
      time: formatChapterTime(segment.startTime),
      label,
    };
  });
}

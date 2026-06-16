import { ChannelContext } from '../channel/channel.types';
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
  ctx: ChannelContext,
  chapters: YouTubeChapter[],
  segments: AudioSegment[],
): YouTubeChapter[] {
  const sections = ctx.config.script.sections;
  if (segments.length === 0 || chapters.length === 0) {
    return chapters;
  }

  let lineIndex = 0;

  return sections.map((section, i) => {
    const segment = segments[Math.min(lineIndex, segments.length - 1)];
    const label = chapters[i]?.label ?? ctx.publish.chapterLabels[i] ?? section.label;
    lineIndex += section.lineCount;
    return {
      time: formatChapterTime(segment.startTime),
      label,
    };
  });
}

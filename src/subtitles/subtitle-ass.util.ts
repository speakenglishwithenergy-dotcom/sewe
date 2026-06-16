import { SHORT_THUMB_HEIGHT, SHORT_THUMB_WIDTH } from '../ai/thumbnail-image.util';
import { ResolvedSubtitleStyle } from './subtitle-config.util';
import {
  buildPodcastAssStyleLine,
  SUBTITLE_PRIMARY_COLOUR,
} from './subtitle-style';

const ASS_STYLE_FORMAT =
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

/** Bottom-center placement shared by hook and default short captions. */
const SHORT_SUBTITLE_ALIGNMENT = 2;
const SHORT_SUBTITLE_MARGIN_V = 400;
const SHORT_SUBTITLE_MARGIN_LR = 30;

const SHORT_DEFAULT_FONT_SIZE = 80;
const SHORT_HOOK_FONT_SIZE = 100;

/** Internal padding between text and the background box border (BorderStyle 3 & 4). */
const SHORT_DEFAULT_BOX_PADDING = 18;
const SHORT_HOOK_BOX_PADDING = 22;

export interface AssDialogueLine {
  startSeconds: number;
  endSeconds: number;
  style: 'Hook' | 'Default';
  text: string;
}

export interface PodcastAssDialogueLine {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

/** Convert seconds to ASS timestamp (H:MM:SS.cc). */
export function formatAssTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const centiseconds = Math.min(99, Math.round((safeSeconds % 1) * 100));

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

/** ASS inline override blocks (e.g. `{\\c&H00E1A62B&}`) must not be escaped. */
const ASS_OVERRIDE_BLOCK = /(\{\\[^}]*\})/g;

/** Escape ASS dialogue text and convert newlines to \\N. Preserves `{\\...}` override blocks. */
export function escapeAssDialogueText(text: string): string {
  return text.split(ASS_OVERRIDE_BLOCK).map((part) => {
    if (/^\{\\[^}]*\}$/.test(part)) {
      return part;
    }

    return part
      .replace(/\\/g, '\\\\')
      .replace(/{/g, '\\{')
      .replace(/}/g, '\\}')
      .replace(/\n/g, '\\N');
  }).join('');
}

/**
 * Build a full ASS subtitle document for podcast video.
 * English text uses the Default style; IPA lines use inline colour overrides.
 * Style values mirror the former SRT + FFmpeg force_style settings.
 */
export function buildPodcastAssDocument(
  dialogues: PodcastAssDialogueLine[],
  style: ResolvedSubtitleStyle,
): string {
  const defaultStyle = buildPodcastAssStyleLine(style.podcast);

  const events = dialogues.map((line) => {
    const start = formatAssTime(line.startSeconds);
    const end = formatAssTime(line.endSeconds);
    const text = escapeAssDialogueText(line.text);
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  });

  return `[Script Info]
Title: Podcast Subtitles
ScriptType: v4.00+
PlayResX: ${style.podcast.playResX}
PlayResY: ${style.podcast.playResY}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
${ASS_STYLE_FORMAT}
${defaultStyle}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
}

/**
 * Build a full ASS subtitle document for short-form video.
 * Hook style: larger bold text, brand-orange box, same bottom placement as default.
 * Default style: bottom captions on a dark semi-transparent box.
 */
export function buildShortAssDocument(
  dialogues: AssDialogueLine[],
  style: ResolvedSubtitleStyle,
): string {
  const defaultStyle = [
    'Style: Default',
    'Arial',
    String(SHORT_DEFAULT_FONT_SIZE),
    SUBTITLE_PRIMARY_COLOUR,
    '&H000000FF',
    '&H00000000',
    '&HEE000000',
    '0', '0', '0', '0', '100', '100', '0', '0',
    '3', String(SHORT_DEFAULT_BOX_PADDING), '2',
    String(SHORT_SUBTITLE_ALIGNMENT),
    String(SHORT_SUBTITLE_MARGIN_LR),
    String(SHORT_SUBTITLE_MARGIN_LR),
    String(SHORT_SUBTITLE_MARGIN_V),
    '1',
  ].join(',');

  const hookStyle = [
    'Style: Hook',
    'Arial',
    String(SHORT_HOOK_FONT_SIZE),
    SUBTITLE_PRIMARY_COLOUR,
    '&H000000FF',
    style.hookOutlineColour,
    style.hookBackgroundColour,
    '-1', '0', '0', '0', '100', '100', '0', '0',
    '4', String(SHORT_HOOK_BOX_PADDING), '0',
    String(SHORT_SUBTITLE_ALIGNMENT),
    String(SHORT_SUBTITLE_MARGIN_LR),
    String(SHORT_SUBTITLE_MARGIN_LR),
    String(SHORT_SUBTITLE_MARGIN_V),
    '1',
  ].join(',');

  const events = dialogues.map((line) => {
    const start = formatAssTime(line.startSeconds);
    const end = formatAssTime(line.endSeconds);
    const text = escapeAssDialogueText(line.text);
    return `Dialogue: 0,${start},${end},${line.style},,0,0,0,,${text}`;
  });

  return `[Script Info]
Title: Short Subtitles
ScriptType: v4.00+
PlayResX: ${SHORT_THUMB_WIDTH}
PlayResY: ${SHORT_THUMB_HEIGHT}
WrapStyle: 0

[V4+ Styles]
${ASS_STYLE_FORMAT}
${defaultStyle}
${hookStyle}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
}

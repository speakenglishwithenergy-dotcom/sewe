import { SHORT_THUMB_HEIGHT, SHORT_THUMB_WIDTH } from '../ai/thumbnail-image.util';
import { ResolvedShortSubtitleStyle, ResolvedSubtitleStyle } from './subtitle-config.util';
import { buildPodcastAssStyleLine } from './subtitle-style';

const ASS_STYLE_FORMAT =
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

/** Top-right title badge on shadowing / podcast video. */
const SHADOWING_TITLE_ALIGNMENT = 9;
const SHADOWING_TITLE_MARGIN_LR = 12;
const SHADOWING_TITLE_MARGIN_V = 12;
const SHADOWING_TITLE_FONT_SIZE = 16;
const SHADOWING_TITLE_BOX_PADDING = 8;
/** Semi-transparent dark box behind title text (ASS BGR + alpha). */
const SHADOWING_TITLE_BACK_COLOUR = '&HC0000000';

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

export interface PodcastTitleOverlay {
  text: string;
  startSeconds: number;
  endSeconds: number;
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

function buildShadowingTitleAssStyleLine(style: ResolvedSubtitleStyle): string {
  const podcast = style.podcast;
  return [
    'Style: Title',
    podcast.fontName,
    String(SHADOWING_TITLE_FONT_SIZE),
    podcast.primaryColour,
    podcast.secondaryColour,
    style.hookOutlineColour,
    SHADOWING_TITLE_BACK_COLOUR,
    '1', '0', '0', '0', '100', '100', '0', '0',
    '3', String(SHADOWING_TITLE_BOX_PADDING), '0',
    String(SHADOWING_TITLE_ALIGNMENT),
    String(SHADOWING_TITLE_MARGIN_LR),
    String(SHADOWING_TITLE_MARGIN_LR),
    String(SHADOWING_TITLE_MARGIN_V),
    String(podcast.encoding),
  ].join(',');
}

/**
 * Build a full ASS subtitle document for podcast video.
 * English text uses the Default style; IPA lines use inline colour overrides.
 * Style values mirror the former SRT + FFmpeg force_style settings.
 */
export function buildPodcastAssDocument(
  dialogues: PodcastAssDialogueLine[],
  style: ResolvedSubtitleStyle,
  titleOverlay?: PodcastTitleOverlay,
): string {
  const defaultStyle = buildPodcastAssStyleLine(style.podcast);
  const titleStyle = titleOverlay ? buildShadowingTitleAssStyleLine(style) : undefined;

  const events = dialogues.map((line) => {
    const start = formatAssTime(line.startSeconds);
    const end = formatAssTime(line.endSeconds);
    const text = escapeAssDialogueText(line.text);
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  });

  if (titleOverlay) {
    const start = formatAssTime(titleOverlay.startSeconds);
    const end = formatAssTime(titleOverlay.endSeconds);
    const text = escapeAssDialogueText(titleOverlay.text);
    events.unshift(`Dialogue: 1,${start},${end},Title,,0,0,0,,${text}`);
  }

  const styleLines = [defaultStyle];
  if (titleStyle) {
    styleLines.push(titleStyle);
  }

  return `[Script Info]
Title: Podcast Subtitles
ScriptType: v4.00+
PlayResX: ${style.podcast.playResX}
PlayResY: ${style.podcast.playResY}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
${ASS_STYLE_FORMAT}
${styleLines.join('\n')}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
}

function buildShortDefaultAssStyleLine(short: ResolvedShortSubtitleStyle): string {
  if (short.useBox) {
    return [
      'Style: Default',
      short.fontName,
      String(short.fontSize),
      short.primaryColour,
      '&H000000FF',
      '&H00000000',
      short.defaultBackColour,
      '0', '0', '0', '0', '100', '100', '0', '0',
      '3', String(short.defaultBoxPadding), '2',
      String(short.alignment),
      String(short.marginL),
      String(short.marginR),
      String(short.marginV),
      '1',
    ].join(',');
  }

  return [
    'Style: Default',
    short.fontName,
    String(short.fontSize),
    short.primaryColour,
    '&H000000FF',
    short.defaultOutlineColour,
    '&H00000000',
    '0', '0', '0', '0', '100', '100', '0', '0',
    '1', String(short.outlineWidth), String(short.shadow),
    String(short.alignment),
    String(short.marginL),
    String(short.marginR),
    String(short.marginV),
    '1',
  ].join(',');
}

function buildShortHookAssStyleLine(short: ResolvedShortSubtitleStyle): string {
  if (short.hookUseBox) {
    return [
      'Style: Hook',
      short.fontName,
      String(short.hookFontSize),
      short.primaryColour,
      '&H000000FF',
      short.hookOutlineColour,
      short.hookBackgroundColour,
      '-1', '0', '0', '0', '100', '100', '0', '0',
      '4', String(short.hookBoxPadding), '0',
      String(short.alignment),
      String(short.marginL),
      String(short.marginR),
      String(short.marginV),
      '1',
    ].join(',');
  }

  return [
    'Style: Hook',
    short.fontName,
    String(short.hookFontSize),
    short.primaryColour,
    '&H000000FF',
    short.hookOutlineColour,
    '&H00000000',
    '-1', '0', '0', '0', '100', '100', '0', '0',
    '1', String(short.outlineWidth), String(short.shadow),
    String(short.alignment),
    String(short.marginL),
    String(short.marginR),
    String(short.marginV),
    '1',
  ].join(',');
}

/**
 * Build a full ASS subtitle document for short-form video.
 * Hook style: larger bold text with optional brand-orange box.
 * Default style: outline + shadow by default, or semi-transparent box when configured.
 */
export function buildShortAssDocument(
  dialogues: AssDialogueLine[],
  style: ResolvedSubtitleStyle,
): string {
  const short = style.short;
  const defaultStyle = buildShortDefaultAssStyleLine(short);
  const hookStyle = buildShortHookAssStyleLine(short);

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

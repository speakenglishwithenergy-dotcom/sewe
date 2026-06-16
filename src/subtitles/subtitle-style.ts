/** ASS BGR colours for burned-in subtitles (libass / FFmpeg subtitles filter). */

/** English dialogue — white. */
export const SUBTITLE_PRIMARY_COLOUR = '&H00FFFFFF';

/** IPA transcription — brand cyan (#2ba6e1), matches podcast waveform overlay. */
export const SUBTITLE_IPA_COLOUR = '&H00E1A62B';

/** Podcast outline — black. */
export const SUBTITLE_PODCAST_OUTLINE_COLOUR = '&H00000000';

/** Brand orange #FF7A00 — hook subtitle box and keyword highlights (ASS BGR). */
export const SUBTITLE_SHORT_HOOK_BACK_COLOUR = '&H00007AFF';

/** Keyword highlights in English dialogue — brand orange (#FF7A00). */
export const SUBTITLE_KEYWORD_COLOUR = SUBTITLE_SHORT_HOOK_BACK_COLOUR;

/** Dark navy #0D1B3D — hook box border (ASS BGR). */
export const SUBTITLE_SHORT_HOOK_OUTLINE_COLOUR = '&H003D1B0D';

/**
 * Podcast subtitle style — mirrors the former FFmpeg `force_style` settings.
 * Play resolution matches libass SRT defaults so fontsize/position/border scale identically.
 */
export const PODCAST_SUBTITLE_STYLE = {
  playResX: 384,
  playResY: 288,
  fontName: 'Arial',
  fontSize: 14,
  primaryColour: SUBTITLE_PRIMARY_COLOUR,
  secondaryColour: '&H000000FF',
  outlineColour: SUBTITLE_PODCAST_OUTLINE_COLOUR,
  backColour: '&H00000000',
  bold: false,
  italic: false,
  underline: false,
  strikeOut: false,
  scaleX: 100,
  scaleY: 100,
  spacing: 0,
  angle: 0,
  borderStyle: 1,
  outline: 1,
  shadow: 1,
  alignment: 2,
  marginL: 10,
  marginR: 10,
  marginV: 70,
  encoding: 1,
} as const;

export interface PodcastAssStyleLineInput {
  fontName: string;
  fontSize: number;
  primaryColour: string;
  secondaryColour: string;
  outlineColour: string;
  backColour: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeOut: boolean;
  scaleX: number;
  scaleY: number;
  spacing: number;
  angle: number;
  borderStyle: number;
  outline: number;
  shadow: number;
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
  encoding: number;
}

/** Build the ASS `Style: Default,...` line for podcast subtitles. */
export function buildPodcastAssStyleLine(
  style: PodcastAssStyleLineInput = PODCAST_SUBTITLE_STYLE,
): string {
  const s = style;
  return [
    'Style: Default',
    s.fontName,
    String(s.fontSize),
    s.primaryColour,
    s.secondaryColour,
    s.outlineColour,
    s.backColour,
    s.bold ? '1' : '0',
    s.italic ? '1' : '0',
    s.underline ? '1' : '0',
    s.strikeOut ? '1' : '0',
    String(s.scaleX),
    String(s.scaleY),
    String(s.spacing),
    String(s.angle),
    String(s.borderStyle),
    String(s.outline),
    String(s.shadow),
    String(s.alignment),
    String(s.marginL),
    String(s.marginR),
    String(s.marginV),
    String(s.encoding),
  ].join(',');
}

/** Wrap IPA lines with an ASS colour override. */
export function formatIpaSubtitleText(ipa: string, colour = SUBTITLE_IPA_COLOUR): string {
  return `{\\c${colour}&}${ipa}`;
}

/** Wrap a keyword with ASS colour + bold overrides, resetting style afterward. */
export function formatKeywordHighlight(word: string, colour = SUBTITLE_KEYWORD_COLOUR): string {
  return `{\\c${colour}&\\b1}${word}{\\r}`;
}

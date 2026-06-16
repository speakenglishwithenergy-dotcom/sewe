import { ChannelBranding } from '../channel/channel.types';
import {
  PODCAST_SUBTITLE_STYLE,
  SUBTITLE_IPA_COLOUR,
  SUBTITLE_KEYWORD_COLOUR,
  SUBTITLE_PODCAST_OUTLINE_COLOUR,
  SUBTITLE_PRIMARY_COLOUR,
  SUBTITLE_SHORT_HOOK_BACK_COLOUR,
  SUBTITLE_SHORT_HOOK_OUTLINE_COLOUR,
} from './subtitle-style';

/** Convert `#RRGGBB` to ASS BGR (`&H00BBGGRR`). */
export function hexToAssBgr(hex: string): string {
  const cleaned = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const r = cleaned.slice(0, 2);
  const g = cleaned.slice(2, 4);
  const b = cleaned.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

export interface ResolvedPodcastSubtitleStyle {
  playResX: number;
  playResY: number;
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
  includeIpa: boolean;
}

export interface ResolvedSubtitleStyle {
  podcast: ResolvedPodcastSubtitleStyle;
  lineWidth: number;
  keywordColour: string;
  ipaColour: string;
  hookBackgroundColour: string;
  hookOutlineColour: string;
}

export function resolveSubtitleStyle(branding: ChannelBranding): ResolvedSubtitleStyle {
  const { subtitleColors, subtitleStyle } = branding;

  return {
    podcast: {
      ...PODCAST_SUBTITLE_STYLE,
      fontName: subtitleStyle?.fontName ?? PODCAST_SUBTITLE_STYLE.fontName,
      fontSize: subtitleStyle?.fontSize ?? PODCAST_SUBTITLE_STYLE.fontSize,
      primaryColour: subtitleStyle?.primary
        ? hexToAssBgr(subtitleStyle.primary)
        : SUBTITLE_PRIMARY_COLOUR,
      outlineColour: subtitleStyle?.outline
        ? hexToAssBgr(subtitleStyle.outline)
        : SUBTITLE_PODCAST_OUTLINE_COLOUR,
      outline: subtitleStyle?.outlineWidth ?? PODCAST_SUBTITLE_STYLE.outline,
      shadow: subtitleStyle?.shadow ?? PODCAST_SUBTITLE_STYLE.shadow,
      alignment: subtitleStyle?.alignment ?? PODCAST_SUBTITLE_STYLE.alignment,
      marginL: subtitleStyle?.marginL ?? PODCAST_SUBTITLE_STYLE.marginL,
      marginR: subtitleStyle?.marginR ?? PODCAST_SUBTITLE_STYLE.marginR,
      marginV: subtitleStyle?.marginV ?? PODCAST_SUBTITLE_STYLE.marginV,
      includeIpa: subtitleStyle?.includeIpa ?? true,
    },
    lineWidth: subtitleStyle?.lineWidth ?? 42,
    keywordColour: hexToAssBgr(subtitleColors.keyword),
    ipaColour: hexToAssBgr(subtitleColors.ipa),
    hookBackgroundColour: hexToAssBgr(subtitleColors.highlight),
    hookOutlineColour: hexToAssBgr(subtitleColors.background),
  };
}

/** Default style when no channel branding is available (e.g. unit tests). */
export function defaultSubtitleStyle(): ResolvedSubtitleStyle {
  return {
    podcast: { ...PODCAST_SUBTITLE_STYLE, includeIpa: true },
    lineWidth: 42,
    keywordColour: SUBTITLE_KEYWORD_COLOUR,
    ipaColour: SUBTITLE_IPA_COLOUR,
    hookBackgroundColour: SUBTITLE_SHORT_HOOK_BACK_COLOUR,
    hookOutlineColour: SUBTITLE_SHORT_HOOK_OUTLINE_COLOUR,
  };
}

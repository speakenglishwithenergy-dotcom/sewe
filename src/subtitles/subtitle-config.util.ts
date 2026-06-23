import { ChannelBranding } from '../channel/channel.types';
import {
  DEFAULT_SHORT_SUBTITLE_STYLE,
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

/** Build ASS BGR with alpha prefix (`&HAABBGGRR`). Alpha 0 = opaque in ASS back colour. */
export function hexToAssBgrWithAlpha(hex: string, alpha: number): string {
  const cleaned = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const aa = Math.min(255, Math.max(0, alpha)).toString(16).padStart(2, '0').toUpperCase();
  const r = cleaned.slice(0, 2);
  const g = cleaned.slice(2, 4);
  const b = cleaned.slice(4, 6);
  return `&H${aa}${b}${g}${r}`.toUpperCase();
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

export interface ResolvedShortSubtitleStyle {
  fontName: string;
  fontSize: number;
  hookFontSize: number;
  primaryColour: string;
  defaultOutlineColour: string;
  defaultBackColour: string;
  hookBackgroundColour: string;
  hookOutlineColour: string;
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
  lineWidth: number;
  useBox: boolean;
  hookUseBox: boolean;
  outlineWidth: number;
  shadow: number;
  defaultBoxPadding: number;
  hookBoxPadding: number;
}

export interface ResolvedSubtitleStyle {
  podcast: ResolvedPodcastSubtitleStyle;
  short: ResolvedShortSubtitleStyle;
  lineWidth: number;
  keywordColour: string;
  ipaColour: string;
  hookBackgroundColour: string;
  hookOutlineColour: string;
}

function resolveShortSubtitleStyle(branding: ChannelBranding): ResolvedShortSubtitleStyle {
  const { subtitleColors, shortSubtitleStyle: shortStyle } = branding;
  const defaults = DEFAULT_SHORT_SUBTITLE_STYLE;
  const boxAlpha = shortStyle?.boxAlpha ?? defaults.boxAlpha;

  return {
    fontName: shortStyle?.fontName ?? defaults.fontName,
    fontSize: shortStyle?.fontSize ?? defaults.fontSize,
    hookFontSize: shortStyle?.hookFontSize ?? defaults.hookFontSize,
    primaryColour: SUBTITLE_PRIMARY_COLOUR,
    defaultOutlineColour: shortStyle?.outline
      ? hexToAssBgr(shortStyle.outline)
      : hexToAssBgr(subtitleColors.background),
    defaultBackColour: hexToAssBgrWithAlpha('#000000', boxAlpha),
    hookBackgroundColour: hexToAssBgr(subtitleColors.highlight),
    hookOutlineColour: hexToAssBgr(subtitleColors.background),
    alignment: shortStyle?.alignment ?? defaults.alignment,
    marginL: shortStyle?.marginL ?? defaults.marginL,
    marginR: shortStyle?.marginR ?? defaults.marginR,
    marginV: shortStyle?.marginV ?? defaults.marginV,
    lineWidth: shortStyle?.lineWidth ?? defaults.lineWidth,
    useBox: shortStyle?.useBox ?? defaults.useBox,
    hookUseBox: shortStyle?.hookUseBox ?? defaults.hookUseBox,
    outlineWidth: shortStyle?.outlineWidth ?? defaults.outlineWidth,
    shadow: shortStyle?.shadow ?? defaults.shadow,
    defaultBoxPadding: defaults.defaultBoxPadding,
    hookBoxPadding: defaults.hookBoxPadding,
  };
}

export function resolveSubtitleStyle(branding: ChannelBranding): ResolvedSubtitleStyle {
  const { subtitleColors, subtitleStyle } = branding;
  const short = resolveShortSubtitleStyle(branding);

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
    short,
    lineWidth: subtitleStyle?.lineWidth ?? 42,
    keywordColour: hexToAssBgr(subtitleColors.keyword),
    ipaColour: hexToAssBgr(subtitleColors.ipa),
    hookBackgroundColour: short.hookBackgroundColour,
    hookOutlineColour: short.hookOutlineColour,
  };
}

/** Default style when no channel branding is available (e.g. unit tests). */
export function defaultSubtitleStyle(): ResolvedSubtitleStyle {
  const short = resolveShortSubtitleStyle({
    subtitleColors: {
      highlight: '#FF7A00',
      keyword: '#FF7A00',
      ipa: '#2ba6e1',
      background: '#0D1B3D',
    },
    thumbnail: {
      brandColors: '',
      logoLockRules: '',
      logoUnchanged: '',
      badgeUnchanged: '',
      shortLogoUnchanged: '',
      shortBadgeUnchanged: '',
      artStyle: '',
    },
  });

  return {
    podcast: { ...PODCAST_SUBTITLE_STYLE, includeIpa: true },
    short,
    lineWidth: 42,
    keywordColour: SUBTITLE_KEYWORD_COLOUR,
    ipaColour: SUBTITLE_IPA_COLOUR,
    hookBackgroundColour: SUBTITLE_SHORT_HOOK_BACK_COLOUR,
    hookOutlineColour: SUBTITLE_SHORT_HOOK_OUTLINE_COLOUR,
  };
}

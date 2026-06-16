import { ChannelBranding } from '../channel/channel.types';

const DEFAULT_WAVE_WIDTH = 800;
const DEFAULT_WAVE_HEIGHT = 200;
const DEFAULT_WAVE_COLOR = '#2ba6e1';
const DEFAULT_WAVE_OPACITY = 0.9;

const PODCAST_VIDEO_WIDTH = 1920;
const PODCAST_VIDEO_HEIGHT = 1080;
const SHORT_VIDEO_WIDTH = 1080;
const SHORT_VIDEO_HEIGHT = 1920;

export interface WaveOverlayPosition {
  x: number;
  y: number;
}

export interface ResolvedWaveVisualizer {
  width: number;
  height: number;
  /** FFmpeg showwaves color, e.g. `0x2ba6e1@0.9` */
  ffmpegColor: string;
  podcast: WaveOverlayPosition;
  short: WaveOverlayPosition;
}

function hexToFfmpegColor(hex: string, opacity: number): string {
  const cleaned = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  return `0x${cleaned.toLowerCase()}@${opacity}`;
}

function defaultPodcastPosition(width: number, height: number): WaveOverlayPosition {
  return {
    x: Math.round((PODCAST_VIDEO_WIDTH - width) / 2),
    y: PODCAST_VIDEO_HEIGHT - height,
  };
}

function defaultShortPosition(width: number): WaveOverlayPosition {
  return {
    x: Math.round((SHORT_VIDEO_WIDTH - width) / 2),
    y: 0,
  };
}

export function resolveWaveVisualizer(branding: ChannelBranding): ResolvedWaveVisualizer {
  const wave = branding.waveVisualizer;
  const width = wave?.width ?? DEFAULT_WAVE_WIDTH;
  const height = wave?.height ?? DEFAULT_WAVE_HEIGHT;
  const color = wave?.color ?? branding.subtitleColors.ipa ?? DEFAULT_WAVE_COLOR;
  const opacity = wave?.opacity ?? DEFAULT_WAVE_OPACITY;

  const podcastDefault = defaultPodcastPosition(width, height);
  const shortDefault = defaultShortPosition(width);

  return {
    width,
    height,
    ffmpegColor: hexToFfmpegColor(color, opacity),
    podcast: {
      x: wave?.x ?? podcastDefault.x,
      y: wave?.y ?? podcastDefault.y,
    },
    short: {
      x: wave?.short?.x ?? shortDefault.x,
      y: wave?.short?.y ?? shortDefault.y,
    },
  };
}

export function defaultWaveVisualizer(): ResolvedWaveVisualizer {
  const width = DEFAULT_WAVE_WIDTH;
  const height = DEFAULT_WAVE_HEIGHT;

  return {
    width,
    height,
    ffmpegColor: hexToFfmpegColor(DEFAULT_WAVE_COLOR, DEFAULT_WAVE_OPACITY),
    podcast: defaultPodcastPosition(width, height),
    short: defaultShortPosition(width),
  };
}

/** Build FFmpeg filter chain that renders the p2p waveform strip. */
export function buildWaveOverlayFilters(wave: ResolvedWaveVisualizer): string[] {
  const { width, height, ffmpegColor } = wave;

  return [
    `[awave]showwaves=size=${width}x${height}:mode=p2p:colors=${ffmpegColor}:rate=30,format=yuva420p,split=2[wa][wb]`,
    `[wb]pad=${width}:${height + 2}:0:1:color=0x00000000,crop=${width}:${height}:0:0[wb2]`,
    '[wa][wb2]blend=all_mode=lighten,format=yuva420p[waves]',
  ];
}

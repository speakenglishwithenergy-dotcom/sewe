import { z } from 'zod';

// ─── Host & script ───────────────────────────────────────────────────────────

export const ChannelHostSchema = z.object({
  name: z.string().min(1),
  voice: z.string().min(1),
  personality: z.string().min(1),
});

export const ScriptSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  lineCount: z.number().int().positive(),
  brief: z.string().min(1),
});

export const ChannelScriptConfigSchema = z.object({
  targetMinWords: z.number().int().positive(),
  targetMinLines: z.number().int().positive(),
  languageLevel: z.string().min(1),
  sections: z.array(ScriptSectionSchema).min(1),
  closingTemplate: z.string().min(1),
  dialogueRules: z.string().optional(),
  dialogueFlowExample: z.string().optional(),
});

export const ChannelShortConfigSchema = z.object({
  enabled: z.boolean(),
  hookSpeaker: z.string().min(1),
  bodySpeaker: z.string().min(1),
  minLines: z.number().int().positive(),
  maxLines: z.number().int().positive(),
  promptExtra: z.string().optional(),
});

// ─── Branding ────────────────────────────────────────────────────────────────

export const SubtitleColorsSchema = z.object({
  highlight: z.string().min(1),
  keyword: z.string().min(1),
  ipa: z.string().min(1),
  background: z.string().min(1),
});

/** Optional podcast subtitle layout and typography overrides (ASS style fields). */
export const SubtitleStyleSchema = z.object({
  fontName: z.string().min(1).optional(),
  fontSize: z.number().int().positive().optional(),
  primary: z.string().min(1).optional(),
  outline: z.string().min(1).optional(),
  outlineWidth: z.number().int().min(0).optional(),
  shadow: z.number().int().min(0).optional(),
  /** ASS alignment 1–9: 1=bottom-left … 2=bottom-center … 8=top-center … 9=top-right */
  alignment: z.number().int().min(1).max(9).optional(),
  marginL: z.number().int().min(0).optional(),
  marginR: z.number().int().min(0).optional(),
  marginV: z.number().int().min(0).optional(),
  /** Max characters per subtitle line before wrapping (default 42). */
  lineWidth: z.number().int().positive().optional(),
  includeIpa: z.boolean().optional(),
});

/** Optional audio waveform overlay position and appearance (1920×1080 podcast / 1080×1920 short). */
export const WaveVisualizerSchema = z.object({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  color: z.string().min(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  /** Podcast overlay X (pixels from left). Default: horizontally centered. */
  x: z.number().int().min(0).optional(),
  /** Podcast overlay Y (pixels from top). Default: flush to bottom edge. */
  y: z.number().int().min(0).optional(),
  short: z.object({
    x: z.number().int().min(0).optional(),
    y: z.number().int().min(0).optional(),
  }).optional(),
});

export const ThumbnailBrandingSchema = z.object({
  templateType: z.enum(['podcast-hosts', 'overlay-template']).optional(),
  brandColors: z.string().min(1),
  charactersBlock: z.string().optional(),
  logoLockRules: z.string().min(1),
  logoUnchanged: z.string().min(1),
  badgeUnchanged: z.string().min(1),
  shortLogoUnchanged: z.string().min(1),
  shortBadgeUnchanged: z.string().min(1),
  artStyle: z.string().min(1),
  backgroundUnchanged: z.string().optional(),
  titleChangeBlock: z.string().optional(),
  characterColorReference: z.string().optional(),
  topicRelevance: z.string().optional(),
  expressionModeration: z.string().optional(),
  charactersExpressionGuidance: z.string().optional(),
});

export const ChannelBrandingSchema = z.object({
  subtitleColors: SubtitleColorsSchema,
  subtitleStyle: SubtitleStyleSchema.optional(),
  waveVisualizer: WaveVisualizerSchema.optional(),
  thumbnail: ThumbnailBrandingSchema,
});

// ─── Assets (relative paths within channel dir) ──────────────────────────────

export const ChannelAssetsConfigSchema = z.object({
  intro: z.string().min(1),
  outro: z.string().min(1),
  background: z.string().min(1),
  shortBackground: z.string().min(1),
  demoThumbnail: z.string().min(1),
  demoShortThumbnail: z.string().min(1),
  logo: z.string().min(1).optional(),
  backgroundMusic: z.string().min(1).optional(),
});

export interface ResolvedChannelAssets {
  intro: string;
  outro: string;
  background: string;
  shortBackground: string;
  demoThumbnail: string;
  demoShortThumbnail: string;
  logo?: string;
  backgroundMusic?: string;
}

// ─── Publish ─────────────────────────────────────────────────────────────────

export const PublishDescriptionBlocksSchema = z.object({
  learnHeader: z.string().min(1),
  chaptersHeader: z.string().min(1),
  subscribeCta: z.string().min(1),
  shortCta: z.string().min(1),
  linksHeader: z.string().min(1),
});

export const PublishFacebookBlocksSchema = z.object({
  learnHeader: z.string().min(1),
  followCta: z.string().min(1),
  youtubeCta: z.string().min(1),
  tiktokCta: z.string().min(1),
});

/** Optional YouTube scheduled-publish times. Times are wall-clock (HH:MM, 24-h). */
export const YoutubeScheduleSchema = z.object({
  /** Wall-clock publish time for long-form videos, e.g. "11:30" */
  longTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format').optional(),
  /** Wall-clock publish time for Shorts, e.g. "17:30" */
  shortTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format').optional(),
  /** IANA timezone name, e.g. "Asia/Ho_Chi_Minh". Defaults to "UTC". */
  timezone: z.string().min(1).optional(),
});

export type YoutubeSchedule = z.infer<typeof YoutubeScheduleSchema>;

export const ChannelPublishConfigSchema = z.object({
  youtubeChannelUrl: z.string().url(),
  facebookPageUrl: z.string().url(),
  tiktokChannelUrl: z.string().url(),
  youtubeLongPlaylistId: z.string().min(1),
  youtubeShortPlaylistId: z.string().min(1),
  titleSuffix: z.string().min(1),
  youtubeSchedule: YoutubeScheduleSchema.optional(),
  coreTags: z.array(z.string().min(1)).min(1),
  coreHashtags: z.array(z.string().min(1)).min(1),
  shortCoreHashtags: z.array(z.string().min(1)).min(1),
  facebookCoreHashtags: z.array(z.string().min(1)).min(1),
  facebookShortCoreHashtags: z.array(z.string().min(1)).min(1),
  chapterLabels: z.array(z.string().min(1)).min(1),
  defaultBullets: z.array(z.string().min(1)).min(1),
  description: PublishDescriptionBlocksSchema,
  facebook: PublishFacebookBlocksSchema,
});

export type PublishDescriptionBlocks = z.infer<typeof PublishDescriptionBlocksSchema>;
export type PublishFacebookBlocks = z.infer<typeof PublishFacebookBlocksSchema>;

export interface ResolvedPublishCopy {
  youtubeChannelUrl: string;
  facebookPageUrl: string;
  tiktokChannelUrl: string;
  youtubeLongPlaylistId: string;
  youtubeShortPlaylistId: string;
  titleSuffix: string;
  titleBaseMax: number;
  youtubeSchedule?: YoutubeSchedule;
  coreTags: readonly string[];
  coreHashtags: readonly string[];
  shortCoreHashtags: readonly string[];
  facebookCoreHashtags: readonly string[];
  facebookShortCoreHashtags: readonly string[];
  chapterLabels: readonly string[];
  defaultBullets: readonly string[];
  description: PublishDescriptionBlocks & {
    youtubeLinkLine: string;
    facebookLinkLine: string;
    tiktokLinkLine: string;
  };
  facebook: PublishFacebookBlocks;
  shortLinks: {
    youtubeLine: string;
    facebookLine: string;
    tiktokLine: string;
  };
}

// ─── Root channel config ─────────────────────────────────────────────────────

export const ChannelConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  niche: z.string().min(1),
  hosts: z.array(ChannelHostSchema).min(1),
  script: ChannelScriptConfigSchema,
  short: ChannelShortConfigSchema,
  branding: ChannelBrandingSchema,
  assets: ChannelAssetsConfigSchema,
  publish: ChannelPublishConfigSchema,
  perEpisodeBackground: z.boolean().optional(),
  env: z.object({
    prefix: z.string().min(1),
  }),
});

export type ChannelHost = z.infer<typeof ChannelHostSchema>;
export type ScriptSectionDef = z.infer<typeof ScriptSectionSchema>;
export type ChannelScriptConfig = z.infer<typeof ChannelScriptConfigSchema>;
export type ChannelShortConfig = z.infer<typeof ChannelShortConfigSchema>;
export type ChannelBranding = z.infer<typeof ChannelBrandingSchema>;
export type ChannelAssetsConfig = z.infer<typeof ChannelAssetsConfigSchema>;
export type ChannelPublishConfig = z.infer<typeof ChannelPublishConfigSchema>;
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

export interface ChannelContext {
  config: ChannelConfig;
  dir: string;
  assets: ResolvedChannelAssets;
  speakers: string[];
  voiceMap: Record<string, string>;
  publish: ResolvedPublishCopy;
  closingText: string;
}

export function buildHostsBlock(hosts: ChannelHost[]): string {
  return `The podcast features ${hosts.length} host${hosts.length === 1 ? '' : 's'}:\n${hosts
    .map((host) => `- ${host.name}: ${host.personality}`)
    .join('\n')}`;
}

export function buildClosingText(template: string, channelName: string): string {
  return template.replace(/\{channelName\}/g, channelName);
}

export function resolvePublishCopy(
  publish: ChannelPublishConfig,
  titleMax = 70,
): ResolvedPublishCopy {
  const { youtubeChannelUrl, facebookPageUrl, tiktokChannelUrl } = publish;

  return {
    youtubeChannelUrl,
    facebookPageUrl,
    tiktokChannelUrl,
    youtubeLongPlaylistId: publish.youtubeLongPlaylistId,
    youtubeShortPlaylistId: publish.youtubeShortPlaylistId,
    titleSuffix: publish.titleSuffix,
    titleBaseMax: titleMax - publish.titleSuffix.length,
    youtubeSchedule: publish.youtubeSchedule,
    coreTags: publish.coreTags,
    coreHashtags: publish.coreHashtags,
    shortCoreHashtags: publish.shortCoreHashtags,
    facebookCoreHashtags: publish.facebookCoreHashtags,
    facebookShortCoreHashtags: publish.facebookShortCoreHashtags,
    chapterLabels: publish.chapterLabels,
    defaultBullets: publish.defaultBullets,
    description: {
      ...publish.description,
      youtubeLinkLine: `YouTube: ${youtubeChannelUrl}`,
      facebookLinkLine: `Facebook: ${facebookPageUrl}`,
      tiktokLinkLine: `TikTok: ${tiktokChannelUrl}`,
    },
    facebook: publish.facebook,
    shortLinks: {
      youtubeLine: `🎬 YouTube: ${youtubeChannelUrl}`,
      facebookLine: `👍 Facebook: ${facebookPageUrl}`,
      tiktokLine: `🎵 TikTok: ${tiktokChannelUrl}`,
    },
  };
}

export function validateChannelConfig(config: ChannelConfig): void {
  const speakerNames = new Set(config.hosts.map((h) => h.name));

  if (config.short.enabled) {
    if (!speakerNames.has(config.short.hookSpeaker)) {
      throw new Error(
        `Channel "${config.id}": short.hookSpeaker "${config.short.hookSpeaker}" is not a configured host`,
      );
    }
    if (!speakerNames.has(config.short.bodySpeaker)) {
      throw new Error(
        `Channel "${config.id}": short.bodySpeaker "${config.short.bodySpeaker}" is not a configured host`,
      );
    }
  }

  const names = config.hosts.map((h) => h.name);
  const duplicateHosts = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicateHosts.length > 0) {
    throw new Error(`Channel "${config.id}": duplicate host names: ${duplicateHosts.join(', ')}`);
  }
}

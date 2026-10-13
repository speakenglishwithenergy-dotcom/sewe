import { z } from 'zod';
import {
  ChannelPublishConfigSchema,
  ResolvedPublishCopy,
  SubtitleColorsSchema,
  SubtitleStyleSchema,
  resolvePublishCopy,
} from '../channel/channel.types';
import { PUBLISH_LIMITS } from '../social/publish.limits';

// ─── Studio profile (standalone — NOT channel.yaml / podcast) ────────────────

export const StudioAssetsConfigSchema = z.object({
  background: z.string().min(1),
});

export const StudioBrandingSchema = z.object({
  subtitleColors: SubtitleColorsSchema,
  subtitleStyle: SubtitleStyleSchema.optional(),
});

/** Who speaks each TTS/subtitle line — not "podcast hosts". */
export const StudioVoiceSchema = z.object({
  name: z.string().min(1),
  voice: z.string().min(1),
  role: z.string().min(1).optional(),
});

export const StudioScriptSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  lineCount: z.number().int().positive(),
  brief: z.string().min(1).optional(),
});

export const StudioScriptFormatSchema = z.enum([
  'monologue',
  'dialogue',
  'tutorial',
  'story',
]);
export type StudioScriptFormat = z.infer<typeof StudioScriptFormatSchema>;

export const StudioScriptConfigSchema = z.object({
  format: StudioScriptFormatSchema,
  languageLevel: z.string().min(1),
  targetMinWords: z.number().int().positive(),
  targetMinLines: z.number().int().positive(),
  lineRules: z.string().min(1),
  flowExample: z.string().optional(),
  closingLine: z.string().optional(),
  sections: z.array(StudioScriptSectionSchema).min(1),
});
export type StudioScriptConfig = z.infer<typeof StudioScriptConfigSchema>;

export const StudioProfileConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  niche: z.string().min(1),
  voices: z.array(StudioVoiceSchema).min(1),
  script: StudioScriptConfigSchema,
  branding: StudioBrandingSchema,
  publish: ChannelPublishConfigSchema,
  assets: StudioAssetsConfigSchema,
});

export type StudioProfileConfig = z.infer<typeof StudioProfileConfigSchema>;
export type StudioVoice = z.infer<typeof StudioVoiceSchema>;
export type StudioScriptSection = z.infer<typeof StudioScriptSectionSchema>;
export type StudioAssetsConfig = z.infer<typeof StudioAssetsConfigSchema>;

export interface ResolvedStudioAssets {
  background: string;
}

export interface StudioContext {
  config: StudioProfileConfig;
  profileDir: string;
  assets: ResolvedStudioAssets;
  speakers: string[];
  voiceMap: Record<string, string>;
  publish: ResolvedPublishCopy;
  closingText?: string;
}

export function buildStudioContext(
  config: StudioProfileConfig,
  profileDir: string,
  assets: ResolvedStudioAssets,
): StudioContext {
  const speakers = config.voices.map((v) => v.name);
  const voiceMap = Object.fromEntries(config.voices.map((v) => [v.name, v.voice]));
  const closingText = config.script.closingLine
    ? config.script.closingLine.replace(/\{name\}/g, config.name)
    : undefined;

  return {
    config,
    profileDir,
    assets,
    speakers,
    voiceMap,
    publish: resolvePublishCopy(config.publish, PUBLISH_LIMITS.youtubeTitleMax),
    closingText,
  };
}

export function studioVoicesBlock(ctx: StudioContext): string {
  return `Voices (each line in the script is spoken by one of these):\n${ctx.config.voices
    .map((v) => `- ${v.name} (${v.voice})${v.role ? `: ${v.role}` : ''}`)
    .join('\n')}`;
}

export function studioFormatDescription(format: StudioScriptFormat): string {
  switch (format) {
    case 'monologue':
      return 'Single speaker — continuous spoken lines for shadowing (vlog, personal story, rant). NOT a podcast interview.';
    case 'dialogue':
      return 'Two or more speakers — natural conversation scene for shadowing. NOT a formal podcast Q&A format.';
    case 'tutorial':
      return 'Instructional spoken lines — teach one concept step by step, viewer shadows each beat.';
    case 'story':
      return 'Narrative spoken lines — story arc with concrete scenes; optional brief reactions if multiple voices.';
  }
}

// ─── Workspace metadata ──────────────────────────────────────────────────────

export const StudioStatusSchema = z.enum([
  'draft',
  'outlined',
  'scripted',
  'shadowing',
  'ready',
]);
export type StudioStatus = z.infer<typeof StudioStatusSchema>;

export const StudioWorkspaceSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  status: StudioStatusSchema,
  title: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type StudioWorkspace = z.infer<typeof StudioWorkspaceSchema>;

// ─── Outline ─────────────────────────────────────────────────────────────────

export const OutlineSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  brief: z.string().min(1),
  lineCount: z.number().int().positive(),
});

export const OutlineSchema = z.object({
  topic: z.string().min(1),
  hookAngles: z.array(z.string().min(1)).min(1),
  viralAngle: z.string().min(1),
  sections: z.array(OutlineSectionSchema).min(1),
  keyTakeaways: z.array(z.string().min(1)).min(1),
});
export type Outline = z.infer<typeof OutlineSchema>;

// ─── Edit guide ──────────────────────────────────────────────────────────────

export const ShotTypeSchema = z.enum([
  'talking_head',
  'broll',
  'screen',
  'text_overlay',
  'split',
]);
export type ShotType = z.infer<typeof ShotTypeSchema>;

export const EditSceneSchema = z.object({
  sectionId: z.string().min(1),
  lineRange: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  estimatedStart: z.string().min(1),
  estimatedEnd: z.string().min(1),
  shotType: ShotTypeSchema,
  visualNotes: z.string().min(1),
  brollSuggestion: z.string().optional(),
  transitionIn: z.string().optional(),
  transitionOut: z.string().optional(),
  textOverlay: z.string().optional(),
  musicCue: z.string().optional(),
  sfxCue: z.string().optional(),
  editorNotes: z.string().optional(),
});

export const EditGuideSchema = z.object({
  episodeTitle: z.string().min(1),
  scenes: z.array(EditSceneSchema).min(1),
  generalNotes: z.string().optional(),
});
export type EditGuide = z.infer<typeof EditGuideSchema>;

// ─── Assets brief ────────────────────────────────────────────────────────────

export const ThumbnailConceptSchema = z.object({
  concept: z.string().min(1),
  imageGenPrompt: z.string().min(1),
  textOverlay: z.string().min(1),
});

export const BrollSuggestionSchema = z.object({
  sceneSectionId: z.string().min(1),
  description: z.string().min(1),
  searchKeywords: z.array(z.string().min(1)).min(1),
  stockQueries: z.array(z.string().min(1)).min(1),
  aiGenPrompt: z.string().optional(),
});

export const AssetsBriefSchema = z.object({
  thumbnails: z.array(ThumbnailConceptSchema).min(1).max(5),
  broll: z.array(BrollSuggestionSchema).min(1),
  music: z.object({
    mood: z.string().min(1),
    tempo: z.string().min(1),
    referenceStyle: z.string().min(1),
  }),
  propsAndSet: z.array(z.string().min(1)).min(1),
  graphics: z.object({
    fonts: z.array(z.string().min(1)).min(1),
    colorPalette: z.array(z.string().min(1)).min(1),
    lowerThirds: z.array(z.string().min(1)).min(1),
  }),
  references: z.array(z.string().min(1)).min(1),
});
export type AssetsBrief = z.infer<typeof AssetsBriefSchema>;

// ─── Viral brief ─────────────────────────────────────────────────────────────

export const TitleRankingSchema = z.object({
  title: z.string().min(1),
  rank: z.number().int().min(1),
  ctrReason: z.string().min(1),
});

export const RetentionRiskSchema = z.object({
  timestamp: z.string().min(1),
  risk: z.string().min(1),
  fix: z.string().min(1),
});

export const ViralBriefSchema = z.object({
  hookScore: z.number().min(1).max(10),
  hookImprovements: z.array(z.string().min(1)).min(1),
  titleRanking: z.array(TitleRankingSchema).min(1),
  thumbnailCtrNotes: z.array(z.string().min(1)).min(1),
  retentionRisks: z.array(RetentionRiskSchema).min(1),
  seoGaps: z.array(z.string().min(1)).min(1),
  differentiation: z.string().min(1),
  uploadChecklist: z.array(z.string().min(1)).min(1),
  disclaimer: z.string().min(1),
});
export type ViralBrief = z.infer<typeof ViralBriefSchema>;

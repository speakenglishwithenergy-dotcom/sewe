import { z } from 'zod';
import { ChannelContext, ScriptSectionSchema } from '../channel/channel.types';

// ─── Speakers (dynamic per channel) ──────────────────────────────────────────

export type Speaker = string;

export function buildSpeakerSchema(speakers: [string, ...string[]]) {
  return z.string().min(1).transform((raw, ctx) => {
    const trimmed = raw.trim();
    if ((speakers as string[]).includes(trimmed)) return trimmed;

    // Common LLM typos: "Victoria" → "Victor", case mismatches, etc.
    const lower = trimmed.toLowerCase();
    const exact = speakers.find((s) => s.toLowerCase() === lower);
    if (exact) return exact;

    const prefix = speakers.find(
      (s) => lower.startsWith(s.toLowerCase()) || s.toLowerCase().startsWith(lower),
    );
    if (prefix) return prefix;

    ctx.addIssue({
      code: z.ZodIssueCode.invalid_enum_value,
      options: speakers,
      received: raw,
      message: `Invalid enum value. Expected ${speakers.map((s) => `'${s}'`).join(' | ')}, received '${raw}'`,
    });
    return z.NEVER;
  });
}

export function buildDialogueLineSchema(speakers: [string, ...string[]]) {
  return z.object({
    speaker: buildSpeakerSchema(speakers),
    text: z.string().min(1),
    ipa: z.string().min(1).optional(),
    keywords: z.array(z.string().min(1)).max(4).optional(),
    continuesStory: z.boolean().optional(),
  });
}

/** Loose schema for loading cached JSON — speaker validated at runtime when needed. */
export const DialogueLineSchema = z.object({
  speaker: z.string().min(1),
  text: z.string().min(1),
  ipa: z.string().min(1).optional(),
  keywords: z.array(z.string().min(1)).max(4).optional(),
  continuesStory: z.boolean().optional(),
});
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const PodcastMetadataSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  thumbnailText: z.string().min(1),
  thumbnailScene: z.string().min(1).optional(),
});
export type PodcastMetadata = z.infer<typeof PodcastMetadataSchema>;

export function buildScriptSectionResultSchema(speakers: [string, ...string[]]) {
  return z.object({
    script: z.array(buildDialogueLineSchema(speakers)).min(1),
  });
}

export function buildScriptSectionsOutlineSchema(sectionCount: number) {
  return z.object({
    sections: z.array(ScriptSectionSchema).length(sectionCount),
  });
}

export const ScriptSectionsOutlineSchema = z.object({
  sections: z.array(ScriptSectionSchema).min(1),
});
export type ScriptSectionsOutline = z.infer<typeof ScriptSectionsOutlineSchema>;

export const ScriptSectionResultSchema = z.object({
  script: z.array(DialogueLineSchema).min(1),
});

export const PodcastScriptSchema = PodcastMetadataSchema.extend({
  script: z.array(DialogueLineSchema).min(10),
  keywordsVersion: z.number().int().optional(),
});
export type PodcastScript = z.infer<typeof PodcastScriptSchema>;

export function buildPodcastScriptSchema(speakers: [string, ...string[]], minLines = 10) {
  return PodcastMetadataSchema.extend({
    script: z.array(buildDialogueLineSchema(speakers)).min(minLines),
    keywordsVersion: z.number().int().optional(),
  });
}

// ─── Short Script ────────────────────────────────────────────────────────────

export const ShortScriptSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  hook: z.string().min(1),
  thumbnailText: z.string().min(1),
  thumbnailScene: z.string().min(1).optional(),
  script: z.array(DialogueLineSchema).min(1).max(30),
  keywordsVersion: z.number().int().optional(),
});
export type ShortScript = z.infer<typeof ShortScriptSchema>;

export function buildShortScriptSchema(
  speakers: [string, ...string[]],
  minLines: number,
  maxLines: number,
) {
  return z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    hook: z.string().min(1),
    thumbnailText: z.string().min(1),
    thumbnailScene: z.string().min(1).optional(),
    script: z.array(buildDialogueLineSchema(speakers)).min(minLines).max(maxLines),
    keywordsVersion: z.number().int().optional(),
  });
}

// ─── Social Metadata ─────────────────────────────────────────────────────────

export const YouTubeChapterSchema = z.object({
  time: z.string().min(1),
  label: z.string().min(1),
});
export type YouTubeChapter = z.infer<typeof YouTubeChapterSchema>;

export const YouTubeMetadataSchema = z.object({
  title: z.string().min(1),
  titleVariants: z.array(z.string().min(1)).min(1).max(3),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1).max(15),
  chapters: z.array(YouTubeChapterSchema).min(3),
  pinnedComment: z.string().min(1),
  hashtags: z.array(z.string().min(1)).min(1).max(5),
});
export type YouTubeMetadata = z.infer<typeof YouTubeMetadataSchema>;

export const YouTubeShortMetadataSchema = z.object({
  title: z.string().min(1),
  caption: z.string().min(1),
  hashtags: z.array(z.string().min(1)).min(1).max(5),
  pinnedComment: z.string().min(1),
});
export type YouTubeShortMetadata = z.infer<typeof YouTubeShortMetadataSchema>;

export const FacebookMetadataSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string().min(1)).min(1).max(5),
  firstComment: z.string().min(1),
});
export type FacebookMetadata = z.infer<typeof FacebookMetadataSchema>;

export const FacebookShortMetadataSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string().min(1)).min(1).max(5),
  firstComment: z.string().min(1),
});
export type FacebookShortMetadata = z.infer<typeof FacebookShortMetadataSchema>;

export const SocialMetadataSchema = z.object({
  youtube: YouTubeMetadataSchema,
  youtubeShort: YouTubeShortMetadataSchema.optional(),
  facebook: FacebookMetadataSchema.optional(),
  facebookShort: FacebookShortMetadataSchema.optional(),
});
export type SocialMetadata = z.infer<typeof SocialMetadataSchema>;

export const SHORT_PAUSE_BETWEEN_SEGMENTS = 0.3;

// ─── Audio ───────────────────────────────────────────────────────────────────

export interface AudioSegment {
  index: number;
  speaker: Speaker;
  text: string;
  ipa?: string;
  keywords?: string[];
  filePath: string;
  duration: number;
  startTime: number;
  /** Silence after this segment before the next one (0 for the last segment). */
  pauseAfter: number;
}

export interface GenerateOptions {
  topic: string;
  channelId: string;
}

export const PAUSE_BETWEEN_SEGMENTS = 0.5;

// ─── Project ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  channelId: string;
  topic: string;
  title?: string;
  description?: string;
  thumbnailText?: string;
  createdAt: string;
  updatedAt: string;
}

export function asSpeakerTuple(speakers: string[]): [string, ...string[]] {
  if (speakers.length === 0) {
    throw new Error('Channel must define at least one host');
  }
  return speakers as [string, ...string[]];
}

export function getVoiceForSpeaker(ctx: ChannelContext, speaker: string): string {
  const voice = ctx.voiceMap[speaker];
  if (!voice) {
    throw new Error(`No voice mapping for speaker "${speaker}" on channel "${ctx.config.id}"`);
  }
  return voice;
}

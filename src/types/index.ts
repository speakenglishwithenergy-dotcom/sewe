import { z } from 'zod';

// ─── Speakers ────────────────────────────────────────────────────────────────

export const SpeakerSchema = z.enum(['Victor', 'Lisa']);
export type Speaker = z.infer<typeof SpeakerSchema>;

// ─── Podcast Script ──────────────────────────────────────────────────────────

export const DialogueLineSchema = z.object({
  speaker: SpeakerSchema,
  text: z.string().min(1),
  /** General American English IPA transcription of the spoken line */
  ipa: z.string().min(1).optional(),
});
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const PodcastMetadataSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  thumbnailText: z.string().min(1),
  thumbnailScene: z.string().min(1).optional(),
});
export type PodcastMetadata = z.infer<typeof PodcastMetadataSchema>;

export const ScriptSectionResultSchema = z.object({
  script: z.array(DialogueLineSchema).min(1),
});

export const PodcastScriptSchema = PodcastMetadataSchema.extend({
  script: z.array(DialogueLineSchema).min(10),
});
export type PodcastScript = z.infer<typeof PodcastScriptSchema>;

// ─── Short Script ────────────────────────────────────────────────────────────

export const ShortScriptSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  hook: z.string().min(1),
  thumbnailText: z.string().min(1),
  thumbnailScene: z.string().min(1).optional(),
  script: z.array(DialogueLineSchema).min(5).max(12),
});
export type ShortScript = z.infer<typeof ShortScriptSchema>;

// ─── Social Metadata (YouTube + Shorts) ──────────────────────────────────────

export const YouTubeChapterSchema = z.object({
  time: z.string().min(1),
  label: z.string().min(1),
});
export type YouTubeChapter = z.infer<typeof YouTubeChapterSchema>;

export const YouTubeMetadataSchema = z.object({
  title: z.string().min(1),
  titleVariants: z.array(z.string().min(1)).min(1).max(3),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).min(5).max(15),
  chapters: z.array(YouTubeChapterSchema).min(3),
  pinnedComment: z.string().min(1),
  hashtags: z.array(z.string().min(1)).min(3).max(5),
});
export type YouTubeMetadata = z.infer<typeof YouTubeMetadataSchema>;

export const YouTubeShortMetadataSchema = z.object({
  title: z.string().min(1),
  caption: z.string().min(1),
  hashtags: z.array(z.string().min(1)).min(3).max(5),
  pinnedComment: z.string().min(1),
});
export type YouTubeShortMetadata = z.infer<typeof YouTubeShortMetadataSchema>;

export const SocialMetadataSchema = z.object({
  youtube: YouTubeMetadataSchema,
  youtubeShort: YouTubeShortMetadataSchema.optional(),
});
export type SocialMetadata = z.infer<typeof SocialMetadataSchema>;

/** Silence duration in seconds between short-form audio segments */
export const SHORT_PAUSE_BETWEEN_SEGMENTS = 0.5;

// ─── Audio ───────────────────────────────────────────────────────────────────

export interface AudioSegment {
  index: number;
  speaker: Speaker;
  text: string;
  ipa?: string;
  filePath: string;
  /** Duration in seconds */
  duration: number;
  /** Absolute start time in seconds within the merged podcast audio */
  startTime: number;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface GenerateOptions {
  topic: string;
}

export const VOICE_MAP: Record<Speaker, string> = {
  Victor: 'M1',  // Supertonic male preset voice
  Lisa: 'F1',    // Supertonic female preset voice
};

/** Silence duration in seconds inserted between each audio segment */
export const PAUSE_BETWEEN_SEGMENTS = 0.5;

// ─── Project ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  topic: string;
  title?: string;
  description?: string;
  thumbnailText?: string;
  createdAt: string;
  updatedAt: string;
}

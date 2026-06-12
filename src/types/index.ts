import { z } from 'zod';

// ─── Speakers ────────────────────────────────────────────────────────────────

export const SpeakerSchema = z.enum(['Victor', 'Lisa']);
export type Speaker = z.infer<typeof SpeakerSchema>;

// ─── Podcast Script ──────────────────────────────────────────────────────────

export const DialogueLineSchema = z.object({
  speaker: SpeakerSchema,
  text: z.string().min(1),
});
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const PodcastScriptSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  thumbnailText: z.string().min(1),
  script: z.array(DialogueLineSchema).min(10),
});
export type PodcastScript = z.infer<typeof PodcastScriptSchema>;

// ─── Audio ───────────────────────────────────────────────────────────────────

export interface AudioSegment {
  index: number;
  speaker: Speaker;
  text: string;
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

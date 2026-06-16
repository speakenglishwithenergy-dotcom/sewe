import { z } from 'zod';
import {
  SubtitleColorsSchema,
  SubtitleStyleSchema,
  WaveVisualizerSchema,
} from '../channel/channel.types';

export const ShadowingBrandingSchema = z.object({
  subtitleColors: SubtitleColorsSchema,
  subtitleStyle: SubtitleStyleSchema.optional(),
  waveVisualizer: WaveVisualizerSchema.optional(),
});

export const ShadowingSpeakerSchema = z.object({
  name: z.string().min(1),
  voice: z.string().min(1),
});

export const ShadowingAssetsSchema = z.object({
  background: z.string().min(1),
});

export const ShadowingProfileSchema = z.object({
  name: z.string().min(1),
  speaker: ShadowingSpeakerSchema,
  branding: ShadowingBrandingSchema,
  assets: ShadowingAssetsSchema,
});

export type ShadowingProfile = z.infer<typeof ShadowingProfileSchema>;

export const ShadowingWorkspaceSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type ShadowingWorkspace = z.infer<typeof ShadowingWorkspaceSchema>;

export interface ShadowingContext {
  profile: ShadowingProfile;
  profileDir: string;
  speakerName: string;
  voiceName: string;
  backgroundPath: string;
}

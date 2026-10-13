import fs from 'fs/promises';
import { OpenAIService } from '../ai/openai.service';
import { buildEditGuidePrompt } from '../prompts/studio/edit-guide.prompt';
import { PodcastScript, AudioSegment } from '../types';
import { EditGuide, EditGuideSchema, Outline } from './studio.types';
import { StudioContext } from './studio.types';
import { logger } from '../utils/logger';

const SYSTEM_PROMPT =
  'You are a professional video editor. Respond only with valid JSON matching the requested structure exactly.';

function formatChapterTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export class StudioEditGuideService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly ctx: StudioContext,
  ) {}

  async generate(
    topic: string,
    outline: Outline,
    script: PodcastScript,
  ): Promise<EditGuide> {
    logger.info('Generating edit guide...');

    const guide = await this.openai.generateJSON(
      buildEditGuidePrompt(this.ctx, topic, outline, script),
      SYSTEM_PROMPT,
      (data) => EditGuideSchema.parse(data),
    );

    logger.success(`Edit guide ready — ${guide.scenes.length} scenes`);
    return guide;
  }

  refineTimestamps(guide: EditGuide, segments: AudioSegment[]): EditGuide {
    if (segments.length === 0) {
      return guide;
    }

    const scenes = guide.scenes.map((scene) => {
      const startLine = scene.lineRange[0];
      const endLine = Math.min(scene.lineRange[1], segments.length - 1);
      const startSegment = segments[Math.min(startLine, segments.length - 1)];
      const endSegment = segments[Math.min(endLine, segments.length - 1)];

      return {
        ...scene,
        estimatedStart: formatChapterTime(startSegment.startTime),
        estimatedEnd: formatChapterTime(
          endSegment.startTime + endSegment.duration + endSegment.pauseAfter,
        ),
      };
    });

    return { ...guide, scenes };
  }

  async load(path: string): Promise<EditGuide> {
    const raw = await fs.readFile(path, 'utf-8');
    return EditGuideSchema.parse(JSON.parse(raw));
  }

  async save(path: string, guide: EditGuide): Promise<void> {
    await fs.writeFile(path, JSON.stringify(guide, null, 2), 'utf-8');
    logger.success(`Edit guide saved → ${path}`);
  }
}

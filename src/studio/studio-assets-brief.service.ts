import fs from 'fs/promises';
import { OpenAIService } from '../ai/openai.service';
import { buildAssetsBriefPrompt } from '../prompts/studio/assets-brief.prompt';
import { PodcastScript } from '../types';
import { AssetsBrief, AssetsBriefSchema, EditGuide, Outline } from './studio.types';
import { StudioContext } from './studio.types';
import { logger } from '../utils/logger';

const SYSTEM_PROMPT =
  'You are a creative producer. Respond only with valid JSON matching the requested structure exactly.';

export class StudioAssetsBriefService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly ctx: StudioContext,
  ) {}

  async generate(
    topic: string,
    outline: Outline,
    script: PodcastScript,
    editGuide?: EditGuide,
  ): Promise<AssetsBrief> {
    logger.info('Generating assets brief...');

    const brief = await this.openai.generateJSON(
      buildAssetsBriefPrompt(this.ctx, topic, outline, script, editGuide),
      SYSTEM_PROMPT,
      (data) => AssetsBriefSchema.parse(data),
    );

    logger.success(
      `Assets brief ready — ${brief.thumbnails.length} thumbnails, ${brief.broll.length} B-roll items`,
    );

    return brief;
  }

  async load(path: string): Promise<AssetsBrief> {
    const raw = await fs.readFile(path, 'utf-8');
    return AssetsBriefSchema.parse(JSON.parse(raw));
  }

  async save(path: string, brief: AssetsBrief): Promise<void> {
    await fs.writeFile(path, JSON.stringify(brief, null, 2), 'utf-8');
    logger.success(`Assets brief saved → ${path}`);
  }
}

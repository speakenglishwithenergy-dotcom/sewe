import fs from 'fs/promises';
import { OpenAIService } from '../ai/openai.service';
import { buildOutlinePrompt } from '../prompts/studio/outline.prompt';
import { Outline, OutlineSchema } from './studio.types';
import { StudioContext } from './studio.types';
import { logger } from '../utils/logger';

const SYSTEM_PROMPT =
  'You are a content strategist. Respond only with valid JSON matching the requested structure exactly.';

export class StudioPlanningService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly ctx: StudioContext,
  ) {}

  async generateOutline(topic: string): Promise<Outline> {
    logger.info(`Generating outline for topic: "${topic}"`);

    const outline = await this.openai.generateJSON(
      buildOutlinePrompt(this.ctx, topic),
      SYSTEM_PROMPT,
      (data) => OutlineSchema.parse(data),
    );

    logger.success(
      `Outline ready — ${outline.sections.length} sections, viral angle: ${outline.viralAngle}`,
    );

    return outline;
  }

  async loadOutline(outlinePath: string): Promise<Outline> {
    const raw = await fs.readFile(outlinePath, 'utf-8');
    return OutlineSchema.parse(JSON.parse(raw));
  }

  async saveOutline(outlinePath: string, outline: Outline): Promise<void> {
    await fs.writeFile(outlinePath, JSON.stringify(outline, null, 2), 'utf-8');
    logger.success(`Outline saved → ${outlinePath}`);
  }
}

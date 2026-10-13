import { EditGuide, Outline, StudioContext, studioVoicesBlock } from '../../studio/studio.types';
import { PodcastScript } from '../../types';

export function buildAssetsBriefPrompt(
  ctx: StudioContext,
  topic: string,
  outline: Outline,
  script: PodcastScript,
  editGuide?: EditGuide,
): string {
  const { name, niche } = ctx.config;
  const voicesBlock = studioVoicesBlock(ctx);
  const scenesSummary = editGuide?.scenes
    .map((s) => `${s.sectionId}: ${s.visualNotes}`)
    .join('\n') ?? 'Infer from script.';

  return `You are a creative producer listing assets for a YouTube VIDEO edit.

Brand: "${name}" — ${niche}
${voicesBlock}

Topic: "${topic}"
Video title: "${script.title}"
Viral angle: ${outline.viralAngle}

EDIT GUIDE SCENES:
${scenesSummary}

List thumbnails, B-roll, music, props, graphics — with search keywords and AI gen prompts.

Return ONLY valid JSON matching the assets brief schema.`;
}

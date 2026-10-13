import { PodcastScript } from '../../types';
import { Outline, StudioContext, studioVoicesBlock } from '../../studio/studio.types';

export function buildEditGuidePrompt(
  ctx: StudioContext,
  topic: string,
  outline: Outline,
  script: PodcastScript,
): string {
  const { name, niche } = ctx.config;
  const voicesBlock = studioVoicesBlock(ctx);
  const scriptExcerpt = script.script
    .slice(0, 30)
    .map((line, i) => `${i + 1}. ${line.speaker}: ${line.text}`)
    .join('\n');

  const sectionIds = outline.sections.map((s) => s.id).join(', ');

  return `You are a video editor creating an edit guide for a YouTube video (final polished edit).

Brand: "${name}" — ${niche}
${voicesBlock}

Topic: "${topic}"
Video title: "${script.title}"
Viral angle: ${outline.viralAngle}

SCRIPT EXCERPT (first 30 spoken lines):
${scriptExcerpt}
${script.script.length > 30 ? `... (${script.script.length - 30} more lines)` : ''}

Create edit guide for the FINAL video (not the shadowing TTS draft).
One scene per script section: ${sectionIds}

Return ONLY valid JSON with scenes array (shotType, visualNotes, brollSuggestion, transitions, timing estimates).`;
}

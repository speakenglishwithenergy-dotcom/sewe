import { StudioContext, studioVoicesBlock, OutlineSchema } from '../../studio/studio.types';

export function buildOutlinePrompt(ctx: StudioContext, topic: string): string {
  const { name, niche, script } = ctx.config;
  const voicesBlock = studioVoicesBlock(ctx);
  const sectionTemplate = script.sections
    .map((s) => `- ${s.id}: ${s.label} (${s.lineCount} lines) — ${s.brief ?? 'adapt to topic'}`)
    .join('\n');

  return `You are a content strategist planning a SPOKEN VIDEO script (for shadowing + YouTube), NOT a podcast episode.

Brand: "${name}"
Niche: ${niche}
Script format: ${script.format}
Language level: ${script.languageLevel}

${voicesBlock}

Plan an outline for topic: "${topic}"

Section structure (adapt briefs to THIS topic and format — keep ids and line counts):
${sectionTemplate}

Think about:
- Hook angles for YouTube (first 30 seconds)
- Viral angle — what makes this different from generic content
- Section briefs = what SPOKEN LINES happen in each part (not podcast segments)
- 3 key takeaways the viewer can remember and shadow

Return ONLY valid JSON:
{
  "topic": "${topic}",
  "hookAngles": ["...", "...", "..."],
  "viralAngle": "one sentence",
  "sections": [
    { "id": "hook", "label": "Hook", "brief": "...", "lineCount": 10 }
  ],
  "keyTakeaways": ["...", "...", "..."]
}

Section ids must be: ${script.sections.map((s) => s.id).join(', ')}
Line counts must be: ${script.sections.map((s) => `${s.id}=${s.lineCount}`).join(', ')}`;
}

export const OutlineResultSchema = OutlineSchema;

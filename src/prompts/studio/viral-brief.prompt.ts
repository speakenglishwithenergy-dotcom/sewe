import { PodcastScript } from '../../types';
import {
  AssetsBrief,
  Outline,
  StudioContext,
  studioVoicesBlock,
} from '../../studio/studio.types';

export function buildViralBriefPrompt(
  ctx: StudioContext,
  topic: string,
  outline: Outline,
  script: PodcastScript,
  assetsBrief?: AssetsBrief,
  titleVariants?: string[],
): string {
  const { name, niche } = ctx.config;
  const voicesBlock = studioVoicesBlock(ctx);
  const firstLines = script.script
    .slice(0, 8)
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');

  const thumbnailConcepts = assetsBrief?.thumbnails
    .map((t) => t.concept)
    .join('; ') ?? 'Not generated yet';

  const titlesBlock = titleVariants?.length
    ? `Title variants to rank: ${titleVariants.join(' | ')}`
    : `Title: ${script.title}`;

  return `You are a YouTube growth strategist analyzing a SPOKEN VIDEO for viral potential.

Brand: "${name}" — ${niche}
${voicesBlock}

Topic: "${topic}"
Viral angle: ${outline.viralAngle}
${titlesBlock}

HOOK (first lines):
${firstLines}

Thumbnail concepts: ${thumbnailConcepts}

Analyze hook, titles, retention risks, SEO gaps, differentiation.
Disclaimer required: "LLM suggestions only — not a guarantee of viral performance."

Return ONLY valid JSON.`;
}

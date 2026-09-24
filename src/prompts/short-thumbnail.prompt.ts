import { ChannelContext } from '../channel/channel.types';
import {
  composeFreshThumbnailScene,
  isFreshEpisodeThumbnail,
  resolveShortLogoAnchor,
  type FreshThumbnailSceneParts,
} from './thumbnail.prompt';

export interface ShortThumbnailPromptInput {
  topic: string;
  episodeTitle: string;
  thumbnailText: string;
  thumbnailScene: string;
}

function getExpressionGuidance(ctx: ChannelContext): string {
  const thumb = ctx.config.branding.thumbnail;
  const parts = [
    thumb.topicRelevance,
    thumb.expressionModeration,
    thumb.charactersExpressionGuidance,
  ].filter(Boolean);
  return parts.join('\n\n');
}

function logoSpaceInstruction(): string {
  return `LOGO SPACE (critical):
- Leave BOTTOM LEFT as continuous desk/floor background — do NOT paint any dark circle, navy disc, badge plate, or empty logo placeholder there
- Leave TOP RIGHT as continuous background — do NOT paint any wordmark or channel name
- Official circular logo + wordmark PNGs are composited later onto clean background only
- Forbidden: blue/navy circular voids, empty medal shapes, fake logo frames`;
}

function ctrHeadlineInstruction(thumbnailText: string, headlineDesign?: string): string {
  const design =
    headlineDesign?.trim() ||
    `Paint a MAXIMUM-CTR stacked ALL-CAPS headline:
- Huge bold condensed type, high contrast
- Punch/quoted phrase in bright orange #FF7A00
- Perfect spelling; readable on a phone`;

  return `═══ CTR HEADLINE — PAINT THIS TEXT (exact spelling) ═══
"${thumbnailText}"

${design}`;
}

export function buildShortThumbnailImagePrompt(
  ctx: ChannelContext,
  input: ShortThumbnailPromptInput,
): string {
  const { topic, episodeTitle, thumbnailText, thumbnailScene } = input;
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;

  if (isFreshEpisodeThumbnail(ctx)) {
    return `Create a brand-new VERTICAL 9:16 short-form thumbnail for the "${name}" channel. Generate from scratch.

GOAL: maximum CTR on TikTok / YouTube Shorts.

CRITICAL ART STYLE: cute flat 2D CARTOON hosts only — NEVER photoreal or uncanny faces.

${logoSpaceInstruction()}

${ctrHeadlineInstruction(thumbnailText, thumb.headlineDesign)}
Place the headline in the UPPER portion (below the top-right wordmark space).

${thumb.charactersBlock ?? ''}
${thumb.characterColorReference ? `\n${thumb.characterColorReference}` : ''}

Art style: ${thumb.artStyle}
Brand colors: ${thumb.brandColors}

${thumb.freshnessRules ?? ''}

${thumb.ctrRules ?? ''}

Episode topic: "${topic}"
Do not paint episode title "${episodeTitle}" as a duplicate headline.

Art director brief:
${thumbnailScene}

${getExpressionGuidance(ctx)}

No watermarks. No channel logo. Spell CTR headline PERFECTLY. Cute cartoon only.`;
  }

  return `Create a brand-new VERTICAL 9:16 short-form thumbnail for the "${name}" channel. Generate from scratch.

CRITICAL ART STYLE: cute flat 2D CARTOON only — never photoreal / creepy faces.

${logoSpaceInstruction()}

${ctrHeadlineInstruction(thumbnailText, thumb.headlineDesign)}

Vertical 9:16 portrait composition with safe margins.
${thumb.charactersBlock ?? ''}
- Art style: ${thumb.artStyle}
- Brand colors: ${thumb.brandColors}

Episode topic: "${topic}"

${thumbnailScene}

${getExpressionGuidance(ctx)}

No watermarks. No channel logo. Spell CTR headline PERFECTLY. Cute cartoon only.`;
}

export function buildShortThumbnailScenePrompt(
  ctx: ChannelContext,
  topic: string,
  episodeTitle: string,
  thumbnailText: string,
): string {
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;

  if (isFreshEpisodeThumbnail(ctx)) {
    return `You are an art director for the "${name}" YouTube Short / TikTok channel.

Episode title: "${episodeTitle}"
Topic: "${topic}"
Thumbnail headline: "${thumbnailText}"

Design a SAME-STYLE vertical CTR refresh. Cute cartoon hosts + conflict beat.
The image model will paint the CTR headline — focus on the host conflict for this hook.
Logo PNGs are composited later — never describe drawing a logo.

${thumb.freshnessRules ?? ''}

${thumb.ctrRules ?? ''}

${thumb.topicRelevance ?? ''}
${thumb.expressionModeration ?? ''}
${thumb.charactersExpressionGuidance ?? ''}

Choose ONE light scene twist from:
${thumb.visualGenres ?? '- same studio desk with new topic props'}

Return ONLY valid JSON:
{
  "visualGenre": "short label",
  "colorMood": "subtle mood within the warm brand palette",
  "setting": "one sentence — vertical-friendly, still illustrated podcast world",
  "interaction": "one sentence — conflict / coaching gestures",
  "badgePlacement": "keep",
  "thumbnailScene": "2–4 sentences — topic props + focal action (no style change, no logo)"
}`;
  }

  return `You are an art director for the "${name}" YouTube Short / TikTok channel.

Episode title: "${episodeTitle}"
Topic: "${topic}"
Thumbnail headline: "${thumbnailText}"

Write ONLY the topic-specific visual scene for a VERTICAL 9:16 thumbnail.
Logo is composited later — never describe drawing a logo.

${thumb.topicRelevance ?? ''}
${thumb.expressionModeration ?? ''}
${thumb.charactersExpressionGuidance ?? ''}

Describe scene choices driven by topic "${topic}".

Return ONLY valid JSON:
{
  "thumbnailScene": "..."
}`;
}

export type { FreshThumbnailSceneParts };
export { composeFreshThumbnailScene };

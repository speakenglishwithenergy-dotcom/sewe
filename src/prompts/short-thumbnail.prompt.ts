import { ChannelContext } from '../channel/channel.types';
import {
  composeFreshThumbnailScene,
  isFreshEpisodeThumbnail,
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

export function buildShortThumbnailImagePrompt(
  ctx: ChannelContext,
  input: ShortThumbnailPromptInput,
): string {
  const { topic, episodeTitle, thumbnailText, thumbnailScene } = input;
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;

  if (isFreshEpisodeThumbnail(ctx)) {
    return `Edit the provided VERTICAL 9:16 reference thumbnail for the "${name}" channel.

CRITICAL: Keep the SAME illustration style, character designs, logo, and badge look as the reference.
Same-style episode refresh only — change topic content, not the art style.

${thumb.logoLockRules}

═══ KEEP MATCHING THE REFERENCE ═══

${thumb.shortLogoUnchanged}
${thumb.shortBadgeUnchanged}
${thumb.charactersBlock ?? ''}
${thumb.characterColorReference ? `\n${thumb.characterColorReference}` : ''}

Art style: ${thumb.artStyle}
Brand colors: ${thumb.brandColors}

═══ CHANGE FOR THIS EPISODE (content only) ═══

${thumb.freshnessRules ?? ''}

${thumb.ctrRules ?? ''}

Episode title: "${episodeTitle}"
Episode topic: "${topic}"

Headline — spell EXACTLY (preserve \\n line breaks), keep demo-like bold typography:
"${thumbnailText}"

Art director brief:
${thumbnailScene}

${getExpressionGuidance(ctx)}

Phone-screen readable, no watermarks, no meta labels, no extra text beyond the headline and existing badge.`;
  }

  return `Edit the provided reference thumbnail template for the "${name}" channel — VERTICAL 9:16 short-form format.

This is a STRICT TEMPLATE EDIT. Keep the vertical reference layout and branding identical. Only change the headline text and topic-specific context.

${thumb.logoLockRules}

KEEP UNCHANGED (match the provided vertical reference exactly):
- Vertical 9:16 portrait composition with safe margins
${thumb.shortLogoUnchanged}
${thumb.shortBadgeUnchanged}
${thumb.charactersBlock}
- Art style: ${thumb.artStyle}
- Brand colors: ${thumb.brandColors}

CHANGE ONLY — headline text at the top:

Episode title: "${episodeTitle}"

Replace the reference headline with this new stacked ALL-CAPS text (spell exactly, preserve \\n line breaks):
"${thumbnailText}"

CHANGE ONLY — topic context on the characters:

Episode topic: "${topic}"

${thumbnailScene}

${getExpressionGuidance(ctx)}

High contrast, readable on a phone screen, no watermarks, no extra text beyond what is specified.`;
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

Design a SAME-STYLE vertical refresh. Must still look like the channel's illustrated podcast hosts — only episode content changes.

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
  "interaction": "one sentence — Victor/Lisa gestures",
  "badgePlacement": "keep",
  "thumbnailScene": "2–4 sentences — topic props + focal action (no style change)"
}`;
  }

  return `You are an art director for the "${name}" YouTube Short / TikTok channel.

Episode title: "${episodeTitle}"
Topic: "${topic}"
Thumbnail headline: "${thumbnailText}"

The thumbnail uses a fixed VERTICAL 9:16 template. Write ONLY the topic-specific changes.

${thumb.topicRelevance ?? ''}
${thumb.expressionModeration ?? ''}
${thumb.charactersExpressionGuidance ?? ''}

Describe what to change from the default template — all choices driven by topic "${topic}".

Return ONLY valid JSON:
{
  "thumbnailScene": "..."
}`;
}

export type { FreshThumbnailSceneParts };
export { composeFreshThumbnailScene };

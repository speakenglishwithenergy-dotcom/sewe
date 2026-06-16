import { ChannelContext } from '../channel/channel.types';

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

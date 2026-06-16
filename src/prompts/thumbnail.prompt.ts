import { ChannelContext } from '../channel/channel.types';

export interface ThumbnailPromptInput {
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

export function buildThumbnailImagePrompt(ctx: ChannelContext, input: ThumbnailPromptInput): string {
  const { topic, episodeTitle, thumbnailText, thumbnailScene } = input;
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;

  return `Edit the provided reference thumbnail template for the "${name}" channel.

This is a STRICT TEMPLATE EDIT. Copy the reference image's fixed branding blocks exactly. Only replace (1) the left headline text and (2) host topic context.

${thumb.logoLockRules}

═══ DO NOT MODIFY — copy pixel-perfect from reference ═══

${thumb.logoUnchanged}

${thumb.badgeUnchanged}

ALSO UNCHANGED:
- Landscape 16:9 composition with safe margins — nothing touches frame edges
${thumb.charactersBlock}
- Desk layout: wooden table, mics on stands, succulent, open notebook with pen
- Art style: ${thumb.artStyle}
- Brand colors: ${thumb.brandColors}
${thumb.characterColorReference ? `- ${thumb.characterColorReference}` : ''}

═══ CHANGE ONLY — left headline (keep demo typography styles) ═══

Episode title: "${episodeTitle}"

Replace the demo title with this new stacked ALL-CAPS text (spell exactly, preserve \\n line breaks):
"${thumbnailText}"

═══ CHANGE ONLY — host scene context (right ~60%) ═══

Episode topic: "${topic}"
Every expression, gesture, prop, and scene detail below MUST connect to this topic.

${thumbnailScene}

${getExpressionGuidance(ctx)}

High contrast, readable at small size, no watermarks, no extra text beyond what is specified.`;
}

export function buildThumbnailScenePrompt(
  ctx: ChannelContext,
  topic: string,
  episodeTitle: string,
  thumbnailText: string,
): string {
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;

  return `You are an art director for the YouTube channel "${name}".

Episode title: "${episodeTitle}"
Topic: "${topic}"
Thumbnail headline: "${thumbnailText}"

The thumbnail uses a fixed template. Logo and badge are locked — never describe redrawing them. Write ONLY the host scene changes for this episode.

${thumb.topicRelevance ?? ''}

${thumb.expressionModeration ?? ''}

${thumb.charactersExpressionGuidance ?? ''}

Describe what to change from the default template — all choices driven by topic "${topic}":
- Host expressions + gestures tied to this topic
- One topic-specific visual metaphor
- Three book spine titles — short uppercase phrases about this episode
- Background/shelf accents that reflect this episode's topic

Do NOT describe host core appearance, mugs, mics, logo, badge, headline, or desk layout — those stay fixed.

Return ONLY valid JSON:
{
  "thumbnailScene": "..."
}`;
}

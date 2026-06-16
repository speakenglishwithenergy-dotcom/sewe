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

function buildOverlayTemplateThumbnailPrompt(
  ctx: ChannelContext,
  input: ThumbnailPromptInput,
): string {
  const { topic, episodeTitle, thumbnailText, thumbnailScene } = input;
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;

  return `Edit the provided reference thumbnail template for the "${name}" channel.

This is a STRICT TEMPLATE EDIT. Copy the reference image's fixed branding blocks exactly. Only replace (1) the left headline text, (2) the blurred workspace background photo, and (3) the host pose/expression on the right.

${thumb.logoLockRules}

═══ DO NOT MODIFY — copy pixel-perfect from reference ═══

${thumb.logoUnchanged}

${thumb.badgeUnchanged}

ALSO UNCHANGED:
- Landscape 16:9 composition with safe margins — nothing touches frame edges
${thumb.charactersBlock ? `${thumb.charactersBlock}` : ''}
- Art style: ${thumb.artStyle}
- Brand colors: ${thumb.brandColors}
${thumb.characterColorReference ? `- ${thumb.characterColorReference}` : ''}
- Episode tag brush-stroke style and badge icon row layout

═══ CHANGE ONLY — left headline (keep demo typography styles) ═══

Episode title: "${episodeTitle}"

Replace the demo title with this new stacked ALL-CAPS text (spell exactly, preserve \\n line breaks):
"${thumbnailText}"

═══ CHANGE ONLY — blurred workspace background + host context (right side) ═══

Episode topic: "${topic}"
Every background detail, expression, gesture, and prop below MUST connect to this topic.

${thumbnailScene}

${getExpressionGuidance(ctx)}

Heavy background blur (bokeh) so text stays readable. High contrast, readable at small size, no watermarks, no extra text beyond what is specified.`;
}

function buildPodcastHostsThumbnailPrompt(
  ctx: ChannelContext,
  input: ThumbnailPromptInput,
): string {
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
${thumb.charactersBlock ?? ''}
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

export function buildThumbnailImagePrompt(ctx: ChannelContext, input: ThumbnailPromptInput): string {
  const templateType = ctx.config.branding.thumbnail.templateType ?? 'podcast-hosts';
  if (templateType === 'overlay-template') {
    return buildOverlayTemplateThumbnailPrompt(ctx, input);
  }
  return buildPodcastHostsThumbnailPrompt(ctx, input);
}

export function buildThumbnailScenePrompt(
  ctx: ChannelContext,
  topic: string,
  episodeTitle: string,
  thumbnailText: string,
): string {
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;
  const templateType = thumb.templateType ?? 'podcast-hosts';

  if (templateType === 'overlay-template') {
    return `You are an art director for the YouTube channel "${name}".

Episode title: "${episodeTitle}"
Topic: "${topic}"
Thumbnail headline: "${thumbnailText}"

The thumbnail uses a fixed overlay template. Logo and badges are locked — never describe redrawing them. Write ONLY the topic-specific visual changes.

${thumb.topicRelevance ?? ''}

${thumb.expressionModeration ?? ''}

${thumb.charactersExpressionGuidance ?? ''}

Describe what to change from the default template — all choices driven by topic "${topic}":
- Blurred dev workspace photo (scene, desk props, monitor content, lighting mood)
- Alex's expression and pose on the right
- One small topic callout or accent if it fits the hook

Do NOT describe logo, badge icons, headline typography, brush-stroke shapes, or episode tag layout — those stay fixed.

Return ONLY valid JSON:
{
  "thumbnailScene": "..."
}`;
  }

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

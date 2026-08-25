import { ChannelContext } from '../channel/channel.types';

export interface ThumbnailPromptInput {
  topic: string;
  episodeTitle: string;
  thumbnailText: string;
  thumbnailScene: string;
}

export interface FreshThumbnailSceneParts {
  visualGenre: string;
  colorMood: string;
  setting: string;
  interaction: string;
  badgePlacement?: string;
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

function getHeadlineDesignBlock(ctx: ChannelContext): string {
  const design = ctx.config.branding.thumbnail.headlineDesign;
  return design?.trim() ? `\n${design.trim()}\n` : '';
}

export function isFreshEpisodeThumbnail(ctx: ChannelContext): boolean {
  return (ctx.config.branding.thumbnail.freshnessMode ?? 'template') === 'fresh-episode';
}

/** Flatten structured art-director JSON into one scene block for the image model. */
export function composeFreshThumbnailScene(parts: FreshThumbnailSceneParts): string {
  const lines = [
    `VISUAL GENRE: ${parts.visualGenre}`,
    `COLOR MOOD: ${parts.colorMood}`,
    `SETTING: ${parts.setting}`,
    `HOST INTERACTION: ${parts.interaction}`,
  ];
  if (parts.badgePlacement?.trim()) {
    lines.push(`BADGE: ${parts.badgePlacement.trim()}`);
  }
  lines.push('', parts.thumbnailScene.trim());
  return lines.join('\n');
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

═══ CHANGE ONLY — left headline (keep demo character/logo style) ═══

Episode title: "${episodeTitle}"

Replace the demo title with this stacked ALL-CAPS text (spell exactly, preserve \\n line breaks):
"${thumbnailText}"
${getHeadlineDesignBlock(ctx)}
═══ CHANGE ONLY — blurred workspace background + host context (right side) ═══

Episode topic: "${topic}"
Every background detail, expression, gesture, and prop below MUST connect to this topic.

${thumbnailScene}

${getExpressionGuidance(ctx)}

Heavy background blur (bokeh) so text stays readable. High contrast, readable at small size, no watermarks, no extra text beyond what is specified.`;
}

function buildPodcastHostsTemplatePrompt(
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

═══ CHANGE ONLY — left headline (keep demo character/logo style) ═══

Episode title: "${episodeTitle}"

Replace the demo title with this stacked ALL-CAPS text (spell exactly, preserve \\n line breaks):
"${thumbnailText}"
${getHeadlineDesignBlock(ctx)}
═══ CHANGE ONLY — host scene context (right ~60%) ═══

Episode topic: "${topic}"
Every expression, gesture, prop, and scene detail below MUST connect to this topic.

${thumbnailScene}

${getExpressionGuidance(ctx)}

High contrast, readable at small size, no watermarks, no extra text beyond what is specified.`;
}

function buildFreshEpisodeThumbnailPrompt(
  ctx: ChannelContext,
  input: ThumbnailPromptInput,
): string {
  const { topic, episodeTitle, thumbnailText, thumbnailScene } = input;
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;

  return `Edit the provided reference thumbnail for the "${name}" channel.

CRITICAL: Keep the SAME illustration style, character designs, logo, badge, desk-host composition, and brand look as the reference.
This is a SAME-STYLE episode refresh — change topic content so it feels like a NEW video, without changing the art style.

${thumb.logoLockRules}

═══ KEEP MATCHING THE REFERENCE ═══

${thumb.logoUnchanged}

${thumb.badgeUnchanged}

${thumb.charactersBlock ?? ''}
${thumb.characterColorReference ? `\n${thumb.characterColorReference}` : ''}

- Landscape 16:9 with safe margins
- Art style: ${thumb.artStyle}
- Brand colors: ${thumb.brandColors}
- Keep wooden-desk podcast-host framing similar to the reference (two hosts, mics OK)

═══ CHANGE FOR THIS EPISODE (content only) ═══

${thumb.freshnessRules ?? ''}

${thumb.ctrRules ?? ''}

Episode title: "${episodeTitle}"
Episode topic: "${topic}"

Replace the headline with this stacked ALL-CAPS text (spell exactly, preserve \\n line breaks):
"${thumbnailText}"
${getHeadlineDesignBlock(ctx)}
Art director brief (topic props + host beat only — do not change art style):
${thumbnailScene}

${getExpressionGuidance(ctx)}

No watermarks. No meta labels. No extra text beyond the headline (and the existing badge). Readable at small size.`;
}

export function buildThumbnailImagePrompt(ctx: ChannelContext, input: ThumbnailPromptInput): string {
  const templateType = ctx.config.branding.thumbnail.templateType ?? 'podcast-hosts';
  if (templateType === 'overlay-template') {
    return buildOverlayTemplateThumbnailPrompt(ctx, input);
  }
  if (isFreshEpisodeThumbnail(ctx)) {
    return buildFreshEpisodeThumbnailPrompt(ctx, input);
  }
  return buildPodcastHostsTemplatePrompt(ctx, input);
}

function buildFreshEpisodeScenePrompt(
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

Design a SAME-STYLE episode refresh. The final image must still look like the channel's illustrated podcast thumbnails (Victor + Lisa, flat digital illustration). Only the episode content should feel new.

${thumb.freshnessRules ?? ''}

${thumb.ctrRules ?? ''}

${thumb.topicRelevance ?? ''}

${thumb.expressionModeration ?? ''}

${thumb.charactersExpressionGuidance ?? ''}

Choose ONE light scene twist from this pack (same art world — not a new style):
${thumb.visualGenres ?? '- same studio desk with new topic props'}

LOCKED by the image model: logo, badge, character designs, illustration style.
CHANGE: host interaction, topic props, shelf/wall details, small accents.

Return ONLY valid JSON:
{
  "visualGenre": "short label from the pack",
  "colorMood": "subtle mood within the warm brand palette (e.g. warm daylight, soft evening lamps)",
  "setting": "one sentence — still a podcast/desk-friendly illustrated setting",
  "interaction": "one sentence — Victor and Lisa gestures for this hook",
  "badgePlacement": "keep-bottom-left",
  "thumbnailScene": "2–4 sentences: topic props + focal host beat (no style changes, no photo/3D/split panels)"
}`;
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

  if (isFreshEpisodeThumbnail(ctx)) {
    return buildFreshEpisodeScenePrompt(ctx, topic, episodeTitle, thumbnailText);
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

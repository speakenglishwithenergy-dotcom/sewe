import { ChannelContext } from '../channel/channel.types';
import type { LogoAnchor } from '../ai/logo-overlay.util';

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

export function resolvePodcastLogoAnchor(ctx: ChannelContext): LogoAnchor {
  return (
    ctx.config.branding.thumbnail.logoOverlay?.podcast?.anchor ??
    (ctx.config.branding.thumbnail.templateType === 'overlay-template'
      ? 'bottom-left'
      : 'top-right')
  );
}

export function resolveShortLogoAnchor(ctx: ChannelContext): LogoAnchor {
  return ctx.config.branding.thumbnail.logoOverlay?.short?.anchor ?? 'top-right';
}

export function resolveBackgroundLogoAnchor(ctx: ChannelContext): LogoAnchor {
  return (
    ctx.config.branding.thumbnail.logoOverlay?.background?.anchor ??
    (ctx.config.branding.thumbnail.templateType === 'overlay-template'
      ? 'top-left'
      : 'top-right')
  );
}

function logoSpaceInstruction(): string {
  return `LOGO SPACE (critical):
- Leave BOTTOM LEFT as continuous desk/floor/wall — do NOT paint any dark circle, navy disc, badge plate, or empty logo placeholder
- Leave TOP RIGHT as continuous background — do NOT paint any wordmark or channel name
- Official circular logo + wordmark PNGs are composited later onto clean background only
- Forbidden: blue/navy circular voids, empty medal shapes, fake logo frames, "Speak English With Energy" text`;
}

function ctrHeadlineInstruction(thumbnailText: string, headlineDesign?: string): string {
  const design =
    headlineDesign?.trim() ||
    `Paint a MAXIMUM-CTR YouTube headline on the LEFT ~40% of the frame:
- Huge ultra-bold condensed ALL-CAPS stacked lines
- High contrast: cream/white text on a dark navy rounded panel, OR navy text on cream with thick orange accents
- Put the punch / forbidden phrase (usually the quoted line) in bright orange #FF7A00 — larger/heavier than other lines
- Perfect spelling; crisp edges; no warped letters; readable at phone-grid size
- Optional: orange underline / brush stroke under the punch line`;

  return `═══ CTR HEADLINE — PAINT THIS TEXT IN THE IMAGE (exact spelling) ═══
Stack these lines with \\n breaks preserved:
"${thumbnailText}"

${design}

The headline is the #1 click magnet. Make it bigger and punchier than the characters.`;
}

function buildOverlayTemplateThumbnailPrompt(
  ctx: ChannelContext,
  input: ThumbnailPromptInput,
): string {
  const { topic, episodeTitle, thumbnailText, thumbnailScene } = input;
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;

  return `Create a brand-new YouTube thumbnail (16:9) for the "${name}" channel. Generate from scratch — there is no reference image.

${logoSpaceInstruction()}

${ctrHeadlineInstruction(thumbnailText, thumb.headlineDesign)}

Composition:
- Landscape 16:9 with safe margins
- LEFT: CTR headline (painted)
- RIGHT: host / topic visual
${thumb.charactersBlock ? `${thumb.charactersBlock}` : ''}
- Art style: ${thumb.artStyle}
- Brand colors: ${thumb.brandColors}
${thumb.characterColorReference ? `- ${thumb.characterColorReference}` : ''}

Episode topic: "${topic}" (context — do not paint the full episode title "${episodeTitle}" as a second headline)

${thumbnailScene}

${getExpressionGuidance(ctx)}

High contrast, readable at small size. No watermarks. No channel logo. Only the CTR headline text plus optional tiny prop marks.`;
}

function buildPodcastHostsTemplatePrompt(
  ctx: ChannelContext,
  input: ThumbnailPromptInput,
): string {
  const { topic, episodeTitle, thumbnailText, thumbnailScene } = input;
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;

  return `Create a brand-new YouTube thumbnail (16:9) for the "${name}" channel. Generate from scratch — there is no reference image.

CRITICAL ART STYLE: cute flat 2D CARTOON characters only — never photoreal / semi-real / creepy faces.

${logoSpaceInstruction()}

${ctrHeadlineInstruction(thumbnailText, thumb.headlineDesign)}

Composition:
- Landscape 16:9 cartoon podcast-desk framing
- LEFT: CTR headline (painted)
- RIGHT ~55%: hosts + topic props
${thumb.charactersBlock ?? ''}
- Desk: wooden table, mics, cozy podcast feel
- Art style: ${thumb.artStyle}
- Brand colors: ${thumb.brandColors}
${thumb.characterColorReference ? `- ${thumb.characterColorReference}` : ''}

Episode topic: "${topic}" (do not paint episode title "${episodeTitle}" as a duplicate headline)

${thumbnailScene}

${getExpressionGuidance(ctx)}

No watermarks. No channel logo. Cute cartoon only. Spell the CTR headline EXACTLY.`;
}

function buildFreshEpisodeThumbnailPrompt(
  ctx: ChannelContext,
  input: ThumbnailPromptInput,
): string {
  const { topic, episodeTitle, thumbnailText, thumbnailScene } = input;
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;

  return `Create a brand-new YouTube thumbnail (16:9) for the "${name}" channel. Generate from scratch — there is no reference image.

GOAL: maximum YouTube CTR — clickbait-clear in under 1 second at phone-grid size.

CRITICAL ART STYLE: cute flat 2D CARTOON / friendly animated characters only.
- Simple rounded cartoon faces, clean outlines, soft cel shading
- NEVER photorealistic, NEVER semi-realistic, NEVER uncanny-valley / creepy faces, NEVER 3D render

${logoSpaceInstruction()}

${ctrHeadlineInstruction(thumbnailText, thumb.headlineDesign)}

${thumb.charactersBlock ?? ''}
${thumb.characterColorReference ? `\n${thumb.characterColorReference}` : ''}

- Landscape 16:9 with safe margins
- Art style: ${thumb.artStyle}
- Brand colors: ${thumb.brandColors}
- Hosts + props on the RIGHT; CTR headline dominates the LEFT

${thumb.freshnessRules ?? ''}

${thumb.ctrRules ?? ''}

Episode topic: "${topic}"
Do NOT paint the full episode title "${episodeTitle}" as a second headline — only the CTR stack above.

Art director brief (topic props + host beat):
${thumbnailScene}

${getExpressionGuidance(ctx)}

No watermarks. No channel logo / wordmark. Spell every CTR headline letter PERFECTLY. Friendly cute cartoon only.`;
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

Design a SAME-STYLE episode refresh. The final image must still look like the channel's illustrated podcast thumbnails (flat digital illustration hosts). Only the episode content should feel new.

CLICKBAIT VISUAL BEAT (required):
- ONE clear conflict — shock / stop / pointing at WRONG — not two people smiling
- Topic props readable at phone-grid size (red X, failed checklist, sticky WRONG)

${thumb.freshnessRules ?? ''}

${thumb.ctrRules ?? ''}

${thumb.topicRelevance ?? ''}

${thumb.expressionModeration ?? ''}

${thumb.charactersExpressionGuidance ?? ''}

Choose ONE light scene twist from this pack (same art world — not a new style):
${thumb.visualGenres ?? '- same studio desk with new topic props'}

Logo PNGs are composited later — never describe drawing a channel logo.
The image model will ALSO paint the CTR headline from thumbnailText on the LEFT — focus your scene JSON on the RIGHT-side conflict beat + props.
CHANGE: host interaction, topic props, shelf/wall details, small accents.

Return ONLY valid JSON:
{
  "visualGenre": "short label from the pack",
  "colorMood": "subtle mood within the warm brand palette (e.g. warm daylight, soft evening lamps)",
  "setting": "one sentence — still a podcast/desk-friendly illustrated setting",
  "interaction": "one sentence — CONFLICT beat between hosts for this hook (not matching smiles)",
  "badgePlacement": "keep-bottom-left",
  "thumbnailScene": "2–4 sentences: topic props + focal conflict beat (no style changes, no photo/3D/split panels, no logo)"
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

Write ONLY the topic-specific visual scene. Logo will be composited later — never describe drawing it.

${thumb.topicRelevance ?? ''}

${thumb.expressionModeration ?? ''}

${thumb.charactersExpressionGuidance ?? ''}

Describe scene choices driven by topic "${topic}":
- Blurred / atmospheric workspace background
- Host expression and pose
- One small topic callout or accent if it fits the hook

Do NOT describe channel logo or wordmark.

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

Write ONLY the host scene changes for this episode. Logo will be composited later — never describe drawing it.

${thumb.topicRelevance ?? ''}

${thumb.expressionModeration ?? ''}

${thumb.charactersExpressionGuidance ?? ''}

Describe scene choices driven by topic "${topic}":
- Host expressions + gestures tied to this topic
- One topic-specific visual metaphor
- Background/shelf accents that reflect this episode's topic

Do NOT describe channel logo or wordmark.

Return ONLY valid JSON:
{
  "thumbnailScene": "..."
}`;
}

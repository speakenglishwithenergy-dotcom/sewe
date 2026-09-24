import { ChannelContext } from '../channel/channel.types';
import { resolveBackgroundLogoAnchor } from './thumbnail.prompt';
import type { LogoAnchor } from '../ai/logo-overlay.util';

export interface BackgroundPromptInput {
  topic: string;
  episodeTitle: string;
  thumbnailScene: string;
}

function getTopicGuidance(ctx: ChannelContext): string {
  const thumb = ctx.config.branding.thumbnail;
  return thumb.topicRelevance ?? '';
}

function logoSpaceInstruction(anchor: LogoAnchor): string {
  const region: Record<LogoAnchor, string> = {
    'top-left': 'TOP LEFT',
    'top-right': 'TOP RIGHT',
    'top-center': 'TOP CENTER',
    'bottom-left': 'BOTTOM LEFT',
    'bottom-right': 'BOTTOM RIGHT',
  };
  return `LOGO SPACE (critical): Leave a clear empty area near ${region[anchor]} for the official channel logo. Do NOT draw any logo or wordmark — a real logo PNG will be composited after generation.`;
}

export function buildBackgroundImagePrompt(ctx: ChannelContext, input: BackgroundPromptInput): string {
  const { topic, episodeTitle, thumbnailScene } = input;
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;
  const logoAnchor = resolveBackgroundLogoAnchor(ctx);

  return `Create a brand-new 16:9 video background for the "${name}" channel. Generate from scratch — there is no reference image.

${logoSpaceInstruction(logoAnchor)}

Composition:
- Landscape 16:9 with safe margins for overlays/subtitles
- Blurred atmospheric workspace / scene related to the episode
- Optional title treatment for: "${episodeTitle}"
${thumb.titleChangeBlock ? `\n${thumb.titleChangeBlock}` : ''}

- Art style: ${thumb.artStyle}
- Brand colors: ${thumb.brandColors}

Episode topic: "${topic}"
Every background detail MUST connect to this topic.

${thumbnailScene}

${getTopicGuidance(ctx)}

Heavy background blur (bokeh) so text overlays stay readable. Moody readable grade. No watermarks. No channel logo. No extra text beyond what is specified.`;
}

export function buildBackgroundScenePrompt(
  ctx: ChannelContext,
  topic: string,
  episodeTitle: string,
): string {
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;

  return `You are an art director for the YouTube channel "${name}".

Episode title: "${episodeTitle}"
Topic: "${topic}"

Write ONLY the blurred workspace / background photo changes for this episode.
Logo is composited later — never describe drawing a logo.

${thumb.topicRelevance ?? ''}

Describe scene choices driven by topic "${topic}":
- Specific workspace / setting (desk, monitors, props, lighting)
- What appears on screens or desk items that hint at the topic
- Mood and color accents (still on-brand)

Do NOT describe channel logo or wordmark.

Return ONLY valid JSON:
{
  "thumbnailScene": "..."
}`;
}

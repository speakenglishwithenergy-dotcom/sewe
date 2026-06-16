import { ChannelContext } from '../channel/channel.types';

export interface BackgroundPromptInput {
  topic: string;
  episodeTitle: string;
  thumbnailScene: string;
}

function getTopicGuidance(ctx: ChannelContext): string {
  const thumb = ctx.config.branding.thumbnail;
  return thumb.topicRelevance ?? '';
}

export function buildBackgroundImagePrompt(ctx: ChannelContext, input: BackgroundPromptInput): string {
  const { topic, episodeTitle, thumbnailScene } = input;
  const { name, branding } = ctx.config;
  const thumb = branding.thumbnail;

  return `Edit the provided reference video-background template for the "${name}" channel.

This is a STRICT TEMPLATE EDIT. Copy every fixed branding overlay exactly from the reference. Only replace (1) the blurred workspace photo, (2) the episode title text, and (3) the episode number.

${thumb.logoLockRules}

═══ DO NOT MODIFY — copy pixel-perfect from reference ═══

${thumb.backgroundUnchanged ?? thumb.logoUnchanged}

${thumb.badgeUnchanged}

ALSO UNCHANGED:
- Landscape 16:9 composition with safe margins — nothing touches frame edges
- Art style: ${thumb.artStyle}
- Brand colors: ${thumb.brandColors}
- All brush-stroke shapes, glows, icon positions, and typography styles

═══ CHANGE ONLY — top-right title banner (keep brush-stroke style) ═══

Episode title: "${episodeTitle}"

${thumb.titleChangeBlock ?? 'Replace the demo title text with the episode title above — keep the exact banner shape and typography from the reference.'}

═══ CHANGE ONLY — blurred workspace background photo ═══

Episode topic: "${topic}"
Every background detail below MUST connect to this topic.

${thumbnailScene}

${getTopicGuidance(ctx)}

Heavy background blur (bokeh) so overlays stay readable. Moody teal/navy color grade. No watermarks, no extra text beyond what is specified.`;
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

The video background uses a fixed overlay template (logo, badges, title banner). Write ONLY the blurred workspace photo changes for this episode.

${thumb.topicRelevance ?? ''}

Describe what to change from the default template — all choices driven by topic "${topic}":
- Specific dev workspace scene (desk setup, monitors, props, lighting)
- What appears on screens or desk items that hint at the topic
- Mood and color accents in the photo (still teal/navy graded)

Do NOT describe logo, badges, title banner shapes, episode tag layout, or bottom bar — those stay fixed.

Return ONLY valid JSON:
{
  "thumbnailScene": "..."
}`;
}

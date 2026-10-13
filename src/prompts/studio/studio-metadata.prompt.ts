import { PUBLISH_LIMITS } from '../../social/publish.limits';
import { PodcastScript } from '../../types';
import { StudioContext, studioVoicesBlock } from '../../studio/studio.types';

function formatScriptExcerpt(script: PodcastScript, maxLines = 40): string {
  const lines = script.script.slice(0, maxLines);
  const excerpt = lines.map((line) => `${line.speaker}: ${line.text}`).join('\n');
  const truncated =
    script.script.length > maxLines
      ? `\n... (${script.script.length - maxLines} more lines)`
      : '';
  return excerpt + truncated;
}

export function buildStudioYouTubeMetadataPrompt(
  ctx: StudioContext,
  podcastScript: PodcastScript,
  topic: string,
): string {
  const { name, niche } = ctx.config;
  const pub = ctx.publish;
  const voicesBlock = studioVoicesBlock(ctx);

  return `You are a YouTube SEO specialist for "${name}" — ${niche}.
${voicesBlock}

Create metadata for a SPOKEN VIDEO (not a podcast upload).

Topic: "${topic}"
Video title draft: "${podcastScript.title}"

SCRIPT EXCERPT:
${formatScriptExcerpt(podcastScript)}

CHANNEL STANDARD (enforced automatically):
- Core tags: ${pub.coreTags.join(', ')}
- Core hashtags: ${pub.coreHashtags.join(', ')}
- Title suffix: "${pub.titleSuffix}"
- Chapter labels: ${pub.chapterLabels.map((l) => `"${l}"`).join(', ')}

RULES:
- title: max ${pub.titleBaseMax} chars, CTR-optimized
- titleVariants: 2 alternatives
- tags: up to ${PUBLISH_LIMITS.youtubeTagsMax - pub.coreTags.length} episode tags
- chapters: exactly ${pub.chapterLabels.length}
- pinnedComment: engaging question, no URLs

Return ONLY valid JSON.`;
}

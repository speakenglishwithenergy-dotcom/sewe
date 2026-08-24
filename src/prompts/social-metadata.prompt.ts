import { ChannelContext, ScriptSectionDef } from '../channel/channel.types';
import { PodcastScript, ShortScript } from '../types';
import { getChapterLabels } from '../script/sections.util';
import { PUBLISH_LIMITS } from '../social/publish.limits';

function formatScriptExcerpt(script: PodcastScript, maxLines = 40): string {
  const lines = script.script.slice(0, maxLines);
  const excerpt = lines.map((line) => `${line.speaker}: ${line.text}`).join('\n');
  const truncated = script.script.length > maxLines ? `\n... (${script.script.length - maxLines} more lines)` : '';
  return excerpt + truncated;
}

function hostsDescription(ctx: ChannelContext): string {
  return ctx.config.hosts.map((h) => h.name).join(' and ');
}

export function buildYouTubeMetadataPrompt(
  ctx: ChannelContext,
  podcastScript: PodcastScript,
  topic: string,
  sections?: ScriptSectionDef[],
): string {
  const { name, niche, script } = ctx.config;
  const pub = ctx.publish;
  const chapterLabels = sections ? getChapterLabels(sections) : [...pub.chapterLabels];

  return `You are a YouTube SEO specialist for the channel "${name}" — ${niche}, hosted by ${hostsDescription(ctx)}.

Create publish-ready YouTube metadata for this episode.

Topic: "${topic}"
Episode title: "${podcastScript.title}"
Current description draft: "${podcastScript.description}"

SCRIPT EXCERPT:
${formatScriptExcerpt(podcastScript)}

AUDIENCE: ${niche} (${script.languageLevel}).

CHANNEL STANDARD (enforced automatically — do not duplicate in your output):
- Core tags always prepended: ${pub.coreTags.join(', ')}
- Core hashtags always prepended: ${pub.coreHashtags.join(', ')}
- Podcast title suffix always appended: "${pub.titleSuffix}"
- Description layout is rebuilt from your hook, bullets, and chapters — fixed sections:
  "${pub.description.learnHeader}", "${pub.description.chaptersHeader}",
  "${pub.description.subscribeCta}", "${pub.description.shortCta}",
  "${pub.description.linksHeader}" with YouTube (${pub.youtubeChannelUrl}), Facebook (${pub.facebookPageUrl}), and TikTok (${pub.tiktokChannelUrl}) links

RULES:
- "title": MUST be exactly "${topic}" — do not rephrase or shorten it (suffix added automatically)
- "titleVariants": 2 alternative titles based on the same topic (suffix added automatically)
- "tags": up to ${PUBLISH_LIMITS.youtubeTagsMax - pub.coreTags.length} episode-specific tags (lowercase, no #)
- "chapters": exactly ${chapterLabels.length} entries with labels ${chapterLabels.map((l) => `"${l}"`).join(', ')}
- "pinnedComment": one engaging question (1–2 sentences). Do not include URLs.
- "hashtags": 1–3 episode-specific hashtags with # prefix

Return ONLY a valid JSON object (no markdown):
{
  "title": "...",
  "titleVariants": ["...", "..."],
  "description": "...",
  "tags": ["..."],
  "chapters": [{ "time": "0:00", "label": "Intro" }],
  "pinnedComment": "...",
  "hashtags": ["#..."]
}`;
}

export function buildYouTubeShortMetadataPrompt(
  ctx: ChannelContext,
  shortScript: ShortScript,
  podcastScript: PodcastScript,
  topic: string,
): string {
  const { name } = ctx.config;
  const pub = ctx.publish;
  const shortLines = shortScript.script
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');

  return `You are a YouTube Shorts SEO specialist for "${name}".

Topic: "${topic}"
Podcast title: "${podcastScript.title}"
Short title draft: "${shortScript.title}"
Short hook: "${shortScript.hook}"

SHORT SCRIPT:
${shortLines}

CHANNEL STANDARD (enforced automatically):
- Core Short hashtags always prepended: ${pub.shortCoreHashtags.join(', ')}
- Platform links appended to exported caption automatically

RULES:
- "title": max ${PUBLISH_LIMITS.youtubeShortTitleMax} characters
- "caption": ≤${PUBLISH_LIMITS.shortCaptionMaxChars} chars — hook + takeaway, NO hashtags inside
- "hashtags": 1–2 episode-specific hashtags
- "pinnedComment": short question or CTA. Do not include URLs.

Return ONLY a valid JSON object (no markdown):
{
  "title": "...",
  "caption": "...",
  "hashtags": ["#..."],
  "pinnedComment": "..."
}`;
}

export function buildFacebookMetadataPrompt(
  ctx: ChannelContext,
  podcastScript: PodcastScript,
  topic: string,
): string {
  const { name, niche, script } = ctx.config;
  const pub = ctx.publish;

  return `You are a Facebook Page content specialist for "${name}" — ${niche}, hosted by ${hostsDescription(ctx)}.

Topic: "${topic}"
Episode title: "${podcastScript.title}"

SCRIPT EXCERPT:
${formatScriptExcerpt(podcastScript)}

CHANNEL STANDARD (enforced automatically):
- Core hashtags: ${pub.facebookCoreHashtags.join(', ')}
- Fixed sections: "${pub.facebook.learnHeader}", follow/youtube/tiktok CTAs

RULES:
- "caption": hook + learn block only (no CTAs, no hashtags, no URLs)
- "hashtags": 1–3 episode-specific hashtags
- "firstComment": engaging question. Do not include URLs.
- Audience: ${script.languageLevel}

Return ONLY a valid JSON object (no markdown):
{
  "caption": "...",
  "hashtags": ["#..."],
  "firstComment": "..."
}`;
}

export function buildFacebookShortMetadataPrompt(
  ctx: ChannelContext,
  shortScript: ShortScript,
  podcastScript: PodcastScript,
  topic: string,
): string {
  const { name } = ctx.config;
  const pub = ctx.publish;
  const shortLines = shortScript.script
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');

  return `You are a Facebook Reels content specialist for "${name}".

Topic: "${topic}"
Short hook: "${shortScript.hook}"

SHORT SCRIPT:
${shortLines}

CHANNEL STANDARD (enforced automatically):
- Core Reel hashtags: ${pub.facebookShortCoreHashtags.join(', ')}

RULES:
- "caption": ≤${PUBLISH_LIMITS.facebookShortCaptionMaxChars} chars — hook + takeaway, NO hashtags
- "hashtags": 1–2 episode-specific hashtags
- "firstComment": short question or CTA. Do not include URLs.

Return ONLY a valid JSON object (no markdown):
{
  "caption": "...",
  "hashtags": ["#..."],
  "firstComment": "..."
}`;
}

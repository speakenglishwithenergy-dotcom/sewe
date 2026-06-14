import { PodcastScript, ShortScript } from '../types';
import { CHANNEL_NAME } from './script.prompt';
import {
  PUBLISH_CHAPTER_LABELS,
  PUBLISH_CORE_HASHTAGS,
  PUBLISH_CORE_TAGS,
  PUBLISH_DESCRIPTION,
  PUBLISH_FACEBOOK,
  PUBLISH_FACEBOOK_CORE_HASHTAGS,
  PUBLISH_FACEBOOK_PAGE_URL,
  PUBLISH_LIMITS,
  PUBLISH_SHORT_CORE_HASHTAGS,
  PUBLISH_YOUTUBE_CHANNEL_URL,
  PUBLISH_YOUTUBE_TITLE_BASE_MAX,
  PUBLISH_YOUTUBE_TITLE_SUFFIX,
} from '../social/publish.config';

function formatScriptExcerpt(script: PodcastScript, maxLines = 40): string {
  const lines = script.script.slice(0, maxLines);
  const excerpt = lines.map((line) => `${line.speaker}: ${line.text}`).join('\n');
  const truncated = script.script.length > maxLines ? `\n... (${script.script.length - maxLines} more lines)` : '';
  return excerpt + truncated;
}

export function buildYouTubeMetadataPrompt(podcastScript: PodcastScript, topic: string): string {
  return `You are a YouTube SEO specialist for the channel "${CHANNEL_NAME}" — an English learning podcast hosted by Victor and Lisa.

Create publish-ready YouTube metadata for this episode.

Topic: "${topic}"
Episode title: "${podcastScript.title}"
Current description draft: "${podcastScript.description}"

SCRIPT EXCERPT:
${formatScriptExcerpt(podcastScript)}

AUDIENCE: English learners (A2–B1), self-improvement fans, people who want practical speaking tips.

CHANNEL STANDARD (enforced automatically — do not duplicate in your output):
- Core tags always prepended: ${PUBLISH_CORE_TAGS.join(', ')}
- Core hashtags always prepended: ${PUBLISH_CORE_HASHTAGS.join(', ')}
- Podcast title suffix always appended: "${PUBLISH_YOUTUBE_TITLE_SUFFIX}" (do not include in your title output)
- Description layout is rebuilt from your hook, bullets, and chapters — fixed sections:
  "${PUBLISH_DESCRIPTION.learnHeader}", "${PUBLISH_DESCRIPTION.chaptersHeader}",
  "${PUBLISH_DESCRIPTION.subscribeCta}", "${PUBLISH_DESCRIPTION.shortCta}",
  "${PUBLISH_DESCRIPTION.linksHeader}" with YouTube (${PUBLISH_YOUTUBE_CHANNEL_URL}) and Facebook (${PUBLISH_FACEBOOK_PAGE_URL}) links

DESCRIPTION CONTENT (use \\n for line breaks inside the JSON string):
1. HOOK — first 1–2 lines, ≤${PUBLISH_LIMITS.hookMaxChars} characters, front-load main keyword (e.g. "learn English", "English fluency")
2. Blank line
3. "${PUBLISH_DESCRIPTION.learnHeader}" + exactly 3 bullet takeaways (• prefix)

RULES:
- "title": keep or slightly improve the episode title, max ${PUBLISH_YOUTUBE_TITLE_BASE_MAX} characters (suffix added automatically), keyword-rich
- "titleVariants": 2 alternative titles for A/B testing, same max length (suffix added automatically)
- "tags": up to ${PUBLISH_LIMITS.youtubeTagsMax - PUBLISH_CORE_TAGS.length} episode-specific YouTube tags (lowercase, no #). Core channel tags are added automatically.
- "chapters": exactly 5 entries with labels ${PUBLISH_CHAPTER_LABELS.map((l) => `"${l}"`).join(', ')} — estimate timestamps for an ~8–10 min episode
- "pinnedComment": one engaging question to spark comments (1–2 sentences, include emoji). Channel links are added automatically — do not include URLs.
- "hashtags": 1–3 episode-specific hashtags with # prefix (core channel hashtags added automatically)
- Tone: warm, encouraging, professional — not clickbait

Return ONLY a valid JSON object (no markdown):
{
  "title": "...",
  "titleVariants": ["...", "..."],
  "description": "...",
  "tags": ["mental blocks", "..."],
  "chapters": [{ "time": "0:00", "label": "Intro" }, ...],
  "pinnedComment": "...",
  "hashtags": ["#EnglishFluency", "..."]
}`;
}

export function buildYouTubeShortMetadataPrompt(
  shortScript: ShortScript,
  podcastScript: PodcastScript,
  topic: string,
): string {
  const shortLines = shortScript.script
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');

  return `You are a YouTube Shorts SEO specialist for "${CHANNEL_NAME}".

Create publish-ready metadata for this Short derived from the full podcast episode.

Topic: "${topic}"
Podcast title: "${podcastScript.title}"
Short title draft: "${shortScript.title}"
Short hook: "${shortScript.hook}"

SHORT SCRIPT:
${shortLines}

AUDIENCE: English learners scrolling Shorts — need instant hook + value.

CHANNEL STANDARD (enforced automatically):
- Core Short hashtags always prepended: ${PUBLISH_SHORT_CORE_HASHTAGS.join(', ')}
- YouTube (${PUBLISH_YOUTUBE_CHANNEL_URL}) and Facebook (${PUBLISH_FACEBOOK_PAGE_URL}) links appended to the exported caption automatically

RULES:
- "title": scroll-stopping, max ${PUBLISH_LIMITS.youtubeShortTitleMax} characters, different angle from podcast title
- "caption": 1–2 sentences (≤${PUBLISH_LIMITS.shortCaptionMaxChars} chars) — hook + one concrete takeaway, NO hashtags inside
- "hashtags": 1–2 episode-specific hashtags with # prefix (core channel hashtags added automatically)
- "pinnedComment": short question or CTA to drive comments (1 sentence, emoji ok). Do not include URLs — links are added automatically.
- Tone: direct, energetic, speak to viewer as "you"

Return ONLY a valid JSON object (no markdown):
{
  "title": "...",
  "caption": "...",
  "hashtags": ["#EnglishTips", "#BreakThrough"],
  "pinnedComment": "..."
}`;
}

export function buildFacebookMetadataPrompt(podcastScript: PodcastScript, topic: string): string {
  return `You are a Facebook Page content specialist for "${CHANNEL_NAME}" — an English learning podcast hosted by Victor and Lisa.

Create publish-ready Facebook post copy for uploading the full podcast video to the Fanpage.

Topic: "${topic}"
Episode title: "${podcastScript.title}"
Current description draft: "${podcastScript.description}"

SCRIPT EXCERPT:
${formatScriptExcerpt(podcastScript)}

AUDIENCE: English learners (A2–B1), self-improvement fans, people who want practical speaking tips.

CHANNEL STANDARD (enforced automatically — do not duplicate in your output):
- Core hashtags always prepended: ${PUBLISH_FACEBOOK_CORE_HASHTAGS.join(', ')}
- Post layout is rebuilt from your hook and bullets — fixed sections:
  "${PUBLISH_FACEBOOK.learnHeader}", "${PUBLISH_FACEBOOK.followCta}", "${PUBLISH_FACEBOOK.youtubeCta}"
- No chapters block — Facebook posts do not use timestamps

CAPTION CONTENT (use \\n for line breaks inside the JSON string):
1. HOOK — first 1–2 lines, ≤${PUBLISH_LIMITS.hookMaxChars} characters, front-load main keyword (e.g. "learn English", "English fluency")
2. Blank line
3. "${PUBLISH_FACEBOOK.learnHeader}" + exactly 3 bullet takeaways (• prefix)

RULES:
- "caption": hook + learn block only (no CTAs, no hashtags, no URLs — those are added automatically)
- "hashtags": 1–3 episode-specific hashtags with # prefix (core channel hashtags added automatically)
- "firstComment": one engaging question to spark comments (1–2 sentences, include emoji). Do not include URLs.
- Tone: warm, conversational, native to Facebook — not clickbait, not YouTube-style "Subscribe"

Return ONLY a valid JSON object (no markdown):
{
  "caption": "...",
  "hashtags": ["#EnglishFluency", "..."],
  "firstComment": "..."
}`;
}

export function buildFacebookShortMetadataPrompt(
  shortScript: ShortScript,
  podcastScript: PodcastScript,
  topic: string,
): string {
  const shortLines = shortScript.script
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');

  return `You are a Facebook Reels content specialist for "${CHANNEL_NAME}".

Create publish-ready metadata for this Reel derived from the full podcast episode.

Topic: "${topic}"
Podcast title: "${podcastScript.title}"
Short title draft: "${shortScript.title}"
Short hook: "${shortScript.hook}"

SHORT SCRIPT:
${shortLines}

AUDIENCE: English learners scrolling Reels — need instant hook + value.

CHANNEL STANDARD (enforced automatically):
- Core Reel hashtags always prepended: #LearnEnglish, #Reels
- YouTube (${PUBLISH_YOUTUBE_CHANNEL_URL}) link appended to the exported caption automatically

RULES:
- "caption": 1–2 sentences (≤${PUBLISH_LIMITS.facebookShortCaptionMaxChars} chars) — hook + one concrete takeaway, NO hashtags inside
- "hashtags": 1–2 episode-specific hashtags with # prefix (core channel hashtags added automatically)
- "firstComment": short question or CTA to drive comments (1 sentence, emoji ok). Do not include URLs.
- Tone: direct, energetic, speak to viewer as "you"

Return ONLY a valid JSON object (no markdown):
{
  "caption": "...",
  "hashtags": ["#EnglishTips", "#BreakThrough"],
  "firstComment": "..."
}`;
}

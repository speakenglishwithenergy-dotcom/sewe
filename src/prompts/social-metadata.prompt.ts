import { PodcastScript, ShortScript } from '../types';
import { CHANNEL_NAME } from './script.prompt';
import {
  PUBLISH_CORE_HASHTAGS,
  PUBLISH_CORE_TAGS,
  PUBLISH_DESCRIPTION,
  PUBLISH_LIMITS,
  PUBLISH_SHORT_CORE_HASHTAGS,
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

DESCRIPTION STRUCTURE (use \\n for line breaks inside the JSON string):
1. HOOK — first 1–2 lines, ≤${PUBLISH_LIMITS.hookMaxChars} characters total, front-load main keyword (e.g. "learn English", "English fluency")
2. Blank line
3. "${PUBLISH_DESCRIPTION.learnHeader}" + exactly 3 bullet takeaways (• prefix)
4. Blank line
5. "${PUBLISH_DESCRIPTION.chaptersHeader}" + 5 chapter lines (format "M:SS Label" — estimate times for an ~8–10 min episode)
6. Blank line
7. "${PUBLISH_DESCRIPTION.subscribeCta}"
8. "${PUBLISH_DESCRIPTION.shortCta}"
9. Blank line
10. Hashtag line: 3–5 hashtags starting with # (must include ${PUBLISH_CORE_HASHTAGS.join(', ')})

RULES:
- "title": keep or slightly improve the episode title, max ${PUBLISH_LIMITS.youtubeTitleMax} characters, keyword-rich
- "titleVariants": 2 alternative titles for A/B testing, same max length
- "tags": ${PUBLISH_LIMITS.youtubeTagsMax} YouTube tags (lowercase phrases, no # prefix). Always include: ${PUBLISH_CORE_TAGS.slice(0, 3).join(', ')}
- "chapters": exactly 5 entries matching Intro, Main idea 1, Main idea 2, Main idea 3, Closing — use estimated timestamps
- "pinnedComment": one engaging question to spark comments (1–2 sentences, include emoji)
- "hashtags": 3–5 hashtags with # prefix; always include ${PUBLISH_CORE_HASHTAGS.join(' and ')}
- Tone: warm, encouraging, professional — not clickbait

Return ONLY a valid JSON object (no markdown):
{
  "title": "...",
  "titleVariants": ["...", "..."],
  "description": "...",
  "tags": ["learn english", "..."],
  "chapters": [{ "time": "0:00", "label": "Intro" }, ...],
  "pinnedComment": "...",
  "hashtags": ["#LearnEnglish", "..."]
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

RULES:
- "title": scroll-stopping, max ${PUBLISH_LIMITS.youtubeShortTitleMax} characters, different angle from podcast title
- "caption": 1–2 sentences (≤${PUBLISH_LIMITS.shortCaptionMaxChars} chars) — hook + one concrete takeaway, NO hashtags inside
- "hashtags": exactly 3–5, start with #; always include ${PUBLISH_SHORT_CORE_HASHTAGS.join(' and ')}
- "pinnedComment": short question or CTA to drive comments (1 sentence, emoji ok)
- Tone: direct, energetic, speak to viewer as "you"

Return ONLY a valid JSON object (no markdown):
{
  "title": "...",
  "caption": "...",
  "hashtags": ["#LearnEnglish", "#EnglishTips", "#Shorts"],
  "pinnedComment": "..."
}`;
}

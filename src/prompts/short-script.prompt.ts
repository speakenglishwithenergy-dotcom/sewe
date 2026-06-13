import { PodcastScript } from '../types';

export function buildShortScriptPrompt(podcastScript: PodcastScript, topic: string): string {
  const scriptText = podcastScript.script
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');

  return `You are a professional short-form video script writer for the YouTube/TikTok channel "Speak English With Energy".

The channel features two hosts:
- Victor: male, warm, enthusiastic
- Lisa: female, thoughtful, practical

Create ONE short-form video script (YouTube Short / TikTok) by distilling the most important insights from the full podcast episode below.

Episode topic: "${topic}"
Episode title: "${podcastScript.title}"

FULL PODCAST SCRIPT:
${scriptText}

REQUIREMENTS:
- Target length: 30–60 seconds of spoken content (~80–150 words total across ALL lines)
- 6–15 dialogue lines only — Victor and Lisa alternate naturally
- Open with a strong HOOK in the first 1–2 lines — no long greetings, jump straight into the problem or surprising fact
- Select the 2–3 most important insights from the podcast — drop long anecdotes, repetition, and filler
- Close with one actionable tip and a short CTA ("Follow for more English tips")
- English level: A2–B1 (clear vocabulary, short sentences)
- "hook" field: the exact opening line or phrase that grabs attention (can match first dialogue line)
- "thumbnailText": 2–3 stacked lines, ALL CAPS, 3–6 words total, use \\n between lines — must be readable on a vertical phone screen
- "thumbnailScene": topic-specific visual changes only (Victor expression, thought bubble metaphor, Lisa gesture, 3 book spine titles)

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "title": "Short catchy title — max 50 characters",
  "description": "TikTok/Short caption with 2–3 hashtags",
  "hook": "Opening hook sentence",
  "thumbnailText": "SMART\\nBUT STUCK?",
  "thumbnailScene": "Victor confused with puzzle pieces in thought bubble. Lisa points encouragingly. Book spines: MINDSET, FOCUS, GROWTH.",
  "script": [
    { "speaker": "Victor", "text": "..." },
    { "speaker": "Lisa", "text": "..." }
  ]
}`;
}

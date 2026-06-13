import { PodcastScript } from '../types';

export function buildShortScriptPrompt(podcastScript: PodcastScript, topic: string): string {
  const scriptText = podcastScript.script
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');

  return `You are a professional short-form video script writer for the YouTube/TikTok channel "Speak English With Energy".

The channel features two hosts:
- Victor: male, warm, enthusiastic, reacts with real surprise and energy
- Lisa: female, thoughtful, practical, asks sharp follow-up questions

Your job is NOT to summarize the podcast below. Do NOT paraphrase or compress the episode line by line.

Instead: read the full episode, pick the ONE most compelling angle (the insight that would stop someone scrolling), and write a FRESH mini-conversation as if this Short was scripted first. Use the podcast only as source material — steal the best ideas, examples, and phrases, then rewrite them into tighter, more dramatic dialogue.

Episode topic: "${topic}"
Episode title: "${podcastScript.title}"

FULL PODCAST SCRIPT:
${scriptText}

CURATION (do this before writing):
1. Find the single strongest hook — a counterintuitive claim, relatable pain, or surprising fact
2. Pick 1–2 supporting ideas that make that hook land (not every point from the episode)
3. Choose ONE vivid proof moment — a short example or analogy (rewrite it; do not copy long anecdotes)
4. End with ONE concrete tip the viewer can try today

NARRATIVE ARC — every line must follow this logic; no random topic jumps:
  HOOK → TENSION (why this matters / common mistake) → TURN (the key insight) → PROOF (quick example) → PAYOFF (actionable tip) → CTA

DIALOGUE RULES:
- Target length: 30–60 seconds (~80–150 words total across ALL lines)
- 6–12 dialogue lines — Victor and Lisa alternate; each line must respond to the previous one
- NO podcast intros ("Hey everyone", "Welcome back", "Today we're talking about…")
- NO bullet-point listing ("First… Second… Third…") or lecture-style monologues
- NO summary phrases ("In this episode…", "We discussed…", "The main takeaway is…")
- Avoid empty agreement loops ("Exactly!", "That's right!", "Yes!" as standalone turns)
- Use natural spoken English: short sentences, contractions, occasional fillers ("well", "you know", "I mean") — but keep every filler purposeful
- Lisa asks questions that move the story forward; Victor delivers examples and energy — they build on each other, not repeat the same idea
- Each speaker turn: 1–2 short sentences max

QUALITY CHECK before returning JSON:
- Could someone who never heard the podcast still follow the logic?
- Does each line earn the next line?
- Is there ONE clear "aha" moment, not three half-explained points?
- Does it sound like two people talking, not one person reading notes?

METADATA:
- "hook": the exact opening line that grabs attention (should match or closely match the first dialogue line)
- "thumbnailText": 2–3 stacked lines, ALL CAPS, 3–6 words total, use \\n between lines — punchy, scroll-stopping, readable on a vertical phone screen
- "thumbnailScene": topic-specific visual changes only (Victor expression, thought bubble metaphor, Lisa gesture, 3 book spine titles)
- English level: A2–B1 (clear vocabulary, short sentences)

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

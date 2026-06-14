import { PodcastScript } from '../types';

export function buildShortScriptPrompt(podcastScript: PodcastScript, topic: string): string {
  const scriptText = podcastScript.script
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');

  return `You are a professional short-form video script writer for the YouTube/TikTok channel "Speak English With Energy".

The Short is narrated entirely by Victor — one warm, energetic male host speaking directly to the viewer ("you"). There is NO dialogue, NO Lisa, NO back-and-forth. Write a single cohesive self-help monologue split into short beats for pacing.

Your job is NOT to summarize the podcast or recap what Victor and Lisa discussed. Do NOT stitch together disconnected episode points.

Instead: read the full episode, extract the 2–3 strongest self-help ideas, and rewrite them as ONE flowing mini-lesson — as if Victor scripted this Short first and the podcast came later. Use the episode only as source material.

Episode topic: "${topic}"
Episode title: "${podcastScript.title}"
Episode thumbnail headline: "${podcastScript.thumbnailText}"

FULL PODCAST SCRIPT:
${scriptText}

CURATION (do this before writing):
1. Pick ONE relatable problem the viewer has about "${topic}" — this becomes your hook
2. Choose ONE counterintuitive insight or reframe (the "aha" moment)
3. Add ONE quick proof — a short example, analogy, or "I see this all the time…" moment
4. End with ONE concrete action the viewer can try today
5. Drop everything else — no extra tips, no episode recap, no "we also talked about…"

NARRATIVE ARC — every beat must connect to the next; use bridge phrases ("Here's the thing…", "That's why…", "So instead of…", "Try this today…"):
  OPEN (name the topic + hook the pain) → REFRAME (the key insight) → WHY IT MATTERS → PROOF (quick example) → ACTION (one tip) → CLOSE (short CTA)

MONOLOGUE RULES:
- Target length: 30–60 seconds (~80–150 words total across ALL beats)
- 5–8 beats — every line is Victor; split the monologue into natural sentence groups for pacing
- The FIRST line MUST clearly name the topic ("${topic}") — not a vague hook, not "In today's episode…"
- Speak directly to the viewer: use "you" and "your"
- NO podcast intros ("Hey everyone", "Welcome back", "Today we're talking about…")
- NO episode recap ("In our podcast…", "Lisa said…", "We discussed…", "The main takeaway is…")
- NO bullet-point listing ("First… Second… Third…") or lecture-style walls of text
- NO disconnected fact drops — each beat must answer "so what?" and lead into the next
- Self-help tone: empathetic, practical, energizing — help the viewer feel understood, then give them a clear next step
- Each beat: 1–2 short sentences max; A2–B1 vocabulary; contractions and natural spoken rhythm

FLOW CHECK before returning JSON:
- Does line 1 name the topic and stop the scroll?
- Could someone who never heard the podcast follow ONE clear thread?
- Does each beat earn the next beat (no random jumps)?
- Is there ONE "aha" moment, not three half-explained ideas?
- Does it sound like Victor coaching you, not reading episode notes?

METADATA:
- "hook": the exact opening line (must name the topic and match the first script beat)
- "thumbnailText": reuse the episode thumbnail headline exactly — same ALL-CAPS stacked lines with \\n: "${podcastScript.thumbnailText.replace(/\n/g, '\\n')}"
- "thumbnailScene": reuse the episode thumbnail scene exactly: "${podcastScript.thumbnailScene ?? 'Victor confused with topic-related metaphor in thought bubble. Lisa points encouragingly. Book spines related to the topic.'}"
- English level: A2–B1 (clear vocabulary, short sentences)

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "title": "Short catchy title — max 50 characters",
  "description": "TikTok/Short caption with 2–3 hashtags",
  "hook": "Opening line that names the topic and hooks the viewer",
  "thumbnailText": "${podcastScript.thumbnailText.replace(/\n/g, '\\n')}",
  "thumbnailScene": "Victor confused with puzzle pieces in thought bubble. Lisa points encouragingly. Book spines: MINDSET, FOCUS, GROWTH.",
  "script": [
    { "speaker": "Victor", "text": "..." },
    { "speaker": "Victor", "text": "..." }
  ]
}`;
}

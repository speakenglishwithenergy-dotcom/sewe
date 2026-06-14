import { PodcastScript, ShortScript } from '../types';

export function buildShortScriptPrompt(podcastScript: PodcastScript, topic: string): string {
  const scriptText = podcastScript.script
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');

  return `You are a professional short-form video script writer for the YouTube/TikTok channel "Speak English With Energy".

The Short uses a two-voice handoff — NOT a back-and-forth dialogue:
- Victor (warm, energetic male) speaks ONLY the FIRST beat — a punchy opening hook that names the topic and stops the scroll.
- Lisa (thoughtful, practical female) speaks ALL remaining beats — she carries the mini-lesson directly to the viewer ("you").

There is NO conversation between Victor and Lisa. Victor opens; Lisa takes over and finishes. Write one cohesive self-help monologue split into short beats for pacing.

Your job is NOT to summarize the podcast or recap what Victor and Lisa discussed. Do NOT stitch together disconnected episode points.

Instead: read the full episode, extract the 2–3 strongest self-help ideas, and rewrite them as ONE flowing mini-lesson. Use the episode only as source material.

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
5. Close with a warm subscribe reminder — invite viewers to subscribe for more English + self-help Shorts like this
6. Drop everything else — no extra tips, no episode recap, no "we also talked about…"

NARRATIVE ARC — every beat must connect to the next; use bridge phrases ("Here's the thing…", "That's why…", "So instead of…", "Try this today…"):
  OPEN — Victor names the topic + hooks the pain → Lisa: REFRAME (the key insight) → WHY IT MATTERS → PROOF (quick example) → ACTION (one tip) → CLOSE (subscribe CTA — Lisa's LAST beat reminds viewers to subscribe)

SPEAKER & PACING RULES:
- Target length: 30–60 seconds (~80–150 words total across ALL beats)
- 5–8 beats — split the monologue into natural sentence groups for pacing
- Beat 1 ONLY: Victor — MUST clearly name the topic ("${topic}") — not a vague hook, not "In today's episode…"
- Beats 2 through the last: Lisa — she continues the lesson seamlessly, as if picking up right after Victor's hook
- NEVER assign Victor to more than the first beat
- Speak directly to the viewer: use "you" and "your"
- NO podcast intros ("Hey everyone", "Welcome back", "Today we're talking about…")
- NO episode recap ("In our podcast…", "Lisa said…", "We discussed…", "The main takeaway is…")
- NO bullet-point listing ("First… Second… Third…") or lecture-style walls of text
- NO disconnected fact drops — each beat must answer "so what?" and lead into the next
- Self-help tone: empathetic, practical, energizing — help the viewer feel understood, then give them a clear next step
- Each beat: 1–2 short sentences max; A2–B1 vocabulary; contractions and natural spoken rhythm
- The LAST script beat (Lisa) MUST remind the viewer to subscribe (e.g. "Subscribe for more Shorts like this — I'll see you in the next one.")

FLOW CHECK before returning JSON:
- Does line 1 name the topic and stop the scroll?
- Could someone who never heard the podcast follow ONE clear thread?
- Does each beat earn the next beat (no random jumps)?
- Is there ONE "aha" moment, not three half-explained ideas?
- Does Victor's hook hand off cleanly to Lisa's teaching voice?
- Does Lisa sound like she's coaching the viewer, not reading episode notes?
- Does the final beat naturally remind the viewer to subscribe?

REVISION PASS (mandatory — do this AFTER drafting, BEFORE returning JSON):
Read your draft aloud in your head. Revise until ALL of these pass:
1. NOT TOO SHORT — ~80–150 words total, 5–8 beats. If under ~80 words, add one bridging beat (insight, proof, or action) — never pad with filler.
2. NOT STIFF — every beat sounds like natural spoken English (A2–B1). Use contractions and bridge phrases ("Here's the thing…", "That's why…", "So instead of…", "Try this today…"). Replace textbook or robotic wording.
3. CONNECTED — each beat picks up from the previous one. No random jumps or disconnected fact drops. If a beat feels standalone, add a link back to the thread.
4. GRADUAL CLOSE — do NOT rush the ending. Lisa needs at least one beat that lands the lesson (proof or action) BEFORE the subscribe CTA. The final subscribe line should feel like a warm goodbye, not an abrupt stop.
5. HANDOFF — Victor's hook and Lisa's first beat must feel like one continuous monologue, not two unrelated openings.

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
    { "speaker": "Victor", "text": "Opening hook — names the topic" },
    { "speaker": "Lisa", "text": "..." },
    { "speaker": "Lisa", "text": "..." }
  ]
}`;
}

export function buildShortScriptReviewPrompt(draft: ShortScript, topic: string): string {
  const draftJson = JSON.stringify(draft, null, 2);

  return `You are a senior short-form script editor for "Speak English With Energy".

You received a DRAFT Short script. Double-check it and REVISE — do not rewrite from scratch unless a beat is broken.

Topic: "${topic}"

DRAFT JSON:
${draftJson}

REVISION CHECKLIST — fix every issue you find:
1. NOT TOO SHORT — ~80–150 words total, 5–8 beats. If under ~80 words or fewer than 5 beats, expand with one bridging beat (insight, proof, or action). Never pad with filler.
2. NOT STIFF — replace robotic or textbook phrasing. Use contractions, spoken rhythm, and bridge phrases ("Here's the thing…", "That's why…", "So instead of…", "Try this today…").
3. CONNECTED — every beat must logically lead to the next. Add a connective phrase where a beat feels like a random jump.
4. GRADUAL CLOSE — the ending must NOT feel rushed. Before the subscribe CTA, Lisa needs at least one beat that lands the lesson (proof or action). The subscribe line should feel warm, not abrupt.
5. PRESERVE STRUCTURE — beat 1 ONLY: Victor (names "${topic}"). Beats 2 through last: Lisa only. No podcast recap, no back-and-forth dialogue.

Keep metadata unchanged unless Victor's opening line changes — then update "hook" too.

Return ONLY a valid JSON object (no markdown, no code blocks) with the EXACT same structure as the draft:
{
  "title": "Short catchy title — max 50 characters",
  "description": "TikTok/Short caption with 2–3 hashtags",
  "hook": "Opening line that names the topic and hooks the viewer",
  "thumbnailText": "ALL-CAPS stacked lines with \\n",
  "thumbnailScene": "Victor confused with puzzle pieces in thought bubble. Lisa points encouragingly. Book spines: MINDSET, FOCUS, GROWTH.",
  "script": [
    { "speaker": "Victor", "text": "Opening hook — names the topic" },
    { "speaker": "Lisa", "text": "..." },
    { "speaker": "Lisa", "text": "..." }
  ]
}

Every script item MUST have exactly "speaker" ("Victor" or "Lisa") and "text" (spoken line string). Do NOT return script as plain strings or use other field names.`;
}

export function buildShadowingReviewPrompt(
  draft: string,
  speaker: string,
  titleOverride?: string,
): string {
  const titleHint = titleOverride
    ? `\nPreferred title (use unless the draft suggests a clearly better one): "${titleOverride}"`
    : '';

  return `You are an expert English YouTube scriptwriter and content editor for shadowing practice.

SOURCE DRAFT (raw notes, outline, or script — may include markdown, timestamps, visual cues, Vietnamese notes, or rough spoken English):
---
${draft.trim()}
---
${titleHint}

Task:
1. Read the draft — extract the core message, story arc, and emotional intent. Treat Vietnamese or mixed-language notes as source material; translate and weave them into natural English where they add value.
2. Rewrite the FULL script for speaker "${speaker}" in a structured video-script format (see below). Same topic and key ideas, but sharper hooks, better pacing, more viral/shareable moments, and more natural spoken English. **Minimum runtime: 6–8 minutes** — if the draft is short, expand with real content (stories, examples, deeper beats), not repetition.
3. Write a separate **AI Suggestions** section the author can scan like a revision checklist — every bullet must be actionable enough to edit script.md immediately.

REWRITE GOALS:
- Target length: **6–8 minutes minimum** when spoken aloud at a natural YouTube pace (~130–150 words/min → roughly **800–1,200 words** of Audio). If the draft is shorter, expand it — do NOT ship a 2–3 minute script
- Viral-friendly: strong opening hook, curiosity gaps, relatable tension, payoff moments viewers want to share
- Natural on camera: sounds like a real person talking, not an essay or corporate video
- Shadowing-friendly: short spoken lines in Audio blocks — easy to read aloud and practice
- Authentic: preserve the speaker's voice, story, and honesty; improve impact without replacing personality
- No generic AI filler ("in today's fast-paced world", "let's dive in", "game-changer", "without further ado", "buckle up", etc.)

LENGTH RULES (when the draft is too short):
- Expand with **substance**, not padding — every added beat must earn its place
- Good ways to lengthen: personal stories/anecdotes, specific examples, "why this matters to me", mini case studies, honest struggles, step-by-step reasoning, relatable viewer scenarios, callbacks between parts, a stronger message-to-viewers section
- Split thin ideas into multiple parts instead of cramming — e.g. one reason per beat, pause for emphasis, rhetorical questions
- Bad ways to lengthen: repeating the same point, vague motivational fluff, long lists without examples, corporate buzzwords
- Timestamps must span **0:00 – ~6:00 to 0:00 – ~8:00**; add or merge parts until the Audio realistically fills that window

STRUCTURED SCRIPT FORMAT (inside ## Script):
- Split into logical parts: Intro, **4–6 body parts**, Message/CTA, Outro — enough sections to sustain 6–8 minutes
- Each part uses this exact pattern:

## 🕒 <Part name> (<start> – <end>) — **<hook label>**

**Audio:**

> <spoken line 1>
>
> <spoken line 2>
>
> ...

**Visual:**

- <shot / on-screen text / B-roll cue — Vietnamese OK for production notes>

---

- Estimate timestamps for a **6–8 minute** video; part durations should add up to at least ~6:00
- One idea per Audio line; use blank lines between blockquote lines (as shown)
- Keep lines short and punchy where they land; vary rhythm — questions, pauses, lists
- Visual bullets are for filming/editing only — do NOT put essential story content only in Visual
- End the Script section with the last part (no trailing --- after the final section)

AI SUGGESTIONS RULES (author will use this section to revise ## Script):
- Write 3–8 bullets per subsection when there is something worth saying; skip weak filler
- Always anchor each bullet to a location: **[Part name]** or **[Part name, Audio line]** — quote the exact line when editing/removing
- Explain WHY in plain language (1 short phrase): retention, hook, rhythm, authenticity, viral/share moment, clarity, cut redundancy
- If the rewritten script still feels short, **Add** must include concrete expansion ideas (new part, anecdote, example block) with Try: lines — not just polish
- For **Add**: propose a specific beat, hook, story detail, example, or CTA — include a ready-to-paste English line in quotes when possible
  Example: **[Intro]** Add a sharper hook before the self-intro — *viewers decide in 3 seconds* — Try: "Most devs wait until their English is perfect. I stopped waiting."
- For **Edit**: show **Before → After** with quoted English lines (or a tight rewrite direction if the whole block is weak)
  Example: **[Part 2, line 4]** "With a good English person, you can get some Better jobs." → "Better English opens better jobs." — *grammar + sounds more natural on camera*
- For **Remove**: name the exact line or beat to cut and what to replace the gap with (if anything)
  Example: **[Part 2]** Remove the AI/layoffs tangent — *drifts off topic; weakens the "why English" arc* — keep focus on docs + community + opportunity
- Prioritize high-impact fixes first within each subsection (hook > middle sag > outro)
- Be honest and specific — no vague advice like "improve flow" or "consider rephrasing" without pointing to the line and offering a better version
- Vietnamese OK for the *why* / production note when it helps the author decide faster; quoted script lines stay in English

Return ONLY valid Markdown with EXACTLY this structure (no extra top-level sections):

# <catchy episode title>

> <one-sentence description for the episode>

## Script

<full structured script — all parts with Audio + Visual, separated by --- >

## AI Suggestions

### Add
- **[<Part>]** <what to add> — *<why>* — Try: "<English line>"

### Edit
- **[<Part>, line N]** "<before>" → "<after>" — *<why>*

### Remove
- **[<Part>]** <what to cut> — *<why>* — <optional: what to keep instead>`;
}

export const SHADOWING_REVIEW_SYSTEM_PROMPT =
  'You are a skilled English YouTube scriptwriter for shadowing practice. Target 6–8 minutes of spoken Audio (~800–1,200 words); expand thin drafts with stories and examples, not filler. Rewrite into structured video scripts with Audio/Visual sections. AI Suggestions must be a concrete revision checklist: locate the part, quote lines, give Before→After or Try: alternatives, and explain why. Respond only with the requested Markdown structure.';

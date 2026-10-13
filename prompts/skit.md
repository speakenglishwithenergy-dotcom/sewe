# Write skit #{{EPISODE}} — a vertical English-learning skit

You write a tiny, funny, **relatable** scene (about 20–45 seconds) that teaches ONE real piece of
English. Two characters, flat-2D, vertical video. A learner scrolling must stop at the first line,
smile once, and walk away remembering the phrase.

## Today's brief
- **Lesson type:** `{{LESSON_TYPE}}`
  - `dialogue` — a natural real-life exchange; teach one useful line in it.
  - `vocab` — a situation that makes ONE word/phrase obvious and memorable.
  - `idiom` — a literal misunderstanding of an idiom, then its real meaning.
  - `grammar` — a common mistake vs the correct pattern, shown naturally.
  - `joke` — a light English joke/pun that still teaches a word or phrase.
- **Situation to build from:** {{SITUATION}}
- **English level:** A2–B1. Simple, natural, spoken English — never textbook or robotic.

## Channel energy — this is "Speak English With Energy"
The channel's whole identity is **confident, high-energy spoken English**. Every skit must feel alive:
- Characters speak with enthusiasm and confidence — upbeat, expressive, never flat or shy.
- Favor energetic actions and expressions: `point`, `celebrate`, `laugh`, `surprised`, `shrug`, with
  `happy` / `smug` / `surprised` faces. Avoid long stretches of `idle` + `neutral`.
- The lesson should make the learner **sound more confident and natural**, not timid or textbook.
- The payoff is a little burst of energy — a win, a "YES!", a confident delivery of the phrase.

## The hook (first line) — most important
The first line is the most scroll-stopping sentence in the skit. Make a learner think
*"wait, am I saying that wrong?"*. Use a bold claim, a *forbidden phrase*, or a curious question.
- Max 8 words. Put one or two key words in `*asterisks*` for emphasis.
- NOT a greeting ("Hi", "Hello", "What's up"), NOT a topic label.
- Example openers: `Never say *"I want coffee."*` · `Your *"how are you"* is wrong.` · `Stop saying *"very good."*`

## Teach clearly
- The **target phrase** must be spoken naturally inside the dialogue and wrapped in `*asterisks*`.
- Exactly ONE lesson. Don't cram. Keep every line something a real person would actually say.
- End with a payoff: the learner uses the phrase correctly, or the mix-up resolves.

## Format — answer with JSON only
```json
{
  "title": "max 6 words",
  "lessonType": "{{LESSON_TYPE}}",
  "lessonFocus": "the exact English phrase/word this skit teaches",
  "characters": {
    "<id>": { "look": "one of: {{LOOKS}}", "gender": "m or f", "scale": 1.0 }
  },
  "scenes": [
    {
      "background": "one of: {{BACKGROUNDS}}",
      "caption": "SHORT ON-SCREEN LABEL",
      "left": "<id>", "right": "<id>",
      "props": { "<id>": "one of: {{PROPS}}" },
      "lines": [
        {
          "speaker": "<id>",
          "text": "Spoken line. *emphasis* on key words.",
          "action": "one of: {{ACTIONS}}",
          "expression": "one of: {{EXPRESSIONS}}",
          "listener": { "action": "one of the actions", "expression": "one of the expressions" }
        }
      ]
    }
  ],
  "recap": {
    "phrase": "the English target to remember (matches lessonFocus)",
    "meaningVi": "nghĩa tiếng Việt ngắn gọn, tự nhiên"
  }
}
```

## Rules (checked automatically)
- 1–3 characters (2 is ideal). `id` is a short lowercase name (e.g. `ben`, `mia`). Pick looks from {{LOOKS}}.
- 1–3 scenes. Only characters placed on `left`/`right`/`center` may speak in that scene.
- 4–14 lines total. Each line 1–14 words. The opening line max 8 words.
- `action`/`expression` only from the lists above. Make them ACT the line (point when insisting,
  shrug when unsure, facepalm at a mistake, celebrate at success, think before answering).
- Use `listener` to react the other character (nod of understanding, surprise, worry).
- `recap.phrase` + `recap.meaningVi` are both required and must match the lesson.
- Keep it fresh — do NOT repeat a phrase already taught below.

## Already taught (do not repeat)
{{HISTORY}}

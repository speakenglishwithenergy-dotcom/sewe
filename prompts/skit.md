# Write skit #{{EPISODE}} — a vertical English-learning skit

You write a tiny, **simple**, relatable scene (about 20–35 seconds) that teaches ONE easy piece of
English. Two characters, flat-2D, vertical video. A learner scrolling must stop, understand the
phrase with no effort, and want the next one — so they follow the channel.

## Today's brief
- **Lesson type:** `{{LESSON_TYPE}}`
  - `dialogue` — a natural real-life exchange; teach one useful line in it.
  - `vocab` — a situation that makes ONE word/phrase obvious and memorable.
  - `idiom` — one everyday line where the idiom is obvious. Do not act out a puzzle.
  - `grammar` — one common mistake, then the natural line. No rule explanation.
  - `joke` — one light smile that still teaches a word or phrase. No setup that needs explaining.
- **Situation to build from:** {{SITUATION}}
- **English level:** A2. Words a learner already half-knows. If a line needs a dictionary, rewrite it.

## Keep the script simple — this is the most important rule
One everyday moment. One phrase. No plot, no backstory, no second joke, no grammar lecture.
A friend could retell the whole skit in one sentence.

Use **one scene** and **5–8 short lines**. Shape:

1. **Hook** — a familiar mistake or a "wait" moment. Max 8 words.
2. **The moment** — 2–3 lines of real talk in today's situation (cafe, boss, friend, shop, late, a text).
3. **The phrase** — said once, out loud, like a friend showing you what to say. Wrap it in `*asterisks*`.
4. **The win** — the other person gets it in one short line. A small smile is enough. No extra twist.
5. **Follow** — the last spoken line invites the next video, warm and short, never a sales pitch.
   Examples: `Follow. One easy phrase a day.` · `Follow for the next one.`

Prefer lines of **4–8 words**. Never explain "In English we say…". Never stack two lessons.
Even `idiom`, `joke`, and `grammar` stay one beat: show the phrase, don't unpack a puzzle.

## Channel energy — this is "Speak English With Energy"
Alive, but not loud or complicated:
- Characters sound like confident friends — warm, clear, a little upbeat.
- Favor `point`, `celebrate`, `laugh`, `surprised`, `shrug`, with `happy` / `surprised` faces.
- The payoff is hearing the phrase said well, then a reason to come back tomorrow.

## The hook (first line)
Make a learner think *"wait, I say that."* Use a bold claim, a forbidden phrase, or a curious question.
- Max 8 words. Put one or two key words in `*asterisks*`.
- NOT a greeting ("Hi", "Hello", "What's up"), NOT a topic label, NOT "Subscribe" (save that for the last line).
- Example openers: `Never say *"I want coffee."*` · `Stop saying *"I'm fine."*` · `Don't say *"very good."*`

## Teach clearly
- The **target phrase** is spoken once inside the dialogue and wrapped in `*asterisks*`.
- Exactly ONE lesson. Every line is something a real person would actually say.
- The learner should remember the phrase after one watch, with the sound off or on.

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
- `gender` must match how that look is drawn, or the voice will not match the picture.
  Male looks (gender `m`): dad, man, teen_boy, kid, boss, worker, grandpa.
  Female looks (gender `f`): mom, woman, teen_girl, kid_girl, barista, teacher.
  A barista or teacher is always a woman; a boss or worker is always a man.
- Prefer **1 scene**. Use a second scene only if the first cannot show the phrase. Never 3 scenes.
- 5–8 lines is the target (4–10 is allowed). Each line 1–12 words. The opening line max 8 words.
- The **last line** is a short follow invite (see shape above). It is not the lesson.
- `action`/`expression` only from the lists above. Make them ACT the line (point when insisting,
  shrug when unsure, facepalm at a mistake, celebrate at success, think before answering).
- Use `listener` to react the other character (nod of understanding, surprise, worry).
- `recap.phrase` + `recap.meaningVi` are both required and must match the lesson.
- Keep it fresh — do NOT repeat a phrase already taught below.

## Already taught (do not repeat)
{{HISTORY}}

import { ChannelContext } from '../channel/channel.types';
import { PodcastScript, ShortScript } from '../types';

export function buildShortScriptPrompt(
  ctx: ChannelContext,
  podcastScript: PodcastScript,
  topic: string,
  tooFewLines?: number,
): string {
  const { name, short } = ctx.config;
  const hookSpeaker = short.hookSpeaker;
  const bodySpeaker = short.bodySpeaker;

  const scriptText = podcastScript.script
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');

  const retryNote = tooFewLines
    ? `\nCRITICAL: Your last attempt had only ${tooFewLines} beats. You MUST return at least ${short.minLines} beats (max ${short.maxLines}). Split the mini-lesson into more natural sentence groups.\n`
    : '';

  return `You are a professional short-form video script writer for the YouTube/TikTok channel "${name}".
${retryNote}

The Short uses a two-voice handoff — NOT a back-and-forth dialogue:
- ${hookSpeaker} speaks ONLY the FIRST beat — one short, punchy opening hook that names the topic and stops the scroll.
- ${bodySpeaker} speaks ALL remaining beats — carries the mini-lesson directly to the viewer ("you").

There is NO conversation between ${hookSpeaker} and ${bodySpeaker}. ${hookSpeaker} opens; ${bodySpeaker} takes over and finishes.

Episode topic: "${topic}"
Episode title: "${podcastScript.title}"
Episode thumbnail headline: "${podcastScript.thumbnailText}"

FULL PODCAST SCRIPT:
${scriptText}

CONTENT QUALITY — make every beat count:
- Pick the ONE sharpest insight from the podcast — not a summary, a reframe that changes how the viewer sees the topic
- Each teaching beat must deliver a distinct "aha" — contrast, myth-bust, hidden cost, or unexpected cause-effect. No filler, no repeating the same idea in different words
- Prefer concrete images and specific scenarios over vague advice ("you rehearse the apology in your head" beats "you overthink things")
- Build tension: hook creates curiosity → middle beats deepen or flip the assumption → payoff lands one clear takeaway the viewer can use today
- Sound confident and direct — like a friend who just figured something out, not a textbook

SPEAKER & PACING RULES:
- Target length: 45–80 seconds (~110–200 words total across ALL beats)
- ${short.minLines}–${short.maxLines} beats — split the monologue into natural sentence groups; use the upper half of the range when the insight needs room to land
- Beat 1 ONLY: ${hookSpeaker} — ONE short sentence (6–14 words max). Name the topic ("${topic}") and spark curiosity — question, bold claim, or surprising stat
- Beats 2 through the last: ${bodySpeaker} only
- NEVER assign ${hookSpeaker} to more than the first beat
- Speak directly to the viewer: use "you" and "your"
- English level: ${ctx.config.script.languageLevel}
- The LAST script beat (${bodySpeaker}) MUST be ONLY the subscribe CTA — one short sentence in its own beat

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "title": "Short catchy title — max 50 characters",
  "description": "TikTok/Short caption with 2–3 hashtags",
  "hook": "One short punchy opening line — 6–14 words, names the topic and sparks curiosity",
  "thumbnailText": "${podcastScript.thumbnailText.replace(/\n/g, '\\n')}",
  "thumbnailScene": "${podcastScript.thumbnailScene ?? 'Topic-specific scene for hosts.'}",
  "script": [
    { "speaker": "${hookSpeaker}", "text": "One short punchy hook — 6–14 words, names the topic and sparks curiosity" },
    { "speaker": "${bodySpeaker}", "text": "First teaching beat — one sharp insight or reframe" },
    { "speaker": "${bodySpeaker}", "text": "Second teaching beat — deepens or contrasts the first" },
    { "speaker": "${bodySpeaker}", "text": "Third teaching beat — concrete example or hidden cost" },
    { "speaker": "${bodySpeaker}", "text": "Fourth teaching beat — flip the assumption or myth-bust" },
    { "speaker": "${bodySpeaker}", "text": "Fifth teaching beat — one clear actionable takeaway" },
    { "speaker": "${bodySpeaker}", "text": "Subscribe for more Shorts like this — I'll see you in the next one." }
  ]
}

The script array MUST contain ${short.minLines}–${short.maxLines} beats. The example above shows the minimum (${short.minLines} beats).`;
}

export function buildShortScriptReviewPrompt(
  ctx: ChannelContext,
  draft: ShortScript,
  topic: string,
  tooFewLines?: number,
): string {
  const { name, short } = ctx.config;
  const draftJson = JSON.stringify(draft, null, 2);

  const retryNote = tooFewLines
    ? `\nCRITICAL: Your last revision had only ${tooFewLines} beats. You MUST return at least ${short.minLines} beats (max ${short.maxLines}). Add beats by splitting long sentences — do NOT merge beats.\n`
    : '';

  return `You are a senior short-form script editor for "${name}".
${retryNote}

Topic: "${topic}"

DRAFT JSON:
${draftJson}

REVISION CHECKLIST:
1. NOT TOO SHORT — ~110–200 words total, ${short.minLines}–${short.maxLines} beats. If under ~110 words, add beats by splitting thin sentences — never pad with filler.
2. SHARP INSIGHTS — each teaching beat must earn its place: distinct reframe, contrast, or concrete example. Cut generic lines; rewrite weak beats to hit harder.
3. NOT STIFF — natural spoken English (${ctx.config.script.languageLevel}).
4. CONNECTED — every beat must logically lead to the next; tension builds toward one memorable payoff.
5. GRADUAL CLOSE — subscribe CTA must be its own final beat.
6. PRESERVE STRUCTURE — beat 1 ONLY: ${short.hookSpeaker}. Beats 2 through last: ${short.bodySpeaker} only.

Return ONLY a valid JSON object with the EXACT same structure as the draft.`;
}

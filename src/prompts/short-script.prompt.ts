import { ChannelContext } from '../channel/channel.types';
import { PodcastScript, ShortScript } from '../types';

export function buildShortScriptPrompt(
  ctx: ChannelContext,
  podcastScript: PodcastScript,
  topic: string,
): string {
  const { name, short } = ctx.config;
  const hookSpeaker = short.hookSpeaker;
  const bodySpeaker = short.bodySpeaker;

  const scriptText = podcastScript.script
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');

  return `You are a professional short-form video script writer for the YouTube/TikTok channel "${name}".

The Short uses a two-voice handoff — NOT a back-and-forth dialogue:
- ${hookSpeaker} speaks ONLY the FIRST beat — one short, punchy opening hook that names the topic and stops the scroll.
- ${bodySpeaker} speaks ALL remaining beats — carries the mini-lesson directly to the viewer ("you").

There is NO conversation between ${hookSpeaker} and ${bodySpeaker}. ${hookSpeaker} opens; ${bodySpeaker} takes over and finishes.

Episode topic: "${topic}"
Episode title: "${podcastScript.title}"
Episode thumbnail headline: "${podcastScript.thumbnailText}"

FULL PODCAST SCRIPT:
${scriptText}

SPEAKER & PACING RULES:
- Target length: 30–60 seconds (~80–150 words total across ALL beats)
- ${short.minLines}–${short.maxLines} beats — split the monologue into natural sentence groups
- Beat 1 ONLY: ${hookSpeaker} — ONE short sentence (6–12 words max). Name the topic ("${topic}") in plain language
- Beats 2 through the last: ${bodySpeaker} only
- NEVER assign ${hookSpeaker} to more than the first beat
- Speak directly to the viewer: use "you" and "your"
- English level: ${ctx.config.script.languageLevel}
- The LAST script beat (${bodySpeaker}) MUST be ONLY the subscribe CTA — one short sentence in its own beat

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "title": "Short catchy title — max 50 characters",
  "description": "TikTok/Short caption with 2–3 hashtags",
  "hook": "One short punchy opening line — 6–12 words, names the topic",
  "thumbnailText": "${podcastScript.thumbnailText.replace(/\n/g, '\\n')}",
  "thumbnailScene": "${podcastScript.thumbnailScene ?? 'Topic-specific scene for hosts.'}",
  "script": [
    { "speaker": "${hookSpeaker}", "text": "One short punchy hook — 6–12 words, names the topic" },
    { "speaker": "${bodySpeaker}", "text": "..." },
    { "speaker": "${bodySpeaker}", "text": "Subscribe for more Shorts like this — I'll see you in the next one." }
  ]
}`;
}

export function buildShortScriptReviewPrompt(
  ctx: ChannelContext,
  draft: ShortScript,
  topic: string,
): string {
  const { name, short } = ctx.config;
  const draftJson = JSON.stringify(draft, null, 2);

  return `You are a senior short-form script editor for "${name}".

Topic: "${topic}"

DRAFT JSON:
${draftJson}

REVISION CHECKLIST:
1. NOT TOO SHORT — ~80–150 words total, ${short.minLines}–${short.maxLines} beats.
2. NOT STIFF — natural spoken English (${ctx.config.script.languageLevel}).
3. CONNECTED — every beat must logically lead to the next.
4. GRADUAL CLOSE — subscribe CTA must be its own final beat.
5. PRESERVE STRUCTURE — beat 1 ONLY: ${short.hookSpeaker}. Beats 2 through last: ${short.bodySpeaker} only.

Return ONLY a valid JSON object with the EXACT same structure as the draft.`;
}

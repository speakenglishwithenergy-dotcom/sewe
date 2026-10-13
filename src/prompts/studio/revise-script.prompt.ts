import { PodcastScript } from '../../types';
import { StudioContext, studioFormatDescription, studioVoicesBlock } from '../../studio/studio.types';

export function buildReviseScriptPrompt(
  ctx: StudioContext,
  script: PodcastScript,
  instruction: string,
): string {
  const { name, niche, script: scriptConfig } = ctx.config;
  const voicesBlock = studioVoicesBlock(ctx);
  const dialogueExcerpt = script.script
    .map((line, i) => `${i + 1}. ${line.speaker}: ${line.text}`)
    .join('\n');

  return `You are revising a SPOKEN VIDEO script (shadowing lines), NOT a podcast script.

Brand: "${name}" (${niche})
Format: ${scriptConfig.format} — ${studioFormatDescription(scriptConfig.format)}

${voicesBlock}

CURRENT SCRIPT (${script.script.length} lines):
Title: ${script.title}
---
${dialogueExcerpt}
---

REVISION INSTRUCTION:
${instruction}

RULES:
- Apply the instruction; keep spoken-video style (not podcast interview)
- Speakers must be: ${ctx.speakers.join(', ')}
- Each line: 1–2 sentences (~14–20 words), one shadowing beat
- Include continuesStory on every line
- Return the FULL revised script

Return ONLY valid JSON:
{
  "title": "...",
  "description": "...",
  "thumbnailText": "...",
  "thumbnailScene": "...",
  "script": [
    { "speaker": "...", "text": "...", "continuesStory": false }
  ]
}`;
}

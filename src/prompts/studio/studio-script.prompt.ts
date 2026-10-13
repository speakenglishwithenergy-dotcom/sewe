import { DialogueLine } from '../../types';
import {
  Outline,
  StudioContext,
  StudioScriptSection,
  studioFormatDescription,
  studioVoicesBlock,
} from '../../studio/studio.types';

function formatCustomScriptBlock(customScript?: string): string {
  const trimmed = customScript?.trim();
  if (!trimmed) return '';

  return `
AUTHOR'S DRAFT (reference only — preserve key ideas, facts, structure, and tone):
---
${trimmed}
---
`;
}

function formatRecentContext(lines: DialogueLine[], count = 6): string {
  if (lines.length === 0) {
    return '(Script starts here — no prior lines.)';
  }

  return lines
    .slice(-count)
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');
}

function getLineRules(ctx: StudioContext): string {
  const { script, voices } = ctx.config;
  const voiceNames = voices.map((v) => v.name).join(', ');
  const custom = script.lineRules.trim();
  return custom.replace(/\{voices\}/g, voiceNames);
}

function getFlowExample(ctx: StudioContext): string {
  return (
    ctx.config.script.flowExample?.trim() ??
    'Each line is one spoken beat — same speaker may have 2–5 consecutive lines when telling a story.'
  );
}

function getContinuesStoryRules(): string {
  return `- Every line MUST include "continuesStory" (boolean) for audio pacing:
  - continuesStory: true — same speaker, same thought/story beat continues
  - continuesStory: false — new beat, section change, or different speaker
  - First line in this section output: always continuesStory: false`;
}

function exampleLine(ctx: StudioContext, index: number, continuesStory: boolean): string {
  const speaker = ctx.speakers[index % ctx.speakers.length];
  return `{ "speaker": "${speaker}", "text": "...", "continuesStory": ${continuesStory} }`;
}

export function countScriptWords(script: DialogueLine[]): number {
  return script.reduce(
    (sum, line) => sum + line.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
}

export function scriptHasClosing(ctx: StudioContext, script: DialogueLine[]): boolean {
  if (!ctx.closingText) return true;
  const name = ctx.config.name.toLowerCase();
  return script
    .slice(-3)
    .some((line) => line.text.toLowerCase().includes(name));
}

export function appendStudioClosing(ctx: StudioContext, script: DialogueLine[]): DialogueLine[] {
  if (!ctx.closingText || scriptHasClosing(ctx, script)) {
    return script;
  }

  const speakers = ctx.speakers;
  const lastSpeaker = script.at(-1)?.speaker ?? speakers[0];

  return [...script, { speaker: lastSpeaker, text: ctx.closingText, continuesStory: false }];
}

export function resolveSectionBrief(
  profileSection: StudioScriptSection,
  outlineSection: Outline['sections'][number],
): string {
  return outlineSection.brief || profileSection.brief || profileSection.label;
}

export function buildStudioMetadataPrompt(
  ctx: StudioContext,
  topic: string,
  outline: Outline,
  customScript?: string,
): string {
  const { name, niche, script } = ctx.config;
  const voicesBlock = studioVoicesBlock(ctx);
  const draftBlock = formatCustomScriptBlock(customScript);

  return `You are a YouTube content strategist writing metadata for a SPOKEN VIDEO (shadowing script), NOT a podcast episode.

Brand: "${name}"
Niche: ${niche}
Script format: ${script.format} — ${studioFormatDescription(script.format)}

${voicesBlock}

Topic: "${topic}"
Viral angle: ${outline.viralAngle}
Key takeaways: ${outline.keyTakeaways.join('; ')}
${draftBlock}

Return ONLY valid JSON:
{
  "title": "YouTube title — catchy, max 70 chars, keyword near front",
  "description": "SEO description with \\n line breaks — hook, bullets, summary",
  "thumbnailText": "Stacked headline — 4 lines max, ALL CAPS, use \\n",
  "thumbnailScene": "Visual scene for thumbnail — topic-specific"
}`;
}

export function buildStudioSectionPrompt(
  ctx: StudioContext,
  topic: string,
  section: StudioScriptSection,
  sectionBrief: string,
  previousLines: DialogueLine[],
  videoTitle: string,
  shortfall?: number,
  customScript?: string,
): string {
  const { name, script } = ctx.config;
  const voicesBlock = studioVoicesBlock(ctx);
  const lineRules = getLineRules(ctx);
  const flowExample = getFlowExample(ctx);
  const draftBlock = formatCustomScriptBlock(customScript);

  const retryNote = shortfall
    ? `\nCRITICAL: Write EXACTLY ${section.lineCount} lines this time.\n`
    : '';

  const outroNote =
    section.id === 'outro' || section.id === 'closing'
      ? `\nFinal section: land one takeaway, then warm sign-off if closingLine is configured.\n`
      : '';

  return `You are writing spoken lines for a ${script.format} VIDEO SCRIPT — for shadowing practice and final video edit.
This is NOT a podcast script. Do NOT write interview Q&A unless format is dialogue.

Brand: "${name}"
Topic: "${topic}"
Video title: "${videoTitle}"
Format: ${script.format} — ${studioFormatDescription(script.format)}
Language level: ${script.languageLevel}

${voicesBlock}
${draftBlock}
SECTION: ${section.label} (${section.lineCount} lines)
Brief: ${sectionBrief}
${retryNote}${outroNote}

LINE RULES:
${lineRules}

FLOW EXAMPLE:
${flowExample}

RECENT LINES (continue naturally — do not repeat):
${formatRecentContext(previousLines)}

REQUIREMENTS:
- Write EXACTLY ${section.lineCount} lines in the script array
- Each line: speaker name must be one of: ${ctx.speakers.join(', ')}
${getContinuesStoryRules()}

Return ONLY valid JSON:
{
  "script": [
    ${exampleLine(ctx, 0, false)},
    ${exampleLine(ctx, 0, true)}
  ]
}`;
}

export function buildStudioExpansionPrompt(
  ctx: StudioContext,
  topic: string,
  videoTitle: string,
  previousLines: DialogueLine[],
  linesNeeded: number,
  customScript?: string,
): string {
  const { name, script } = ctx.config;
  const voicesBlock = studioVoicesBlock(ctx);
  const draftBlock = formatCustomScriptBlock(customScript);

  return `Continue a ${script.format} spoken video script for "${name}" — NOT a podcast.

Topic: "${topic}"
Title: "${videoTitle}"

${voicesBlock}
${draftBlock}
Script is still too short. Add MORE spoken lines before the outro/closing.

${getLineRules(ctx)}
${getFlowExample(ctx)}

RECENT LINES:
${formatRecentContext(previousLines, 8)}

Write EXACTLY ${linesNeeded} additional lines — new details, not recap.
${getContinuesStoryRules()}

Return ONLY valid JSON:
{
  "script": [
    ${exampleLine(ctx, 0, false)},
    ${exampleLine(ctx, 0, true)}
  ]
}`;
}

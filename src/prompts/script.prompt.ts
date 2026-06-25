import { ChannelContext, ScriptSectionDef, buildHostsBlock } from '../channel/channel.types';
import { DialogueLine } from '../types';

function getDialogueRules(ctx: ChannelContext): string {
  const { script, hosts } = ctx.config;
  const hostNames = hosts.map((h) => h.name).join(' and ');
  const custom = script.dialogueRules?.trim();
  if (custom) return custom.replace(/\{hosts\}/g, hostNames);
  return `- English level: ${script.languageLevel}
- Only ${hostNames} speak — no narrator
- Natural spoken English — conversational podcast tone
- Each line: 1–2 sentences (~14–20 words per line)
- Do NOT include IPA — text only`;
}

function getDialogueFlowExample(ctx: ChannelContext): string {
  return (
    ctx.config.script.dialogueFlowExample?.trim() ??
    'Use natural turn-taking — the same host may speak 2–4 lines in a row when finishing a story.'
  );
}

export function scriptHasChannelClosing(ctx: ChannelContext, script: DialogueLine[]): boolean {
  const channelName = ctx.config.name;
  return script
    .slice(-3)
    .some((line) => line.text.toLowerCase().includes(channelName.toLowerCase()));
}

export function appendChannelClosing(ctx: ChannelContext, script: DialogueLine[]): DialogueLine[] {
  if (scriptHasChannelClosing(ctx, script)) {
    return script;
  }

  const speakers = ctx.speakers;
  const lastSpeaker = script.at(-1)?.speaker ?? speakers[0];
  const alternate = speakers.find((s) => s !== lastSpeaker) ?? speakers[0];

  return [...script, { speaker: alternate, text: ctx.closingText, continuesStory: false }];
}

export function countScriptWords(script: DialogueLine[]): number {
  return script.reduce(
    (sum, line) => sum + line.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
}

function formatCustomScriptBlock(customScript?: string): string {
  const trimmed = customScript?.trim();
  if (!trimmed) return '';

  return `
AUTHOR'S DRAFT SCRIPT (reference only — preserve key ideas, facts, structure, and tone; rewrite as natural host dialogue):
---
${trimmed}
---
`;
}

function formatRecentContext(lines: DialogueLine[], count = 6): string {
  if (lines.length === 0) {
    return '(Episode starts here — no prior dialogue.)';
  }

  return lines
    .slice(-count)
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n');
}

function getContinuesStoryRules(): string {
  return `- Every dialogue line MUST include "continuesStory" (boolean):
  - continuesStory: true — this line continues the SAME story/anecdote from the previous line (storyteller still mid-tell, not a new beat)
  - continuesStory: false — new turn: greeting, listener reaction, section transition, or starting a fresh story after the other host spoke
  - First line of the episode/section output: always continuesStory: false`;
}

function exampleSpeakerLine(ctx: ChannelContext, index: number, continuesStory: boolean): string {
  const speaker = ctx.speakers[index % ctx.speakers.length];
  return `{ "speaker": "${speaker}", "text": "...", "continuesStory": ${continuesStory} }`;
}

export function buildMetadataPrompt(
  ctx: ChannelContext,
  topic: string,
  customScript?: string,
): string {
  const { name, niche } = ctx.config;
  const hostsBlock = buildHostsBlock(ctx.config.hosts);
  const draftBlock = formatCustomScriptBlock(customScript);

  return `You are a professional podcast script writer for the YouTube channel "${name}".
Channel niche: ${niche}

${hostsBlock}

Episode title (fixed — do NOT change): "${topic}"
${draftBlock}

Return ONLY a valid JSON object (no markdown). Do NOT include a "title" field — the episode title is already set.
{
  "description": "YouTube SEO description using \\n line breaks:\\n1) Hook line ≤125 chars with main keyword\\n2) Blank line\\n3) 📌 In this episode you'll learn: + exactly 3 bullet takeaways (• prefix)\\n4) Blank line\\n5) Warm 2-sentence summary\\n6) 🔔 Subscribe CTA aligned with the channel niche",
  "thumbnailText": "Stacked headline — 4 lines max, ALL CAPS, 5–8 words total, use \\n between lines",
  "thumbnailScene": "Topic-specific changes only — host expressions, gestures, props, book spine titles (uppercase, topic-related)"
}`;
}

export function buildSectionPrompt(
  ctx: ChannelContext,
  topic: string,
  section: ScriptSectionDef,
  previousLines: DialogueLine[],
  episodeTitle: string,
  shortfall?: number,
  customScript?: string,
): string {
  const { name } = ctx.config;
  const hostsBlock = buildHostsBlock(ctx.config.hosts);
  const dialogueRules = getDialogueRules(ctx);
  const dialogueFlow = getDialogueFlowExample(ctx);
  const draftBlock = formatCustomScriptBlock(customScript);

  const retryNote = shortfall
    ? `\nCRITICAL: Your last attempt had too few lines. You MUST write EXACTLY ${section.lineCount} dialogue lines this time.\n`
    : '';

  const closingNote =
    section.id === 'closing'
      ? `\nClosing structure:
1. Most lines: keep talking — recap takeaways and one actionable tip in natural dialogue.
2. Last 1–2 lines only: a simple warm sign-off (goodbye + "see you next time on ${name}").
Do NOT include like, share, or subscribe CTAs — the video outro handles that.
The FINAL dialogue line MUST mention "${name}" (e.g. "See you next time on ${name}!").\n`
      : '';

  return `You are writing ONE section of a podcast script for "${name}".

Episode topic: "${topic}"
Episode title: "${episodeTitle}"

${hostsBlock}
${draftBlock}
SECTION TO WRITE: ${section.label}
${section.brief}
${retryNote}${closingNote}
${dialogueRules}

${dialogueFlow}

RECENT DIALOGUE (continue naturally from here — do not repeat):
${formatRecentContext(previousLines)}

REQUIREMENTS FOR THIS SECTION:
- Write EXACTLY ${section.lineCount} dialogue lines in the script array — count carefully
- Hit every point in the brief with enough depth — no filler, no circling back to the same idea
${getContinuesStoryRules()}

Return ONLY a valid JSON object (no markdown):
{
  "script": [
    ${exampleSpeakerLine(ctx, 0, false)},
    ${exampleSpeakerLine(ctx, 1, true)}
  ]
}`;
}

export function buildExpansionPrompt(
  ctx: ChannelContext,
  topic: string,
  episodeTitle: string,
  previousLines: DialogueLine[],
  linesNeeded: number,
  customScript?: string,
): string {
  const { name } = ctx.config;
  const hostsBlock = buildHostsBlock(ctx.config.hosts);
  const draftBlock = formatCustomScriptBlock(customScript);

  return `You are continuing a podcast script for "${name}".

Episode topic: "${topic}"
Episode title: "${episodeTitle}"

${hostsBlock}
${draftBlock}
The episode is still too short. Add MORE dialogue before the closing.

${getDialogueRules(ctx)}

${getDialogueFlowExample(ctx)}

RECENT DIALOGUE (continue from here):
${formatRecentContext(previousLines, 8)}

Write EXACTLY ${linesNeeded} additional dialogue lines — fresh example or sharper Q&A with concrete details, not more recap.
Each line should be ~14–20 words. Do NOT write a recap or closing yet.
${getContinuesStoryRules()}

Return ONLY a valid JSON object:
{
  "script": [
    ${exampleSpeakerLine(ctx, 0, false)},
    ${exampleSpeakerLine(ctx, 1, true)}
  ]
}`;
}

export function buildScriptPrompt(
  ctx: ChannelContext,
  topic: string,
  test = false,
  customScript?: string,
): string {
  const hostList = ctx.speakers.join(' and ');
  const draftBlock = formatCustomScriptBlock(customScript);

  if (test) {
    return `You are a professional podcast script writer.

Episode title (fixed — use exactly): "${topic}"
${draftBlock}
Hosts: ${hostList}.

Requirements:
- Exactly 12 dialogue lines total
- English level: ${ctx.config.script.languageLevel}
- Natural conversation, short sentences
- Include an "ipa" field for every line: General American English IPA in slashes
${getContinuesStoryRules()}

Return ONLY a valid JSON object. Do NOT include a "title" field — the episode title is already set.
{
  "description": "Short description.",
  "thumbnailText": "WHY\\nSMART\\nPEOPLE STAY\\nSTUCK?",
  "thumbnailScene": "Topic-specific scene for hosts.",
  "script": [
    { "speaker": "${ctx.speakers[0]}", "text": "...", "ipa": "/.../", "continuesStory": false }
  ]
}`;
  }

  throw new Error('buildScriptPrompt without test=true is deprecated — use sectional generation');
}

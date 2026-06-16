import { OpenAIService } from './openai.service';
import { ChannelContext } from '../channel/channel.types';
import {
  asSpeakerTuple,
  buildPodcastScriptSchema,
  buildScriptSectionResultSchema,
  DialogueLine,
  PodcastMetadataSchema,
  PodcastScript,
} from '../types';
import {
  appendChannelClosing,
  buildExpansionPrompt,
  buildMetadataPrompt,
  buildScriptPrompt,
  buildSectionPrompt,
  countScriptWords,
} from '../prompts/script.prompt';
import { logger } from '../utils/logger';

const MAX_SECTION_ATTEMPTS = 3;
const SYSTEM_PROMPT =
  'You are a professional podcast script writer. Respond only with valid JSON matching the requested structure exactly.';

export class ScriptService {
  private readonly speakers: [string, ...string[]];

  constructor(
    private readonly openai: OpenAIService,
    private readonly ctx: ChannelContext,
  ) {
    this.speakers = asSpeakerTuple(ctx.speakers);
  }

  async generate(topic: string, test = false, customScript?: string): Promise<PodcastScript> {
    const { script: scriptConfig } = this.ctx.config;
    const draftNote = customScript?.trim() ? ' (with custom draft)' : '';
    logger.info(
      `Generating podcast script for topic: "${topic}"${test ? ' [TEST MODE]' : ''}${draftNote}`,
    );

    if (test) {
      const script = await this.openai.generateJSON(
        buildScriptPrompt(this.ctx, topic, true, customScript),
        SYSTEM_PROMPT,
        (data) => buildPodcastScriptSchema(this.speakers, 10).parse(data),
      );
      logger.success(
        `Script ready — "${script.title}" (${script.script.length} lines, ${countScriptWords(script.script)} words)`,
      );
      return script;
    }

    const metadata = await this.openai.generateJSON(
      buildMetadataPrompt(this.ctx, topic, customScript),
      SYSTEM_PROMPT,
      (data) => PodcastMetadataSchema.parse(data),
    );

    const allLines: DialogueLine[] = [];

    for (const section of scriptConfig.sections) {
      logger.info(`Writing section "${section.label}" (${section.lineCount} lines)...`);
      const sectionLines = await this.generateSection(
        topic,
        section,
        allLines,
        metadata.title,
        customScript,
      );
      allLines.push(...sectionLines);
      logger.info(
        `  → ${sectionLines.length} lines (${countScriptWords(allLines)} words so far)`,
      );
    }

    let script: PodcastScript = { ...metadata, script: allLines };
    script = await this.expandIfNeeded(topic, script, customScript);
    script = {
      ...script,
      script: appendChannelClosing(this.ctx, script.script),
    };

    const words = countScriptWords(script.script);
    logger.success(
      `Script ready — "${script.title}" (${script.script.length} lines, ${words} words)`,
    );

    return script;
  }

  private async generateSection(
    topic: string,
    section: (typeof this.ctx.config.script.sections)[number],
    previousLines: DialogueLine[],
    episodeTitle: string,
    customScript?: string,
  ): Promise<DialogueLine[]> {
    let lastCount = 0;
    let lastLines: DialogueLine[] = [];
    const sectionSchema = buildScriptSectionResultSchema(this.speakers);

    for (let attempt = 1; attempt <= MAX_SECTION_ATTEMPTS; attempt++) {
      const result = await this.openai.generateJSON(
        buildSectionPrompt(
          this.ctx,
          topic,
          section,
          previousLines,
          episodeTitle,
          attempt > 1 ? lastCount : undefined,
          customScript,
        ),
        SYSTEM_PROMPT,
        (data) => sectionSchema.parse(data),
      );

      lastCount = result.script.length;
      lastLines = result.script;

      if (result.script.length >= section.lineCount) {
        return result.script.slice(0, section.lineCount);
      }

      logger.warn(
        `Section "${section.label}" too short: ${result.script.length}/${section.lineCount} lines — ` +
          `retry ${attempt}/${MAX_SECTION_ATTEMPTS}`,
      );
    }

    logger.warn(
      `Section "${section.label}" still short after ${MAX_SECTION_ATTEMPTS} attempts (${lastCount} lines) — using what we have`,
    );
    return lastLines;
  }

  private async expandIfNeeded(
    topic: string,
    script: PodcastScript,
    customScript?: string,
  ): Promise<PodcastScript> {
    const { targetMinWords, targetMinLines } = this.ctx.config.script;
    let lines = [...script.script];
    let words = countScriptWords(lines);

    if (words >= targetMinWords && lines.length >= targetMinLines) {
      return { ...script, script: lines };
    }

    const linesNeeded = Math.max(10, targetMinLines - lines.length + 5);
    logger.warn(
      `Script below target (${lines.length} lines, ${words} words) — expanding by ~${linesNeeded} lines...`,
    );

    const expansion = await this.openai.generateJSON(
      buildExpansionPrompt(this.ctx, topic, script.title, lines, linesNeeded, customScript),
      SYSTEM_PROMPT,
      (data) => buildScriptSectionResultSchema(this.speakers).parse(data),
    );

    const closingStart = findClosingStart(lines);
    lines = [...lines.slice(0, closingStart), ...expansion.script, ...lines.slice(closingStart)];
    words = countScriptWords(lines);

    logger.info(`After expansion: ${lines.length} lines, ${words} words`);

    return { ...script, script: lines };
  }
}

function findClosingStart(lines: DialogueLine[]): number {
  const closingPatterns = [
    /\brecap\b/i,
    /\blet'?s recap\b/i,
    /\bbefore you go\b/i,
    /\bsubscribe\b/i,
    /\bthanks for (joining|listening)\b/i,
  ];

  for (let i = Math.max(0, lines.length - 20); i < lines.length; i++) {
    if (closingPatterns.some((p) => p.test(lines[i].text))) {
      return i;
    }
  }

  return Math.max(0, lines.length - 14);
}

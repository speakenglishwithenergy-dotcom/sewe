import fs from 'fs/promises';
import { OpenAIService } from '../ai/openai.service';
import { buildReviseScriptPrompt } from '../prompts/studio/revise-script.prompt';
import {
  appendStudioClosing,
  buildStudioExpansionPrompt,
  buildStudioMetadataPrompt,
  buildStudioSectionPrompt,
  countScriptWords,
  resolveSectionBrief,
} from '../prompts/studio/studio-script.prompt';
import {
  asSpeakerTuple,
  buildPodcastScriptSchema,
  buildScriptSectionResultSchema,
  DialogueLine,
  PodcastMetadataSchema,
  PodcastScript,
} from '../types';
import { Outline, StudioScriptSection } from './studio.types';
import { StudioContext } from './studio.types';
import { logger } from '../utils/logger';

const MAX_SECTION_ATTEMPTS = 3;
const SYSTEM_PROMPT =
  'You are a spoken video script writer for shadowing practice. Respond only with valid JSON matching the requested structure exactly.';

export class StudioScriptService {
  private readonly speakers: [string, ...string[]];

  constructor(
    private readonly openai: OpenAIService,
    private readonly ctx: StudioContext,
  ) {
    this.speakers = asSpeakerTuple(ctx.speakers);
  }

  async generateFromOutline(
    topic: string,
    outline: Outline,
    customScript?: string,
  ): Promise<PodcastScript> {
    const draftNote = customScript?.trim() ? ' (with custom draft)' : '';
    logger.info(
      `Generating ${this.ctx.config.script.format} script from outline: "${topic}"${draftNote}`,
    );

    const metadata = await this.openai.generateJSON(
      buildStudioMetadataPrompt(this.ctx, topic, outline, customScript),
      SYSTEM_PROMPT,
      (data) => PodcastMetadataSchema.parse(data),
    );

    const allLines: DialogueLine[] = [];
    const scriptConfig = this.ctx.config.script;

    for (const section of scriptConfig.sections) {
      const outlineSection = outline.sections.find((s) => s.id === section.id);
      if (!outlineSection) {
        throw new Error(`Outline missing section "${section.id}"`);
      }

      const sectionBrief = resolveSectionBrief(section, outlineSection);

      logger.info(`Writing section "${section.label}" (${section.lineCount} lines)...`);
      const sectionLines = await this.generateSection(
        topic,
        section,
        sectionBrief,
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
      script: appendStudioClosing(this.ctx, script.script),
    };

    const words = countScriptWords(script.script);
    logger.success(
      `Script ready — "${script.title}" (${script.script.length} lines, ${words} words)`,
    );

    return script;
  }

  async revise(script: PodcastScript, instruction: string): Promise<PodcastScript> {
    logger.info(`Revising script: ${instruction.slice(0, 80)}...`);

    const revised = await this.openai.generateJSON(
      buildReviseScriptPrompt(this.ctx, script, instruction),
      SYSTEM_PROMPT,
      (data) => buildPodcastScriptSchema(this.speakers, 10).parse(data),
    );

    logger.success(`Revision complete — ${revised.script.length} lines`);
    return revised;
  }

  async loadScript(scriptPath: string): Promise<PodcastScript> {
    const raw = await fs.readFile(scriptPath, 'utf-8');
    return buildPodcastScriptSchema(this.speakers, 10).parse(JSON.parse(raw));
  }

  async saveScript(scriptPath: string, script: PodcastScript): Promise<void> {
    await fs.writeFile(scriptPath, JSON.stringify(script, null, 2), 'utf-8');
    logger.success(`Script saved → ${scriptPath}`);
  }

  private async generateSection(
    topic: string,
    section: StudioScriptSection,
    sectionBrief: string,
    previousLines: DialogueLine[],
    videoTitle: string,
    customScript?: string,
  ): Promise<DialogueLine[]> {
    let lastCount = 0;
    let lastLines: DialogueLine[] = [];
    const sectionSchema = buildScriptSectionResultSchema(this.speakers);

    for (let attempt = 1; attempt <= MAX_SECTION_ATTEMPTS; attempt++) {
      const result = await this.openai.generateJSON(
        buildStudioSectionPrompt(
          this.ctx,
          topic,
          section,
          sectionBrief,
          previousLines,
          videoTitle,
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
        `Section "${section.label}" too short: ${result.script.length}/${section.lineCount} — ` +
          `retry ${attempt}/${MAX_SECTION_ATTEMPTS}`,
      );
    }

    logger.warn(
      `Section "${section.label}" still short after ${MAX_SECTION_ATTEMPTS} attempts — using ${lastCount} lines`,
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
      buildStudioExpansionPrompt(
        this.ctx,
        topic,
        script.title,
        lines,
        linesNeeded,
        customScript,
      ),
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
    /\bthanks for (watching|practicing|shadowing)\b/i,
    /\bsee you (next|in the next)\b/i,
  ];

  for (let i = Math.max(0, lines.length - 20); i < lines.length; i++) {
    if (closingPatterns.some((p) => p.test(lines[i].text))) {
      return i;
    }
  }

  return Math.max(0, lines.length - 14);
}

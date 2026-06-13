import { OpenAIService } from './openai.service';
import {
  DialogueLine,
  PodcastMetadataSchema,
  PodcastScript,
  PodcastScriptSchema,
  ScriptSectionResultSchema,
} from '../types';
import {
  appendChannelClosing,
  buildExpansionPrompt,
  buildMetadataPrompt,
  buildScriptPrompt,
  buildSectionPrompt,
  countScriptWords,
  SCRIPT_SECTIONS,
  SCRIPT_TARGET_MIN_LINES,
  SCRIPT_TARGET_MIN_WORDS,
} from '../prompts/script.prompt';
import { logger } from '../utils/logger';

const MAX_SECTION_ATTEMPTS = 3;
const SYSTEM_PROMPT =
  'You are a professional podcast script writer. Respond only with valid JSON matching the requested structure exactly.';

export class ScriptService {
  constructor(private readonly openai: OpenAIService) {}

  async generate(topic: string, test = false): Promise<PodcastScript> {
    logger.info(`Generating podcast script for topic: "${topic}"${test ? ' [TEST MODE]' : ''}`);

    if (test) {
      const script = await this.openai.generateJSON(
        buildScriptPrompt(topic, true),
        SYSTEM_PROMPT,
        (data) => PodcastScriptSchema.parse(data),
      );
      logger.success(
        `Script ready — "${script.title}" (${script.script.length} lines, ${countScriptWords(script.script)} words)`,
      );
      return script;
    }

    const metadata = await this.openai.generateJSON(
      buildMetadataPrompt(topic),
      SYSTEM_PROMPT,
      (data) => PodcastMetadataSchema.parse(data),
    );

    const allLines: DialogueLine[] = [];

    for (const section of SCRIPT_SECTIONS) {
      logger.info(`Writing section "${section.label}" (${section.lineCount} lines)...`);
      const sectionLines = await this.generateSection(topic, section, allLines, metadata.title);
      allLines.push(...sectionLines);
      logger.info(
        `  → ${sectionLines.length} lines (${countScriptWords(allLines)} words so far)`,
      );
    }

    let script: PodcastScript = { ...metadata, script: allLines };
    script = await this.expandIfNeeded(topic, script);
    script = {
      ...script,
      script: appendChannelClosing(script.script),
    };

    const words = countScriptWords(script.script);
    logger.success(
      `Script ready — "${script.title}" (${script.script.length} lines, ${words} words)`,
    );

    return script;
  }

  private async generateSection(
    topic: string,
    section: (typeof SCRIPT_SECTIONS)[number],
    previousLines: DialogueLine[],
    episodeTitle: string,
  ): Promise<DialogueLine[]> {
    let lastCount = 0;
    let lastLines: DialogueLine[] = [];

    for (let attempt = 1; attempt <= MAX_SECTION_ATTEMPTS; attempt++) {
      const result = await this.openai.generateJSON(
        buildSectionPrompt(
          topic,
          section,
          previousLines,
          episodeTitle,
          attempt > 1 ? lastCount : undefined,
        ),
        SYSTEM_PROMPT,
        (data) => ScriptSectionResultSchema.parse(data),
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

  private async expandIfNeeded(topic: string, script: PodcastScript): Promise<PodcastScript> {
    let lines = [...script.script];
    let words = countScriptWords(lines);

    if (words >= SCRIPT_TARGET_MIN_WORDS && lines.length >= SCRIPT_TARGET_MIN_LINES) {
      return { ...script, script: lines };
    }

    const linesNeeded = Math.max(10, SCRIPT_TARGET_MIN_LINES - lines.length + 5);
    logger.warn(
      `Script below target (${lines.length} lines, ${words} words) — expanding by ~${linesNeeded} lines...`,
    );

    const expansion = await this.openai.generateJSON(
      buildExpansionPrompt(topic, script.title, lines, linesNeeded),
      SYSTEM_PROMPT,
      (data) => ScriptSectionResultSchema.parse(data),
    );

    // Insert expansion before any closing/sign-off lines in the last section
    const closingStart = findClosingStart(lines);
    lines = [...lines.slice(0, closingStart), ...expansion.script, ...lines.slice(closingStart)];
    words = countScriptWords(lines);

    logger.info(`After expansion: ${lines.length} lines, ${words} words`);

    return { ...script, script: lines };
  }
}

/** Find where recap/closing begins so expansion inserts before it. */
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

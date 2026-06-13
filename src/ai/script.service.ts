import { OpenAIService } from './openai.service';
import { PodcastScript, PodcastScriptSchema } from '../types';
import {
  appendChannelClosing,
  buildScriptPrompt,
  countScriptWords,
  SCRIPT_TARGET_MIN_LINES,
  SCRIPT_TARGET_MIN_WORDS,
} from '../prompts/script.prompt';
import { logger } from '../utils/logger';

const MAX_SCRIPT_ATTEMPTS = 3;

export class ScriptService {
  constructor(private readonly openai: OpenAIService) {}

  async generate(topic: string, test = false): Promise<PodcastScript> {
    logger.info(`Generating podcast script for topic: "${topic}"${test ? ' [TEST MODE]' : ''}`);

    let script = await this.requestScript(topic, test);
    if (!test) {
      script = await this.ensureMinimumLength(topic, script);
    }
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

  private async requestScript(
    topic: string,
    test: boolean,
    retry?: { lines: number; words: number },
  ): Promise<PodcastScript> {
    return this.openai.generateJSON(
      buildScriptPrompt(topic, test, retry),
      'You are a professional podcast script writer. Respond only with valid JSON matching the requested structure exactly.',
      (data) => PodcastScriptSchema.parse(data),
    );
  }

  private async ensureMinimumLength(
    topic: string,
    script: PodcastScript,
  ): Promise<PodcastScript> {
    let current = script;

    for (let attempt = 2; attempt <= MAX_SCRIPT_ATTEMPTS; attempt++) {
      const words = countScriptWords(current.script);
      if (
        current.script.length >= SCRIPT_TARGET_MIN_LINES &&
        words >= SCRIPT_TARGET_MIN_WORDS
      ) {
        return current;
      }

      logger.warn(
        `Script too short (${current.script.length} lines, ${words} words) — ` +
          `target is ${SCRIPT_TARGET_MIN_LINES}+ lines and ${SCRIPT_TARGET_MIN_WORDS}+ words. ` +
          `Retrying (${attempt}/${MAX_SCRIPT_ATTEMPTS})...`,
      );

      current = await this.requestScript(topic, false, {
        lines: current.script.length,
        words,
      });
    }

    const words = countScriptWords(current.script);
    if (
      current.script.length < SCRIPT_TARGET_MIN_LINES ||
      words < SCRIPT_TARGET_MIN_WORDS
    ) {
      logger.warn(
        `Script still below target after ${MAX_SCRIPT_ATTEMPTS} attempts ` +
          `(${current.script.length} lines, ${words} words). Proceeding anyway.`,
      );
    }

    return current;
  }
}

import { DialogueLine, PodcastScript } from '../types';
import { logger } from '../utils/logger';
import { inferContinuesStory } from './shadowing-continues.util';
import { assertScriptFidelity } from './shadowing-fidelity.util';
import { parseShadowingDraft } from './shadowing-draft.util';
import { sentencesFromTextFile } from './shadowing-read.util';
import { titleFromDraft } from './shadowing-split.util';

export class ShadowingScriptService {
  constructor(private readonly speakerName: string) {}

  async generateFromDraft(draft: string, titleOverride?: string): Promise<PodcastScript> {
    const trimmed = draft.trim();
    if (!trimmed) {
      throw new Error('Draft is empty');
    }

    logger.info(`Splitting draft into sentences (${this.speakerName} only)...`);

    const parsed = parseShadowingDraft(trimmed);
    const sentences = sentencesFromTextFile(trimmed);
    if (sentences.length === 0) {
      throw new Error('Draft has no text');
    }

    let previousLineText: string | null = null;
    const script: DialogueLine[] = sentences.map((text) => {
      const line: DialogueLine = {
        speaker: this.speakerName,
        text,
        continuesStory: inferContinuesStory(previousLineText),
      };
      previousLineText = text;
      return line;
    });

    assertScriptFidelity(trimmed, script);

    const title =
      titleOverride ?? parsed.title ?? titleFromDraft(sentences[0] ?? trimmed);

    const result: PodcastScript = {
      title,
      description: parsed.description ?? title,
      thumbnailText: title.slice(0, 40).toUpperCase(),
      script,
    };

    logger.success(`Script ready — "${result.title}" (${result.script.length} lines)`);
    return result;
  }
}

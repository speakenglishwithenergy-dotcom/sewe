import { DialogueLine, PodcastScript } from '../types';
import { logger } from '../utils/logger';
import { parseShadowingDraft, ParsedAudioLine } from './shadowing-draft.util';
import { splitDraftIntoLines, titleFromDraft } from './shadowing-split.util';

export class ShadowingScriptService {
  constructor(private readonly speakerName: string) {}

  async generateFromDraft(draft: string, titleOverride?: string): Promise<PodcastScript> {
    const trimmed = draft.trim();
    if (!trimmed) {
      throw new Error('Draft is empty');
    }

    logger.info(`Formatting draft into shadowing script (${this.speakerName} only)...`);

    const parsed = parseShadowingDraft(trimmed);
    const script =
      parsed.audioLines.length > 0
        ? this.linesFromAudioBlocks(parsed.audioLines)
        : splitDraftIntoLines(trimmed, this.speakerName);

    const title =
      titleOverride ?? parsed.title ?? titleFromDraft(script.map((line) => line.text).join(' '));

    const result: PodcastScript = {
      title,
      description: parsed.description ?? title,
      thumbnailText: title.slice(0, 40).toUpperCase(),
      script,
    };

    logger.success(`Script ready — "${result.title}" (${result.script.length} lines)`);
    return result;
  }

  private linesFromAudioBlocks(audioLines: ParsedAudioLine[]): DialogueLine[] {
    return audioLines.map(({ text, continuesStory }) => ({
      speaker: this.speakerName,
      text,
      continuesStory,
    }));
  }
}

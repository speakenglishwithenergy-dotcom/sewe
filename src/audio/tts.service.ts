import path from 'path';
import fs from 'fs/promises';
import { SupertonicService } from './supertonic.service';
import { FFmpegService } from '../ffmpeg/ffmpeg.service';
import {
  DEFAULT_TTS_MAX_RETRIES,
  DEFAULT_TTS_TOTAL_STEPS,
  estimateMinDurationSeconds,
  isSuspiciousSegmentDuration,
  isWavFilePlausible,
  prepareTextForTts,
} from './tts-stability';
import { pauseAfterLine } from './segment-pause.util';
import { AudioSegment, DialogueLine } from '../types';
import { logger } from '../utils/logger';

const PODCAST_TTS_SPEED = 0.85;

export class TTSService {
  constructor(
    private readonly supertonic: SupertonicService,
    private readonly ffmpeg: FFmpegService,
    private readonly voiceMap: Record<string, string> = {},
  ) {}

  private async synthesizeWithStability(
    text: string,
    filePath: string,
    voiceName: string,
    speed = PODCAST_TTS_SPEED,
  ): Promise<number> {
    const preparedText = prepareTextForTts(text);
    const minDuration = estimateMinDurationSeconds(preparedText, speed);
    const maxAttempts = DEFAULT_TTS_MAX_RETRIES;
    const totalSteps = DEFAULT_TTS_TOTAL_STEPS;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        await fs.unlink(filePath).catch(() => {});
        logger.warn(
          `  ↻ TTS retry ${attempt}/${maxAttempts}: "${preparedText.slice(0, 50)}${preparedText.length > 50 ? '…' : ''}"`,
        );
      }

      await this.supertonic.generateSpeech(
        preparedText,
        'en',
        voiceName,
        filePath,
        speed,
        totalSteps,
      );

      const duration = await this.ffmpeg.getAudioDuration(filePath);
      const wavOk = await isWavFilePlausible(filePath, minDuration);
      const durationOk = !isSuspiciousSegmentDuration(preparedText, duration, speed);

      if (wavOk && durationOk) {
        return duration;
      }

      if (attempt === maxAttempts) {
        logger.warn(
          `  ⚠ TTS output still looks off after ${maxAttempts} attempts (${duration.toFixed(2)}s) — keeping last result`,
        );
        return duration;
      }
    }

    return this.ffmpeg.getAudioDuration(filePath);
  }

  private async needsRegeneration(
    text: string,
    filePath: string,
    speed = PODCAST_TTS_SPEED,
  ): Promise<boolean> {
    const preparedText = prepareTextForTts(text);
    const minDuration = estimateMinDurationSeconds(preparedText, speed);

    if (!(await isWavFilePlausible(filePath, minDuration))) {
      return true;
    }

    const duration = await this.ffmpeg.getAudioDuration(filePath);
    return isSuspiciousSegmentDuration(preparedText, duration, speed);
  }

  /**
   * Generate one MP3 file per dialogue line.
   * Returns AudioSegment[] with accurate timestamps derived from ffprobe.
   */
  async generateSegments(
    script: DialogueLine[],
    audioDir: string,
    pauseBetweenSegments?: number,
  ): Promise<AudioSegment[]> {
    const useAdaptivePause = pauseBetweenSegments === undefined;
    await fs.mkdir(audioDir, { recursive: true });

    logger.info(
      `Generating ${script.length} audio segments via TTS (steps=${DEFAULT_TTS_TOTAL_STEPS}, retries=${DEFAULT_TTS_MAX_RETRIES})...`,
    );

    const segments: AudioSegment[] = [];
    let currentTime = 0;

    for (let i = 0; i < script.length; i++) {
      const line = script[i];
      const index = i + 1;
      const fileName = `${String(index).padStart(3, '0')}.wav`;
      const filePath = path.join(audioDir, fileName);

      const voiceName = this.voiceMap[line.speaker];
      if (!voiceName) {
        throw new Error(`No voice mapping for speaker "${line.speaker}"`);
      }
      const preview = prepareTextForTts(line.text);
      const previewText = `"${preview.slice(0, 60)}${preview.length > 60 ? '…' : ''}"`;

      let cached = false;
      try {
        await fs.access(filePath);
        cached = !(await this.needsRegeneration(line.text, filePath));
      } catch {
        // file does not exist — generate it
      }

      if (cached) {
        logger.info(`  [${index}/${script.length}] ⏭  ${line.speaker}: (cached) ${previewText}`);
      } else {
        logger.info(`  [${index}/${script.length}] ${line.speaker}: ${previewText}`);
        await this.synthesizeWithStability(line.text, filePath, voiceName);
      }

      const duration = await this.ffmpeg.getAudioDuration(filePath);

      const pauseAfter = useAdaptivePause
        ? pauseAfterLine(script, i)
        : (i < script.length - 1 ? pauseBetweenSegments! : 0);

      segments.push({
        index,
        speaker: line.speaker,
        text: line.text,
        ipa: line.ipa,
        keywords: line.keywords,
        filePath,
        duration,
        startTime: currentTime,
        pauseAfter,
      });

      currentTime += duration + pauseAfter;
    }

    logger.success(`${segments.length} audio segments generated`);
    return segments;
  }

  /** Generate a single narration clip (e.g. episode title intro). */
  async generateNarration(
    text: string,
    filePath: string,
    voiceName: string,
    speed = PODCAST_TTS_SPEED,
  ): Promise<number> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const preparedText = prepareTextForTts(text);
    const previewText = `"${preparedText.slice(0, 60)}${preparedText.length > 60 ? '…' : ''}"`;

    let cached = false;
    try {
      await fs.access(filePath);
      cached = !(await this.needsRegeneration(text, filePath, speed));
    } catch {
      // file does not exist — generate it
    }

    if (cached) {
      logger.info(`  ⏭  Narration (cached): ${previewText}`);
    } else {
      logger.info(`  Narration: ${previewText}`);
      await this.synthesizeWithStability(text, filePath, voiceName, speed);
    }

    return this.ffmpeg.getAudioDuration(filePath);
  }
}

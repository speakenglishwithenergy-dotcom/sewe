import path from 'path';
import fs from 'fs/promises';
import { SupertonicService } from './supertonic.service';
import { FFmpegService } from '../ffmpeg/ffmpeg.service';
import { AudioSegment, DialogueLine, VOICE_MAP, PAUSE_BETWEEN_SEGMENTS, Speaker } from '../types';
import { logger } from '../utils/logger';

export class TTSService {
  constructor(
    private readonly supertonic: SupertonicService,
    private readonly ffmpeg: FFmpegService,
  ) {}

  /**
   * Generate one MP3 file per dialogue line.
   * Returns AudioSegment[] with accurate timestamps derived from ffprobe.
   */
  async generateSegments(
    script: DialogueLine[],
    audioDir: string,
  ): Promise<AudioSegment[]> {
    await fs.mkdir(audioDir, { recursive: true });

    logger.info(`Generating ${script.length} audio segments via TTS...`);

    const segments: AudioSegment[] = [];
    let currentTime = 0;

    for (let i = 0; i < script.length; i++) {
      const line = script[i];
      const index = i + 1;
      const fileName = `${String(index).padStart(3, '0')}.wav`;
      const filePath = path.join(audioDir, fileName);

      const voiceName = VOICE_MAP[line.speaker as Speaker];

      // Resume: skip TTS call if audio file already exists
      let cached = false;
      try {
        await fs.access(filePath);
        cached = true;
      } catch {
        // file does not exist — generate it
      }

      if (cached) {
        logger.info(`  [${index}/${script.length}] ⏭  ${line.speaker}: (cached) "${line.text.slice(0, 60)}${line.text.length > 60 ? '…' : ''}"`);
      } else {
        logger.info(`  [${index}/${script.length}] ${line.speaker}: "${line.text.slice(0, 60)}${line.text.length > 60 ? '…' : ''}"`);
        await this.supertonic.generateSpeech(line.text, 'en', voiceName, filePath, 0.85);
      }

      const duration = await this.ffmpeg.getAudioDuration(filePath);

      segments.push({
        index,
        speaker: line.speaker as Speaker,
        text: line.text,
        filePath,
        duration,
        startTime: currentTime,
      });

      // Advance time: current segment duration + silence gap before next segment
      currentTime += duration + PAUSE_BETWEEN_SEGMENTS;
    }

    logger.success(`${segments.length} audio segments generated`);
    return segments;
  }
}

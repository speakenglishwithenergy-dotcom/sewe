import path from 'path';
import fs from 'fs/promises';
import { OpenAIService } from '../ai/openai.service';
import { FFmpegService } from '../ffmpeg/ffmpeg.service';
import { AudioSegment, DialogueLine, VOICE_MAP, PAUSE_BETWEEN_SEGMENTS, Speaker } from '../types';
import { logger } from '../utils/logger';

export class TTSService {
  constructor(
    private readonly openai: OpenAIService,
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
      const fileName = `${String(index).padStart(3, '0')}.mp3`;
      const filePath = path.join(audioDir, fileName);

      logger.info(`  [${index}/${script.length}] ${line.speaker}: "${line.text.slice(0, 60)}${line.text.length > 60 ? '…' : ''}"`);

      const voice = VOICE_MAP[line.speaker as Speaker];
      await this.openai.generateSpeech(line.text, voice, filePath);

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

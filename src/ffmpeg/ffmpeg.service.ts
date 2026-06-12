import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

interface FFprobeStream {
  duration?: string;
}

interface FFprobeOutput {
  streams: FFprobeStream[];
}

export class FFmpegService {
  /**
   * Verify that ffmpeg and ffprobe are available on PATH.
   */
  async checkDependencies(): Promise<void> {
    for (const bin of ['ffmpeg', 'ffprobe']) {
      try {
        await execFileAsync(bin, ['-version']);
      } catch {
        throw new Error(
          `"${bin}" not found. Install FFmpeg: https://ffmpeg.org/download.html (macOS: brew install ffmpeg)`,
        );
      }
    }
  }

  /**
   * Return the duration of an audio/video file in seconds using ffprobe.
   */
  async getAudioDuration(filePath: string): Promise<number> {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      filePath,
    ]);

    const data = JSON.parse(stdout) as FFprobeOutput;
    const rawDuration = data.streams[0]?.duration ?? '0';
    const duration = parseFloat(rawDuration);

    if (isNaN(duration) || duration <= 0) {
      throw new Error(`Could not read duration from: ${filePath}`);
    }

    return duration;
  }

  /**
   * Generate a silent WAV file of the given duration.
   */
  async generateSilence(outputPath: string, durationSeconds: number): Promise<void> {
    await execFileAsync('ffmpeg', [
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=mono',
      '-t', String(durationSeconds),
      '-y',
      outputPath,
    ]);
  }

  /**
   * Merge an ordered list of WAV files into a single podcast.mp3.
   * A silent gap of `pauseSeconds` is inserted between each segment.
   */
  async mergeAudioFiles(
    inputFiles: string[],
    outputPath: string,
    pauseSeconds: number,
  ): Promise<void> {
    if (inputFiles.length === 0) {
      throw new Error('No audio files provided for merge');
    }

    const tmpDir = path.dirname(outputPath);
    const silencePath = path.join(tmpDir, '_silence.wav');
    const concatListPath = path.join(tmpDir, '_concat.txt');

    logger.info(`Merging ${inputFiles.length} audio segments with ${pauseSeconds}s pause...`);

    // Generate a short silence clip
    await this.generateSilence(silencePath, pauseSeconds);

    // Build ffmpeg concat file — silence between every pair, not after the last
    const lines: string[] = [];
    for (let i = 0; i < inputFiles.length; i++) {
      lines.push(`file '${inputFiles[i]}'`);
      if (i < inputFiles.length - 1) {
        lines.push(`file '${silencePath}'`);
      }
    }
    await fs.writeFile(concatListPath, lines.join('\n'), 'utf-8');

    await execFileAsync('ffmpeg', [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-acodec', 'libmp3lame',
      '-ab', '192k',
      '-ar', '44100',
      '-y',
      outputPath,
    ]);

    // Cleanup temporary files
    await Promise.allSettled([
      fs.unlink(silencePath),
      fs.unlink(concatListPath),
    ]);
  }

  /**
   * Compose the final 1920×1080 H.264 video from a static background image,
   * the merged podcast audio, and a burned-in SRT subtitle track.
   */
  async generateVideo(
    backgroundPath: string,
    audioPath: string,
    subtitlesPath: string,
    outputPath: string,
  ): Promise<void> {
    logger.info('Running FFmpeg video encode (this may take several minutes)...');

    // In FFmpeg filter strings the colon is the option separator, so any colon
    // that appears in the subtitle path (Windows drive letters) must be escaped.
    // On macOS/Linux paths never contain colons, so this is a no-op — but keeps
    // the code cross-platform safe.
    const safeSubs = subtitlesPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    const subtitleFilter =
      `subtitles='${safeSubs}':` +
      `force_style='Fontsize=40,` +
      `PrimaryColour=&H00FFFFFF,` +
      `OutlineColour=&H00000000,` +
      `BorderStyle=1,Outline=3,Shadow=2,` +
      `Alignment=2,MarginV=50'`;

    const vfFilter = `scale=1920:1080,${subtitleFilter}`;

    await execFileAsync(
      'ffmpeg',
      [
        '-loop', '1',
        '-i', backgroundPath,
        '-i', audioPath,
        '-vf', vfFilter,
        '-c:v', 'libx264',
        '-preset', 'slow',
        '-crf', '20',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ],
      // Increase buffer — video stdout/stderr can be large
      { maxBuffer: 256 * 1024 * 1024 },
    );
  }
}

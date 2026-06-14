import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';
import { buildSubtitleForceStyle } from '../subtitles/subtitle-style';

const execFileAsync = promisify(execFile);

/** Linear gain applied to podcast speech before mixing (+6 dB at 2.0). */
const PODCAST_VOLUME = 2.0;

/** Crossfade duration between final-video segments. */
const FADE_DURATION = 0.5;

const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;
const SHORT_VIDEO_WIDTH = 1080;
const SHORT_VIDEO_HEIGHT = 1920;
const VIDEO_FPS = 30;

// Candidate FFmpeg installations, ordered by preference.
// ffmpeg-full (Homebrew keg-only) includes libass and the subtitles filter.
const FFMPEG_CANDIDATES = [
  '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
  'ffmpeg',
];
const FFPROBE_CANDIDATES = [
  '/opt/homebrew/opt/ffmpeg-full/bin/ffprobe',
  'ffprobe',
];

interface FFprobeFormat {
  duration?: string;
}

interface FFprobeFormatOutput {
  format: FFprobeFormat;
}

export class FFmpegService {
  private ffmpegBin = 'ffmpeg';
  private ffprobeBin = 'ffprobe';

  /**
   * Verify that ffmpeg and ffprobe are available on PATH.
   * Prefers a build that includes the subtitles filter (requires libass).
   */
  async checkDependencies(): Promise<void> {
    // Resolve the best available ffmpeg binary.
    this.ffmpegBin = await this.resolveBin(FFMPEG_CANDIDATES, 'ffmpeg');
    this.ffprobeBin = await this.resolveBin(FFPROBE_CANDIDATES, 'ffprobe');
  }

  private async resolveBin(candidates: string[], name: string): Promise<string> {
    for (const bin of candidates) {
      try {
        await execFileAsync(bin, ['-version']);
        return bin;
      } catch {
        // not found, try next
      }
    }
    throw new Error(
      `"${name}" not found. Install FFmpeg: https://ffmpeg.org/download.html (macOS: brew install ffmpeg-full)`,
    );
  }

  /**
   * Return the duration of an audio/video file in seconds using ffprobe.
   */
  async getMediaDuration(filePath: string): Promise<number> {
    const { stdout } = await execFileAsync(this.ffprobeBin, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath,
    ]);

    const data = JSON.parse(stdout) as FFprobeFormatOutput;
    const duration = parseFloat(data.format.duration ?? '0');

    if (isNaN(duration) || duration <= 0) {
      throw new Error(`Could not read duration from: ${filePath}`);
    }

    return duration;
  }

  /** @deprecated Use getMediaDuration */
  async getAudioDuration(filePath: string): Promise<number> {
    return this.getMediaDuration(filePath);
  }

  /**
   * Generate a silent WAV file of the given duration.
   */
  async generateSilence(outputPath: string, durationSeconds: number): Promise<void> {
    await execFileAsync(this.ffmpegBin, [
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
    firstPauseSeconds = pauseSeconds,
  ): Promise<void> {
    if (inputFiles.length === 0) {
      throw new Error('No audio files provided for merge');
    }

    const tmpDir = path.dirname(outputPath);
    const pauseValues = [...new Set([firstPauseSeconds, pauseSeconds])];
    const silenceByDuration = new Map<number, string>();
    const concatListPath = path.join(tmpDir, '_concat.txt');

    logger.info(
      `Merging ${inputFiles.length} audio segments with ${pauseSeconds}s pause` +
        (firstPauseSeconds !== pauseSeconds ? ` (${firstPauseSeconds}s after first)` : '') +
        '...',
    );

    for (const duration of pauseValues) {
      const silencePath = path.join(tmpDir, `_silence_${duration}s.wav`);
      await this.generateSilence(silencePath, duration);
      silenceByDuration.set(duration, silencePath);
    }

    // Build ffmpeg concat file — silence between every pair, not after the last
    const lines: string[] = [];
    for (let i = 0; i < inputFiles.length; i++) {
      lines.push(`file '${inputFiles[i]}'`);
      if (i < inputFiles.length - 1) {
        const gap = i === 0 ? firstPauseSeconds : pauseSeconds;
        lines.push(`file '${silenceByDuration.get(gap)!}'`);
      }
    }
    await fs.writeFile(concatListPath, lines.join('\n'), 'utf-8');

    await execFileAsync(this.ffmpegBin, [
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
      ...pauseValues.map((duration) => fs.unlink(silenceByDuration.get(duration)!)),
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

    // Escape characters special to FFmpeg filter option parsing.
    // Colons are option separators; backslashes need doubling.
    const safeSubs = subtitlesPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');

    // Commas in force_style must be escaped as \, so they are not treated as
    // filtergraph-level filter separators (FFmpeg 8.x is strict about this).
    const subtitleFilter = `subtitles=filename=${safeSubs}:force_style=${buildSubtitleForceStyle(14, 70)}`;

    // Wave strip: 500×200 dot waveform, brand purple, overlaid above subtitle zone
    const filterComplex = [
      `[0:v]scale=1920:1080[bg]`,
      `[1:a]volume=${PODCAST_VOLUME},asplit=2[aout][awave]`,
      `[awave]showwaves=size=500x200:mode=point:colors=0x2ba6e1@0.9:rate=30,format=yuva420p[waves]`,
      `[bg][waves]overlay=700:800,format=yuv420p,${subtitleFilter}[vout]`,
    ].join(';');

    await execFileAsync(
      this.ffmpegBin,
      [
        '-loop', '1',
        '-i', backgroundPath,
        '-i', audioPath,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', '[aout]',
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

  /**
   * Compose a 1080×1920 vertical H.264 video from a static background,
   * merged short audio, and burned-in SRT subtitles (no waveform overlay).
   */
  async generateShortVideo(
    backgroundPath: string,
    audioPath: string,
    subtitlesPath: string,
    outputPath: string,
  ): Promise<void> {
    logger.info('Running FFmpeg short video encode...');

    const safeSubs = subtitlesPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');

    const subtitleFilter = `subtitles=filename=${safeSubs}:force_style=${buildSubtitleForceStyle(10, 48)}`;

    const filterComplex = [
      `[0:v]scale=${SHORT_VIDEO_WIDTH}:${SHORT_VIDEO_HEIGHT}[bg]`,
      `[1:a]volume=${PODCAST_VOLUME}[aout]`,
      `[bg]format=yuv420p,${subtitleFilter}[vout]`,
    ].join(';');

    await execFileAsync(
      this.ffmpegBin,
      [
        '-loop', '1',
        '-i', backgroundPath,
        '-i', audioPath,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', '[aout]',
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
      { maxBuffer: 256 * 1024 * 1024 },
    );
  }

  /**
   * Create a short H.264 clip from a static image (e.g. YouTube thumbnail).
   */
  async generateImageVideo(
    imagePath: string,
    outputPath: string,
    durationSeconds: number,
    width = VIDEO_WIDTH,
    height = VIDEO_HEIGHT,
  ): Promise<void> {
    logger.info(`Creating ${durationSeconds}s thumbnail video (${width}x${height})...`);

    await execFileAsync(
      this.ffmpegBin,
      [
        '-loop', '1',
        '-i', imagePath,
        '-f', 'lavfi',
        '-i', 'anullsrc=r=44100:cl=stereo',
        '-t', String(durationSeconds),
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${VIDEO_FPS},format=yuv420p`,
        '-c:v', 'libx264',
        '-preset', 'slow',
        '-crf', '20',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
  }

  /**
   * Stitch ordered video clips with crossfade transitions (video + audio).
   * Each clip is normalized to the target resolution / 30 fps / stereo AAC before blending.
   */
  async composeFinalVideo(
    inputPaths: string[],
    outputPath: string,
    width = VIDEO_WIDTH,
    height = VIDEO_HEIGHT,
  ): Promise<void> {
    if (inputPaths.length < 2) {
      throw new Error('At least 2 video clips required for composition');
    }

    const fade = FADE_DURATION;
    const durations = await Promise.all(inputPaths.map((p) => this.getMediaDuration(p)));

    for (let i = 0; i < durations.length; i++) {
      if (durations[i] <= fade) {
        throw new Error(
          `Clip ${i + 1} (${inputPaths[i]}) is ${durations[i]}s — must be longer than ${fade}s fade`,
        );
      }
    }

    logger.info(
      `Composing final video from ${inputPaths.length} clips with ${fade}s crossfades...`,
    );

    const normalizeVideo = (index: number): string =>
      `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${VIDEO_FPS},format=yuv420p[v${index}]`;

    const normalizeAudio = (index: number): string =>
      `[${index}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${index}]`;

    const videoNorm = inputPaths.map((_, i) => normalizeVideo(i));
    const audioNorm = inputPaths.map((_, i) => normalizeAudio(i));

    const videoXfade: string[] = [];
    const audioXfade: string[] = [];

    let videoLabel = 'v0';
    let audioLabel = 'a0';
    let cumulativeDuration = durations[0];

    for (let i = 1; i < inputPaths.length; i++) {
      const outV = i === inputPaths.length - 1 ? 'vout' : `v${i}out`;
      const outA = i === inputPaths.length - 1 ? 'aout' : `a${i}out`;
      const offset = cumulativeDuration - i * fade;

      videoXfade.push(
        `[${videoLabel}][v${i}]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}[${outV}]`,
      );
      audioXfade.push(
        `[${audioLabel}][a${i}]acrossfade=d=${fade}:c1=tri:c2=tri[${outA}]`,
      );

      videoLabel = outV;
      audioLabel = outA;
      cumulativeDuration += durations[i];
    }

    const filterComplex = [...videoNorm, ...audioNorm, ...videoXfade, ...audioXfade].join(';');

    const ffmpegArgs = [
      ...inputPaths.flatMap((p) => ['-i', p]),
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-map', '[aout]',
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '20',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ];

    await execFileAsync(this.ffmpegBin, ffmpegArgs, { maxBuffer: 256 * 1024 * 1024 });
  }
}

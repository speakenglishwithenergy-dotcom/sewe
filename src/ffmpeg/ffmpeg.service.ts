import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';
import {
  buildWaveOverlayFilters,
  defaultWaveVisualizer,
  ResolvedWaveVisualizer,
} from './wave-config.util';

const execFileAsync = promisify(execFile);

/** Linear gain applied to podcast speech before mixing (+6 dB at 2.0). */
const PODCAST_VOLUME = 2.0;

/** Crossfade duration between final-video segments. */
const FADE_DURATION = 0.5;

/** Silence before topic narration on the thumbnail segment (seconds). */
const THUMBNAIL_LEAD_SECONDS = 0.5;

/** Silence after topic narration before fading to intro (seconds). */
const THUMBNAIL_TRAIL_SECONDS = 1;

/** Fallback thumbnail still duration when no topic audio is provided. */
const THUMBNAIL_VIDEO_DURATION = THUMBNAIL_LEAD_SECONDS + THUMBNAIL_TRAIL_SECONDS;

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
  private useVideoToolbox = false;

  constructor(private readonly wave: ResolvedWaveVisualizer = defaultWaveVisualizer()) {}

  /**
   * Verify that ffmpeg and ffprobe are available on PATH.
   * Prefers a build that includes the subtitles filter (requires libass).
   */
  async checkDependencies(): Promise<void> {
    // Resolve the best available ffmpeg binary.
    this.ffmpegBin = await this.resolveBin(FFMPEG_CANDIDATES, 'ffmpeg');
    this.ffprobeBin = await this.resolveBin(FFPROBE_CANDIDATES, 'ffprobe');

    if (process.platform === 'darwin') {
      this.useVideoToolbox = await this.hasEncoder('h264_videotoolbox');
      if (this.useVideoToolbox) {
        logger.info('Using hardware encoder: h264_videotoolbox');
      } else {
        logger.info('Using software encoder: libx264 (preset medium)');
      }
    } else {
      logger.info('Using software encoder: libx264 (preset medium)');
    }
  }

  private async hasEncoder(codec: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(this.ffmpegBin, ['-hide_banner', '-encoders']);
      return stdout.includes(codec);
    } catch {
      return false;
    }
  }

  /** H.264 encode args — VideoToolbox on macOS when available, else libx264 medium. */
  private getVideoEncodeArgs(): string[] {
    if (this.useVideoToolbox) {
      return ['-c:v', 'h264_videotoolbox', '-q:v', '65'];
    }
    return ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20'];
  }

  /** Background still image (-loop) or ffconcat slideshow list (no pre-encode). */
  private backgroundInputArgs(
    backgroundPath: string,
    mode: 'image' | 'slideshow',
  ): string[] {
    if (mode === 'slideshow') {
      return ['-f', 'concat', '-safe', '0', '-i', backgroundPath];
    }
    return ['-loop', '1', '-i', backgroundPath];
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
   * Inserts silent gaps between segments. `pauseSeconds` may be a uniform duration
   * or an array where pauses[i] is the gap after inputFiles[i].
   */
  async mergeAudioFiles(
    inputFiles: string[],
    outputPath: string,
    pauseSeconds: number | number[],
    firstPauseSeconds?: number,
  ): Promise<void> {
    if (inputFiles.length === 0) {
      throw new Error('No audio files provided for merge');
    }

    const tmpDir = path.dirname(outputPath);
    const gapAfterIndex = (i: number): number => {
      if (i >= inputFiles.length - 1) {
        return 0;
      }
      if (Array.isArray(pauseSeconds)) {
        if (pauseSeconds.length !== inputFiles.length - 1) {
          throw new Error(
            `Expected ${inputFiles.length - 1} pause values, got ${pauseSeconds.length}`,
          );
        }
        return pauseSeconds[i];
      }
      return i === 0 && firstPauseSeconds !== undefined ? firstPauseSeconds : pauseSeconds;
    };

    const pauseValues = [...new Set(
      inputFiles.slice(0, -1).map((_, i) => gapAfterIndex(i)),
    )];
    const silenceByDuration = new Map<number, string>();
    const concatListPath = path.join(tmpDir, '_concat.txt');

    const pauseLabel = Array.isArray(pauseSeconds)
      ? `variable pause (${pauseValues.join('s / ')}s)`
      : `${pauseSeconds}s pause` +
        (firstPauseSeconds !== undefined && firstPauseSeconds !== pauseSeconds
          ? ` (${firstPauseSeconds}s after first)`
          : '');

    logger.info(`Merging ${inputFiles.length} audio segments with ${pauseLabel}...`);

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
        const gap = gapAfterIndex(i);
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
   * the merged podcast audio, and burned-in ASS subtitle track.
   */
  async generateVideo(
    backgroundPath: string,
    audioPath: string,
    subtitlesPath: string,
    outputPath: string,
    backgroundMode: 'image' | 'slideshow' = 'image',
  ): Promise<void> {
    logger.info('Running FFmpeg video encode (this may take several minutes)...');

    // Escape characters special to FFmpeg filter option parsing.
    // Colons are option separators; backslashes need doubling.
    const safeSubs = subtitlesPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');

    // Styles are embedded in the ASS file so inline IPA colour overrides work.
    const subtitleFilter = `subtitles=filename=${safeSubs}`;

    // Wave strip: p2p waveform, brand cyan, overlaid above subtitle zone
    const waveFilters = buildWaveOverlayFilters(this.wave);
    const { x: waveX, y: waveY } = this.wave.podcast;
    const filterComplex = [
      `[0:v]scale=1920:1080,fps=${VIDEO_FPS}[bg]`,
      `[1:a]volume=${PODCAST_VOLUME},asplit=2[aout][awave]`,
      ...waveFilters,
      `[bg][waves]overlay=${waveX}:${waveY},format=yuv420p,${subtitleFilter}[vout]`,
    ].join(';');

    await execFileAsync(
      this.ffmpegBin,
      [
        ...this.backgroundInputArgs(backgroundPath, backgroundMode),
        '-i', audioPath,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', '[aout]',
        ...this.getVideoEncodeArgs(),
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
   * merged short audio, burned-in subtitles, and a top-center waveform overlay.
   */
  async generateShortVideo(
    backgroundPath: string,
    audioPath: string,
    subtitlesPath: string,
    outputPath: string,
  ): Promise<void> {
    logger.info('Running FFmpeg short video encode...');

    const safeSubs = subtitlesPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');

    const subtitleFilter = `subtitles=filename=${safeSubs}`;

    const waveFilters = buildWaveOverlayFilters(this.wave);
    const { x: waveX, y: waveY } = this.wave.short;
    const filterComplex = [
      `[0:v]scale=${SHORT_VIDEO_WIDTH}:${SHORT_VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${SHORT_VIDEO_WIDTH}:${SHORT_VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1[bg]`,
      `[1:a]volume=${PODCAST_VOLUME},asplit=2[aout][awave]`,
      ...waveFilters,
      `[bg][waves]overlay=${waveX}:${waveY},format=yuv420p,${subtitleFilter}[vout]`,
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
        ...this.getVideoEncodeArgs(),
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
   * With audio: 2s lead silence → full narration → 1s trail silence.
   */
  async generateImageVideo(
    imagePath: string,
    outputPath: string,
    durationSeconds?: number,
    width = VIDEO_WIDTH,
    height = VIDEO_HEIGHT,
    audioPath?: string,
  ): Promise<void> {
    let duration = durationSeconds ?? THUMBNAIL_VIDEO_DURATION;
    if (audioPath) {
      const topicDur = await this.getMediaDuration(audioPath);
      duration = THUMBNAIL_LEAD_SECONDS + topicDur + THUMBNAIL_TRAIL_SECONDS;
    }

    logger.info(`Creating ${duration.toFixed(1)}s thumbnail video (${width}x${height})...`);

    const audioInput = audioPath
      ? ['-i', audioPath]
      : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];

    const leadMs = Math.round(THUMBNAIL_LEAD_SECONDS * 1000);
    const audioFilter = audioPath
      ? `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `adelay=${leadMs}|${leadMs}:all=1,apad=whole_dur=${duration},atrim=0:${duration}[aout]`
      : undefined;

    const ffmpegArgs = [
      '-loop', '1',
      '-i', imagePath,
      ...audioInput,
      '-t', String(duration),
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${VIDEO_FPS},format=yuv420p`,
    ];

    if (audioFilter) {
      ffmpegArgs.push('-filter_complex', audioFilter, '-map', '0:v', '-map', '[aout]');
    }

    ffmpegArgs.push(
      ...this.getVideoEncodeArgs(),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    );

    await execFileAsync(this.ffmpegBin, ffmpegArgs, { maxBuffer: 64 * 1024 * 1024 });
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
      ...this.getVideoEncodeArgs(),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ];

    await execFileAsync(this.ffmpegBin, ffmpegArgs, { maxBuffer: 256 * 1024 * 1024 });
  }

  /**
   * Single-pass final video: thumbnail → intro → podcast body → outro with crossfades.
   * Thumbnail segment: 2s hold → topic narration (full) → 1s hold → fade to intro.
   * Renders the podcast segment (background, waveform, burned-in ASS) inline — no
   * intermediate podcast-video.mp4 encode.
   */
  async generateFinalVideo(
    introPath: string,
    thumbnailPath: string,
    backgroundPath: string,
    audioPath: string,
    subtitlesPath: string,
    outroPath: string,
    outputPath: string,
    backgroundMode: 'image' | 'slideshow' = 'image',
    thumbnailAudioPath?: string,
  ): Promise<void> {
    const fade = FADE_DURATION;

    const [introDur, podcastDur, outroDur, topicDur] = await Promise.all([
      this.getMediaDuration(introPath),
      this.getMediaDuration(audioPath),
      this.getMediaDuration(outroPath),
      thumbnailAudioPath ? this.getMediaDuration(thumbnailAudioPath) : Promise.resolve(0),
    ]);

    const thumbDur = thumbnailAudioPath
      ? THUMBNAIL_LEAD_SECONDS + topicDur + THUMBNAIL_TRAIL_SECONDS
      : THUMBNAIL_VIDEO_DURATION;

    // Order on timeline: thumbnail → intro → podcast → outro
    const segmentDurations = [thumbDur, introDur, podcastDur, outroDur];
    const segmentNames = ['thumbnail', 'intro', 'podcast', 'outro'];

    for (let i = 0; i < segmentDurations.length; i++) {
      if (segmentDurations[i] <= fade) {
        throw new Error(
          `${segmentNames[i]} segment is ${segmentDurations[i]}s — must be longer than ${fade}s fade`,
        );
      }
    }

    logger.info(
      `Rendering final video (single-pass): thumb ${thumbDur.toFixed(1)}s` +
        (thumbnailAudioPath
          ? ` (${THUMBNAIL_LEAD_SECONDS}s hold + ${topicDur.toFixed(1)}s topic + ${THUMBNAIL_TRAIL_SECONDS}s hold)`
          : '') +
        ` + intro ${introDur.toFixed(1)}s + podcast ${podcastDur.toFixed(1)}s + outro ${outroDur.toFixed(1)}s...`,
    );

    const safeSubs = subtitlesPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
    const subtitleFilter = `subtitles=filename=${safeSubs}`;

    const normalizeVideo = (index: number, label: string): string =>
      `[${index}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,` +
      `pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${VIDEO_FPS},format=yuv420p[${label}]`;

    const normalizeAudio = (index: number, label: string): string =>
      `[${index}:a]aformat=sample_rates=44100:channel_layouts=stereo[${label}]`;

    const leadMs = Math.round(THUMBNAIL_LEAD_SECONDS * 1000);
    const fitThumbAudio = (index: number, label: string): string =>
      `[${index}:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
      `adelay=${leadMs}|${leadMs}:all=1,apad=whole_dur=${thumbDur},atrim=0:${thumbDur}[${label}]`;

    const waveFilters = buildWaveOverlayFilters(this.wave);
    const { x: waveX, y: waveY } = this.wave.podcast;
    // Slideshow concat is finite; end with audio waveform then clone last frame for xfade→outro.
    const isSlideshow = backgroundMode === 'slideshow';
    const overlayOpts = isSlideshow ? `:shortest=1` : '';
    const podcastVideoPad = isSlideshow
      ? `,tpad=stop_mode=clone:stop_duration=${fade}`
      : '';
    // Inputs: 0=intro, 1=thumb image, 2=thumb audio, 3=bg, 4=podcast audio, 5=outro
    // Labels follow timeline order: v0/a0=thumb, v1/a1=intro, v2/a2=podcast, v3/a3=outro
    const filters: string[] = [
      normalizeVideo(1, 'v0'),
      thumbnailAudioPath ? fitThumbAudio(2, 'a0') : normalizeAudio(2, 'a0'),
      normalizeVideo(0, 'v1'),
      normalizeAudio(0, 'a1'),
      `[3:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},fps=${VIDEO_FPS}[bg]`,
      `[4:a]volume=${PODCAST_VOLUME},asplit=2[apod][awave]`,
      ...waveFilters,
      `[bg][waves]overlay=${waveX}:${waveY}${overlayOpts},format=yuv420p,${subtitleFilter},fps=${VIDEO_FPS}${podcastVideoPad}[v2]`,
      `[apod]aformat=sample_rates=44100:channel_layouts=stereo[a2]`,
      normalizeVideo(5, 'v3'),
      normalizeAudio(5, 'a3'),
    ];

    let videoLabel = 'v0';
    let audioLabel = 'a0';
    let cumulativeDuration = segmentDurations[0];

    for (let i = 1; i < segmentDurations.length; i++) {
      const outV = i === segmentDurations.length - 1 ? 'vout' : `vx${i}`;
      const outA = i === segmentDurations.length - 1 ? 'aout' : `ax${i}`;
      const offset = cumulativeDuration - i * fade;

      filters.push(
        `[${videoLabel}][v${i}]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}[${outV}]`,
      );
      filters.push(
        `[${audioLabel}][a${i}]acrossfade=d=${fade}:c1=tri:c2=tri[${outA}]`,
      );

      videoLabel = outV;
      audioLabel = outA;
      cumulativeDuration += segmentDurations[i];
    }

    const thumbAudioInput = thumbnailAudioPath
      ? ['-i', thumbnailAudioPath]
      : ['-f', 'lavfi', '-t', String(thumbDur), '-i', 'anullsrc=r=44100:cl=stereo'];

    const ffmpegArgs = [
      '-i', introPath,
      '-loop', '1', '-t', String(thumbDur), '-i', thumbnailPath,
      ...thumbAudioInput,
      ...this.backgroundInputArgs(backgroundPath, backgroundMode),
      '-i', audioPath,
      '-i', outroPath,
      '-filter_complex', filters.join(';'),
      '-map', '[vout]',
      '-map', '[aout]',
      ...this.getVideoEncodeArgs(),
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

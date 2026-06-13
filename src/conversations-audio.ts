import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';

import { FFmpegService } from './ffmpeg/ffmpeg.service';
import { SupertonicService } from './audio/supertonic.service';
import { TTSService } from './audio/tts.service';
import { DialogueLineSchema, PAUSE_BETWEEN_SEGMENTS, VOICE_MAP } from './types';
import { logger } from './utils/logger';

const ROOT_DIR = process.cwd();
const DEFAULT_COLLECTION_DIR = path.join(ROOT_DIR, 'output', 'basic-english-conversations');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const SUPERTONIC_DIR = path.join(ASSETS_DIR, 'supertonic-3');
const SUPERTONIC_ONNX_DIR = process.env.SUPERTONIC_ONNX_DIR ?? path.join(SUPERTONIC_DIR, 'onnx');
const SUPERTONIC_VOICES_DIR = process.env.SUPERTONIC_VOICES_DIR ?? path.join(SUPERTONIC_DIR, 'voice_styles');

/** Silence after the spoken title before dialogue begins */
const TITLE_INTRO_PAUSE_SECONDS = 2;

const ManifestEntrySchema = z.object({
  id: z.number(),
  title: z.string(),
  path: z.string(),
});

const ConversationScriptSchema = z.object({
  title: z.string().min(1),
  script: z.array(DialogueLineSchema).min(1),
});

type CliArgs = {
  collectionDir: string;
  episodeId?: number;
  force: boolean;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  const dirArg = args.find((a) => a.startsWith('--dir='));
  const collectionDir = dirArg
    ? path.resolve(dirArg.replace('--dir=', '').trim())
    : DEFAULT_COLLECTION_DIR;

  const idArg = args.find((a) => a.startsWith('--id='));
  const episodeId = idArg ? Number(idArg.replace('--id=', '').trim()) : undefined;
  if (idArg && (episodeId === undefined || Number.isNaN(episodeId) || episodeId < 1)) {
    logger.error('--id must be a positive number');
    process.exit(1);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  npm run generate:conversations-audio
  npm run generate:conversations-audio -- --id=1
  npm run generate:conversations-audio -- --dir=output/basic-english-conversations --force

Options:
  --dir=PATH   Collection folder (default: output/basic-english-conversations)
  --id=N       Process a single episode by manifest id
  --force      Regenerate audio even if podcast.mp3 already exists
`);
    process.exit(0);
  }

  return { collectionDir, episodeId, force };
}

function formatTitleForSpeech(title: string): string {
  return title.replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim();
}

async function generateEpisodeAudio(
  entry: z.infer<typeof ManifestEntrySchema>,
  ttsService: TTSService,
  ffmpegService: FFmpegService,
  force: boolean,
): Promise<void> {
  const episodeDir = path.dirname(entry.path);
  const audioDir = path.join(episodeDir, 'audio');
  const titlePath = path.join(audioDir, '000-title.wav');
  const podcastPath = path.join(episodeDir, 'podcast.mp3');

  if (!force && (await fileExists(podcastPath))) {
    logger.info(`⏭  [${entry.id}] "${entry.title}" — podcast.mp3 exists, skipping`);
    return;
  }

  logger.divider('─');
  logger.info(`[${entry.id}] ${entry.title}`);

  const raw = await fs.readFile(entry.path, 'utf-8');
  const script = ConversationScriptSchema.parse(JSON.parse(raw));
  const titleSpeech = formatTitleForSpeech(script.title);

  await ttsService.generateNarration(titleSpeech, titlePath, VOICE_MAP.Victor);

  const segments = await ttsService.generateSegments(script.script, audioDir);
  const audioFiles = [titlePath, ...segments.map((s) => s.filePath)];

  await ffmpegService.mergeAudioFiles(
    audioFiles,
    podcastPath,
    PAUSE_BETWEEN_SEGMENTS,
    TITLE_INTRO_PAUSE_SECONDS,
  );

  logger.success(`Podcast audio saved → ${podcastPath}`);
}

async function main(): Promise<void> {
  const { collectionDir, episodeId, force } = parseArgs();
  const manifestPath = path.join(collectionDir, 'manifest.json');

  if (!(await fileExists(manifestPath))) {
    logger.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
  let entries = z.array(ManifestEntrySchema).parse(JSON.parse(manifestRaw));

  if (episodeId !== undefined) {
    entries = entries.filter((e) => e.id === episodeId);
    if (entries.length === 0) {
      logger.error(`No episode with id=${episodeId} in manifest`);
      process.exit(1);
    }
  }

  logger.divider('═');
  console.log('  🎙  Basic English Conversations — Podcast Audio');
  logger.divider('═');
  logger.info(`Collection : ${collectionDir}`);
  logger.info(`Episodes   : ${entries.length}`);
  logger.info(`Title intro: spoken title + ${TITLE_INTRO_PAUSE_SECONDS}s pause`);
  logger.info('');

  const ffmpegService = new FFmpegService();
  await ffmpegService.checkDependencies();

  const supertonicService = new SupertonicService(SUPERTONIC_ONNX_DIR, SUPERTONIC_VOICES_DIR);
  const ttsService = new TTSService(supertonicService, ffmpegService);

  for (const entry of entries) {
    await generateEpisodeAudio(entry, ttsService, ffmpegService, force);
  }

  logger.info('');
  logger.divider('═');
  logger.success(`Done — processed ${entries.length} episode(s).`);
  logger.divider('═');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Fatal: ${message}`);
  if (err instanceof Error && err.stack) {
    logger.error(err.stack);
  }
  process.exit(1);
});

import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import { MediaRegenMode, ShadowingService } from './shadowing/shadowing.service';
import { logger } from './utils/logger';

type CliArgs =
  | {
      mode: 'new';
      draft: string;
      title?: string;
      voice?: string;
      speed?: number;
      test: boolean;
      force: boolean;
    }
  | {
      mode: 'resume';
      workspaceId: string;
      title?: string;
      voice?: string;
      speed?: number;
      test: boolean;
      force: boolean;
      mediaRegen: MediaRegenMode;
    }
  | { mode: 'list' }
  | { mode: 'list-voices' };

const MEDIA_REGEN_FLAGS = ['--force-media', '--force-audio', '--force-subtitles'] as const;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseSpeed(raw: string): number {
  const speed = Number(raw);
  if (Number.isNaN(speed)) {
    logger.error('--speed must be a number (e.g. 0.85 or 1.0)');
    process.exit(1);
  }
  return speed;
}

function parseMediaRegen(args: string[]): MediaRegenMode {
  const found = MEDIA_REGEN_FLAGS.filter((flag) => args.includes(flag));
  if (found.length > 1) {
    logger.error(`Only one of ${MEDIA_REGEN_FLAGS.join(', ')} can be used at a time`);
    process.exit(1);
  }

  if (args.includes('--force-audio')) return 'audio';
  if (args.includes('--force-subtitles')) return 'subtitles';
  if (args.includes('--force-media')) return 'all';
  return 'none';
}

function parseCommonOptions(args: string[]): {
  title?: string;
  voice?: string;
  speed?: number;
  test: boolean;
  force: boolean;
} {
  const titleArg = args.find((a) => a.startsWith('--title='));
  const title = titleArg?.replace('--title=', '').replace(/^["']|["']$/g, '').trim() || undefined;

  const voiceArg = args.find((a) => a.startsWith('--voice='));
  const voice = voiceArg?.replace('--voice=', '').replace(/^["']|["']$/g, '').trim() || undefined;

  const speedArg = args.find((a) => a.startsWith('--speed='));
  const speed = speedArg ? parseSpeed(speedArg.replace('--speed=', '').trim()) : undefined;

  return {
    title,
    voice,
    speed,
    test: args.includes('--test'),
    force: args.includes('--force'),
  };
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--list-voices')) {
    return { mode: 'list-voices' };
  }

  if (args.includes('--list')) {
    return { mode: 'list' };
  }

  const { title, voice, speed, test, force } = parseCommonOptions(args);
  const mediaRegen = parseMediaRegen(args);

  if (force && mediaRegen !== 'none') {
    logger.error('--force cannot be combined with --force-media, --force-audio, or --force-subtitles');
    process.exit(1);
  }
  if (mediaRegen !== 'none' && test) {
    logger.error('Media regen flags cannot be combined with --test');
    process.exit(1);
  }

  const workspaceArg = args.find((a) => a.startsWith('--workspace='));
  const workspaceId = workspaceArg?.replace('--workspace=', '').replace(/^["']|["']$/g, '').trim();

  if (workspaceId) {
    return { mode: 'resume', workspaceId, title, voice, speed, test, force, mediaRegen };
  }

  const draftArg = args.find((a) => a.startsWith('--draft=') || a.startsWith('--file='));
  const draft = draftArg
    ?.replace(/^--(?:draft|file)=/, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  if (draft) {
    return { mode: 'new', draft, title, voice, speed, test, force };
  }

  logger.error('Missing required flag. Use --draft=PATH for a new workspace or --workspace=ID to resume.');
  printHelp();
  process.exit(1);
}

function printHelp(): void {
  console.log(`Usage:
  npm run shadowing -- --draft=./my-script.txt
  npm run shadowing -- --draft=./my-script.txt --voice=M1 --speed=0.85
  npm run shadowing -- --draft=./my-script.txt --title="Episode title"
  npm run shadowing -- --draft=./my-script.txt --test
  npm run shadowing -- --workspace=20260616-230137
  npm run shadowing -- --workspace=20260616-230137 --force
  npm run shadowing -- --workspace=20260616-230137 --force-audio
  npm run shadowing -- --list
  npm run shadowing -- --list-voices

Workflow:
  1. --draft=PATH     Create workspace from draft and generate shadowing video
  2. --workspace=ID   Resume or regenerate an existing workspace

Draft text is kept verbatim — only split into sentences for shadowing. Output lives under shadowing/workspaces/<id>/.

Options:
  --draft=PATH         Create a new workspace from a text draft (alias: --file=PATH)
  --workspace=ID       Continue an existing workspace
  --title=TEXT         Override episode title
  --voice=NAME         Voice preset, e.g. M1 or F1 (default: shadowing/defaults/profile.yaml)
  --speed=NUMBER       Speech speed, 0.7–2.0 (default: 0.85)
  --test               Build script.json only — no audio or video
  --force              Regenerate script.json + all media from draft
  --force-audio        Regenerate TTS + podcast.mp3 only
  --force-subtitles    Regenerate subtitles.ass + shadowing.mp4 only
  --force-media        Regenerate all media — keeps script.json
  --list               List shadowing workspaces
  --list-voices        List available voice presets
`);
}

function runOptions(args: Exclude<CliArgs, { mode: 'list' } | { mode: 'list-voices' }>) {
  return {
    test: args.test,
    force: args.force,
    title: args.title,
    voice: args.voice,
    speed: args.speed,
    ...(args.mode === 'resume' ? { mediaRegen: args.mediaRegen } : {}),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const service = new ShadowingService();

  if (args.mode === 'list-voices') {
    const voices = await service.listVoices();
    if (voices.length === 0) {
      logger.info('No voices found. Download Supertonic models first.');
      return;
    }

    console.log('\nAvailable voices:\n');
    for (const voice of voices) {
      console.log(`  ${voice}`);
    }
    console.log('');
    return;
  }

  if (args.mode === 'list') {
    const workspaces = await service.listWorkspaces();
    if (workspaces.length === 0) {
      logger.info('No shadowing workspaces found.');
      return;
    }

    console.log('\nShadowing workspaces:\n');
    for (const ws of workspaces) {
      const title = ws.title ? ` — ${ws.title}` : '';
      console.log(`  ${ws.id}${title}`);
    }
    console.log('');
    return;
  }

  if (args.mode === 'new') {
    const resolved = path.resolve(args.draft);
    if (!(await fileExists(resolved))) {
      logger.error(`Draft file not found: ${resolved}`);
      process.exit(1);
    }

    const workspace = await service.createWorkspace(resolved, args.title);
    await service.run(workspace.id, runOptions(args));
    return;
  }

  await service.run(args.workspaceId, runOptions(args));
}

main().catch((error) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

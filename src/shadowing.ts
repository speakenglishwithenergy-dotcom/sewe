import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import { ShadowingService } from './shadowing/shadowing.service';
import { logger } from './utils/logger';

type CliArgs =
  | { mode: 'new'; draft: string; title?: string; force: boolean }
  | { mode: 'resume'; workspaceId: string; title?: string; test: boolean; force: boolean; review: boolean }
  | { mode: 'list' };

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

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--list')) {
    return { mode: 'list' };
  }

  const test = args.includes('--test');
  const force = args.includes('--force');
  const review = args.includes('--review');

  const titleArg = args.find((a) => a.startsWith('--title='));
  const title = titleArg?.replace('--title=', '').replace(/^["']|["']$/g, '').trim() || undefined;

  const workspaceArg = args.find((a) => a.startsWith('--workspace='));
  const workspaceId = workspaceArg?.replace('--workspace=', '').replace(/^["']|["']$/g, '').trim();

  if (workspaceId) {
    return { mode: 'resume', workspaceId, title, test, force, review };
  }

  const draftArg = args.find((a) => a.startsWith('--draft='));
  const draft = draftArg?.replace('--draft=', '').replace(/^["']|["']$/g, '').trim();

  if (draft) {
    return { mode: 'new', draft, title, force };
  }

  logger.error('Missing required flag. Use --draft=PATH for a new workspace or --workspace=ID to resume.');
  printHelp();
  process.exit(1);
}

function printHelp(): void {
  console.log(`Usage:
  npm run shadowing -- --draft=./my-script.txt
  npm run shadowing -- --draft=./my-script.txt --title="Episode title"
  npm run shadowing -- --workspace=20260616-230137
  npm run shadowing -- --workspace=20260616-230137 --test
  npm run shadowing -- --workspace=20260616-230137 --force
  npm run shadowing -- --workspace=20260616-230137 --review
  npm run shadowing -- --workspace=20260616-230137 --review --force
  npm run shadowing -- --list

Workflow:
  1. --draft=PATH     Create workspace + AI writes script.md for you to review
  2. Edit script.md   Change the "## Script" section; apply or ignore AI suggestions
  3. --workspace=ID   Build script.json and render shadowing video

Options:
  --draft=PATH       Create a new workspace from a text draft (generates script.md only)
  --workspace=ID     Continue an existing workspace (script.json + audio + video)
  --review           Regenerate script.md from draft.txt (use with --workspace)
  --title=TEXT       Override episode title
  --test             Format script.json only — no audio or video
  --force            Regenerate script.json or audio/video (resume), or script.md (--review)
  --list             List shadowing workspaces
`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const service = new ShadowingService();

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
    await service.generateReview(workspace.id, {
      force: true,
      title: args.title,
    });
    return;
  }

  if (args.review) {
    await service.generateReview(args.workspaceId, {
      force: args.force,
      title: args.title,
    });
    return;
  }

  await service.run(args.workspaceId, {
    test: args.test,
    force: args.force,
    title: args.title,
  });
}

main().catch((error) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

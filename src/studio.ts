import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';

import { OpenAIService } from './ai/openai.service';
import { FFmpegService } from './ffmpeg/ffmpeg.service';
import { SupertonicService } from './audio/supertonic.service';
import { StudioAssetsBriefService } from './studio/studio-assets-brief.service';
import { StudioEditGuideService } from './studio/studio-edit-guide.service';
import { StudioMetadataService } from './studio/studio-metadata.service';
import { StudioPlanningService } from './studio/studio-planning.service';
import { StudioProfileService } from './studio/studio-profile.service';
import { StudioScriptService } from './studio/studio-script.service';
import { StudioShadowingService } from './studio/studio-shadowing.service';
import { StudioService } from './studio/studio.service';
import { StudioWorkspace } from './studio/studio.types';
import { logger } from './utils/logger';

const ROOT_DIR = process.cwd();
const SUPERTONIC_DIR = path.join(ROOT_DIR, 'assets', 'supertonic-3');
const SUPERTONIC_ONNX_DIR = process.env.SUPERTONIC_ONNX_DIR ?? path.join(SUPERTONIC_DIR, 'onnx');
const SUPERTONIC_VOICES_DIR =
  process.env.SUPERTONIC_VOICES_DIR ?? path.join(SUPERTONIC_DIR, 'voice_styles');

type CliArgs = {
  newTopic?: string;
  studioId?: string;
  list: boolean;
  outline: boolean;
  script: boolean;
  revise?: string;
  editGuide: boolean;
  assets: boolean;
  shadowing: boolean;
  metadata: boolean;
  all: boolean;
  force: boolean;
  draftFile?: string;
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

  const topicArg = args.find((a) => a.startsWith('--topic='));
  const studioArg = args.find((a) => a.startsWith('--studio='));
  const reviseArg = args.find((a) => a.startsWith('--revise='));
  const draftArg = args.find((a) => a.startsWith('--draft='));

  return {
    newTopic: topicArg?.replace('--topic=', '').replace(/^["']|["']$/g, '').trim(),
    studioId: studioArg?.replace('--studio=', '').trim(),
    list: args.includes('--list'),
    outline: args.includes('--outline'),
    script: args.includes('--script'),
    revise: reviseArg?.replace('--revise=', '').replace(/^["']|["']$/g, '').trim(),
    editGuide: args.includes('--edit-guide'),
    assets: args.includes('--assets'),
    shadowing: args.includes('--shadowing'),
    metadata: args.includes('--metadata'),
    all: args.includes('--all'),
    force: args.includes('--force'),
    draftFile: draftArg?.replace('--draft=', '').replace(/^["']|["']$/g, '').trim(),
  };
}

function printUsage(): void {
  console.log(`
Studio — Content Planning & Shadowing Workspace

  npm run studio -- --new --topic="Why I started a channel in English"
  npm run studio -- --list
  npm run studio -- --studio=ID --outline
  npm run studio -- --studio=ID --script [--draft=./draft.txt]
  npm run studio -- --studio=ID --revise="make main2 more emotional"
  npm run studio -- --studio=ID --edit-guide
  npm run studio -- --studio=ID --assets
  npm run studio -- --studio=ID --shadowing
  npm run studio -- --studio=ID --metadata
  npm run studio -- --studio=ID --all

Flags:
  --force   Regenerate even if artifact exists
`);
}

async function loadDraft(draftFile?: string): Promise<string | undefined> {
  if (!draftFile) return undefined;
  const resolved = path.resolve(draftFile);
  if (!(await fileExists(resolved))) {
    logger.error(`Draft file not found: ${resolved}`);
    process.exit(1);
  }
  const content = await fs.readFile(resolved, 'utf-8').then((s) => s.trim());
  return content || undefined;
}

async function ensureOutline(
  planningService: StudioPlanningService,
  studioService: StudioService,
  workspace: StudioWorkspace,
  workspaceDir: string,
  force: boolean,
): Promise<void> {
  const outlinePath = studioService.getOutlinePath(workspaceDir);
  if (!force && (await fileExists(outlinePath))) {
    logger.info('⏭  Outline exists — skipping (--force to regenerate)');
    return;
  }

  const outline = await planningService.generateOutline(workspace.topic);
  await planningService.saveOutline(outlinePath, outline);
  await studioService.updateStatus(workspace, 'outlined');
}

async function ensureScript(
  planningService: StudioPlanningService,
  scriptService: StudioScriptService,
  studioService: StudioService,
  workspace: StudioWorkspace,
  workspaceDir: string,
  force: boolean,
  draftFile?: string,
): Promise<void> {
  const scriptPath = studioService.getScriptPath(workspaceDir);
  if (!force && (await fileExists(scriptPath))) {
    logger.info('⏭  Script exists — skipping (--force to regenerate)');
    return;
  }

  const outlinePath = studioService.getOutlinePath(workspaceDir);
  if (!(await fileExists(outlinePath))) {
    logger.error('Outline not found — run --outline first');
    process.exit(1);
  }

  const outline = await planningService.loadOutline(outlinePath);
  const customScript = await loadDraft(draftFile);
  const script = await scriptService.generateFromOutline(
    workspace.topic,
    outline,
    customScript,
  );

  await scriptService.saveScript(scriptPath, script);
  workspace.title = script.title;
  await studioService.updateStatus(workspace, 'scripted');
}

async function runRevise(
  scriptService: StudioScriptService,
  studioService: StudioService,
  workspace: StudioWorkspace,
  workspaceDir: string,
  instruction: string,
): Promise<void> {
  const scriptPath = studioService.getScriptPath(workspaceDir);
  if (!(await fileExists(scriptPath))) {
    logger.error('Script not found — run --script first');
    process.exit(1);
  }

  const current = await scriptService.loadScript(scriptPath);
  const revisionNum = await studioService.nextRevisionNumber(workspaceDir);
  await studioService.saveRevision(workspaceDir, current, revisionNum);

  const revised = await scriptService.revise(current, instruction);
  await scriptService.saveScript(scriptPath, revised);
  workspace.title = revised.title;
  await studioService.save(workspace);
}

async function ensureEditGuide(
  planningService: StudioPlanningService,
  scriptService: StudioScriptService,
  editGuideService: StudioEditGuideService,
  studioService: StudioService,
  workspace: StudioWorkspace,
  workspaceDir: string,
  force: boolean,
  segments?: import('./types').AudioSegment[],
): Promise<void> {
  const editGuidePath = studioService.getEditGuidePath(workspaceDir);
  if (!force && (await fileExists(editGuidePath))) {
    logger.info('⏭  Edit guide exists — skipping (--force to regenerate)');
    if (segments) {
      const guide = await editGuideService.load(editGuidePath);
      const refined = editGuideService.refineTimestamps(guide, segments);
      await editGuideService.save(editGuidePath, refined);
      logger.info('Edit guide timestamps refined from shadowing audio');
    }
    return;
  }

  const outline = await planningService.loadOutline(studioService.getOutlinePath(workspaceDir));
  const script = await scriptService.loadScript(studioService.getScriptPath(workspaceDir));

  let guide = await editGuideService.generate(workspace.topic, outline, script);
  if (segments) {
    guide = editGuideService.refineTimestamps(guide, segments);
  }

  await editGuideService.save(editGuidePath, guide);
}

async function ensureAssetsBrief(
  planningService: StudioPlanningService,
  scriptService: StudioScriptService,
  editGuideService: StudioEditGuideService,
  assetsBriefService: StudioAssetsBriefService,
  studioService: StudioService,
  workspace: StudioWorkspace,
  workspaceDir: string,
  force: boolean,
): Promise<void> {
  const assetsPath = studioService.getAssetsBriefPath(workspaceDir);
  if (!force && (await fileExists(assetsPath))) {
    logger.info('⏭  Assets brief exists — skipping (--force to regenerate)');
    return;
  }

  const outline = await planningService.loadOutline(studioService.getOutlinePath(workspaceDir));
  const script = await scriptService.loadScript(studioService.getScriptPath(workspaceDir));

  let editGuide;
  const editGuidePath = studioService.getEditGuidePath(workspaceDir);
  if (await fileExists(editGuidePath)) {
    editGuide = await editGuideService.load(editGuidePath);
  }

  const brief = await assetsBriefService.generate(
    workspace.topic,
    outline,
    script,
    editGuide,
  );
  await assetsBriefService.save(assetsPath, brief);
}

async function ensureShadowing(
  scriptService: StudioScriptService,
  shadowingService: StudioShadowingService,
  studioService: StudioService,
  workspace: StudioWorkspace,
  workspaceDir: string,
  force: boolean,
): Promise<import('./types').AudioSegment[] | undefined> {
  const shadowingDir = studioService.getShadowingDir(workspaceDir);
  const videoPath = path.join(shadowingDir, 'shadowing.mp4');

  if (!force && (await fileExists(videoPath))) {
    logger.info('⏭  Shadowing video exists — skipping (--force to regenerate)');
    return undefined;
  }

  const script = await scriptService.loadScript(studioService.getScriptPath(workspaceDir));
  const result = await shadowingService.generate(script, workspace.topic, shadowingDir);
  await studioService.updateStatus(workspace, 'shadowing');
  return result.segments;
}

async function ensureMetadata(
  planningService: StudioPlanningService,
  scriptService: StudioScriptService,
  assetsBriefService: StudioAssetsBriefService,
  metadataService: StudioMetadataService,
  studioService: StudioService,
  workspace: StudioWorkspace,
  workspaceDir: string,
  force: boolean,
  segments?: import('./types').AudioSegment[],
): Promise<void> {
  const publishDir = studioService.getPublishDir(workspaceDir);
  const socialPath = path.join(publishDir, 'social-metadata.json');

  if (!force && (await fileExists(socialPath))) {
    logger.info('⏭  Metadata exists — skipping (--force to regenerate)');
    return;
  }

  const outline = await planningService.loadOutline(studioService.getOutlinePath(workspaceDir));
  const script = await scriptService.loadScript(studioService.getScriptPath(workspaceDir));

  let assetsBrief;
  const assetsPath = studioService.getAssetsBriefPath(workspaceDir);
  if (await fileExists(assetsPath)) {
    assetsBrief = await assetsBriefService.load(assetsPath);
  }

  await metadataService.generate(workspaceDir, workspace.topic, outline, script, {
    assetsBrief,
    segments,
  });
  await studioService.updateStatus(workspace, 'ready');
}

async function main(): Promise<void> {
  const args = parseArgs();
  const studioService = new StudioService(ROOT_DIR);
  const profileService = new StudioProfileService(studioService.getStudioRoot());
  const openai = new OpenAIService();

  if (args.list) {
    const workspaces = await studioService.list();
    if (workspaces.length === 0) {
      console.log('No studio workspaces found.');
      return;
    }
    console.log('Studio workspaces:');
    for (const w of workspaces) {
      console.log(`  ${w.id}  [${w.status}]  ${w.title ?? w.topic}`);
    }
    return;
  }

  if (args.newTopic) {
    const workspace = await studioService.create(args.newTopic);
    const workspaceDir = studioService.getWorkspaceDir(workspace);
    console.log(`
Studio workspace created:
  ID:    ${workspace.id}
  Topic: ${workspace.topic}
  Dir:   ${workspaceDir}
`);
    return;
  }

  if (!args.studioId) {
    printUsage();
    process.exit(1);
  }

  const workspace = await studioService.load(args.studioId);
  const workspaceDir = studioService.getWorkspaceDir(workspace);
  const ctx = await profileService.loadForWorkspace(workspaceDir);

  const planningService = new StudioPlanningService(openai, ctx);
  const scriptService = new StudioScriptService(openai, ctx);
  const editGuideService = new StudioEditGuideService(openai, ctx);
  const assetsBriefService = new StudioAssetsBriefService(openai, ctx);
  const metadataService = new StudioMetadataService(openai, ctx);

  const hasAction =
    args.outline ||
    args.script ||
    args.revise ||
    args.editGuide ||
    args.assets ||
    args.shadowing ||
    args.metadata ||
    args.all;

  if (!hasAction) {
    printUsage();
    process.exit(1);
  }

  if (args.all || args.outline) {
    await ensureOutline(planningService, studioService, workspace, workspaceDir, args.force);
  }

  if (args.all || args.script) {
    await ensureScript(
      planningService,
      scriptService,
      studioService,
      workspace,
      workspaceDir,
      args.force,
      args.draftFile,
    );
  }

  if (args.revise) {
    await runRevise(scriptService, studioService, workspace, workspaceDir, args.revise);
  }

  let segments: import('./types').AudioSegment[] | undefined;

  if (args.all || args.shadowing) {
    const ffmpeg = new FFmpegService();
    await ffmpeg.checkDependencies();
    const supertonic = new SupertonicService(SUPERTONIC_ONNX_DIR, SUPERTONIC_VOICES_DIR);
    const shadowingService = new StudioShadowingService(ctx, ffmpeg, supertonic, openai);
    segments = await ensureShadowing(
      scriptService,
      shadowingService,
      studioService,
      workspace,
      workspaceDir,
      args.force,
    );
  }

  if (args.all || args.editGuide) {
    await ensureEditGuide(
      planningService,
      scriptService,
      editGuideService,
      studioService,
      workspace,
      workspaceDir,
      args.force,
      segments,
    );
  }

  if (args.all || args.assets) {
    await ensureAssetsBrief(
      planningService,
      scriptService,
      editGuideService,
      assetsBriefService,
      studioService,
      workspace,
      workspaceDir,
      args.force,
    );
  }

  if (args.all || args.metadata) {
    await ensureMetadata(
      planningService,
      scriptService,
      assetsBriefService,
      metadataService,
      studioService,
      workspace,
      workspaceDir,
      args.force,
      segments,
    );
  }

  logger.divider('═');
  logger.success('Studio step complete.');
  logger.divider('═');
  console.log(`
  Workspace : ${workspace.id}
  Status    : ${workspace.status}
  Title     : ${workspace.title ?? '(not set)'}
  Dir       : ${workspaceDir}
`);
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

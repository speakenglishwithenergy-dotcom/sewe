import 'dotenv/config';
import { OpenAIService } from './ai/openai.service';
import { ChannelService } from './channel/channel.service';
import { ProjectService } from './project/project.service';
import { SocialMetadataService } from './social/social-metadata.service';
import { normalizeSocialMetadata } from './social/social-metadata.normalize';
import {
  loadPodcastScript,
  loadShortScript,
  loadSocialMetadata,
  SocialPublisherService,
} from './social/social-publisher.service';
import { getDefaultPublishTargets } from './social/publish.env';
import { PublishFormat, PublishTarget } from './social/publish.types';
import {
  formatBatchScheduleSlot,
  formatViWeekdayHelp,
  parseScheduleDateInput,
  scheduledTimeOnDate,
} from './social/schedule.util';
import { logger } from './utils/logger';

type PublishCliArgs = {
  projectId: string;
  explicitTargets?: PublishTarget[];
  formats: PublishFormat[];
  force: boolean;
  now: boolean;
  /** Wall-clock schedule date (ISO or Vietnamese weekday). Mutually exclusive with --now. */
  dateInput?: string;
};

function parsePublishArgs(): PublishCliArgs {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const now = args.includes('--now');
  const dateArg = args.find((a) => a.startsWith('--date='));
  const dateInput = dateArg ? dateArg.replace('--date=', '').trim() : undefined;

  const projectArg = args.find((a) => a.startsWith('--project='));
  if (!projectArg) {
    logger.error('Missing required argument: --project=PROJECT_ID');
    logger.info('Usage:');
    logger.info('  npm run publish -- --project=20260614-180724');
    logger.info('  npm run publish -- --project=20260614-180724 --youtube-only');
    logger.info('  npm run publish -- --project=20260614-180724 --facebook-only');
    logger.info('  npm run publish -- --project=20260614-180724 --tiktok-only');
    logger.info('  npm run publish -- --project=20260614-180724 --long-only');
    logger.info('  npm run publish -- --project=20260614-180724 --short-only');
    logger.info('  npm run publish -- --project=20260614-180724 --force');
    logger.info('  npm run publish -- --project=20260614-180724 --long-only --now');
    logger.info('  npm run publish -- --project=20260614-180724 --date=6');
    logger.info('  npm run publish -- --project=20260614-180724 --date=2026-08-28');
    process.exit(1);
  }

  const projectId = projectArg.replace('--project=', '').trim();
  if (!projectId) {
    logger.error('--project value cannot be empty');
    process.exit(1);
  }

  if (now && dateInput) {
    logger.error('--now and --date cannot be used together');
    process.exit(1);
  }

  if (dateArg && !dateInput) {
    logger.error('--date value cannot be empty (use ISO YYYY-MM-DD or weekday 2–8)');
    process.exit(1);
  }

  const youtubeOnly = args.includes('--youtube-only');
  const facebookOnly = args.includes('--facebook-only');
  const tiktokOnly = args.includes('--tiktok-only');
  const platformOnlyFlags = [youtubeOnly, facebookOnly, tiktokOnly].filter(Boolean).length;
  if (platformOnlyFlags > 1) {
    logger.error('Only one of --youtube-only, --facebook-only, --tiktok-only can be used');
    process.exit(1);
  }

  const longOnly = args.includes('--long-only');
  const shortOnly = args.includes('--short-only');
  if (longOnly && shortOnly) {
    logger.error('--long-only and --short-only cannot be used together');
    process.exit(1);
  }

  let explicitTargets: PublishTarget[] | undefined;
  if (youtubeOnly) explicitTargets = ['youtube'];
  if (facebookOnly) explicitTargets = ['facebook'];
  if (tiktokOnly) explicitTargets = ['tiktok'];

  let formats: PublishFormat[] = ['long', 'short'];
  if (longOnly) formats = ['long'];
  if (shortOnly) formats = ['short'];

  return { projectId, explicitTargets, formats, force, now, dateInput };
}

function resolveScheduleOverrides(
  dateInput: string,
  channelCtx: Awaited<ReturnType<ChannelService['loadChannel']>>,
): { long?: Date; short?: Date } {
  const timezone =
    channelCtx.publish.youtubeSchedule?.timezone
    ?? channelCtx.publish.facebookSchedule?.timezone
    ?? 'Asia/Ho_Chi_Minh';
  const longTime =
    channelCtx.publish.youtubeSchedule?.longTime
    ?? channelCtx.publish.facebookSchedule?.longTime
    ?? '11:30';
  const shortTime =
    channelCtx.publish.youtubeSchedule?.shortTime
    ?? channelCtx.publish.facebookSchedule?.shortTime
    ?? '17:30';

  const slot = parseScheduleDateInput(dateInput, timezone);
  if (!slot) {
    throw new Error(
      `Invalid --date="${dateInput}". Use YYYY-MM-DD or weekday (${formatViWeekdayHelp()}).`,
    );
  }

  const longAt = scheduledTimeOnDate(longTime, timezone, slot.date);
  const shortAt = scheduledTimeOnDate(shortTime, timezone, slot.date);
  const nowMs = Date.now();
  const minLeadMs = 10 * 60 * 1000;

  if (longAt.getTime() <= nowMs + minLeadMs && shortAt.getTime() <= nowMs + minLeadMs) {
    throw new Error(
      `Schedule on ${formatBatchScheduleSlot(slot, timezone)} is already too soon `
      + `(need ≥10 minutes lead). Pick a later --date.`,
    );
  }

  logger.info(`Schedule : ${formatBatchScheduleSlot(slot, timezone)}`);
  logger.info(`  long    : ${longTime} → ${longAt.toISOString()}`);
  logger.info(`  short   : ${shortTime} → ${shortAt.toISOString()}`);

  return {
    long: longAt.getTime() > nowMs + minLeadMs ? longAt : undefined,
    short: shortAt.getTime() > nowMs + minLeadMs ? shortAt : undefined,
  };
}

async function main(): Promise<void> {
  const args = parsePublishArgs();
  const projectService = new ProjectService();
  const channelService = new ChannelService();

  let project;
  try {
    project = await projectService.load(args.projectId);
  } catch {
    logger.error(`Project "${args.projectId}" not found.`);
    process.exit(1);
  }

  const channelCtx = await channelService.loadChannel(project.channelId);
  const projectDir = projectService.getDir(project);
  const podcastScript = await loadPodcastScript(projectDir);
  const shortScript = await loadShortScript(projectDir);

  const socialMetadataService = new SocialMetadataService(new OpenAIService(), channelCtx);
  let socialMeta;
  try {
    socialMeta = normalizeSocialMetadata(
      await loadSocialMetadata(projectDir),
      channelCtx.publish,
      project.topic,
    );
  } catch {
    logger.info('Social metadata cache missing — generating from script...');
    socialMeta = await socialMetadataService.loadOrGenerate(
      projectDir,
      podcastScript,
      project.topic,
      shortScript ? { shortScript } : undefined,
    );
  }

  logger.divider('═');
  console.log(`  📤  ${channelCtx.config.name} — Social Publisher`);
  logger.divider('═');
  logger.info(`Project : ${project.id}`);
  logger.info(`Channel : ${channelCtx.config.id}`);
  logger.info(`Title   : ${podcastScript.title}`);

  const targets =
    args.explicitTargets
    ?? getDefaultPublishTargets(channelCtx.config.env.prefix, channelCtx.config.id);

  let scheduleOverrides: { long?: Date; short?: Date } | undefined;
  if (args.dateInput) {
    try {
      scheduleOverrides = resolveScheduleOverrides(args.dateInput, channelCtx);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  const publisher = new SocialPublisherService();
  const results = await publisher.publishProject(
    channelCtx,
    projectDir,
    socialMeta,
    podcastScript,
    {
      targets,
      formats: args.formats,
      force: args.force,
      now: args.now,
      scheduleOverrides,
    },
    shortScript,
  );

  if (results.length === 0) {
    logger.info('Nothing new published (already uploaded — use --force to re-upload).');
    return;
  }

  logger.success(`Published ${results.length} video(s):`);
  for (const result of results) {
    console.log(`  ${result.platform} ${result.format}: ${result.url}`);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Fatal: ${message}`);
  process.exit(1);
});

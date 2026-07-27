import 'dotenv/config';
import { OpenAIService } from './ai/openai.service';
import { TopicSuggestService } from './ai/topic-suggest.service';
import { runGenerateProjectWithLog } from './batch/batch-generate.util';
import {
  askBatchCountInteractive,
  askResumeBatchInteractive,
  printIncompleteBatch,
  reviewScheduleInteractive,
  reviewTopicsInteractive,
} from './batch/batch-prompt.util';
import { BatchCount, isBatchCount } from './batch/batch.types';
import { projectHasReadyVideos } from './batch/batch-videos.util';
import { ChannelService } from './channel/channel.service';
import { ProjectService } from './project/project.service';
import { SocialMetadataService } from './social/social-metadata.service';
import { normalizeSocialMetadata } from './social/social-metadata.normalize';
import {
  BatchScheduleSlot,
  buildScheduleSlotFromIso,
  formatBatchScheduleSlot,
  isScheduleDateValid,
  nextMonWedFriDates,
  parseScheduleDateInput,
  scheduledTimeOnDate,
} from './social/schedule.util';
import {
  loadPodcastScript,
  loadShortScript,
  loadSocialMetadata,
  SocialPublisherService,
} from './social/social-publisher.service';
import {
  isIncompleteTopicStatus,
  TopicRegistryService,
} from './topic/topic-registry.service';
import { TopicRecord } from './topic/topic.types';
import { logger } from './utils/logger';

const DEFAULT_CHANNEL_ID = 'speak-english-with-energy';

type BatchCliArgs = {
  channelId: string;
  count?: BatchCount;
  dates?: string[];
  resume: boolean;
};

function parseCountArg(args: string[]): BatchCount | undefined {
  const countArg = args.find((arg) => arg.startsWith('--count='));
  if (!countArg) return undefined;

  const raw = Number.parseInt(countArg.replace('--count=', '').trim(), 10);
  if (!isBatchCount(raw)) {
    logger.error('--count must be 2 or 3');
    process.exit(1);
  }

  return raw;
}

function parseDatesArg(args: string[]): string[] | undefined {
  const datesArg = args.find((arg) => arg.startsWith('--dates='));
  if (!datesArg) return undefined;

  const raw = datesArg.replace('--dates=', '').trim();
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2 && parts.length !== 3) {
    logger.error('--dates must contain 2 or 3 comma-separated values: weekday 2-8 or YYYY-MM-DD');
    process.exit(1);
  }

  return parts;
}

function parseBatchArgs(): BatchCliArgs {
  const args = process.argv.slice(2);
  const channelArg = args.find((arg) => arg.startsWith('--channel='));
  const channelId = channelArg?.replace('--channel=', '').trim() || DEFAULT_CHANNEL_ID;
  const resume = args.includes('--resume');

  if (!channelId) {
    logger.error('--channel value cannot be empty');
    process.exit(1);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage:');
    console.log('  npm run batch -- --channel=speak-english-with-energy');
    console.log('  npm run batch -- --channel=speak-english-with-energy --count=2');
    console.log('  npm run batch -- --channel=speak-english-with-energy --dates=2,4,6');
    console.log('  npm run batch -- --channel=speak-english-with-energy --dates=2026-07-21,2026-07-23');
    console.log('  npm run batch -- --channel=speak-english-with-energy --count=3 --dates=2026-07-21,2026-07-23,2026-07-25');
    console.log('  npm run batch -- --channel=speak-english-with-energy --resume');
    process.exit(0);
  }

  const dates = parseDatesArg(args);
  const count = parseCountArg(args);

  if (count && dates && count !== dates.length) {
    logger.error(`--count=${count} does not match ${dates.length} date(s) in --dates`);
    process.exit(1);
  }

  if (resume && (count || dates)) {
    logger.info('--resume ignores --count / --dates (uses topics.json schedule)');
  }

  return { channelId, count: count ?? (dates?.length as BatchCount | undefined), dates, resume };
}

function resolveScheduleSlots(
  timezone: string,
  count: BatchCount,
  cliDates: string[] | undefined,
): BatchScheduleSlot[] {
  if (!cliDates) {
    return nextMonWedFriDates(new Date(), timezone, count);
  }

  const slots: BatchScheduleSlot[] = [];
  for (const dateInput of cliDates) {
    const slot = parseScheduleDateInput(dateInput, timezone);
    if (!slot) {
      logger.error(`Invalid date: ${dateInput} (use weekday 2-8 or YYYY-MM-DD)`);
      process.exit(1);
    }
    if (!isScheduleDateValid(slot.dateIso, timezone)) {
      logger.error(`Date must be today or later (${timezone}): ${slot.dateIso}`);
      process.exit(1);
    }
    slots.push(slot);
  }

  const unique = new Set(slots.map((slot) => slot.dateIso));
  if (unique.size !== count) {
    logger.error(`All ${count} publish dates must be distinct`);
    process.exit(1);
  }

  return slots;
}

function formatPublishTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function slotFromTopicRecord(record: TopicRecord, timezone: string): BatchScheduleSlot {
  const slot = buildScheduleSlotFromIso(record.scheduledDate, timezone);
  if (!slot) {
    throw new Error(`Invalid scheduledDate in topics.json: ${record.scheduledDate}`);
  }
  return slot;
}

async function publishWithSchedule(
  channelId: string,
  projectId: string,
  longAt: Date,
  shortAt: Date,
): Promise<void> {
  const channelService = new ChannelService();
  const projectService = new ProjectService();
  const channelCtx = await channelService.loadChannel(channelId);
  const project = await projectService.load(projectId, channelId);
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
    socialMeta = await socialMetadataService.loadOrGenerate(
      projectDir,
      podcastScript,
      project.topic,
      shortScript ? { shortScript } : undefined,
    );
  }

  const publisher = new SocialPublisherService();
  const results = await publisher.publishProject(
    channelCtx,
    projectDir,
    socialMeta,
    podcastScript,
    { scheduleOverrides: { long: longAt, short: shortAt } },
    shortScript,
  );

  if (results.length === 0) {
    logger.info('Nothing new published (already uploaded).');
    return;
  }

  logger.success(`Published ${results.length} video(s) for ${projectId}:`);
  for (const result of results) {
    console.log(`  ${result.platform} ${result.format}: ${result.url}`);
  }
}

type BatchEpisodeWorkItem = {
  channelId: string;
  topic: string;
  projectId?: string;
  status?: TopicRecord['status'];
  slot: BatchScheduleSlot;
  timezone: string;
  longTime: string;
  shortTime: string;
};

function needsGenerate(status: TopicRecord['status'] | undefined): boolean {
  return status !== 'generated' && status !== 'published';
}

function needsPublish(status: TopicRecord['status'] | undefined): boolean {
  return status !== 'published';
}

async function markReadyFromDisk(
  item: BatchEpisodeWorkItem,
  projectService: ProjectService,
  topicRegistry: TopicRegistryService,
  shortRequired: boolean,
): Promise<BatchEpisodeWorkItem | null> {
  if (!item.projectId || item.status === 'published') return null;

  const projectDir = projectService.getDir({
    id: item.projectId,
    channelId: item.channelId,
  });
  const ready = await projectHasReadyVideos(projectDir, shortRequired);
  if (!ready) return null;

  if (item.status !== 'generated') {
    await topicRegistry.updateRecord(item.channelId, item.topic, {
      projectId: item.projectId,
      status: 'generated',
    });
  }

  return { ...item, status: 'generated' };
}

/** Phase 1 — create project folders for every episode that does not have one yet. */
async function createBatchFolders(
  items: BatchEpisodeWorkItem[],
  projectService: ProjectService,
  topicRegistry: TopicRegistryService,
  shortRequired: boolean,
): Promise<BatchEpisodeWorkItem[]> {
  logger.divider('═');
  logger.info(`Phase 1/3 — Create folders (${items.length})`);
  logger.divider('═');

  const withFolders: BatchEpisodeWorkItem[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    let projectId = item.projectId;

    if (!projectId) {
      const project = await projectService.create(item.topic, item.channelId);
      projectId = project.id;
      logger.success(`[${index + 1}/${items.length}] Created folder ${projectId} — ${item.topic}`);
    } else {
      logger.info(`[${index + 1}/${items.length}] Reusing folder ${projectId} — ${item.topic}`);
    }

    const withProject = { ...item, projectId };
    const ready = await markReadyFromDisk(withProject, projectService, topicRegistry, shortRequired);
    if (ready) {
      logger.info(`⏭  Videos already ready — marked generated: ${projectId}`);
      withFolders.push(ready);
      continue;
    }

    await topicRegistry.updateRecord(item.channelId, item.topic, {
      projectId,
      status: needsGenerate(item.status) ? 'pending' : item.status,
    });

    withFolders.push(withProject);
  }

  return withFolders;
}

/** Phase 2 — generate project files for every episode that is not already generated/published. */
async function generateBatchFiles(
  items: BatchEpisodeWorkItem[],
  projectService: ProjectService,
  topicRegistry: TopicRegistryService,
  shortRequired: boolean,
): Promise<BatchEpisodeWorkItem[]> {
  logger.divider('═');
  logger.info(`Phase 2/3 — Generate files`);
  logger.divider('═');

  const updated = new Map(items.map((item) => [item.topic, item]));
  const toGenerate: BatchEpisodeWorkItem[] = [];

  for (const item of items) {
    if (!needsGenerate(item.status)) {
      logger.info(`⏭  Skip generate (status=${item.status}): ${item.projectId} — ${item.topic}`);
      continue;
    }

    const ready = await markReadyFromDisk(item, projectService, topicRegistry, shortRequired);
    if (ready) {
      logger.info(`⏭  Skip generate (long+short videos exist): ${item.projectId} — ${item.topic}`);
      updated.set(item.topic, ready);
      continue;
    }

    toGenerate.push(item);
  }

  if (toGenerate.length === 0) {
    logger.info('All episodes already generated — skipping.');
    return items.map((item) => updated.get(item.topic) ?? item);
  }

  logger.info(`Generating ${toGenerate.length}/${items.length} episode(s)...`);

  for (let index = 0; index < toGenerate.length; index++) {
    const item = toGenerate[index];
    const projectId = item.projectId;
    if (!projectId) {
      throw new Error(`Missing projectId for topic "${item.topic}" before generate`);
    }

    logger.info(`Generating ${index + 1}/${toGenerate.length} — ${item.topic}`);
    await topicRegistry.updateRecord(item.channelId, item.topic, {
      projectId,
      status: 'generating',
    });

    try {
      await runGenerateProjectWithLog(projectId, item.topic);
      await topicRegistry.setStatus(item.channelId, item.topic, 'generated');
      updated.set(item.topic, { ...item, projectId, status: 'generated' });
      logger.success(`Generated: ${projectId}`);
    } catch (err) {
      await topicRegistry.setStatus(item.channelId, item.topic, 'failed');
      throw err;
    }
  }

  return items.map((item) => updated.get(item.topic) ?? item);
}

/** Phase 3 — publish every episode that is not already published. */
async function publishBatchEpisodes(
  items: BatchEpisodeWorkItem[],
  topicRegistry: TopicRegistryService,
): Promise<void> {
  const toPublish = items.filter((item) => needsPublish(item.status));

  logger.divider('═');
  logger.info(`Phase 3/3 — Publish (${toPublish.length}/${items.length})`);
  logger.divider('═');

  if (toPublish.length === 0) {
    logger.info('All episodes already published — skipping.');
    return;
  }

  for (let index = 0; index < toPublish.length; index++) {
    const item = toPublish[index];
    const projectId = item.projectId;
    if (!projectId) {
      throw new Error(`Missing projectId for topic "${item.topic}" before publish`);
    }

    const longAt = scheduledTimeOnDate(item.longTime, item.timezone, item.slot.date);
    const shortAt = scheduledTimeOnDate(item.shortTime, item.timezone, item.slot.date);

    logger.divider('─');
    logger.info(`Publishing ${index + 1}/${toPublish.length} — ${item.topic}`);
    logger.info(`Scheduled : long ${formatPublishTime(longAt, item.timezone)}, short ${formatPublishTime(shortAt, item.timezone)}`);
    logger.divider('─');

    try {
      await publishWithSchedule(item.channelId, projectId, longAt, shortAt);
      await topicRegistry.setStatus(item.channelId, item.topic, 'published');
      logger.success(`Published: ${projectId} → ${item.slot.dateIso}`);
    } catch (err) {
      await topicRegistry.setStatus(item.channelId, item.topic, 'failed');
      throw err;
    }
  }
}

async function runBatchPhases(
  items: BatchEpisodeWorkItem[],
  projectService: ProjectService,
  topicRegistry: TopicRegistryService,
  shortRequired: boolean,
): Promise<void> {
  const withFolders = await createBatchFolders(items, projectService, topicRegistry, shortRequired);
  const generated = await generateBatchFiles(withFolders, projectService, topicRegistry, shortRequired);
  await publishBatchEpisodes(generated, topicRegistry);
}

async function resumeIncompleteBatch(input: {
  channelId: string;
  records: TopicRecord[];
  timezone: string;
  longTime: string;
  shortTime: string;
  shortRequired: boolean;
  projectService: ProjectService;
  topicRegistry: TopicRegistryService;
}): Promise<void> {
  const {
    channelId,
    records,
    timezone,
    longTime,
    shortTime,
    shortRequired,
    projectService,
    topicRegistry,
  } = input;
  const remaining = records.filter((record) => isIncompleteTopicStatus(record.status));

  logger.divider('═');
  console.log(`  ♻️  Resuming incomplete batch (${remaining.length}/${records.length} left)`);
  logger.divider('═');
  printIncompleteBatch(records);

  logger.info('\nStarting batch resume (folders → generate → publish)...\n');

  const items: BatchEpisodeWorkItem[] = remaining.map((record) => ({
    channelId,
    topic: record.topic,
    projectId: record.projectId,
    status: record.status,
    slot: slotFromTopicRecord(record, timezone),
    timezone,
    longTime,
    shortTime,
  }));

  await runBatchPhases(items, projectService, topicRegistry, shortRequired);

  const refreshed = await topicRegistry.load(channelId);
  const createdAt = records[0]?.createdAt;
  const summaryRecords = createdAt
    ? refreshed.topics
      .filter((record) => record.createdAt === createdAt)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    : records;

  logger.info('');
  logger.divider('═');
  logger.success('Batch resume complete!');
  logger.divider('═');
  console.log('\nSummary:');
  summaryRecords.forEach((record, index) => {
    console.log(`  ${index + 1}. [${record.status}] ${record.topic}`);
    console.log(`     ${record.scheduledDate} — long ${longTime}, short ${shortTime}`);
  });
  console.log(`\nTopic registry: channels/${channelId}/topics.json\n`);
}

async function runNewBatch(input: {
  channelId: string;
  channelName: string;
  timezone: string;
  count: BatchCount;
  dates: string[] | undefined;
  longTime: string;
  shortTime: string;
  pastTopics: string[];
  projectService: ProjectService;
  topicRegistry: TopicRegistryService;
  channelCtx: Awaited<ReturnType<ChannelService['loadChannel']>>;
}): Promise<void> {
  const {
    channelId,
    channelName,
    timezone,
    count,
    dates,
    longTime,
    shortTime,
    pastTopics,
    projectService,
    topicRegistry,
    channelCtx,
  } = input;

  logger.divider('═');
  console.log(`  📅  ${channelName} — Weekly Batch (${count} episodes)`);
  logger.divider('═');
  logger.info(`Channel   : ${channelId}`);
  logger.info(`Timezone  : ${timezone}`);
  logger.info(`Batch size: ${count}`);
  logger.info(`Past topics: ${pastTopics.length}`);

  const defaultScheduleSlots = resolveScheduleSlots(timezone, count, dates);
  const openai = new OpenAIService();
  const topicSuggest = new TopicSuggestService(openai, channelCtx);

  const regenerate = async (): Promise<string[]> =>
    topicSuggest.suggest(pastTopics, count);

  const initialTopics = await regenerate();
  const confirmedTopics = await reviewTopicsInteractive(initialTopics, regenerate);

  if (!confirmedTopics) {
    logger.info('Batch cancelled.');
    return;
  }

  const scheduleSlots = dates
    ? defaultScheduleSlots
    : await reviewScheduleInteractive(defaultScheduleSlots, timezone);

  if (!scheduleSlots) {
    logger.info('Batch cancelled.');
    return;
  }

  await topicRegistry.addPendingBatch(
    channelId,
    confirmedTopics.map((topic, index) => ({
      topic,
      scheduledDate: scheduleSlots[index].dateIso,
      weekday: scheduleSlots[index].weekday,
    })),
  );

  logger.info('\nStarting batch (folders → generate → publish)...\n');

  const items: BatchEpisodeWorkItem[] = confirmedTopics.map((topic, index) => ({
    channelId,
    topic,
    status: 'pending',
    slot: scheduleSlots[index],
    timezone,
    longTime,
    shortTime,
  }));

  await runBatchPhases(items, projectService, topicRegistry, channelCtx.config.short.enabled);

  logger.info('');
  logger.divider('═');
  logger.success('Weekly batch complete!');
  logger.divider('═');
  console.log('\nSummary:');
  confirmedTopics.forEach((topic, index) => {
    const slot = scheduleSlots[index];
    console.log(`  ${index + 1}. ${topic}`);
    console.log(`     ${formatBatchScheduleSlot(slot, timezone)} — long ${longTime}, short ${shortTime}`);
  });
  console.log(`\nTopic registry: channels/${channelId}/topics.json\n`);
}

async function main(): Promise<void> {
  const args = parseBatchArgs();
  const channelService = new ChannelService();
  const projectService = new ProjectService();
  const topicRegistry = new TopicRegistryService(channelService, projectService);

  let channelCtx;
  try {
    channelCtx = await channelService.loadChannel(args.channelId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(message);
    process.exit(1);
  }

  const timezone =
    channelCtx.publish.youtubeSchedule?.timezone
    ?? channelCtx.publish.facebookSchedule?.timezone
    ?? 'Asia/Ho_Chi_Minh';

  const longTime = channelCtx.publish.youtubeSchedule?.longTime ?? '11:30';
  const shortTime = channelCtx.publish.youtubeSchedule?.shortTime ?? '17:30';

  const registry = await topicRegistry.migrateFromProjects(args.channelId);
  const incompleteBatch = topicRegistry.findLatestIncompleteBatch(registry);

  let shouldResume = args.resume;
  if (args.resume) {
    if (!incompleteBatch) {
      logger.error('No incomplete batch found in topics.json (nothing to --resume)');
      process.exit(1);
    }
  } else if (incompleteBatch) {
    shouldResume = await askResumeBatchInteractive(incompleteBatch);
  }

  if (shouldResume && incompleteBatch) {
    await resumeIncompleteBatch({
      channelId: args.channelId,
      records: incompleteBatch,
      timezone,
      longTime,
      shortTime,
      shortRequired: channelCtx.config.short.enabled,
      projectService,
      topicRegistry,
    });
    return;
  }

  const count = args.count ?? await askBatchCountInteractive();
  const pastTopics = topicRegistry.listTopicStrings(registry);

  await runNewBatch({
    channelId: args.channelId,
    channelName: channelCtx.config.name,
    timezone,
    count,
    dates: args.dates,
    longTime,
    shortTime,
    pastTopics,
    projectService,
    topicRegistry,
    channelCtx,
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Fatal: ${message}`);
  process.exit(1);
});

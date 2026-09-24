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
import { projectHasReadyVideos, isBatchShortOnly } from './batch/batch-videos.util';
import { ChannelService } from './channel/channel.service';
import { ProjectService } from './project/project.service';
import { SocialMetadataService } from './social/social-metadata.service';
import { normalizeSocialMetadata } from './social/social-metadata.normalize';
import {
  BatchScheduleSlot,
  buildScheduleSlotFromIso,
  formatBatchScheduleSlot,
  isScheduleDateValid,
  nextFutureMonWedFriDates,
  nextMonWedFriDates,
  parseScheduleDateInput,
  scheduledTimeOnDate,
  shortPublishSlotForLongSlot,
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
  yes: boolean;
};

function parseCountArg(args: string[]): BatchCount | undefined {
  const countArg = args.find((arg) => arg.startsWith('--count='));
  if (!countArg) return undefined;

  const raw = Number.parseInt(countArg.replace('--count=', '').trim(), 10);
  if (!isBatchCount(raw)) {
    logger.error('--count must be 1, 2, or 3');
    process.exit(1);
  }

  return raw;
}

function parseDatesArg(args: string[]): string[] | undefined {
  const datesArg = args.find((arg) => arg.startsWith('--dates='));
  if (!datesArg) return undefined;

  const raw = datesArg.replace('--dates=', '').trim();
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 1 || parts.length > 3) {
    logger.error('--dates must contain 1–3 comma-separated values: weekday 2-8 or YYYY-MM-DD');
    process.exit(1);
  }

  return parts;
}

function parseBatchArgs(): BatchCliArgs {
  const args = process.argv.slice(2);
  const channelArg = args.find((arg) => arg.startsWith('--channel='));
  const channelId = channelArg?.replace('--channel=', '').trim() || DEFAULT_CHANNEL_ID;
  const resume = args.includes('--resume');
  const yes = args.includes('--yes') || args.includes('-y');

  if (!channelId) {
    logger.error('--channel value cannot be empty');
    process.exit(1);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage:');
    console.log('  npm run batch -- --channel=speak-english-with-energy');
    console.log('  npm run batch -- --channel=speak-english-with-energy --count=1 --yes');
    console.log('  npm run batch -- --channel=speak-english-with-energy --count=2');
    console.log('  npm run batch -- --channel=speak-english-with-energy --dates=2,4,6');
    console.log('  npm run batch -- --channel=speak-english-with-energy --dates=2026-07-21,2026-07-23');
    console.log('  npm run batch -- --channel=speak-english-with-energy --count=3 --dates=2026-07-21,2026-07-23,2026-07-25');
    console.log('  npm run batch -- --channel=speak-english-with-energy --resume');
    console.log('  npm run batch -- --channel=speak-english-with-energy --count=1 --yes  # CI / non-interactive');
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

  return {
    channelId,
    count: count ?? (dates?.length as BatchCount | undefined),
    dates,
    resume,
    yes,
  };
}

function resolveScheduleSlots(
  timezone: string,
  count: BatchCount,
  cliDates: string[] | undefined,
  options: { preferFuture: boolean; longTime: string },
): BatchScheduleSlot[] {
  if (!cliDates) {
    if (options.preferFuture) {
      return nextFutureMonWedFriDates(new Date(), timezone, count, options.longTime);
    }
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
  const shortOnly = isBatchShortOnly();
  const results = await publisher.publishProject(
    channelCtx,
    projectDir,
    socialMeta,
    podcastScript,
    {
      scheduleOverrides: { long: longAt, short: shortAt },
      formats: shortOnly ? ['short'] : undefined,
    },
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
  const ready = await projectHasReadyVideos(
    projectDir,
    shortRequired,
    !isBatchShortOnly(),
  );
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
  logger.info(`Phase 1/2 — Create folders (${items.length})`);
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

async function generateOneEpisode(
  item: BatchEpisodeWorkItem,
  projectService: ProjectService,
  topicRegistry: TopicRegistryService,
  shortRequired: boolean,
): Promise<BatchEpisodeWorkItem> {
  if (!needsGenerate(item.status)) {
    logger.info(`⏭  Skip generate (status=${item.status}): ${item.projectId} — ${item.topic}`);
    return item;
  }

  const ready = await markReadyFromDisk(item, projectService, topicRegistry, shortRequired);
  if (ready) {
    logger.info(`⏭  Skip generate (long+short videos exist): ${item.projectId} — ${item.topic}`);
    return ready;
  }

  const projectId = item.projectId;
  if (!projectId) {
    throw new Error(`Missing projectId for topic "${item.topic}" before generate`);
  }

  logger.info(`Generating — ${item.topic}`);
  await topicRegistry.updateRecord(item.channelId, item.topic, {
    projectId,
    status: 'generating',
  });

  try {
    await runGenerateProjectWithLog(projectId, item.topic);
    await topicRegistry.setStatus(item.channelId, item.topic, 'generated');
    logger.success(`Generated: ${projectId}`);
    return { ...item, projectId, status: 'generated' };
  } catch (err) {
    await topicRegistry.setStatus(item.channelId, item.topic, 'failed');
    throw err;
  }
}

async function publishOneEpisode(
  item: BatchEpisodeWorkItem,
  topicRegistry: TopicRegistryService,
): Promise<BatchEpisodeWorkItem> {
  if (!needsPublish(item.status)) {
    logger.info(`⏭  Skip publish (status=${item.status}): ${item.projectId} — ${item.topic}`);
    return item;
  }

  const projectId = item.projectId;
  if (!projectId) {
    throw new Error(`Missing projectId for topic "${item.topic}" before publish`);
  }

  const shortSlot = shortPublishSlotForLongSlot(item.slot, item.timezone);
  const longAt = scheduledTimeOnDate(item.longTime, item.timezone, item.slot.date);
  const shortAt = scheduledTimeOnDate(item.longTime, item.timezone, shortSlot.date);

  logger.divider('─');
  logger.info(`Publishing — ${item.topic}`);
  logger.info(
    `Scheduled : long ${formatPublishTime(longAt, item.timezone)} (${item.slot.dateIso}), `
    + `short ${formatPublishTime(shortAt, item.timezone)} (${shortSlot.dateIso})`,
  );
  logger.divider('─');

  try {
    await publishWithSchedule(item.channelId, projectId, longAt, shortAt);
    await topicRegistry.setStatus(item.channelId, item.topic, 'published');
    logger.success(`Published: ${projectId} → ${item.slot.dateIso}`);
    return { ...item, status: 'published' };
  } catch (err) {
    await topicRegistry.setStatus(item.channelId, item.topic, 'failed');
    throw err;
  }
}

/** Phase 2 — generate each episode, then publish it immediately before the next one. */
async function generateAndPublishEpisodes(
  items: BatchEpisodeWorkItem[],
  projectService: ProjectService,
  topicRegistry: TopicRegistryService,
  shortRequired: boolean,
): Promise<void> {
  logger.divider('═');
  logger.info(`Phase 2/2 — Generate then publish each episode (${items.length})`);
  logger.divider('═');

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    logger.divider('═');
    logger.info(`[${index + 1}/${items.length}] ${item.topic}`);
    logger.divider('═');

    const generated = await generateOneEpisode(
      item,
      projectService,
      topicRegistry,
      shortRequired,
    );
    await publishOneEpisode(generated, topicRegistry);
  }
}

async function runBatchPhases(
  items: BatchEpisodeWorkItem[],
  projectService: ProjectService,
  topicRegistry: TopicRegistryService,
  shortRequired: boolean,
): Promise<void> {
  const withFolders = await createBatchFolders(items, projectService, topicRegistry, shortRequired);
  await generateAndPublishEpisodes(withFolders, projectService, topicRegistry, shortRequired);
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

  logger.info('\nStarting batch resume (folders → generate+publish each episode)...\n');

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
    const shortSlot = shortPublishSlotForLongSlot(slotFromTopicRecord(record, timezone), timezone);
    console.log(`     long ${record.scheduledDate} ${longTime}, short ${shortSlot.dateIso} ${longTime}`);
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
  yes: boolean;
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
    yes,
  } = input;

  logger.divider('═');
  console.log(`  📅  ${channelName} — Weekly Batch (${count} episode${count === 1 ? '' : 's'})`);
  logger.divider('═');
  logger.info(`Channel   : ${channelId}`);
  logger.info(`Timezone  : ${timezone}`);
  logger.info(`Batch size: ${count}`);
  logger.info(`Past topics: ${pastTopics.length}`);
  if (yes) logger.info('Mode      : non-interactive (--yes)');

  const defaultScheduleSlots = resolveScheduleSlots(timezone, count, dates, {
    preferFuture: yes,
    longTime,
  });
  const openai = new OpenAIService();
  const topicSuggest = new TopicSuggestService(openai, channelCtx);

  const regenerate = async (): Promise<string[]> =>
    topicSuggest.suggest(pastTopics, count);

  const initialTopics = await regenerate();
  const confirmedTopics = yes
    ? initialTopics
    : await reviewTopicsInteractive(initialTopics, regenerate);

  if (!confirmedTopics) {
    logger.info('Batch cancelled.');
    return;
  }

  if (yes) {
    logger.info('Auto-accepted topics:');
    confirmedTopics.forEach((topic, index) => {
      console.log(`  ${index + 1}. ${topic}`);
    });
  }

  const scheduleSlots = dates || yes
    ? defaultScheduleSlots
    : await reviewScheduleInteractive(defaultScheduleSlots, timezone, longTime);

  if (!scheduleSlots) {
    logger.info('Batch cancelled.');
    return;
  }

  if (yes) {
    logger.info('Auto-accepted schedule:');
    scheduleSlots.forEach((slot, index) => {
      console.log(`  ${index + 1}. ${formatBatchScheduleSlot(slot, timezone)} ${longTime}`);
    });
  }

  await topicRegistry.addPendingBatch(
    channelId,
    confirmedTopics.map((topic, index) => ({
      topic,
      scheduledDate: scheduleSlots[index].dateIso,
      weekday: scheduleSlots[index].weekday,
    })),
  );

  logger.info('\nStarting batch (folders → generate+publish each episode)...\n');

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
    const shortSlot = shortPublishSlotForLongSlot(slot, timezone);
    console.log(
      `     long ${formatBatchScheduleSlot(slot, timezone)} ${longTime}, `
      + `short ${formatBatchScheduleSlot(shortSlot, timezone)} ${longTime}`,
    );
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
    if (args.yes) {
      logger.info('Incomplete batch found — auto-resuming (--yes)');
      shouldResume = true;
    } else {
      shouldResume = await askResumeBatchInteractive(incompleteBatch);
    }
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

  const count = args.count ?? (args.yes ? 1 : await askBatchCountInteractive());
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
    yes: args.yes,
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Fatal: ${message}`);
  process.exit(1);
});

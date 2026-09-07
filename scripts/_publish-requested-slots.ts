import 'dotenv/config';
import { OpenAIService } from '../src/ai/openai.service';
import { ChannelService } from '../src/channel/channel.service';
import { ProjectService } from '../src/project/project.service';
import { SocialMetadataService } from '../src/social/social-metadata.service';
import { normalizeSocialMetadata } from '../src/social/social-metadata.normalize';
import {
  loadPodcastScript,
  loadShortScript,
  loadSocialMetadata,
  SocialPublisherService,
} from '../src/social/social-publisher.service';
import { PublishFormat } from '../src/social/publish.types';
import {
  parseCalendarDateIso,
  scheduledTimeOnDate,
} from '../src/social/schedule.util';
import { TopicRegistryService } from '../src/topic/topic-registry.service';
import { logger } from '../src/utils/logger';

const TIMEZONE = 'Asia/Ho_Chi_Minh';
const NOON = '11:30';

type Job = {
  projectId: string;
  format: PublishFormat;
  now?: boolean;
  dateIso?: string;
};

const jobs: Job[] = [
  { projectId: '001-20260831', format: 'long', now: true },
  { projectId: '001-20260831', format: 'short', dateIso: '2026-09-08' },
  { projectId: '002-20260831', format: 'long', dateIso: '2026-09-09' },
  { projectId: '002-20260831', format: 'short', dateIso: '2026-09-10' },
  { projectId: '003-20260831', format: 'long', dateIso: '2026-09-11' },
  { projectId: '003-20260831', format: 'short', dateIso: '2026-09-12' },
];

const topicPatches: Record<string, { scheduledDate: string; weekday: 'monday' | 'wednesday' | 'friday' }> = {
  '001-20260831': { scheduledDate: '2026-09-07', weekday: 'monday' },
  '002-20260831': { scheduledDate: '2026-09-09', weekday: 'wednesday' },
  '003-20260831': { scheduledDate: '2026-09-11', weekday: 'friday' },
};

function noonOn(dateIso: string): Date {
  const date = parseCalendarDateIso(dateIso);
  if (!date) {
    throw new Error(`Invalid date: ${dateIso}`);
  }
  return scheduledTimeOnDate(NOON, TIMEZONE, date);
}

async function publishJob(job: Job): Promise<void> {
  const channelService = new ChannelService();
  const projectService = new ProjectService();
  const project = await projectService.load(job.projectId);
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
    socialMeta = await socialMetadataService.loadOrGenerate(
      projectDir,
      podcastScript,
      project.topic,
      shortScript ? { shortScript } : undefined,
    );
  }

  const scheduleOverrides = job.now
    ? undefined
    : job.format === 'long'
      ? { long: noonOn(job.dateIso!) }
      : { short: noonOn(job.dateIso!) };

  logger.divider('═');
  logger.info(`Project : ${project.id}`);
  logger.info(`Format  : ${job.format}`);
  if (job.now) {
    logger.info('When    : NOW (live)');
  } else {
    logger.info(`When    : ${job.dateIso} ${NOON} ${TIMEZONE} → ${scheduleOverrides?.[job.format]?.toISOString()}`);
  }

  const publisher = new SocialPublisherService();
  const results = await publisher.publishProject(
    channelCtx,
    projectDir,
    socialMeta,
    podcastScript,
    {
      formats: [job.format],
      now: job.now ?? false,
      scheduleOverrides,
    },
    shortScript,
  );

  if (results.length === 0) {
    logger.info('Nothing new published (already uploaded).');
    return;
  }

  logger.success(`Published ${results.length} video(s):`);
  for (const result of results) {
    console.log(`  ${result.platform} ${result.format}: ${result.url}`);
  }
}

async function markPublished(): Promise<void> {
  const topicRegistry = new TopicRegistryService();
  const channelId = 'speak-english-with-energy';
  const registry = await topicRegistry.load(channelId);

  for (const [projectId, patch] of Object.entries(topicPatches)) {
    const record = registry.topics.find((item) => item.projectId === projectId);
    if (!record) {
      throw new Error(`Topic record not found for ${projectId}`);
    }
    record.status = 'published';
    record.scheduledDate = patch.scheduledDate;
    record.weekday = patch.weekday;
  }

  await topicRegistry.save(channelId, registry);
  logger.success('Updated topics.json status to published');
}

async function main(): Promise<void> {
  logger.info('Preview schedule:');
  for (const job of jobs) {
    if (job.now) {
      logger.info(`  ${job.projectId} ${job.format}: NOW`);
    } else {
      logger.info(
        `  ${job.projectId} ${job.format}: ${job.dateIso} ${NOON} ${TIMEZONE} (${noonOn(job.dateIso!).toISOString()})`,
      );
    }
  }

  for (const job of jobs) {
    await publishJob(job);
  }

  await markPublished();
  logger.success('All requested publish jobs finished.');
}

main().catch((err: unknown) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

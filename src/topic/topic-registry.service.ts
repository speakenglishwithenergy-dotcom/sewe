import fs from 'fs/promises';
import path from 'path';
import { ChannelService } from '../channel/channel.service';
import { ProjectService } from '../project/project.service';
import { datePartsInTimezone, WeekdayName } from '../social/schedule.util';
import { TopicRecord, TopicRegistryFile, TopicStatus } from './topic.types';

const REGISTRY_FILENAME = 'topics.json';

const INCOMPLETE_STATUSES: ReadonlySet<TopicStatus> = new Set([
  'pending',
  'generating',
  'generated',
  'failed',
]);

/** In-progress statuses that CI `--yes` will auto-resume (excludes `failed`). */
const AUTO_RESUME_STATUSES: ReadonlySet<TopicStatus> = new Set([
  'pending',
  'generating',
  'generated',
]);

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase();
}

export function isIncompleteTopicStatus(status: TopicStatus): boolean {
  return INCOMPLETE_STATUSES.has(status);
}

export function isAutoResumeTopicStatus(status: TopicStatus): boolean {
  return AUTO_RESUME_STATUSES.has(status);
}

export class TopicRegistryService {
  constructor(
    private readonly channelService = new ChannelService(),
    private readonly projectService = new ProjectService(),
  ) {}

  private getRegistryPath(channelId: string): string {
    return path.join(this.channelService.getChannelDir(channelId), REGISTRY_FILENAME);
  }

  async load(channelId: string): Promise<TopicRegistryFile> {
    const registryPath = this.getRegistryPath(channelId);
    try {
      const raw = await fs.readFile(registryPath, 'utf-8');
      return JSON.parse(raw) as TopicRegistryFile;
    } catch {
      return { topics: [] };
    }
  }

  async save(channelId: string, registry: TopicRegistryFile): Promise<void> {
    const registryPath = this.getRegistryPath(channelId);
    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  }

  listTopicStrings(registry: TopicRegistryFile): string[] {
    return registry.topics.map((record) => record.topic);
  }

  hasTopic(registry: TopicRegistryFile, topic: string): boolean {
    const normalized = normalizeTopic(topic);
    return registry.topics.some((record) => normalizeTopic(record.topic) === normalized);
  }

  async migrateFromProjects(channelId: string): Promise<TopicRegistryFile> {
    const registry = await this.load(channelId);
    const projects = await this.projectService.list(channelId);
    let changed = false;

    for (const project of projects) {
      if (!project.topic || this.hasTopic(registry, project.topic)) continue;

      registry.topics.push({
        topic: project.topic,
        projectId: project.id,
        scheduledDate: project.createdAt.slice(0, 10),
        weekday: 'monday',
        createdAt: project.createdAt,
        status: 'published',
      });
      changed = true;
    }

    if (changed) {
      registry.topics.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      await this.save(channelId, registry);
    }

    return registry;
  }

  async addPendingBatch(
    channelId: string,
    entries: Array<{ topic: string; scheduledDate: string; weekday: WeekdayName }>,
  ): Promise<TopicRegistryFile> {
    const registry = await this.load(channelId);
    const now = new Date().toISOString();

    for (const entry of entries) {
      if (this.hasTopic(registry, entry.topic)) {
        throw new Error(`Topic already exists in registry: "${entry.topic}"`);
      }

      registry.topics.push({
        topic: entry.topic,
        scheduledDate: entry.scheduledDate,
        weekday: entry.weekday,
        createdAt: now,
        status: 'pending',
      });
    }

    await this.save(channelId, registry);
    return registry;
  }

  /**
   * Register a topic created via `npm run generate` (new project only).
   * Upserts by topic string: sets status `generating` and attaches projectId.
   */
  async registerNewGenerate(
    channelId: string,
    input: {
      topic: string;
      projectId: string;
      createdAt: string;
      timezone: string;
    },
  ): Promise<void> {
    const registry = await this.load(channelId);
    const { dateIso, weekday } = datePartsInTimezone(new Date(input.createdAt), input.timezone);
    const normalized = normalizeTopic(input.topic);
    const existing = registry.topics.find((item) => normalizeTopic(item.topic) === normalized);

    if (existing) {
      existing.projectId = input.projectId;
      existing.scheduledDate = dateIso;
      existing.weekday = weekday;
      existing.status = 'generating';
    } else {
      registry.topics.push({
        topic: input.topic,
        projectId: input.projectId,
        scheduledDate: dateIso,
        weekday,
        createdAt: input.createdAt,
        status: 'generating',
      });
    }

    await this.save(channelId, registry);
  }

  async updateRecord(
    channelId: string,
    topic: string,
    patch: Partial<Pick<TopicRecord, 'projectId' | 'status'>>,
  ): Promise<void> {
    const registry = await this.load(channelId);
    const normalized = normalizeTopic(topic);
    const record = registry.topics.find((item) => normalizeTopic(item.topic) === normalized);

    if (!record) {
      throw new Error(`Topic not found in registry: "${topic}"`);
    }

    if (patch.projectId !== undefined) record.projectId = patch.projectId;
    if (patch.status !== undefined) record.status = patch.status;

    await this.save(channelId, registry);
  }

  async setStatus(channelId: string, topic: string, status: TopicStatus): Promise<void> {
    await this.updateRecord(channelId, topic, { status });
  }

  /**
   * Latest batch group (same createdAt) that still has unfinished topics.
   * Returns every record in that group, including already-published siblings.
   *
   * @param includeFailed When false (CI `--yes`), skip batches that only have
   *   `failed` leftovers so a stale local failure does not block a fresh run.
   *   Explicit `--resume` should pass includeFailed: true.
   */
  findLatestIncompleteBatch(
    registry: TopicRegistryFile,
    options: { includeFailed?: boolean } = {},
  ): TopicRecord[] | null {
    const includeFailed = options.includeFailed ?? true;
    const isOpen = includeFailed ? isIncompleteTopicStatus : isAutoResumeTopicStatus;

    const byCreatedAt = new Map<string, TopicRecord[]>();

    for (const record of registry.topics) {
      const group = byCreatedAt.get(record.createdAt) ?? [];
      group.push(record);
      byCreatedAt.set(record.createdAt, group);
    }

    const incompleteCreatedAts = [...byCreatedAt.entries()]
      .filter(([, records]) => records.some((record) => isOpen(record.status)))
      .map(([createdAt]) => createdAt)
      .sort((a, b) => b.localeCompare(a));

    const latestCreatedAt = incompleteCreatedAts[0];
    if (!latestCreatedAt) return null;

    const group = byCreatedAt.get(latestCreatedAt);
    if (!group) return null;

    return [...group].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  }
}

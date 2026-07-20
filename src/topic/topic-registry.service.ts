import fs from 'fs/promises';
import path from 'path';
import { ChannelService } from '../channel/channel.service';
import { ProjectService } from '../project/project.service';
import { WeekdayName } from '../social/schedule.util';
import { TopicRecord, TopicRegistryFile, TopicStatus } from './topic.types';

const REGISTRY_FILENAME = 'topics.json';

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase();
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
}

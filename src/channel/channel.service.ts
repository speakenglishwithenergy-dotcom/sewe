import fs from 'fs/promises';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import {
  buildClosingText,
  ChannelConfig,
  ChannelConfigSchema,
  ChannelContext,
  resolvePublishCopy,
  ResolvedChannelAssets,
  validateChannelConfig,
} from './channel.types';
import { CHANNELS_DIR } from './constants';
import { PUBLISH_LIMITS } from '../social/publish.limits';
import { isTikTokPublishEnabled } from '../social/publish.env';

export class ChannelService {
  private readonly rootDir: string;

  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
  }

  getChannelsRoot(): string {
    return path.join(this.rootDir, CHANNELS_DIR);
  }

  getChannelDir(channelId: string): string {
    return path.join(this.getChannelsRoot(), channelId);
  }

  async listChannels(): Promise<ChannelConfig[]> {
    const channelsRoot = this.getChannelsRoot();
    let entries;
    try {
      entries = await fs.readdir(channelsRoot, { withFileTypes: true });
    } catch {
      return [];
    }

    const channels: ChannelConfig[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        channels.push((await this.loadChannel(entry.name)).config);
      } catch {
        // skip invalid channel dirs
      }
    }

    return channels.sort((a, b) => a.id.localeCompare(b.id));
  }

  async loadChannel(channelId: string): Promise<ChannelContext> {
    const channelDir = this.getChannelDir(channelId);
    const configPath = path.join(channelDir, 'channel.yaml');

    let raw: string;
    try {
      raw = await fs.readFile(configPath, 'utf-8');
    } catch {
      throw new Error(`Channel "${channelId}" not found at ${configPath}`);
    }

    const parsed = parseYaml(raw);
    const config = ChannelConfigSchema.parse(parsed);

    if (config.id !== channelId) {
      throw new Error(
        `Channel folder "${channelId}" does not match channel.yaml id "${config.id}"`,
      );
    }

    validateChannelConfig(config);

    const assets = this.resolveAssets(channelDir, config);
    const speakers = config.hosts.map((host) => host.name);
    const voiceMap = Object.fromEntries(config.hosts.map((host) => [host.name, host.voice]));

    return {
      config,
      dir: channelDir,
      assets,
      speakers,
      voiceMap,
      publish: resolvePublishCopy(
        config.publish,
        PUBLISH_LIMITS.youtubeTitleMax,
        isTikTokPublishEnabled(config.env.prefix, config.id),
      ),
      closingText: buildClosingText(config.script.closingTemplate, config.name),
    };
  }

  private resolveAssets(channelDir: string, config: ChannelConfig): ResolvedChannelAssets {
    const resolve = (relativePath: string): string =>
      path.join(channelDir, relativePath);

    const assets: ResolvedChannelAssets = {
      intro: resolve(config.assets.intro),
      outro: resolve(config.assets.outro),
      background: resolve(config.assets.background),
      shortBackground: resolve(config.assets.shortBackground),
      demoThumbnail: resolve(config.assets.demoThumbnail),
      demoShortThumbnail: resolve(config.assets.demoShortThumbnail),
    };

    if (config.assets.logo) {
      assets.logo = resolve(config.assets.logo);
    }
    if (config.assets.backgroundMusic) {
      assets.backgroundMusic = resolve(config.assets.backgroundMusic);
    }

    return assets;
  }
}

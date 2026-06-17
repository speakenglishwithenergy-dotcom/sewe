import fs from 'fs/promises';
import path from 'path';
import { ChannelContext } from '../channel/channel.types';
import { PodcastScript, ShortScript, SocialMetadata } from '../types';
import { buildPodcastVideoPath, buildShortVideoPath } from '../utils/filename.util';
import { logger } from '../utils/logger';
import { FacebookPublisherService } from './facebook-publisher.service';
import { isPublishConfigured, loadPublishEnvConfig } from './publish.env';
import { DEFAULT_PUBLISH_TARGETS, PublishFormat, PublishResult, PublishedVideoRecord, PublishStatus, PublishTarget } from './publish.types';
import {
  formatChannelDescription,
  formatChannelShortCaption,
  formatFacebookCaption,
  formatFacebookShortCaption,
  formatTikTokShortCaption,
} from './social-metadata.normalize';
import { getPublishOutputDir } from './social-metadata.export';
import { TikTokPublisherService } from './tiktok-publisher.service';
import { YouTubePublisherService } from './youtube-publisher.service';

const PUBLISH_STATUS_FILE = 'publish-status.json';

export interface PublishOptions {
  targets?: PublishTarget[];
  formats?: PublishFormat[];
  force?: boolean;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveVideoPath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function resolveLongVideoPath(projectDir: string, script: PodcastScript): Promise<string | null> {
  return resolveVideoPath([
    buildPodcastVideoPath(projectDir, script.title),
    path.join(projectDir, 'final.mp4'),
    path.join(projectDir, 'podcast-video.mp4'),
  ]);
}

async function resolveShortVideoPath(
  projectDir: string,
  podcastTitle: string,
  shortTitle?: string,
): Promise<string | null> {
  const candidates = [
    buildShortVideoPath(projectDir, podcastTitle),
    path.join(projectDir, 'short.mp4'),
  ];
  if (shortTitle && shortTitle !== podcastTitle) {
    candidates.splice(1, 0, buildShortVideoPath(projectDir, shortTitle));
  }
  return resolveVideoPath(candidates);
}

async function resolveLongThumbnailPath(projectDir: string): Promise<string | null> {
  return resolveVideoPath([path.join(projectDir, 'thumbnail.png')]);
}

async function resolveShortThumbnailPath(projectDir: string): Promise<string | null> {
  return resolveVideoPath([path.join(projectDir, 'short-thumbnail.png')]);
}

async function loadPublishStatus(projectDir: string): Promise<PublishStatus> {
  const statusPath = path.join(getPublishOutputDir(projectDir), PUBLISH_STATUS_FILE);
  try {
    const raw = await fs.readFile(statusPath, 'utf-8');
    return JSON.parse(raw) as PublishStatus;
  } catch {
    return {};
  }
}

async function savePublishStatus(projectDir: string, status: PublishStatus): Promise<void> {
  const publishDir = getPublishOutputDir(projectDir);
  await fs.mkdir(publishDir, { recursive: true });
  await fs.writeFile(
    path.join(publishDir, PUBLISH_STATUS_FILE),
    JSON.stringify(status, null, 2),
    'utf-8',
  );
}

function recordResult(
  status: PublishStatus,
  result: PublishResult,
): void {
  const record: PublishedVideoRecord = {
    id: result.videoId,
    url: result.url,
    publishedAt: new Date().toISOString(),
  };

  if (result.platform === 'youtube') {
    if (!status.youtube) status.youtube = {};
    status.youtube[result.format] = record;
    return;
  }
  if (result.platform === 'facebook') {
    if (!status.facebook) status.facebook = {};
    status.facebook[result.format] = record;
    return;
  }
  if (result.platform === 'tiktok' && result.format === 'short') {
    if (!status.tiktok) status.tiktok = {};
    status.tiktok.short = record;
  }
}

async function recordAndSaveResult(
  projectDir: string,
  status: PublishStatus,
  result: PublishResult,
): Promise<void> {
  recordResult(status, result);
  await savePublishStatus(projectDir, status);
}

function isAlreadyPublished(
  status: PublishStatus,
  platform: PublishTarget,
  format: PublishFormat,
): boolean {
  if (platform === 'tiktok') {
    return format === 'short' && Boolean(status.tiktok?.short?.id);
  }
  if (platform === 'youtube') {
    return Boolean(status.youtube?.[format]?.id);
  }
  return Boolean(status.facebook?.[format]?.id);
}

export class SocialPublisherService {
  async publishProject(
    ctx: ChannelContext,
    projectDir: string,
    socialMeta: SocialMetadata,
    podcastScript: PodcastScript,
    options: PublishOptions = {},
    shortScript?: ShortScript,
  ): Promise<PublishResult[]> {
    const targets = options.targets ?? DEFAULT_PUBLISH_TARGETS;
    const formats = options.formats ?? (shortScript ? ['long', 'short'] : ['long']);
    const force = options.force ?? false;
    const pub = ctx.publish;
    const envPrefix = ctx.config.env.prefix;

    const missing = targets.filter((target) => !isPublishConfigured(target, envPrefix, ctx.config.id));
    if (missing.length > 0) {
      throw new Error(
        `Publish credentials missing for: ${missing.join(', ')} (prefix ${envPrefix}_*). See .env.example for setup.`,
      );
    }

    const config = loadPublishEnvConfig(envPrefix, targets, ctx.config.id);
    const youtube = targets.includes('youtube')
      ? new YouTubePublisherService(config.youtube, {
          long: pub.youtubeLongPlaylistId,
          short: pub.youtubeShortPlaylistId,
        })
      : null;
    const facebook = targets.includes('facebook')
      ? new FacebookPublisherService(config.facebook)
      : null;
    const tiktok = targets.includes('tiktok')
      ? new TikTokPublisherService(config.tiktok)
      : null;

    const status = await loadPublishStatus(projectDir);
    const results: PublishResult[] = [];

    if (formats.includes('long')) {
      const videoPath = await resolveLongVideoPath(projectDir, podcastScript);
      if (!videoPath) {
        throw new Error('Long-form video not found — run the full pipeline first');
      }
      const thumbnailPath = (await resolveLongThumbnailPath(projectDir)) ?? undefined;
      if (!thumbnailPath) {
        logger.info('No long-form thumbnail found — platforms will use an auto-generated frame');
      }

      if (targets.includes('youtube') && youtube) {
        if (!force && isAlreadyPublished(status, 'youtube', 'long')) {
          logger.info(`⏭  YouTube long already published → ${status.youtube!.long!.url}`);
        } else {
          const result = await youtube.uploadVideo({
            videoPath,
            thumbnailPath,
            title: socialMeta.youtube.title,
            description: formatChannelDescription(socialMeta.youtube, pub),
            tags: socialMeta.youtube.tags,
            pinnedComment: socialMeta.youtube.pinnedComment,
            format: 'long',
          });
          results.push(result);
          await recordAndSaveResult(projectDir, status, result);
        }
      }

      if (targets.includes('facebook') && facebook && socialMeta.facebook) {
        if (!force && isAlreadyPublished(status, 'facebook', 'long')) {
          logger.info(`⏭  Facebook long already published → ${status.facebook!.long!.url}`);
        } else {
          const result = await facebook.uploadVideo({
            videoPath,
            thumbnailPath,
            caption: formatFacebookCaption(socialMeta.facebook, pub),
            firstComment: socialMeta.facebook.firstComment,
            format: 'long',
          });
          results.push(result);
          await recordAndSaveResult(projectDir, status, result);
        }
      }
    }

    if (formats.includes('short') && shortScript && socialMeta.youtubeShort) {
      const videoPath = await resolveShortVideoPath(
        projectDir,
        podcastScript.title,
        shortScript.title,
      );
      if (!videoPath) {
        throw new Error('Short video not found — run the short pipeline first');
      }
      const thumbnailPath = (await resolveShortThumbnailPath(projectDir)) ?? undefined;
      if (!thumbnailPath) {
        logger.info('No short thumbnail found — platforms will use an auto-generated frame');
      }

      if (targets.includes('youtube') && youtube) {
        if (!force && isAlreadyPublished(status, 'youtube', 'short')) {
          logger.info(`⏭  YouTube Short already published → ${status.youtube!.short!.url}`);
        } else {
          const result = await youtube.uploadVideo({
            videoPath,
            thumbnailPath,
            title: socialMeta.youtubeShort.title,
            description: formatChannelShortCaption(socialMeta.youtubeShort, pub),
            tags: [],
            pinnedComment: socialMeta.youtubeShort.pinnedComment,
            format: 'short',
          });
          results.push(result);
          await recordAndSaveResult(projectDir, status, result);
        }
      }

      if (targets.includes('facebook') && facebook && socialMeta.facebookShort) {
        if (!force && isAlreadyPublished(status, 'facebook', 'short')) {
          logger.info(`⏭  Facebook Reel already published → ${status.facebook!.short!.url}`);
        } else {
          const result = await facebook.uploadVideo({
            videoPath,
            thumbnailPath,
            caption: formatFacebookShortCaption(socialMeta.facebookShort, pub),
            firstComment: socialMeta.facebookShort.firstComment,
            format: 'short',
          });
          results.push(result);
          await recordAndSaveResult(projectDir, status, result);
        }
      }

      if (targets.includes('tiktok') && tiktok) {
        if (!force && isAlreadyPublished(status, 'tiktok', 'short')) {
          logger.info(`⏭  TikTok already published → ${status.tiktok!.short!.url}`);
        } else {
          const result = await tiktok.uploadVideo({
            videoPath,
            caption: formatTikTokShortCaption(socialMeta.youtubeShort, pub),
          });
          results.push(result);
          await recordAndSaveResult(projectDir, status, result);
        }
      }
    }

    return results;
  }
}

export async function loadSocialMetadata(projectDir: string): Promise<SocialMetadata> {
  const metadataPath = path.join(getPublishOutputDir(projectDir), 'social-metadata.json');
  const raw = await fs.readFile(metadataPath, 'utf-8');
  return JSON.parse(raw) as SocialMetadata;
}

export async function loadPodcastScript(projectDir: string): Promise<PodcastScript> {
  const raw = await fs.readFile(path.join(projectDir, 'script.json'), 'utf-8');
  return JSON.parse(raw) as PodcastScript;
}

export async function loadShortScript(projectDir: string): Promise<ShortScript | undefined> {
  const shortPath = path.join(projectDir, 'short-script.json');
  if (!(await fileExists(shortPath))) return undefined;
  const raw = await fs.readFile(shortPath, 'utf-8');
  return JSON.parse(raw) as ShortScript;
}

import fs from 'fs/promises';
import path from 'path';
import { PodcastScript, ShortScript, SocialMetadata } from '../types';
import { buildPodcastVideoPath, buildShortVideoPath } from '../utils/filename.util';
import { logger } from '../utils/logger';
import { FacebookPublisherService } from './facebook-publisher.service';
import { isPublishConfigured, loadPublishEnvConfig } from './publish.env';
import { PublishFormat, PublishResult, PublishStatus, PublishTarget } from './publish.types';
import {
  formatChannelDescription,
  formatChannelShortCaption,
  formatFacebookCaption,
  formatFacebookShortCaption,
} from './social-metadata.normalize';
import { getPublishOutputDir } from './social-metadata.export';
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
  shortScript: ShortScript,
): Promise<string | null> {
  return resolveVideoPath([
    buildShortVideoPath(projectDir, shortScript.title),
    path.join(projectDir, 'short.mp4'),
  ]);
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
  const bucket = result.platform === 'youtube' ? 'youtube' : 'facebook';
  if (!status[bucket]) status[bucket] = {};
  status[bucket]![result.format] = {
    id: result.videoId,
    url: result.url,
    publishedAt: new Date().toISOString(),
  };
}

function isAlreadyPublished(
  status: PublishStatus,
  platform: PublishTarget,
  format: PublishFormat,
): boolean {
  return Boolean(status[platform]?.[format]?.id);
}

export class SocialPublisherService {
  async publishProject(
    projectDir: string,
    socialMeta: SocialMetadata,
    podcastScript: PodcastScript,
    options: PublishOptions = {},
    shortScript?: ShortScript,
  ): Promise<PublishResult[]> {
    const targets = options.targets ?? ['youtube', 'facebook'];
    const formats = options.formats ?? (shortScript ? ['long', 'short'] : ['long']);
    const force = options.force ?? false;

    const missing = targets.filter((target) => !isPublishConfigured(target));
    if (missing.length > 0) {
      throw new Error(
        `Publish credentials missing for: ${missing.join(', ')}. See .env.example for setup.`,
      );
    }

    const config = loadPublishEnvConfig(targets);
    const youtube = targets.includes('youtube')
      ? new YouTubePublisherService(config.youtube)
      : null;
    const facebook = targets.includes('facebook')
      ? new FacebookPublisherService(config.facebook)
      : null;

    const status = await loadPublishStatus(projectDir);
    const results: PublishResult[] = [];

    if (formats.includes('long')) {
      const videoPath = await resolveLongVideoPath(projectDir, podcastScript);
      if (!videoPath) {
        throw new Error('Long-form video not found — run the full pipeline first');
      }

      if (targets.includes('youtube') && youtube) {
        if (!force && isAlreadyPublished(status, 'youtube', 'long')) {
          logger.info(`⏭  YouTube long already published → ${status.youtube!.long!.url}`);
        } else {
          const result = await youtube.uploadVideo({
            videoPath,
            title: socialMeta.youtube.title,
            description: formatChannelDescription(socialMeta.youtube),
            tags: socialMeta.youtube.tags,
            pinnedComment: socialMeta.youtube.pinnedComment,
            format: 'long',
          });
          results.push(result);
          recordResult(status, result);
        }
      }

      if (targets.includes('facebook') && facebook && socialMeta.facebook) {
        if (!force && isAlreadyPublished(status, 'facebook', 'long')) {
          logger.info(`⏭  Facebook long already published → ${status.facebook!.long!.url}`);
        } else {
          const result = await facebook.uploadVideo({
            videoPath,
            caption: formatFacebookCaption(socialMeta.facebook),
            firstComment: socialMeta.facebook.firstComment,
            format: 'long',
          });
          results.push(result);
          recordResult(status, result);
        }
      }
    }

    if (formats.includes('short') && shortScript && socialMeta.youtubeShort) {
      const videoPath = await resolveShortVideoPath(projectDir, shortScript);
      if (!videoPath) {
        throw new Error('Short video not found — run the short pipeline first');
      }

      if (targets.includes('youtube') && youtube) {
        if (!force && isAlreadyPublished(status, 'youtube', 'short')) {
          logger.info(`⏭  YouTube Short already published → ${status.youtube!.short!.url}`);
        } else {
          const result = await youtube.uploadVideo({
            videoPath,
            title: socialMeta.youtubeShort.title,
            description: formatChannelShortCaption(socialMeta.youtubeShort),
            tags: [],
            pinnedComment: socialMeta.youtubeShort.pinnedComment,
            format: 'short',
          });
          results.push(result);
          recordResult(status, result);
        }
      }

      if (targets.includes('facebook') && facebook && socialMeta.facebookShort) {
        if (!force && isAlreadyPublished(status, 'facebook', 'short')) {
          logger.info(`⏭  Facebook Reel already published → ${status.facebook!.short!.url}`);
        } else {
          const result = await facebook.uploadVideo({
            videoPath,
            caption: formatFacebookShortCaption(socialMeta.facebookShort),
            firstComment: socialMeta.facebookShort.firstComment,
            format: 'short',
          });
          results.push(result);
          recordResult(status, result);
        }
      }
    }

    await savePublishStatus(projectDir, status);
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

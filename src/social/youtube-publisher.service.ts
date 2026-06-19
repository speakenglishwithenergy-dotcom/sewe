import fs from 'fs';
import { google } from 'googleapis';
import { PublishEnvConfig } from './publish.env';
import { PublishResult } from './publish.types';
import { logger } from '../utils/logger';

export interface YouTubeUploadInput {
  videoPath: string;
  thumbnailPath?: string;
  title: string;
  description: string;
  tags: string[];
  pinnedComment: string;
  format: 'long' | 'short';
  /** When set, the video is scheduled for this UTC time (privacyStatus becomes "private"). */
  publishAt?: Date;
}

export class YouTubePublisherService {
  constructor(
    private readonly config: PublishEnvConfig['youtube'],
    private readonly playlists: { long: string; short: string },
  ) {}

  private createClient() {
    const oauth2 = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
    );
    oauth2.setCredentials({ refresh_token: this.config.refreshToken });
    return google.youtube({ version: 'v3', auth: oauth2 });
  }

  async uploadVideo(input: YouTubeUploadInput): Promise<PublishResult> {
    const youtube = this.createClient();
    const label = input.format === 'short' ? 'YouTube Short' : 'YouTube video';
    const scheduledLabel = input.publishAt
      ? ` (scheduled for ${input.publishAt.toISOString()})`
      : '';

    logger.info(`Uploading ${label} → ${input.title}${scheduledLabel}`);

    const privacyStatus = input.publishAt ? 'private' : this.config.privacy;

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: input.title,
          description: input.description,
          tags: input.tags,
          categoryId: this.config.categoryId,
        },
        status: {
          privacyStatus,
          ...(input.publishAt ? { publishAt: input.publishAt.toISOString() } : {}),
          selfDeclaredMadeForKids: false,
          containsSyntheticMedia: false,
        },
      },
      media: {
        body: fs.createReadStream(input.videoPath),
      },
    });

    const videoId = response.data.id;
    if (!videoId) {
      throw new Error('YouTube upload succeeded but no video ID was returned');
    }

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    logger.success(`${label} uploaded → ${url}${scheduledLabel}`);

    await this.setCustomThumbnail(youtube, videoId, input.thumbnailPath);

    await this.addToPlaylist(
      youtube,
      videoId,
      input.format === 'long' ? this.playlists.long : this.playlists.short,
      label,
    );

    const commentPosted = await this.postPinnedComment(youtube, videoId, input.pinnedComment);

    return {
      platform: 'youtube',
      format: input.format,
      videoId,
      url,
      commentPosted,
    };
  }

  private async setCustomThumbnail(
    youtube: ReturnType<typeof google.youtube>,
    videoId: string,
    thumbnailPath: string | undefined,
  ): Promise<void> {
    if (!thumbnailPath) return;

    logger.info(`Setting YouTube thumbnail → ${thumbnailPath}`);

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await youtube.thumbnails.set({
          videoId,
          requestBody: {},
          media: {
            mimeType: 'image/png',
            body: fs.createReadStream(thumbnailPath),
          },
        });
        logger.success('YouTube thumbnail set');
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const retryable = /notFound|videoNotFound|404/i.test(message);
        if (retryable && attempt < maxAttempts) {
          await sleep(3000);
          continue;
        }
        logger.error(`Could not set YouTube thumbnail: ${message}`);
        logger.info(
          'Video uploaded successfully. Verify your channel for custom thumbnails or set one manually in YouTube Studio.',
        );
        return;
      }
    }
  }

  private async addToPlaylist(
    youtube: ReturnType<typeof google.youtube>,
    videoId: string,
    playlistId: string,
    label: string,
  ): Promise<void> {
    logger.info(`Adding ${label} to playlist ${playlistId}...`);

    try {
      await youtube.playlistItems.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId,
            },
          },
        },
      });
      logger.success(`Added to playlist → https://www.youtube.com/playlist?list=${playlistId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Could not add video to playlist: ${message}`);
      logger.info(
        'Video uploaded successfully. Re-run `npm run youtube:auth` if your token lacks playlist permissions, or add manually in YouTube Studio.',
      );
    }
  }

  private async postPinnedComment(
    youtube: ReturnType<typeof google.youtube>,
    videoId: string,
    text: string,
  ): Promise<boolean> {
    logger.info('Posting pinned comment on YouTube...');

    try {
      const thread = await youtube.commentThreads.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            videoId,
            topLevelComment: {
              snippet: {
                textOriginal: text,
              },
            },
          },
        },
      });

      const commentId = thread.data.snippet?.topLevelComment?.id;
      if (!commentId) {
        logger.error('YouTube comment posted but comment ID was missing — could not pin');
        return false;
      }

      await youtube.comments.setModerationStatus({
        id: [commentId],
        moderationStatus: 'published',
        banAuthor: false,
        ...({ isPinned: true } as Record<string, boolean>),
      });

      logger.success('Pinned comment on YouTube');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Could not post pinned comment: ${message}`);
      logger.info(
        'Video uploaded successfully. Re-run `npm run youtube:auth` if your token lacks the youtube.force-ssl scope, then paste the comment manually.',
      );
      return false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import fs from 'fs';
import { google } from 'googleapis';
import { PublishEnvConfig } from './publish.env';
import { PublishResult } from './publish.types';
import { logger } from '../utils/logger';

export interface YouTubeUploadInput {
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  pinnedComment: string;
  format: 'long' | 'short';
}

export class YouTubePublisherService {
  constructor(private readonly config: PublishEnvConfig['youtube']) {}

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

    logger.info(`Uploading ${label} → ${input.title}`);

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
          privacyStatus: this.config.privacy,
          selfDeclaredMadeForKids: false,
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
    logger.success(`${label} uploaded → ${url}`);

    const commentPosted = await this.postPinnedComment(youtube, videoId, input.pinnedComment);

    return {
      platform: 'youtube',
      format: input.format,
      videoId,
      url,
      commentPosted,
    };
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

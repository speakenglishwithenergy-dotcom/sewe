import fs from 'fs';
import FormData from 'form-data';
import { PublishEnvConfig } from './publish.env';
import { PublishResult } from './publish.types';
import { logger } from '../utils/logger';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const GRAPH_VIDEO_BASE = `https://graph-video.facebook.com/${GRAPH_API_VERSION}`;

export interface FacebookUploadInput {
  videoPath: string;
  caption: string;
  firstComment: string;
  format: 'long' | 'short';
}

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

export class FacebookPublisherService {
  constructor(private readonly config: PublishEnvConfig['facebook']) {}

  async uploadVideo(input: FacebookUploadInput): Promise<PublishResult> {
    if (input.format === 'short') {
      return this.uploadReel(input);
    }
    return this.uploadPageVideo(input);
  }

  private async uploadPageVideo(input: FacebookUploadInput): Promise<PublishResult> {
    logger.info(`Uploading Facebook video → ${input.videoPath}`);

    const form = new FormData();
    form.append('access_token', this.config.accessToken);
    form.append('description', input.caption);
    form.append('published', 'true');
    form.append('source', fs.createReadStream(input.videoPath));

    const response = await this.postMultipart(
      `${GRAPH_VIDEO_BASE}/${this.config.pageId}/videos`,
      form,
    );
    const videoId = response.id as string | undefined;
    if (!videoId) {
      throw new Error('Facebook upload succeeded but no video ID was returned');
    }

    const url = `https://www.facebook.com/${videoId}`;
    logger.success(`Facebook video uploaded → ${url}`);

    const commentPosted = await this.postFirstComment(videoId, input.firstComment);

    return {
      platform: 'facebook',
      format: 'long',
      videoId,
      url,
      commentPosted,
    };
  }

  private async uploadReel(input: FacebookUploadInput): Promise<PublishResult> {
    logger.info(`Uploading Facebook Reel → ${input.videoPath}`);

    const startParams = new URLSearchParams({
      access_token: this.config.accessToken,
      upload_phase: 'start',
    });
    const start = await this.postJson<{ video_id: string; upload_url: string }>(
      `${GRAPH_BASE}/${this.config.pageId}/video_reels?${startParams.toString()}`,
      {},
    );

    const uploadUrl = start.upload_url;
    const videoId = start.video_id;
    if (!uploadUrl || !videoId) {
      throw new Error('Facebook Reel init failed — missing upload_url or video_id');
    }

    const videoBuffer = await fs.promises.readFile(input.videoPath);
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${this.config.accessToken}`,
        'Content-Type': 'application/octet-stream',
        offset: '0',
        file_size: String(videoBuffer.length),
      },
      body: videoBuffer,
    });
    if (!uploadResponse.ok) {
      const body = await uploadResponse.text();
      throw new Error(`Facebook Reel binary upload failed (${uploadResponse.status}): ${body}`);
    }

    const finishParams = new URLSearchParams({
      access_token: this.config.accessToken,
      upload_phase: 'finish',
      video_id: videoId,
      video_state: 'PUBLISHED',
      description: input.caption,
    });
    await this.postJson(
      `${GRAPH_BASE}/${this.config.pageId}/video_reels?${finishParams.toString()}`,
      {},
    );

    const url = `https://www.facebook.com/reel/${videoId}`;
    logger.success(`Facebook Reel uploaded → ${url}`);

    const commentPosted = await this.postFirstComment(videoId, input.firstComment);

    return {
      platform: 'facebook',
      format: 'short',
      videoId,
      url,
      commentPosted,
    };
  }

  private async postFirstComment(objectId: string, message: string): Promise<boolean> {
    logger.info('Posting first comment on Facebook...');

    const params = new URLSearchParams({
      access_token: this.config.accessToken,
      message,
    });
    await this.postJson(`${GRAPH_BASE}/${objectId}/comments?${params.toString()}`, {});

    logger.success('First comment posted on Facebook');
    return true;
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as T & GraphErrorBody;
    if (!response.ok) {
      throw new Error(
        `Facebook API error (${response.status}): ${data.error?.message ?? JSON.stringify(data)}`,
      );
    }
    if (data.error?.message) {
      throw new Error(`Facebook API error: ${data.error.message}`);
    }
    return data;
  }

  private async postMultipart(url: string, form: FormData): Promise<{ id?: string }> {
    const response = await fetch(url, {
      method: 'POST',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: form as any,
      headers: form.getHeaders(),
    });
    const data = (await response.json()) as { id?: string } & GraphErrorBody;
    if (!response.ok) {
      throw new Error(
        `Facebook API error (${response.status}): ${data.error?.message ?? JSON.stringify(data)}`,
      );
    }
    if (data.error?.message) {
      throw new Error(`Facebook API error: ${data.error.message}`);
    }
    return data;
  }
}

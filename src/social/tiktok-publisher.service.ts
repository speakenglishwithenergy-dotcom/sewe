import fs from 'fs/promises';
import { PublishEnvConfig } from './publish.env';
import { PublishResult, TikTokPrivacy } from './publish.types';
import { logger } from '../utils/logger';

const API_BASE = 'https://open.tiktokapis.com/v2';

interface TikTokApiResponse<T> {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
}

interface CreatorInfo {
  creator_username?: string;
  privacy_level_options?: TikTokPrivacy[];
  max_video_post_duration_sec?: number;
}

interface InitUploadResponse {
  publish_id?: string;
  upload_url?: string;
}

interface PublishStatusResponse {
  status?: string;
  fail_reason?: string;
  share_url?: string;
  publicaly_available_post_id?: Array<number | string>;
}

export interface TikTokUploadInput {
  videoPath: string;
  caption: string;
}

export class TikTokPublisherService {
  constructor(private readonly config: PublishEnvConfig['tiktok']) {}

  async uploadVideo(input: TikTokUploadInput): Promise<PublishResult> {
    const accessToken = await this.resolveAccessToken();
    const creator = await this.queryCreatorInfo(accessToken);
    const privacy = this.resolvePrivacyLevel(creator.privacy_level_options);

    const videoBuffer = await fs.readFile(input.videoPath);
    const videoSize = videoBuffer.length;

    logger.info(`Uploading TikTok video (${privacy}) → ${input.videoPath}`);

    const init = await this.apiPost<InitUploadResponse>(
      '/post/publish/video/init/',
      accessToken,
      {
        post_info: {
          title: input.caption,
          privacy_level: privacy,
          disable_duet: false,
          disable_stitch: false,
          disable_comment: false,
          brand_content_toggle: false,
          brand_organic_toggle: false,
          is_aigc: true,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1,
        },
      },
    );

    const publishId = init.publish_id;
    const uploadUrl = init.upload_url;
    if (!publishId || !uploadUrl) {
      throw new Error('TikTok init upload failed — missing publish_id or upload_url');
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(videoSize),
        'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
      },
      body: videoBuffer,
    });
    if (!uploadResponse.ok) {
      const body = await uploadResponse.text();
      throw new Error(`TikTok video upload failed (${uploadResponse.status}): ${body}`);
    }

    const status = await this.waitForPublishComplete(accessToken, publishId);
    const postId = status.publicaly_available_post_id?.[0];
    const url = status.share_url
      ?? (postId && creator.creator_username
        ? `https://www.tiktok.com/@${creator.creator_username}/video/${String(postId)}`
        : `https://www.tiktok.com/@${creator.creator_username ?? 'me'}`);

    logger.success(`TikTok video uploaded (${status.status ?? 'submitted'}) → ${url}`);

    if (privacy === 'SELF_ONLY') {
      logger.info(
        'TikTok post is private (SELF_ONLY) — visible only to you until you change visibility in the app',
      );
    }

    return {
      platform: 'tiktok',
      format: 'short',
      videoId: postId ? String(postId) : publishId,
      url,
      commentPosted: false,
    };
  }

  private async resolveAccessToken(): Promise<string> {
    if (this.config.accessToken) {
      return this.config.accessToken;
    }
    if (!this.config.refreshToken) {
      throw new Error('TIKTOK_ACCESS_TOKEN or TIKTOK_REFRESH_TOKEN is required');
    }
    return this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_key: this.config.clientKey,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: this.config.refreshToken,
    });

    const response = await fetch(`${API_BASE}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !data.access_token) {
      throw new Error(
        `TikTok token refresh failed: ${data.error_description ?? data.error ?? response.statusText}`,
      );
    }

    if (data.refresh_token && data.refresh_token !== this.config.refreshToken) {
      logger.info('TikTok refresh token rotated — update TIKTOK_REFRESH_TOKEN in .env');
    }

    return data.access_token;
  }

  private async queryCreatorInfo(accessToken: string): Promise<CreatorInfo> {
    return this.apiPost<CreatorInfo>('/post/publish/creator_info/query/', accessToken, {});
  }

  private resolvePrivacyLevel(options: TikTokPrivacy[] | undefined): TikTokPrivacy {
    const preferred = this.config.privacy;
    if (options?.includes(preferred)) {
      return preferred;
    }
    if (options?.includes('SELF_ONLY')) {
      if (preferred !== 'SELF_ONLY') {
        logger.info(
          `TikTok privacy "${preferred}" unavailable — falling back to SELF_ONLY`,
        );
      }
      return 'SELF_ONLY';
    }
    if (options?.[0]) {
      logger.info(`TikTok privacy "${preferred}" unavailable — using ${options[0]}`);
      return options[0];
    }
    return 'SELF_ONLY';
  }

  private async waitForPublishComplete(
    accessToken: string,
    publishId: string,
  ): Promise<PublishStatusResponse> {
    const maxAttempts = 30;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const status = await this.apiPost<PublishStatusResponse>(
        '/post/publish/status/fetch/',
        accessToken,
        { publish_id: publishId },
      );

      if (status.status === 'PUBLISH_COMPLETE') {
        return status;
      }
      if (status.status === 'FAILED') {
        throw new Error(
          `TikTok publish failed (${status.fail_reason ?? 'unknown reason'})`,
        );
      }

      if (attempt < maxAttempts) {
        await sleep(2000);
      }
    }

    logger.info('TikTok publish still processing — saving publish_id for reference');
    return { status: 'PROCESSING' };
  }

  private async apiPost<T>(path: string, accessToken: string, body: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
    });

    const raw = await response.text();
    const parsed = JSON.parse(raw) as TikTokApiResponse<T>;
    if (!response.ok || (parsed.error?.code && parsed.error.code !== 'ok')) {
      throw new Error(
        `TikTok API error (${path}): ${parsed.error?.message ?? raw}`,
      );
    }
    if (!parsed.data) {
      throw new Error(`TikTok API returned no data (${path})`);
    }
    return parsed.data;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

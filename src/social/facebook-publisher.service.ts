import fs from 'fs';
import FormData from 'form-data';
import { PublishEnvConfig } from './publish.env';
import { PublishResult } from './publish.types';
import { logger } from '../utils/logger';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const GRAPH_VIDEO_BASE = `https://graph-video.facebook.com/${GRAPH_API_VERSION}`;
const FETCH_MAX_ATTEMPTS = 5;
const FETCH_CHUNK_TIMEOUT_MS = 10 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(FETCH_CHUNK_TIMEOUT_MS),
      });
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < FETCH_MAX_ATTEMPTS) {
        const delayMs = Math.min(1000 * 2 ** (attempt - 1), 30_000);
        logger.info(
          `Facebook ${label} failed (${message}) — retry ${attempt}/${FETCH_MAX_ATTEMPTS} in ${delayMs / 1000}s`,
        );
        await sleep(delayMs);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface FacebookUploadInput {
  videoPath: string;
  thumbnailPath?: string;
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

  /** Unpublished Page videos / draft Reels — review in Meta Business Suite before going live. */
  private get publishLive(): boolean {
    return this.config.published;
  }

  async uploadVideo(input: FacebookUploadInput): Promise<PublishResult> {
    if (input.format === 'short') {
      return this.uploadReel(input);
    }
    return this.uploadPageVideo(input);
  }

  private async uploadPageVideo(input: FacebookUploadInput): Promise<PublishResult> {
    const visibility = this.publishLive ? 'public' : 'unpublished (private)';
    logger.info(`Uploading Facebook video (${visibility}) → ${input.videoPath}`);

    const fileSize = (await fs.promises.stat(input.videoPath)).size;
    const { videoId, sessionId, startOffset, endOffset } = await this.startResumableUpload(fileSize);
    await this.transferResumableVideo(input.videoPath, fileSize, sessionId, startOffset, endOffset);
    await this.finishResumableUpload(sessionId, input.caption);

    const url = `https://www.facebook.com/${videoId}`;
    logger.success(`Facebook video uploaded (${visibility}) → ${url}`);

    await this.setVideoThumbnail(videoId, input.thumbnailPath);

    const commentPosted = await this.maybePostFirstComment(videoId, input.firstComment);

    return {
      platform: 'facebook',
      format: 'long',
      videoId,
      url,
      commentPosted,
    };
  }

  private async startResumableUpload(
    fileSize: number,
  ): Promise<{ videoId: string; sessionId: string; startOffset: number; endOffset: number }> {
    const params = new URLSearchParams({
      access_token: this.config.accessToken,
      upload_phase: 'start',
      file_size: String(fileSize),
    });
    const data = await this.postUrlEncoded<{ video_id: string; upload_session_id: string; start_offset: string; end_offset: string }>(
      `${GRAPH_VIDEO_BASE}/${this.config.pageId}/videos?${params.toString()}`,
    );
    if (!data.video_id || !data.upload_session_id) {
      throw new Error('Facebook resumable upload start failed — missing video_id or upload_session_id');
    }
    return {
      videoId: data.video_id,
      sessionId: data.upload_session_id,
      startOffset: Number(data.start_offset),
      endOffset: Number(data.end_offset),
    };
  }

  private async transferResumableVideo(
    videoPath: string,
    fileSize: number,
    sessionId: string,
    startOffset: number,
    endOffset: number,
  ): Promise<void> {
    const fd = await fs.promises.open(videoPath, 'r');
    try {
      let offset = startOffset;
      let chunkEnd = endOffset;
      let lastLoggedMb = 0;

      while (offset !== chunkEnd) {
        const chunkLength = chunkEnd - offset;
        const chunk = Buffer.alloc(chunkLength);
        await fd.read(chunk, 0, chunkLength, offset);

        const form = new globalThis.FormData();
        form.append('access_token', this.config.accessToken);
        form.append('upload_phase', 'transfer');
        form.append('upload_session_id', sessionId);
        form.append('start_offset', String(offset));
        form.append('video_file_chunk', new Blob([chunk]), 'chunk');

        const response = await fetchWithRetry(
          `${GRAPH_VIDEO_BASE}/${this.config.pageId}/videos`,
          { method: 'POST', body: form },
          'chunk upload',
        );
        const data = (await response.json()) as {
          start_offset: string;
          end_offset: string;
        } & GraphErrorBody;
        if (!response.ok || data.error?.message) {
          throw new Error(
            `Facebook resumable transfer failed (${response.status}): ${data.error?.message ?? JSON.stringify(data)}`,
          );
        }

        offset = Number(data.start_offset);
        chunkEnd = Number(data.end_offset);

        const uploadedMb = Math.floor(offset / (1024 * 1024));
        if (uploadedMb >= lastLoggedMb + 10 || offset === fileSize) {
          lastLoggedMb = uploadedMb;
          logger.info(`Facebook upload progress: ${Math.round((offset / fileSize) * 100)}% (${uploadedMb} MB / ${Math.ceil(fileSize / (1024 * 1024))} MB)`);
        }
      }
    } finally {
      await fd.close();
    }
  }

  private async finishResumableUpload(sessionId: string, caption: string): Promise<void> {
    const params = new URLSearchParams({
      access_token: this.config.accessToken,
      upload_phase: 'finish',
      upload_session_id: sessionId,
      description: caption,
      published: this.publishLive ? 'true' : 'false',
    });
    await this.postUrlEncoded(`${GRAPH_VIDEO_BASE}/${this.config.pageId}/videos?${params.toString()}`);
  }

  private async postUrlEncoded<T = { success?: boolean }>(url: string): Promise<T> {
    const response = await fetchWithRetry(url, { method: 'POST' }, 'API request');
    const text = await response.text();
    let data: T & GraphErrorBody;
    try {
      data = (text ? JSON.parse(text) : {}) as T & GraphErrorBody;
    } catch {
      throw new Error(
        `Facebook API error (${response.status}): ${text || 'empty response body'}`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `Facebook API error (${response.status}): ${data.error?.message ?? text}`,
      );
    }
    if (data.error?.message) {
      throw new Error(`Facebook API error: ${data.error.message}`);
    }
    return data;
  }

  private async uploadReel(input: FacebookUploadInput): Promise<PublishResult> {
    const videoState = this.publishLive ? 'PUBLISHED' : 'DRAFT';
    const visibility = this.publishLive ? 'public' : 'draft (private)';
    logger.info(`Uploading Facebook Reel (${visibility}) → ${input.videoPath}`);

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
    const uploadResponse = await fetchWithRetry(
      uploadUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${this.config.accessToken}`,
          'Content-Type': 'application/octet-stream',
          offset: '0',
          file_size: String(videoBuffer.length),
        },
        body: videoBuffer,
      },
      'Reel upload',
    );
    if (!uploadResponse.ok) {
      const body = await uploadResponse.text();
      throw new Error(`Facebook Reel binary upload failed (${uploadResponse.status}): ${body}`);
    }

    const finishParams = new URLSearchParams({
      access_token: this.config.accessToken,
      upload_phase: 'finish',
      video_id: videoId,
      video_state: videoState,
      description: input.caption,
    });
    await this.postJson(
      `${GRAPH_BASE}/${this.config.pageId}/video_reels?${finishParams.toString()}`,
      {},
    );

    const url = this.publishLive
      ? `https://www.facebook.com/reel/${videoId}`
      : `https://www.facebook.com/${videoId}`;
    logger.success(`Facebook Reel uploaded (${visibility}) → ${url}`);

    await this.setVideoThumbnail(videoId, input.thumbnailPath);

    const commentPosted = await this.maybePostFirstComment(videoId, input.firstComment);

    return {
      platform: 'facebook',
      format: 'short',
      videoId,
      url,
      commentPosted,
    };
  }

  private async setVideoThumbnail(videoId: string, thumbnailPath: string | undefined): Promise<void> {
    if (!thumbnailPath) return;

    logger.info(`Setting Facebook video thumbnail → ${thumbnailPath}`);

    const form = new FormData();
    form.append('is_preferred', 'true');
    form.append('source', fs.createReadStream(thumbnailPath));

    try {
      await this.postMultipart(`${GRAPH_BASE}/${videoId}/thumbnails`, form);
      logger.success('Facebook video thumbnail set');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Could not set Facebook video thumbnail: ${message}`);
      logger.info('Video uploaded successfully — set the cover image manually in Meta Business Suite if needed.');
    }
  }

  private async maybePostFirstComment(objectId: string, message: string): Promise<boolean> {
    if (!this.publishLive) {
      logger.info(
        'Skipping Facebook first comment — video is unpublished/draft (post manually after publishing)',
      );
      return false;
    }
    return this.postFirstComment(objectId, message);
  }

  private async postFirstComment(objectId: string, message: string): Promise<boolean> {
    logger.info('Posting first comment on Facebook...');

    try {
      const params = new URLSearchParams({
        access_token: this.config.accessToken,
        message,
      });
      await this.postJson(`${GRAPH_BASE}/${objectId}/comments?${params.toString()}`, {});
      logger.success('First comment posted on Facebook');
      return true;
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error(`Could not post Facebook first comment: ${errMessage}`);
      logger.info('Video uploaded successfully — post the first comment manually in Meta Business Suite if needed.');
      return false;
    }
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      'API request',
    );
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

  /** form-data + Node fetch drops body fields and streams; use query param + form.submit(). */
  private withAccessToken(url: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}access_token=${encodeURIComponent(this.config.accessToken)}`;
  }

  private postMultipart(url: string, form: FormData): Promise<{ id?: string }> {
    return new Promise((resolve, reject) => {
      form.submit(this.withAccessToken(url), (err, res) => {
        if (err) {
          reject(err);
          return;
        }

        let body = '';
        res.on('data', (chunk: Buffer | string) => {
          body += chunk;
        });
        res.on('error', reject);
        res.on('end', () => {
          if (!body.trim()) {
            reject(
              new Error(
                `Facebook API error (${res.statusCode ?? 'unknown'}): empty response body`,
              ),
            );
            return;
          }
          try {
            const data = JSON.parse(body) as { id?: string } & GraphErrorBody;
            if (res.statusCode && res.statusCode >= 400) {
              reject(
                new Error(
                  `Facebook API error (${res.statusCode}): ${data.error?.message ?? body}`,
                ),
              );
              return;
            }
            if (data.error?.message) {
              reject(new Error(`Facebook API error: ${data.error.message}`));
              return;
            }
            resolve(data);
          } catch (parseErr) {
            reject(parseErr);
          }
        });
      });
    });
  }
}

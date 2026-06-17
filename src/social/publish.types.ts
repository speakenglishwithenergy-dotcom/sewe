export type PublishPrivacy = 'private' | 'unlisted' | 'public';

export type TikTokPrivacy =
  | 'PUBLIC_TO_EVERYONE'
  | 'MUTUAL_FOLLOW_FRIENDS'
  | 'FOLLOWER_OF_CREATOR'
  | 'SELF_ONLY';

export type PublishTarget = 'youtube' | 'facebook' | 'tiktok';

/** Default platforms for publish — TikTok temporarily disabled. */
export const DEFAULT_PUBLISH_TARGETS: PublishTarget[] = ['youtube', 'facebook'];

export type PublishFormat = 'long' | 'short';

export interface PublishedVideoRecord {
  id: string;
  url: string;
  publishedAt: string;
}

export interface PublishStatus {
  youtube?: {
    long?: PublishedVideoRecord;
    short?: PublishedVideoRecord;
  };
  facebook?: {
    long?: PublishedVideoRecord;
    short?: PublishedVideoRecord;
  };
  tiktok?: {
    short?: PublishedVideoRecord;
  };
}

export interface PublishResult {
  platform: PublishTarget;
  format: PublishFormat;
  videoId: string;
  url: string;
  commentPosted: boolean;
}

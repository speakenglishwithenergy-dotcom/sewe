export type PublishPrivacy = 'private' | 'unlisted' | 'public';

export type PublishTarget = 'youtube' | 'facebook';

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
}

export interface PublishResult {
  platform: PublishTarget;
  format: PublishFormat;
  videoId: string;
  url: string;
  commentPosted: boolean;
}

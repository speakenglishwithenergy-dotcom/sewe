import { PublishPrivacy, PublishTarget } from './publish.types';

const VALID_PRIVACY: PublishPrivacy[] = ['private', 'unlisted', 'public'];

export interface PublishEnvConfig {
  youtube: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    privacy: PublishPrivacy;
    categoryId: string;
  };
  facebook: {
    pageId: string;
    accessToken: string;
    /** false = unpublished Page video / draft Reel (default, matches YouTube private) */
    published: boolean;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePrivacy(value: string | undefined, fallback: PublishPrivacy): PublishPrivacy {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (VALID_PRIVACY.includes(normalized as PublishPrivacy)) {
    return normalized as PublishPrivacy;
  }
  throw new Error(
    `Invalid YOUTUBE_PUBLISH_PRIVACY "${value}" — use private, unlisted, or public`,
  );
}

export function isPublishConfigured(target: PublishTarget): boolean {
  if (target === 'youtube') {
    return Boolean(
      process.env.YOUTUBE_CLIENT_ID?.trim()
        && process.env.YOUTUBE_CLIENT_SECRET?.trim()
        && process.env.YOUTUBE_REFRESH_TOKEN?.trim(),
    );
  }
  return Boolean(
    process.env.FACEBOOK_PAGE_ID?.trim() && process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim(),
  );
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  throw new Error(`Invalid boolean env value "${value}" — use true or false`);
}

export function loadPublishEnvConfig(targets: PublishTarget[]): PublishEnvConfig {
  const needsYouTube = targets.includes('youtube');
  const needsFacebook = targets.includes('facebook');

  return {
    youtube: {
      clientId: needsYouTube ? requireEnv('YOUTUBE_CLIENT_ID') : '',
      clientSecret: needsYouTube ? requireEnv('YOUTUBE_CLIENT_SECRET') : '',
      refreshToken: needsYouTube ? requireEnv('YOUTUBE_REFRESH_TOKEN') : '',
      privacy: parsePrivacy(process.env.YOUTUBE_PUBLISH_PRIVACY, 'private'),
      categoryId: process.env.YOUTUBE_CATEGORY_ID?.trim() || '27',
    },
    facebook: {
      pageId: needsFacebook ? requireEnv('FACEBOOK_PAGE_ID') : '',
      accessToken: needsFacebook ? requireEnv('FACEBOOK_PAGE_ACCESS_TOKEN') : '',
      published: parseBooleanEnv(process.env.FACEBOOK_PUBLISH_LIVE, false),
    },
  };
}

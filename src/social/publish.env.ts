import { PublishPrivacy, PublishTarget, TikTokPrivacy } from './publish.types';

const VALID_PRIVACY: PublishPrivacy[] = ['private', 'unlisted', 'public'];
const VALID_TIKTOK_PRIVACY: TikTokPrivacy[] = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
];

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
  tiktok: {
    clientKey: string;
    clientSecret: string;
    accessToken: string;
    refreshToken: string;
    privacy: TikTokPrivacy;
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

function parseTikTokPrivacy(value: string | undefined, fallback: TikTokPrivacy): TikTokPrivacy {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return fallback;
  if (VALID_TIKTOK_PRIVACY.includes(normalized as TikTokPrivacy)) {
    return normalized as TikTokPrivacy;
  }
  throw new Error(
    `Invalid TIKTOK_PUBLISH_PRIVACY "${value}" — use ${VALID_TIKTOK_PRIVACY.join(', ')}`,
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
  if (target === 'facebook') {
    return Boolean(
      process.env.FACEBOOK_PAGE_ID?.trim() && process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim(),
    );
  }
  return Boolean(
    process.env.TIKTOK_CLIENT_KEY?.trim()
      && process.env.TIKTOK_CLIENT_SECRET?.trim()
      && (process.env.TIKTOK_ACCESS_TOKEN?.trim() || process.env.TIKTOK_REFRESH_TOKEN?.trim()),
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
  const needsTikTok = targets.includes('tiktok');

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
    tiktok: {
      clientKey: needsTikTok ? requireEnv('TIKTOK_CLIENT_KEY') : '',
      clientSecret: needsTikTok ? requireEnv('TIKTOK_CLIENT_SECRET') : '',
      accessToken: needsTikTok ? (process.env.TIKTOK_ACCESS_TOKEN?.trim() || '') : '',
      refreshToken: needsTikTok ? (process.env.TIKTOK_REFRESH_TOKEN?.trim() || '') : '',
      privacy: parseTikTokPrivacy(process.env.TIKTOK_PUBLISH_PRIVACY, 'SELF_ONLY'),
    },
  };
}

import { PublishPrivacy, PublishTarget, TikTokPrivacy } from './publish.types';
import { DEFAULT_CHANNEL_ID } from '../channel/constants';

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
    published: boolean;
    firstCommentEnabled: boolean;
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

function envName(prefix: string, base: string, channelId?: string): string {
  const prefixed = `${prefix}_${base}`;
  if (process.env[prefixed]?.trim()) {
    return prefixed;
  }
  if (channelId === DEFAULT_CHANNEL_ID && process.env[base]?.trim()) {
    return base;
  }
  return prefixed;
}

function readEnv(prefix: string, base: string, channelId?: string): string | undefined {
  const name = envName(prefix, base, channelId);
  return process.env[name]?.trim() || undefined;
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

export function isPublishConfigured(target: PublishTarget, envPrefix: string, channelId?: string): boolean {
  if (target === 'youtube') {
    return Boolean(
      readEnv(envPrefix, 'YOUTUBE_CLIENT_ID', channelId)
        && readEnv(envPrefix, 'YOUTUBE_CLIENT_SECRET', channelId)
        && readEnv(envPrefix, 'YOUTUBE_REFRESH_TOKEN', channelId),
    );
  }
  if (target === 'facebook') {
    return Boolean(
      readEnv(envPrefix, 'FACEBOOK_PAGE_ID', channelId)
        && readEnv(envPrefix, 'FACEBOOK_PAGE_ACCESS_TOKEN', channelId),
    );
  }
  return Boolean(
    readEnv(envPrefix, 'TIKTOK_CLIENT_KEY', channelId)
      && readEnv(envPrefix, 'TIKTOK_CLIENT_SECRET', channelId)
      && (readEnv(envPrefix, 'TIKTOK_ACCESS_TOKEN', channelId)
        || readEnv(envPrefix, 'TIKTOK_REFRESH_TOKEN', channelId)),
  );
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  throw new Error(`Invalid boolean env value "${value}" — use true or false`);
}

export function loadPublishEnvConfig(
  envPrefix: string,
  targets: PublishTarget[],
  channelId?: string,
): PublishEnvConfig {
  const needsYouTube = targets.includes('youtube');
  const needsFacebook = targets.includes('facebook');
  const needsTikTok = targets.includes('tiktok');

  const youtubeClientId = envName(envPrefix, 'YOUTUBE_CLIENT_ID', channelId);
  const youtubeClientSecret = envName(envPrefix, 'YOUTUBE_CLIENT_SECRET', channelId);
  const youtubeRefreshToken = envName(envPrefix, 'YOUTUBE_REFRESH_TOKEN', channelId);
  const facebookPageId = envName(envPrefix, 'FACEBOOK_PAGE_ID', channelId);
  const facebookToken = envName(envPrefix, 'FACEBOOK_PAGE_ACCESS_TOKEN', channelId);
  const tiktokClientKey = envName(envPrefix, 'TIKTOK_CLIENT_KEY', channelId);
  const tiktokClientSecret = envName(envPrefix, 'TIKTOK_CLIENT_SECRET', channelId);

  return {
    youtube: {
      clientId: needsYouTube ? requireEnv(youtubeClientId) : '',
      clientSecret: needsYouTube ? requireEnv(youtubeClientSecret) : '',
      refreshToken: needsYouTube ? requireEnv(youtubeRefreshToken) : '',
      privacy: parsePrivacy(
        readEnv(envPrefix, 'YOUTUBE_PUBLISH_PRIVACY', channelId),
        'private',
      ),
      categoryId: readEnv(envPrefix, 'YOUTUBE_CATEGORY_ID', channelId) || '27',
    },
    facebook: {
      pageId: needsFacebook ? requireEnv(facebookPageId) : '',
      accessToken: needsFacebook ? requireEnv(facebookToken) : '',
      published: parseBooleanEnv(
        readEnv(envPrefix, 'FACEBOOK_PUBLISH_LIVE', channelId),
        false,
      ),
      firstCommentEnabled: parseBooleanEnv(
        readEnv(envPrefix, 'FACEBOOK_FIRST_COMMENT', channelId),
        true,
      ),
    },
    tiktok: {
      clientKey: needsTikTok ? requireEnv(tiktokClientKey) : '',
      clientSecret: needsTikTok ? requireEnv(tiktokClientSecret) : '',
      accessToken: needsTikTok ? (readEnv(envPrefix, 'TIKTOK_ACCESS_TOKEN', channelId) || '') : '',
      refreshToken: needsTikTok ? (readEnv(envPrefix, 'TIKTOK_REFRESH_TOKEN', channelId) || '') : '',
      privacy: parseTikTokPrivacy(
        readEnv(envPrefix, 'TIKTOK_PUBLISH_PRIVACY', channelId),
        'SELF_ONLY',
      ),
    },
  };
}

/** Resolve OAuth env var names for scripts/youtube-oauth.ts */
export function resolveOAuthEnvNames(envPrefix: string, channelId?: string) {
  return {
    youtubeClientId: envName(envPrefix, 'YOUTUBE_CLIENT_ID', channelId),
    youtubeClientSecret: envName(envPrefix, 'YOUTUBE_CLIENT_SECRET', channelId),
    youtubeRefreshToken: envName(envPrefix, 'YOUTUBE_REFRESH_TOKEN', channelId),
    tiktokClientKey: envName(envPrefix, 'TIKTOK_CLIENT_KEY', channelId),
    tiktokClientSecret: envName(envPrefix, 'TIKTOK_CLIENT_SECRET', channelId),
    tiktokAccessToken: envName(envPrefix, 'TIKTOK_ACCESS_TOKEN', channelId),
    tiktokRefreshToken: envName(envPrefix, 'TIKTOK_REFRESH_TOKEN', channelId),
  };
}

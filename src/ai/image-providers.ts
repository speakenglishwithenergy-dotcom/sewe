import { parseApiKeys } from './llm-providers';

export type ImageProvider = 'gemini' | 'openai' | 'cloudflare';

export interface ImageProviderConfig {
  provider: ImageProvider;
  apiKey: string;
  model: string;
  /** Cloudflare Workers AI account id (first account when multiple are configured). */
  accountId?: string;
}

/** One Cloudflare Workers AI account (account id + API token pair). */
export interface CloudflareAccount {
  /** Stable id for sticky quota skips, e.g. `cloudflare#1`. */
  id: string;
  accountId: string;
  apiKey: string;
}

type Env = Record<string, string | undefined>;

const PINNED = new Set<string>(['gemini', 'openai', 'cloudflare']);

const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-1';
const DEFAULT_CLOUDFLARE_IMAGE_MODEL = '@cf/black-forest-labs/flux-2-dev';

/**
 * Resolve which backend generates thumbnails/backgrounds.
 * - IMAGE_PROVIDER=gemini|openai|cloudflare → pin (no cross-provider fallback)
 * - unset → Gemini if GEMINI_API_KEY exists, else OpenAI, else Cloudflare
 */
export function resolveImageProvider(env: Env = process.env): ImageProviderConfig {
  const pinned = env.IMAGE_PROVIDER?.trim().toLowerCase();

  if (pinned) {
    if (!PINNED.has(pinned)) {
      throw new Error(
        `IMAGE_PROVIDER must be "gemini", "openai", or "cloudflare" (got "${env.IMAGE_PROVIDER}")`,
      );
    }
    return buildConfig(pinned as ImageProvider, env, true);
  }

  const geminiKeys = geminiApiKeys(env);
  if (geminiKeys.length > 0) {
    return {
      provider: 'gemini',
      apiKey: geminiKeys[0],
      model: env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_GEMINI_IMAGE_MODEL,
    };
  }

  const openaiKeys = parseApiKeys(env.OPENAI_API_KEY, env.OPENAI_API_KEYS);
  if (openaiKeys.length > 0) {
    return {
      provider: 'openai',
      apiKey: openaiKeys[0],
      model: env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_OPENAI_IMAGE_MODEL,
    };
  }

  const cloudflare = buildCloudflareConfig(env, false);
  if (cloudflare) {
    return cloudflare;
  }

  throw new Error(
    'No image API key configured. Set GEMINI_API_KEY, OPENAI_API_KEY, or CLOUDFLARE_API_TOKEN',
  );
}

function buildConfig(provider: ImageProvider, env: Env, requireKey: boolean): ImageProviderConfig {
  if (provider === 'gemini') {
    const keys = geminiApiKeys(env);
    if (keys.length === 0) {
      if (requireKey) {
        throw new Error('GEMINI_API_KEY environment variable is required when IMAGE_PROVIDER=gemini');
      }
      throw new Error('GEMINI_API_KEY is required for Gemini image generation');
    }
    return {
      provider: 'gemini',
      apiKey: keys[0],
      model: env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_GEMINI_IMAGE_MODEL,
    };
  }

  if (provider === 'cloudflare') {
    const config = buildCloudflareConfig(env, requireKey);
    if (!config) {
      throw new Error(
        'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required when IMAGE_PROVIDER=cloudflare',
      );
    }
    return config;
  }

  const keys = parseApiKeys(env.OPENAI_API_KEY, env.OPENAI_API_KEYS);
  if (keys.length === 0) {
    if (requireKey) {
      throw new Error('OPENAI_API_KEY environment variable is required when IMAGE_PROVIDER=openai');
    }
    throw new Error('OPENAI_API_KEY is required for OpenAI image generation');
  }
  return {
    provider: 'openai',
    apiKey: keys[0],
    model: env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_OPENAI_IMAGE_MODEL,
  };
}

function buildCloudflareConfig(env: Env, requireKey: boolean): ImageProviderConfig | null {
  const accounts = resolveCloudflareAccounts(env);
  if (accounts.length === 0) {
    if (requireKey) {
      throw new Error(
        'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required when IMAGE_PROVIDER=cloudflare',
      );
    }
    return null;
  }
  const first = accounts[0]!;
  return {
    provider: 'cloudflare',
    apiKey: first.apiKey,
    accountId: first.accountId,
    model: env.CLOUDFLARE_IMAGE_MODEL?.trim() || DEFAULT_CLOUDFLARE_IMAGE_MODEL,
  };
}

/**
 * Pair Cloudflare account IDs with API tokens (by index).
 * Supports singular + plural env vars (comma / semicolon / newline separated):
 *   CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_ACCOUNT_IDS
 *   CLOUDFLARE_API_TOKEN  / CLOUDFLARE_API_TOKENS
 * Order is preserved (no dedupe) so index pairing stays aligned.
 * Exhausted accounts are skipped at call time by ImageService.
 */
export function resolveCloudflareAccounts(env: Env = process.env): CloudflareAccount[] {
  const accountIds = parseListPreserveOrder(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_ACCOUNT_IDS);
  const tokens = parseListPreserveOrder(env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_API_TOKENS);
  const count = Math.min(accountIds.length, tokens.length);
  const accounts: CloudflareAccount[] = [];
  for (let i = 0; i < count; i++) {
    accounts.push({
      id: `cloudflare#${i + 1}`,
      accountId: accountIds[i]!,
      apiKey: tokens[i]!,
    });
  }
  return accounts;
}

/** Split env lists without deduping — index pairing must stay aligned. */
function parseListPreserveOrder(...raw: Array<string | undefined>): string[] {
  const values: string[] = [];
  for (const value of raw) {
    if (!value) continue;
    for (const part of value.split(/[,;\n\r]+/)) {
      const trimmed = part.trim();
      if (trimmed) values.push(trimmed);
    }
  }
  return values;
}

export function cloudflareImageModel(env: Env = process.env): string {
  return env.CLOUDFLARE_IMAGE_MODEL?.trim() || DEFAULT_CLOUDFLARE_IMAGE_MODEL;
}

function geminiApiKeys(env: Env): string[] {
  return parseApiKeys(env.GEMINI_API_KEY, env.GEMINI_API_KEYS);
}

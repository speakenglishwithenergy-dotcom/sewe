export type ChatProvider = 'gemini' | 'groq' | 'cerebras' | 'openai';

export const FALLBACK_ORDER = ['gemini', 'groq', 'cerebras'] as const;

export interface ChatBackendConfig {
  /** Stable id for sticky quota skips, e.g. `gemini#2`. */
  id: string;
  name: ChatProvider;
  keyIndex: number;
  apiKey: string;
  baseURL?: string;
  model: string;
  defaultMaxTokens: number;
}

type ProviderSpec = {
  envKey: string;
  /** Optional plural env, e.g. GEMINI_API_KEYS — merged with singular. */
  envKeysPlural?: string;
  modelEnv: string;
  defaultModel: string;
  baseURL?: string;
  defaultMaxTokens: number;
};

const PROVIDER_SPECS: Record<ChatProvider, ProviderSpec> = {
  gemini: {
    envKey: 'GEMINI_API_KEY',
    envKeysPlural: 'GEMINI_API_KEYS',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-3.6-flash',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultMaxTokens: 8_192,
  },
  groq: {
    envKey: 'GROQ_API_KEY',
    envKeysPlural: 'GROQ_API_KEYS',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'qwen/qwen3.8-27b',
    baseURL: 'https://api.groq.com/openai/v1',
    defaultMaxTokens: 4_096,
  },
  cerebras: {
    envKey: 'CEREBRAS_API_KEY',
    envKeysPlural: 'CEREBRAS_API_KEYS',
    modelEnv: 'CEREBRAS_MODEL',
    defaultModel: 'gpt-oss-120b',
    baseURL: 'https://api.cerebras.ai/v1',
    defaultMaxTokens: 8_192,
  },
  openai: {
    envKey: 'OPENAI_API_KEY',
    envKeysPlural: 'OPENAI_API_KEYS',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o',
    defaultMaxTokens: 16_384,
  },
};

const PINNED_PROVIDERS = new Set<string>(['gemini', 'groq', 'cerebras', 'openai']);

type Env = Record<string, string | undefined>;

/** Split one or more env values into unique API keys (comma / semicolon / newline). */
export function parseApiKeys(...raw: Array<string | undefined>): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const value of raw) {
    if (!value) {
      continue;
    }
    for (const part of value.split(/[,;\n\r]+/)) {
      const key = part.trim();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      keys.push(key);
    }
  }

  return keys;
}

type ChatApiError = {
  status?: number;
  code?: string;
  message?: string;
  error?: { code?: string | number; message?: string };
};

const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);
export const TRANSIENT_RETRY_ATTEMPTS = 3;

export function isQuotaError(error: unknown): boolean {
  const err = asChatApiError(error);
  if (!err) {
    return false;
  }

  if (err.status === 429 || err.status === 402) {
    return true;
  }

  const code = String(err.error?.code ?? err.code ?? '');
  if (/RESOURCE_EXHAUSTED|rate_limit|insufficient_quota|payment_required/i.test(code)) {
    return true;
  }

  const message = `${err.error?.message ?? ''} ${err.message ?? ''}`;
  if (/payment required|visit your billing/i.test(message)) {
    return true;
  }
  return /quota|rate.?limit|resource.?exhausted|too many requests/i.test(message);
}

/** Overload / gateway errors that should be retried, then failed over — not sticky-skipped. */
export function isTransientError(error: unknown): boolean {
  const err = asChatApiError(error);
  if (!err) {
    return false;
  }

  if (err.status !== undefined && TRANSIENT_STATUSES.has(err.status)) {
    return true;
  }

  const code = String(err.error?.code ?? err.code ?? '');
  if (/UNAVAILABLE|DEADLINE_EXCEEDED|overloaded/i.test(code)) {
    return true;
  }

  const message = `${err.error?.message ?? ''} ${err.message ?? ''}`;
  if (
    /\b(500|502|503|504)\b/.test(message) &&
    /status code|unavailable|overloaded|no body/i.test(message)
  ) {
    return true;
  }
  return /service unavailable|temporarily unavailable|overloaded|try again later/i.test(message);
}

/** Model removed or gated — skip this provider's remaining keys, then fail over. */
export function isModelAccessError(error: unknown): boolean {
  const err = asChatApiError(error);
  if (!err) {
    return false;
  }

  const code = String(err.error?.code ?? err.code ?? '');
  if (/model_not_found/i.test(code)) {
    return true;
  }

  const message = `${err.error?.message ?? ''} ${err.message ?? ''}`;
  return /does not exist or you do not have access|model_not_found/i.test(message);
}

function fallbackReason(error: unknown): 'quota' | 'transient' | 'model' | undefined {
  if (isQuotaError(error)) {
    return 'quota';
  }
  if (isModelAccessError(error)) {
    return 'model';
  }
  if (isTransientError(error)) {
    return 'transient';
  }
  return undefined;
}

export function transientRetryDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 8_000);
}

export async function withTransientRetries<T>(
  call: () => Promise<T>,
  options?: {
    attempts?: number;
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  },
): Promise<T> {
  const attempts = options?.attempts ?? TRANSIENT_RETRY_ATTEMPTS;
  const sleep = options?.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      if (isTransientError(error) && attempt < attempts) {
        const delayMs = transientRetryDelayMs(attempt);
        options?.onRetry?.(attempt, delayMs, error);
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

export function resolveChatBackends(env: Env = process.env): ChatBackendConfig[] {
  const pinned = env.LLM_PROVIDER?.toLowerCase();
  if (pinned && PINNED_PROVIDERS.has(pinned)) {
    const backends = buildBackends(pinned as ChatProvider, env);
    if (backends.length === 0) {
      const spec = PROVIDER_SPECS[pinned as ChatProvider];
      throw new Error(`${spec.envKey} environment variable is required when LLM_PROVIDER=${pinned}`);
    }
    return backends;
  }

  const chain = FALLBACK_ORDER.flatMap((name) => buildBackends(name, env));
  if (chain.length > 0) {
    const openaiBackends = buildBackends('openai', env);
    return openaiBackends.length > 0 ? [...chain, ...openaiBackends] : chain;
  }

  const openai = buildBackends('openai', env);
  if (openai.length > 0) {
    return openai;
  }

  throw new Error(
    'No LLM API key configured. Set GEMINI_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, or OPENAI_API_KEY',
  );
}

export async function callWithQuotaFallback<
  TBackend extends { id: string; name: ChatProvider },
  TResult,
>(
  backends: TBackend[],
  call: (backend: TBackend) => Promise<TResult>,
  options?: {
    onFallback?: (from: string, to: string, reason: 'quota' | 'transient' | 'model') => void;
    /** Backend ids already known to be over quota — skipped for this and future calls. */
    skipped?: Set<string>;
  },
): Promise<TResult> {
  if (backends.length === 0) {
    throw new Error('No LLM backends available');
  }

  const skipped = options?.skipped;
  const active = skipped ? backends.filter((b) => !skipped.has(b.id)) : backends;
  const chain = active.length > 0 ? active : backends;

  let lastError: unknown;
  for (let i = 0; i < chain.length; i++) {
    const backend = chain[i];
    try {
      return await call(backend);
    } catch (error) {
      lastError = error;
      const reason = fallbackReason(error);
      if (!reason) {
        throw toError(error);
      }

      if (reason === 'quota') {
        skipped?.add(backend.id);
      } else if (reason === 'model') {
        for (const b of backends) {
          if (b.name === backend.name) {
            skipped?.add(b.id);
          }
        }
      }

      const nextIndex = chain.findIndex((candidate, index) => {
        if (index <= i) {
          return false;
        }
        if (skipped?.has(candidate.id)) {
          return false;
        }
        if (reason === 'model' && candidate.name === backend.name) {
          return false;
        }
        return true;
      });
      if (nextIndex === -1) {
        throw toError(error);
      }

      options?.onFallback?.(backend.id, chain[nextIndex].id, reason);
      i = nextIndex - 1;
    }
  }

  throw toError(lastError);
}

function buildBackends(name: ChatProvider, env: Env): ChatBackendConfig[] {
  const spec = PROVIDER_SPECS[name];
  const plural = spec.envKeysPlural ? env[spec.envKeysPlural] : undefined;
  const keys = parseApiKeys(env[spec.envKey], plural);
  const model = env[spec.modelEnv]?.trim() || spec.defaultModel;

  return keys.map((apiKey, index) => ({
    id: `${name}#${index + 1}`,
    name,
    keyIndex: index + 1,
    apiKey,
    baseURL: spec.baseURL,
    model,
    defaultMaxTokens: spec.defaultMaxTokens,
  }));
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(extractMessage(error));
}

function asChatApiError(error: unknown): ChatApiError | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  return error as ChatApiError;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractMessage(error: unknown): string {
  const err = asChatApiError(error);
  if (err) {
    return err.error?.message ?? err.message ?? String(error);
  }
  return String(error);
}

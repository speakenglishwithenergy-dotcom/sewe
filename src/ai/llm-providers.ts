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
    defaultModel: 'qwen/qwen3.6-27b',
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

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as {
    status?: number;
    code?: string;
    message?: string;
    error?: { code?: string | number; message?: string };
  };

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
    onFallback?: (from: string, to: string) => void;
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
    const next = chain[i + 1];
    try {
      return await call(backend);
    } catch (error) {
      lastError = error;
      if (isQuotaError(error)) {
        skipped?.add(backend.id);
        if (next) {
          options?.onFallback?.(backend.id, next.id);
          continue;
        }
      }
      throw toError(error);
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

function extractMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as { message?: string; error?: { message?: string } };
    return err.error?.message ?? err.message ?? String(error);
  }
  return String(error);
}

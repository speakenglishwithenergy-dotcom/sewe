export type ChatProvider = 'gemini' | 'groq' | 'cerebras' | 'openai';

export const FALLBACK_ORDER = ['gemini', 'groq', 'cerebras'] as const;

export interface ChatBackendConfig {
  name: ChatProvider;
  apiKey: string;
  baseURL?: string;
  model: string;
  defaultMaxTokens: number;
}

type ProviderSpec = {
  envKey: string;
  modelEnv: string;
  defaultModel: string;
  baseURL?: string;
  defaultMaxTokens: number;
};

const PROVIDER_SPECS: Record<ChatProvider, ProviderSpec> = {
  gemini: {
    envKey: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-3.6-flash',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultMaxTokens: 8_192,
  },
  groq: {
    envKey: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'qwen/qwen3.6-27b',
    baseURL: 'https://api.groq.com/openai/v1',
    defaultMaxTokens: 4_096,
  },
  cerebras: {
    envKey: 'CEREBRAS_API_KEY',
    modelEnv: 'CEREBRAS_MODEL',
    defaultModel: 'llama-3.3-70b',
    baseURL: 'https://api.cerebras.ai/v1',
    defaultMaxTokens: 8_192,
  },
  openai: {
    envKey: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o',
    defaultMaxTokens: 16_384,
  },
};

const PINNED_PROVIDERS = new Set<string>(['gemini', 'groq', 'cerebras', 'openai']);

type Env = Record<string, string | undefined>;

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

  if (err.status === 429) {
    return true;
  }

  const code = String(err.error?.code ?? err.code ?? '');
  if (/RESOURCE_EXHAUSTED|rate_limit|insufficient_quota/i.test(code)) {
    return true;
  }

  const message = `${err.error?.message ?? ''} ${err.message ?? ''}`;
  return /quota|rate.?limit|resource.?exhausted|too many requests/i.test(message);
}

export function resolveChatBackends(env: Env = process.env): ChatBackendConfig[] {
  const pinned = env.LLM_PROVIDER?.toLowerCase();
  if (pinned && PINNED_PROVIDERS.has(pinned)) {
    const backend = buildBackend(pinned as ChatProvider, env);
    if (!backend) {
      const spec = PROVIDER_SPECS[pinned as ChatProvider];
      throw new Error(`${spec.envKey} environment variable is required when LLM_PROVIDER=${pinned}`);
    }
    return [backend];
  }

  const chain = FALLBACK_ORDER.map((name) => buildBackend(name, env)).filter(
    (backend): backend is ChatBackendConfig => backend !== null,
  );
  if (chain.length > 0) {
    return chain;
  }

  const openai = buildBackend('openai', env);
  if (openai) {
    return [openai];
  }

  throw new Error(
    'No LLM API key configured. Set GEMINI_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, or OPENAI_API_KEY',
  );
}

export async function callWithQuotaFallback<TBackend extends { name: ChatProvider }, TResult>(
  backends: TBackend[],
  call: (backend: TBackend) => Promise<TResult>,
  onFallback?: (from: ChatProvider, to: ChatProvider) => void,
): Promise<TResult> {
  if (backends.length === 0) {
    throw new Error('No LLM backends available');
  }

  let lastError: unknown;
  for (let i = 0; i < backends.length; i++) {
    const backend = backends[i];
    const next = backends[i + 1];
    try {
      return await call(backend);
    } catch (error) {
      lastError = error;
      if (next && isQuotaError(error)) {
        onFallback?.(backend.name, next.name);
        continue;
      }
      throw toError(error);
    }
  }

  throw toError(lastError);
}

function buildBackend(name: ChatProvider, env: Env): ChatBackendConfig | null {
  const spec = PROVIDER_SPECS[name];
  const apiKey = env[spec.envKey]?.trim();
  if (!apiKey) {
    return null;
  }

  return {
    name,
    apiKey,
    baseURL: spec.baseURL,
    model: env[spec.modelEnv]?.trim() || spec.defaultModel,
    defaultMaxTokens: spec.defaultMaxTokens,
  };
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

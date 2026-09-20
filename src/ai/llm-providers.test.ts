import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  callWithQuotaFallback,
  isModelAccessError,
  isQuotaError,
  isTransientError,
  parseApiKeys,
  resolveChatBackends,
  withTransientRetries,
} from './llm-providers';

describe('isQuotaError', () => {
  it('treats HTTP 429 as quota', () => {
    assert.equal(isQuotaError({ status: 429, message: 'Too Many Requests' }), true);
  });

  it('treats Gemini RESOURCE_EXHAUSTED as quota', () => {
    assert.equal(
      isQuotaError({
        status: 429,
        error: { code: 'RESOURCE_EXHAUSTED', message: 'Resource exhausted' },
      }),
      true,
    );
  });

  it('treats Groq rate_limit_exceeded as quota', () => {
    assert.equal(
      isQuotaError({
        status: 429,
        error: { code: 'rate_limit_exceeded', message: 'Rate limit reached for model' },
      }),
      true,
    );
  });

  it('treats Cerebras payment_required (402) as quota', () => {
    assert.equal(
      isQuotaError({
        status: 402,
        error: { code: 'payment_required', message: 'Payment required to access this resource.' },
      }),
      true,
    );
  });

  it('does not treat Groq JSON validation failure as quota', () => {
    assert.equal(
      isQuotaError({
        status: 400,
        error: { code: 'json_validate_failed', message: 'Failed to validate JSON' },
      }),
      false,
    );
  });

  it('does not treat auth errors as quota', () => {
    assert.equal(isQuotaError({ status: 401, message: 'Incorrect API key' }), false);
  });

  it('does not treat Gemini 503 as quota', () => {
    assert.equal(isQuotaError({ status: 503, message: '503 status code (no body)' }), false);
  });
});

describe('isTransientError', () => {
  it('treats HTTP 503 as transient', () => {
    assert.equal(isTransientError({ status: 503, message: '503 status code (no body)' }), true);
  });

  it('treats HTTP 500 / 502 / 504 as transient', () => {
    assert.equal(isTransientError({ status: 500, message: 'internal' }), true);
    assert.equal(isTransientError({ status: 502, message: 'bad gateway' }), true);
    assert.equal(isTransientError({ status: 504, message: 'timeout' }), true);
  });

  it('treats wrapped gemini 503 messages as transient', () => {
    assert.equal(
      isTransientError(new Error('gemini 503 503 status code (no body)')),
      true,
    );
  });

  it('does not treat 400 JSON validation as transient', () => {
    assert.equal(
      isTransientError({ status: 400, error: { code: 'json_validate_failed' } }),
      false,
    );
  });

  it('does not treat quota 429 as transient', () => {
    assert.equal(isTransientError({ status: 429, message: 'Too Many Requests' }), false);
  });
});

describe('isModelAccessError', () => {
  it('treats Groq model_not_found as a model access error', () => {
    assert.equal(
      isModelAccessError({
        status: 404,
        error: {
          message: 'The model `qwen/qwen3.6-27b` does not exist or you do not have access to it.',
          code: 'model_not_found',
        },
      }),
      true,
    );
  });

  it('treats wrapped groq 404 messages as a model access error', () => {
    assert.equal(
      isModelAccessError(
        new Error(
          'groq 404 The model `qwen/qwen3.6-27b` does not exist or you do not have access to it.',
        ),
      ),
      true,
    );
  });

  it('does not treat a generic 404 page as a model access error', () => {
    assert.equal(isModelAccessError({ status: 404, message: 'Not Found' }), false);
  });
});

describe('withTransientRetries', () => {
  it('retries a 503 then returns the success', async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await withTransientRetries(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw { status: 503, message: '503 status code (no body)' };
        }
        return 'ok';
      },
      {
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );

    assert.equal(result, 'ok');
    assert.equal(calls, 2);
    assert.deepEqual(delays, [1000]);
  });

  it('throws after exhausting 503 retries', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withTransientRetries(
          async () => {
            calls += 1;
            throw { status: 503, message: '503 status code (no body)' };
          },
          { sleep: async () => undefined },
        ),
      (error: unknown) => {
        assert.equal((error as { status?: number }).status, 503);
        return true;
      },
    );
    assert.equal(calls, 3);
  });

  it('does not retry a 400', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withTransientRetries(async () => {
          calls += 1;
          throw { status: 400, message: 'Failed to validate JSON' };
        }),
      (error: unknown) => {
        assert.equal((error as { status?: number }).status, 400);
        assert.equal((error as { message?: string }).message, 'Failed to validate JSON');
        return true;
      },
    );
    assert.equal(calls, 1);
  });
});

describe('parseApiKeys', () => {
  it('splits comma / semicolon / newline lists and dedupes', () => {
    assert.deepEqual(parseApiKeys('a, b;c\nd', 'b,e'), ['a', 'b', 'c', 'd', 'e']);
  });

  it('ignores empty values', () => {
    assert.deepEqual(parseApiKeys('  , ,x,, ', undefined, ''), ['x']);
  });
});

describe('resolveChatBackends', () => {
  const allKeys = {
    GEMINI_API_KEY: 'gem-key',
    GROQ_API_KEY: 'groq-key',
    CEREBRAS_API_KEY: 'cerebras-key',
    OPENAI_API_KEY: 'openai-key',
  };

  it('uses Gemini → Groq → Cerebras → OpenAI when keys exist and LLM_PROVIDER is unset', () => {
    const backends = resolveChatBackends(allKeys);
    assert.deepEqual(
      backends.map((b) => b.id),
      ['gemini#1', 'groq#1', 'cerebras#1', 'openai#1'],
    );
    assert.equal(backends[0].baseURL, 'https://generativelanguage.googleapis.com/v1beta/openai/');
    assert.equal(backends[1].baseURL, 'https://api.groq.com/openai/v1');
    assert.equal(backends[2].baseURL, 'https://api.cerebras.ai/v1');
  });

  it('expands multiple keys per provider before falling to the next provider', () => {
    const backends = resolveChatBackends({
      GEMINI_API_KEY: 'gem-a,gem-b',
      GROQ_API_KEY: 'groq-a;groq-b',
      CEREBRAS_API_KEY: 'cerebras-a',
    });
    assert.deepEqual(
      backends.map((b) => ({ id: b.id, apiKey: b.apiKey })),
      [
        { id: 'gemini#1', apiKey: 'gem-a' },
        { id: 'gemini#2', apiKey: 'gem-b' },
        { id: 'groq#1', apiKey: 'groq-a' },
        { id: 'groq#2', apiKey: 'groq-b' },
        { id: 'cerebras#1', apiKey: 'cerebras-a' },
      ],
    );
  });

  it('merges GEMINI_API_KEYS / GROQ_API_KEYS with the singular env vars', () => {
    const backends = resolveChatBackends({
      GEMINI_API_KEY: 'gem-a',
      GEMINI_API_KEYS: 'gem-b,gem-a',
      GROQ_API_KEYS: 'groq-a',
    });
    assert.deepEqual(
      backends.map((b) => b.apiKey),
      ['gem-a', 'gem-b', 'groq-a'],
    );
  });

  it('skips providers whose API key is missing', () => {
    const backends = resolveChatBackends({ GROQ_API_KEY: 'groq-key' });
    assert.deepEqual(
      backends.map((b) => b.id),
      ['groq#1'],
    );
  });

  it('pins to all keys of a single provider when LLM_PROVIDER is set', () => {
    const backends = resolveChatBackends({
      ...allKeys,
      LLM_PROVIDER: 'groq',
      GROQ_API_KEY: 'g1,g2',
    });
    assert.deepEqual(
      backends.map((b) => b.id),
      ['groq#1', 'groq#2'],
    );
  });

  it('throws when LLM_PROVIDER is pinned but that key is missing', () => {
    assert.throws(
      () => resolveChatBackends({ LLM_PROVIDER: 'gemini', GROQ_API_KEY: 'groq-key' }),
      /GEMINI_API_KEY/,
    );
  });

  it('falls back to OpenAI when no Gemini/Groq/Cerebras key is set', () => {
    const backends = resolveChatBackends({ OPENAI_API_KEY: 'openai-key' });
    assert.deepEqual(
      backends.map((b) => b.id),
      ['openai#1'],
    );
    assert.equal(backends[0].baseURL, undefined);
  });

  it('uses default models when model env vars are unset', () => {
    const backends = resolveChatBackends(allKeys);
    assert.equal(backends[0].model, 'gemini-3.6-flash');
    assert.equal(backends[1].model, 'qwen/qwen3.8-27b');
    assert.equal(backends[2].model, 'gpt-oss-120b');
  });
});

describe('callWithQuotaFallback', () => {
  it('returns the first provider result when it succeeds', async () => {
    const calls: string[] = [];
    const result = await callWithQuotaFallback(
      [
        { id: 'gemini#1', name: 'gemini' },
        { id: 'groq#1', name: 'groq' },
      ],
      async (backend) => {
        calls.push(backend.id);
        return `${backend.id}-ok`;
      },
    );

    assert.equal(result, 'gemini#1-ok');
    assert.deepEqual(calls, ['gemini#1']);
  });

  it('falls back to the next Gemini key before switching to Groq', async () => {
    const calls: string[] = [];
    const result = await callWithQuotaFallback(
      [
        { id: 'gemini#1', name: 'gemini' },
        { id: 'gemini#2', name: 'gemini' },
        { id: 'groq#1', name: 'groq' },
      ],
      async (backend) => {
        calls.push(backend.id);
        if (backend.id === 'gemini#1') {
          throw { status: 429, message: 'RESOURCE_EXHAUSTED' };
        }
        return `${backend.id}-ok`;
      },
    );

    assert.equal(result, 'gemini#2-ok');
    assert.deepEqual(calls, ['gemini#1', 'gemini#2']);
  });

  it('falls back to Groq when Gemini hits quota', async () => {
    const calls: string[] = [];
    const result = await callWithQuotaFallback(
      [
        { id: 'gemini#1', name: 'gemini' },
        { id: 'groq#1', name: 'groq' },
        { id: 'cerebras#1', name: 'cerebras' },
      ],
      async (backend) => {
        calls.push(backend.id);
        if (backend.name === 'gemini') {
          throw { status: 429, message: 'RESOURCE_EXHAUSTED' };
        }
        return `${backend.id}-ok`;
      },
    );

    assert.equal(result, 'groq#1-ok');
    assert.deepEqual(calls, ['gemini#1', 'groq#1']);
  });

  it('falls back to Cerebras when Gemini and Groq both hit quota', async () => {
    const calls: string[] = [];
    const result = await callWithQuotaFallback(
      [
        { id: 'gemini#1', name: 'gemini' },
        { id: 'groq#1', name: 'groq' },
        { id: 'cerebras#1', name: 'cerebras' },
      ],
      async (backend) => {
        calls.push(backend.id);
        if (backend.name !== 'cerebras') {
          throw { status: 429, message: 'rate_limit_exceeded' };
        }
        return 'cerebras-ok';
      },
    );

    assert.equal(result, 'cerebras-ok');
    assert.deepEqual(calls, ['gemini#1', 'groq#1', 'cerebras#1']);
  });

  it('does not fall back on non-quota errors', async () => {
    const calls: string[] = [];
    await assert.rejects(
      () =>
        callWithQuotaFallback(
          [
            { id: 'gemini#1', name: 'gemini' },
            { id: 'groq#1', name: 'groq' },
          ],
          async (backend) => {
            calls.push(backend.id);
            throw { status: 400, message: 'Failed to validate JSON' };
          },
        ),
      /Failed to validate JSON/,
    );
    assert.deepEqual(calls, ['gemini#1']);
  });

  it('throws the last error when every provider is over quota', async () => {
    await assert.rejects(
      () =>
        callWithQuotaFallback(
          [
            { id: 'gemini#1', name: 'gemini' },
            { id: 'groq#1', name: 'groq' },
            { id: 'cerebras#1', name: 'cerebras' },
          ],
          async () => {
            throw { status: 429, message: 'quota exceeded' };
          },
        ),
      /quota exceeded/,
    );
  });

  it('skips remaining Groq keys and falls back to Cerebras on model 404', async () => {
    const backends = [
      { id: 'groq#1', name: 'groq' as const },
      { id: 'groq#2', name: 'groq' as const },
      { id: 'cerebras#1', name: 'cerebras' as const },
    ];
    const skipped = new Set<string>();
    const calls: string[] = [];
    const reasons: string[] = [];

    const result = await callWithQuotaFallback(
      backends,
      async (backend) => {
        calls.push(backend.id);
        if (backend.name === 'groq') {
          throw {
            status: 404,
            error: {
              code: 'model_not_found',
              message: 'The model `qwen/qwen3.6-27b` does not exist or you do not have access to it.',
            },
          };
        }
        return 'cerebras-ok';
      },
      {
        skipped,
        onFallback: (_from, _to, reason) => reasons.push(reason),
      },
    );

    assert.equal(result, 'cerebras-ok');
    assert.deepEqual(calls, ['groq#1', 'cerebras#1']);
    assert.deepEqual([...skipped], ['groq#1', 'groq#2']);
    assert.deepEqual(reasons, ['model']);
  });

  it('falls back to Groq on Gemini 503 without skipping Gemini for later calls', async () => {
    const backends = [
      { id: 'gemini#1', name: 'gemini' as const },
      { id: 'groq#1', name: 'groq' as const },
    ];
    const skipped = new Set<string>();
    const calls: string[] = [];
    const reasons: string[] = [];
    let geminiCalls = 0;

    const call = async (backend: { id: string }) => {
      calls.push(backend.id);
      if (backend.id === 'gemini#1') {
        geminiCalls += 1;
        if (geminiCalls === 1) {
          throw { status: 503, message: '503 status code (no body)' };
        }
        return 'gemini-ok';
      }
      return 'groq-ok';
    };

    assert.equal(
      await callWithQuotaFallback(backends, call, {
        skipped,
        onFallback: (_from, _to, reason) => reasons.push(reason),
      }),
      'groq-ok',
    );
    assert.equal(await callWithQuotaFallback(backends, call, { skipped }), 'gemini-ok');
    assert.deepEqual(calls, ['gemini#1', 'groq#1', 'gemini#1']);
    assert.deepEqual([...skipped], []);
    assert.deepEqual(reasons, ['transient']);
  });

  it('remembers quota skips so the next call starts at the next key, not the exhausted one', async () => {
    const backends = [
      { id: 'gemini#1', name: 'gemini' as const },
      { id: 'gemini#2', name: 'gemini' as const },
      { id: 'groq#1', name: 'groq' as const },
    ];
    const skipped = new Set<string>();
    const calls: string[] = [];

    const call = async (backend: { id: string }) => {
      calls.push(backend.id);
      if (backend.id === 'gemini#1') {
        throw { status: 429, message: 'RESOURCE_EXHAUSTED' };
      }
      return `${backend.id}-ok`;
    };

    assert.equal(await callWithQuotaFallback(backends, call, { skipped }), 'gemini#2-ok');
    assert.equal(await callWithQuotaFallback(backends, call, { skipped }), 'gemini#2-ok');
    assert.deepEqual(calls, ['gemini#1', 'gemini#2', 'gemini#2']);
    assert.deepEqual([...skipped], ['gemini#1']);
  });
});

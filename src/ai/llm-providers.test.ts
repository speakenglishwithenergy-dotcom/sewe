import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  callWithQuotaFallback,
  isQuotaError,
  parseApiKeys,
  resolveChatBackends,
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
    assert.equal(backends[1].model, 'qwen/qwen3.6-27b');
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

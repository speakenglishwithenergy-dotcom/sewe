import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  callWithQuotaFallback,
  isQuotaError,
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

describe('resolveChatBackends', () => {
  const allKeys = {
    GEMINI_API_KEY: 'gem-key',
    GROQ_API_KEY: 'groq-key',
    CEREBRAS_API_KEY: 'cerebras-key',
    OPENAI_API_KEY: 'openai-key',
  };

  it('uses Gemini → Groq → Cerebras when keys exist and LLM_PROVIDER is unset', () => {
    const backends = resolveChatBackends(allKeys);
    assert.deepEqual(
      backends.map((b) => b.name),
      ['gemini', 'groq', 'cerebras'],
    );
    assert.equal(backends[0].baseURL, 'https://generativelanguage.googleapis.com/v1beta/openai/');
    assert.equal(backends[1].baseURL, 'https://api.groq.com/openai/v1');
    assert.equal(backends[2].baseURL, 'https://api.cerebras.ai/v1');
  });

  it('skips providers whose API key is missing', () => {
    const backends = resolveChatBackends({ GROQ_API_KEY: 'groq-key' });
    assert.deepEqual(
      backends.map((b) => b.name),
      ['groq'],
    );
  });

  it('pins to a single provider when LLM_PROVIDER is set', () => {
    const backends = resolveChatBackends({ ...allKeys, LLM_PROVIDER: 'groq' });
    assert.deepEqual(
      backends.map((b) => b.name),
      ['groq'],
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
      backends.map((b) => b.name),
      ['openai'],
    );
    assert.equal(backends[0].baseURL, undefined);
  });

  it('uses default models when model env vars are unset', () => {
    const backends = resolveChatBackends(allKeys);
    assert.equal(backends[0].model, 'gemini-3.6-flash');
    assert.equal(backends[1].model, 'qwen/qwen3.6-27b');
    assert.equal(backends[2].model, 'llama-3.3-70b');
  });
});

describe('callWithQuotaFallback', () => {
  it('returns the first provider result when it succeeds', async () => {
    const calls: string[] = [];
    const result = await callWithQuotaFallback(
      [{ name: 'gemini' }, { name: 'groq' }],
      async (backend) => {
        calls.push(backend.name);
        return `${backend.name}-ok`;
      },
    );

    assert.equal(result, 'gemini-ok');
    assert.deepEqual(calls, ['gemini']);
  });

  it('falls back to Groq when Gemini hits quota', async () => {
    const calls: string[] = [];
    const result = await callWithQuotaFallback(
      [{ name: 'gemini' }, { name: 'groq' }, { name: 'cerebras' }],
      async (backend) => {
        calls.push(backend.name);
        if (backend.name === 'gemini') {
          throw { status: 429, message: 'RESOURCE_EXHAUSTED' };
        }
        return `${backend.name}-ok`;
      },
    );

    assert.equal(result, 'groq-ok');
    assert.deepEqual(calls, ['gemini', 'groq']);
  });

  it('falls back to Cerebras when Gemini and Groq both hit quota', async () => {
    const calls: string[] = [];
    const result = await callWithQuotaFallback(
      [{ name: 'gemini' }, { name: 'groq' }, { name: 'cerebras' }],
      async (backend) => {
        calls.push(backend.name);
        if (backend.name !== 'cerebras') {
          throw { status: 429, message: 'rate_limit_exceeded' };
        }
        return 'cerebras-ok';
      },
    );

    assert.equal(result, 'cerebras-ok');
    assert.deepEqual(calls, ['gemini', 'groq', 'cerebras']);
  });

  it('does not fall back on non-quota errors', async () => {
    const calls: string[] = [];
    await assert.rejects(
      () =>
        callWithQuotaFallback([{ name: 'gemini' }, { name: 'groq' }], async (backend) => {
          calls.push(backend.name);
          throw { status: 400, message: 'Failed to validate JSON' };
        }),
      /Failed to validate JSON/,
    );
    assert.deepEqual(calls, ['gemini']);
  });

  it('throws the last error when every provider is over quota', async () => {
    await assert.rejects(
      () =>
        callWithQuotaFallback(
          [{ name: 'gemini' }, { name: 'groq' }, { name: 'cerebras' }],
          async () => {
            throw { status: 429, message: 'quota exceeded' };
          },
        ),
      /quota exceeded/,
    );
  });
});

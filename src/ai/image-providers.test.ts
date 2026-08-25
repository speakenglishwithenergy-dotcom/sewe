import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveImageProvider } from './image-providers';

describe('resolveImageProvider', () => {
  it('defaults to Gemini when GEMINI_API_KEY is set and IMAGE_PROVIDER is unset', () => {
    const config = resolveImageProvider({
      GEMINI_API_KEY: 'gem-key',
      OPENAI_API_KEY: 'openai-key',
    });
    assert.equal(config.provider, 'gemini');
    assert.equal(config.apiKey, 'gem-key');
    assert.equal(config.model, 'gemini-2.5-flash-image');
  });

  it('defaults to OpenAI when only OPENAI_API_KEY is set', () => {
    const config = resolveImageProvider({ OPENAI_API_KEY: 'openai-key' });
    assert.equal(config.provider, 'openai');
    assert.equal(config.apiKey, 'openai-key');
    assert.equal(config.model, 'gpt-image-1');
  });

  it('pins to OpenAI when IMAGE_PROVIDER=openai even if Gemini key exists', () => {
    const config = resolveImageProvider({
      IMAGE_PROVIDER: 'openai',
      GEMINI_API_KEY: 'gem-key',
      OPENAI_API_KEY: 'openai-key',
    });
    assert.equal(config.provider, 'openai');
    assert.equal(config.apiKey, 'openai-key');
  });

  it('pins to Gemini when IMAGE_PROVIDER=gemini', () => {
    const config = resolveImageProvider({
      IMAGE_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'gem-a,gem-b',
      OPENAI_API_KEY: 'openai-key',
    });
    assert.equal(config.provider, 'gemini');
    assert.equal(config.apiKey, 'gem-a');
  });

  it('throws when IMAGE_PROVIDER=gemini but Gemini key is missing', () => {
    assert.throws(
      () => resolveImageProvider({ IMAGE_PROVIDER: 'gemini', OPENAI_API_KEY: 'openai-key' }),
      /GEMINI_API_KEY/,
    );
  });

  it('throws when IMAGE_PROVIDER=openai but OpenAI key is missing', () => {
    assert.throws(
      () => resolveImageProvider({ IMAGE_PROVIDER: 'openai', GEMINI_API_KEY: 'gem-key' }),
      /OPENAI_API_KEY/,
    );
  });

  it('pins to Cloudflare when IMAGE_PROVIDER=cloudflare', () => {
    const config = resolveImageProvider({
      IMAGE_PROVIDER: 'cloudflare',
      CLOUDFLARE_ACCOUNT_ID: 'acct',
      CLOUDFLARE_API_TOKEN: 'cf-token',
      CLOUDFLARE_IMAGE_MODEL: '@cf/black-forest-labs/flux-2-dev',
    });
    assert.equal(config.provider, 'cloudflare');
    assert.equal(config.apiKey, 'cf-token');
    assert.equal(config.accountId, 'acct');
    assert.equal(config.model, '@cf/black-forest-labs/flux-2-dev');
  });

  it('throws when IMAGE_PROVIDER=cloudflare but credentials are missing', () => {
    assert.throws(
      () => resolveImageProvider({ IMAGE_PROVIDER: 'cloudflare', GEMINI_API_KEY: 'gem-key' }),
      /CLOUDFLARE_ACCOUNT_ID/,
    );
  });

  it('throws on invalid IMAGE_PROVIDER', () => {
    assert.throws(
      () => resolveImageProvider({ IMAGE_PROVIDER: 'groq', GEMINI_API_KEY: 'gem-key' }),
      /IMAGE_PROVIDER must be/,
    );
  });

  it('uses GEMINI_IMAGE_MODEL / OPENAI_IMAGE_MODEL overrides', () => {
    assert.equal(
      resolveImageProvider({
        GEMINI_API_KEY: 'gem-key',
        GEMINI_IMAGE_MODEL: 'gemini-3.1-flash-image',
      }).model,
      'gemini-3.1-flash-image',
    );
    assert.equal(
      resolveImageProvider({
        IMAGE_PROVIDER: 'openai',
        OPENAI_API_KEY: 'openai-key',
        OPENAI_IMAGE_MODEL: 'gpt-image-1-mini',
      }).model,
      'gpt-image-1-mini',
    );
  });

  it('throws when no image keys are configured', () => {
    assert.throws(() => resolveImageProvider({}), /No image API key/);
  });
});

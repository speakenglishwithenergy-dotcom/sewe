import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCloudflareAccounts, resolveImageProvider } from './image-providers';

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

  it('uses the first Cloudflare account when multiple are configured', () => {
    const config = resolveImageProvider({
      IMAGE_PROVIDER: 'cloudflare',
      CLOUDFLARE_ACCOUNT_ID: 'acct-a,acct-b',
      CLOUDFLARE_API_TOKEN: 'tok-a,tok-b',
    });
    assert.equal(config.accountId, 'acct-a');
    assert.equal(config.apiKey, 'tok-a');
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

describe('resolveCloudflareAccounts', () => {
  it('pairs account IDs with tokens by index', () => {
    const accounts = resolveCloudflareAccounts({
      CLOUDFLARE_ACCOUNT_ID: 'acct-a, acct-b',
      CLOUDFLARE_API_TOKEN: 'tok-a;tok-b',
    });
    assert.deepEqual(accounts, [
      { id: 'cloudflare#1', accountId: 'acct-a', apiKey: 'tok-a' },
      { id: 'cloudflare#2', accountId: 'acct-b', apiKey: 'tok-b' },
    ]);
  });

  it('merges plural env vars with singular', () => {
    const accounts = resolveCloudflareAccounts({
      CLOUDFLARE_ACCOUNT_ID: 'acct-a',
      CLOUDFLARE_ACCOUNT_IDS: 'acct-b',
      CLOUDFLARE_API_TOKEN: 'tok-a',
      CLOUDFLARE_API_TOKENS: 'tok-b',
    });
    assert.equal(accounts.length, 2);
    assert.equal(accounts[0]?.accountId, 'acct-a');
    assert.equal(accounts[1]?.accountId, 'acct-b');
  });

  it('pairs only up to the shorter list length', () => {
    const accounts = resolveCloudflareAccounts({
      CLOUDFLARE_ACCOUNT_ID: 'acct-a,acct-b,acct-c',
      CLOUDFLARE_API_TOKEN: 'tok-a,tok-b',
    });
    assert.equal(accounts.length, 2);
    assert.equal(accounts[1]?.accountId, 'acct-b');
  });

  it('keeps duplicate account IDs so token pairing stays aligned', () => {
    const accounts = resolveCloudflareAccounts({
      CLOUDFLARE_ACCOUNT_ID: 'same-acct,same-acct',
      CLOUDFLARE_API_TOKEN: 'tok-a,tok-b',
    });
    assert.equal(accounts.length, 2);
    assert.equal(accounts[0]?.accountId, 'same-acct');
    assert.equal(accounts[1]?.accountId, 'same-acct');
    assert.equal(accounts[0]?.apiKey, 'tok-a');
    assert.equal(accounts[1]?.apiKey, 'tok-b');
  });

  it('returns empty when credentials are missing', () => {
    assert.deepEqual(resolveCloudflareAccounts({}), []);
  });
});

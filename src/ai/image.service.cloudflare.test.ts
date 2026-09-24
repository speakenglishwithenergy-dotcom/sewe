import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ImageService } from './image.service';

describe('ImageService Cloudflare multi-account failover', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('falls back to the next Cloudflare account when daily neurons are exhausted', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/accounts/acct-a/')) {
        return new Response(
          JSON.stringify({
            success: false,
            errors: [
              {
                message:
                  'AiError: you have used up your daily free allocation of 10,000 neurons, please upgrade',
              },
            ],
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }
      // Second account succeeds with raw image bytes
      return new Response(Buffer.from('fake-png'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }) as typeof fetch;

    const service = new ImageService({
      IMAGE_PROVIDER: 'cloudflare',
      CLOUDFLARE_ACCOUNT_ID: 'acct-a,acct-b',
      CLOUDFLARE_API_TOKEN: 'tok-a,tok-b',
    });

    const buf = await service.generateImage('a cute podcast studio');
    assert.equal(buf.toString(), 'fake-png');
    assert.equal(calls.length, 2);
    assert.match(calls[0]!, /\/accounts\/acct-a\//);
    assert.match(calls[1]!, /\/accounts\/acct-b\//);

    // Sticky skip: next call should go straight to acct-b
    calls.length = 0;
    await service.generateImage('another prompt');
    assert.equal(calls.length, 1);
    assert.match(calls[0]!, /\/accounts\/acct-b\//);
  });

  it('does not fall back on non-quota Cloudflare errors', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ message: 'Authentication error' }],
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    const service = new ImageService({
      IMAGE_PROVIDER: 'cloudflare',
      CLOUDFLARE_ACCOUNT_ID: 'acct-a,acct-b',
      CLOUDFLARE_API_TOKEN: 'tok-a,tok-b',
    });

    await assert.rejects(
      () => service.generateImage('prompt'),
      /Authentication error/,
    );
  });
});

/**
 * One-time setup: obtain TikTok OAuth tokens for Content Posting API.
 *
 * Run: npm run tiktok:auth -- --channel=speak-english-with-energy
 */
import 'dotenv/config';
import crypto from 'crypto';
import http from 'http';
import { URL } from 'url';
import { ChannelService } from '../src/channel/channel.service';
import { resolveOAuthEnvNames } from '../src/social/publish.env';

const REDIRECT_URI = 'http://localhost:53683/callback';
const SCOPES = ['user.info.basic', 'video.publish'];

function parseChannelArg(): string {
  const arg = process.argv.find((a) => a.startsWith('--channel='));
  if (!arg) {
    console.error('Missing --channel=CHANNEL_ID (e.g. --channel=speak-english-with-energy)');
    process.exit(1);
  }
  const channelId = arg.replace('--channel=', '').trim();
  if (!channelId) {
    console.error('--channel value cannot be empty');
    process.exit(1);
  }
  return channelId;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name} in .env`);
    process.exit(1);
  }
  return value;
}

function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

async function main(): Promise<void> {
  const channelId = parseChannelArg();
  const channelService = new ChannelService();
  const channel = await channelService.loadChannel(channelId);
  const envNames = resolveOAuthEnvNames(channel.config.env.prefix, channel.config.id);

  const clientKey = requireEnv(envNames.tiktokClientKey);
  const clientSecret = requireEnv(envNames.tiktokClientSecret);
  const { codeVerifier, codeChallenge } = generatePkce();
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    scope: SCOPES.join(','),
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

  console.log(`\nChannel: ${channel.config.name} (${channel.config.id})`);
  console.log('\nOpen this URL in your browser and authorize your TikTok account:\n');
  console.log(authUrl);
  console.log('\nWaiting for callback on', REDIRECT_URI, '...\n');

  const code = await waitForAuthCode(state);
  const tokenBody = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody,
  });
  const tokens = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    open_id?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) {
    console.error(
      'Token exchange failed:',
      tokens.error_description ?? tokens.error ?? tokenResponse.statusText,
    );
    process.exit(1);
  }

  console.log('\n✅ Success! Add these to your .env:\n');
  console.log(`${envNames.tiktokAccessToken}=${tokens.access_token}`);
  console.log(`${envNames.tiktokRefreshToken}=${tokens.refresh_token}`);
  if (tokens.open_id) {
    console.log(`# ${envNames.tiktokAccessToken.replace('ACCESS_TOKEN', 'OPEN_ID')}=${tokens.open_id}`);
  }
  console.log('\nNote: access_token expires in ~24 hours; refresh_token lasts ~365 days.\n');
}

function waitForAuthCode(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT_URI);
      if (url.pathname !== '/callback') return;

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const state = url.searchParams.get('state');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`Authorization failed: ${error}`);
        server.close();
        reject(new Error(error));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('State mismatch — possible CSRF');
        server.close();
        reject(new Error('OAuth state mismatch'));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing authorization code');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Authorization successful!</h1><p>You can close this tab and return to the terminal.</p>');
      server.close();
      resolve(code);
    });

    server.listen(53683, '127.0.0.1', () => {
      // ready
    });

    server.on('error', reject);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

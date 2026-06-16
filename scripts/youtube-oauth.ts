/**
 * One-time setup: obtain a YouTube OAuth refresh token for a channel.
 *
 * 1. Create OAuth 2.0 credentials (Desktop app) in Google Cloud Console.
 * 2. Enable YouTube Data API v3 for the project.
 * 3. Add credentials to .env with channel prefix (e.g. SEWE_YOUTUBE_CLIENT_ID)
 * 4. Run: npm run youtube:auth -- --channel=speak-english-with-energy
 */
import 'dotenv/config';
import http from 'http';
import { URL } from 'url';
import { google } from 'googleapis';
import { ChannelService } from '../src/channel/channel.service';
import { resolveOAuthEnvNames } from '../src/social/publish.env';

const REDIRECT_URI = 'http://localhost:53682/oauth2callback';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

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

async function main(): Promise<void> {
  const channelId = parseChannelArg();
  const channelService = new ChannelService();
  const channel = await channelService.loadChannel(channelId);
  const envNames = resolveOAuthEnvNames(channel.config.env.prefix, channel.config.id);

  const clientId = requireEnv(envNames.youtubeClientId);
  const clientSecret = requireEnv(envNames.youtubeClientSecret);

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log(`\nChannel: ${channel.config.name} (${channel.config.id})`);
  console.log('\nOpen this URL in your browser and authorize the channel:\n');
  console.log(authUrl);
  console.log('\nWaiting for callback on', REDIRECT_URI, '...\n');

  const code = await waitForAuthCode();
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      'No refresh token returned. Revoke app access at https://myaccount.google.com/permissions and retry.',
    );
    process.exit(1);
  }

  console.log('\n✅ Success! Add this to your .env:\n');
  console.log(`${envNames.youtubeRefreshToken}=${tokens.refresh_token}\n`);
}

function waitForAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT_URI);
      if (url.pathname !== '/oauth2callback') return;

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`Authorization failed: ${error}`);
        server.close();
        reject(new Error(error));
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

    server.listen(53682, '127.0.0.1', () => {
      // ready
    });

    server.on('error', reject);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

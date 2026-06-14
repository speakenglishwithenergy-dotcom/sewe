/**
 * One-time setup: obtain a YouTube OAuth refresh token.
 *
 * 1. Create OAuth 2.0 credentials (Desktop app) in Google Cloud Console.
 * 2. Enable YouTube Data API v3 for the project.
 * 3. Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to .env
 * 4. Run: npm run youtube:auth
 * 5. Copy the printed refresh token into YOUTUBE_REFRESH_TOKEN in .env
 */
import 'dotenv/config';
import http from 'http';
import { URL } from 'url';
import { google } from 'googleapis';

const REDIRECT_URI = 'http://localhost:53682/oauth2callback';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name} in .env`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const clientId = requireEnv('YOUTUBE_CLIENT_ID');
  const clientSecret = requireEnv('YOUTUBE_CLIENT_SECRET');

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

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
  console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
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

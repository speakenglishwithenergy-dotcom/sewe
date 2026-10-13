"""One-time: get a TikTok refresh token for the GitHub Actions secrets.

Run on your own machine:

  TIKTOK_CLIENT_KEY=... TIKTOK_CLIENT_SECRET=... python3 scripts/auth/tiktok_auth.py

Prerequisites (do once at https://developers.tiktok.com):
  1. Create an app; add the "Content Posting API" product.
  2. Add the scopes: video.publish and video.upload.
  3. Register this exact redirect URI in the app settings:
        http://localhost:8724/
     (TikTok allows localhost for development.)
  4. Copy the Client key and Client secret.

It prints TIKTOK_REFRESH_TOKEN. Add these three as repository secrets:
  TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN

NOTE: until your app passes TikTok's audit it can only post privately
(TIKTOK_PRIVACY=SELF_ONLY). After the audit, set TIKTOK_PRIVACY to
PUBLIC_TO_EVERYONE in the workflow env.
"""
import http.server
import json
import os
import sys
import urllib.parse
import urllib.request
import webbrowser

AUTH = "https://www.tiktok.com/v2/auth/authorize/"
TOKEN = "https://open.tiktokapis.com/v2/oauth/token/"
PORT = 8724
REDIRECT = f"http://localhost:{PORT}/"
SCOPES = "video.publish,video.upload"


def main():
    key = os.environ.get("TIKTOK_CLIENT_KEY")
    secret = os.environ.get("TIKTOK_CLIENT_SECRET")
    if not key or not secret:
        sys.exit("Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET first.")

    params = urllib.parse.urlencode({
        "client_key": key,
        "response_type": "code",
        "scope": SCOPES,
        "redirect_uri": REDIRECT,
        "state": "kidlogic",
    })
    url = f"{AUTH}?{params}"
    print("Opening your browser to authorize. If it doesn't open, visit:\n" + url)
    webbrowser.open(url)

    box = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.urlparse(self.path).query
            box["code"] = urllib.parse.parse_qs(q).get("code", [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h2>Done. You can close this tab.</h2>")

        def log_message(self, *a):
            pass

    with http.server.HTTPServer(("localhost", PORT), Handler) as srv:
        srv.handle_request()

    code = box.get("code")
    if not code:
        sys.exit("No authorization code received.")

    data = urllib.parse.urlencode({
        "client_key": key,
        "client_secret": secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT,
    }).encode()
    req = urllib.request.Request(TOKEN, data=data,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req) as resp:
        tok = json.loads(resp.read())
    refresh = tok.get("refresh_token")
    if not refresh:
        sys.exit(f"No refresh_token in response: {tok}")
    print("\nTIKTOK_REFRESH_TOKEN=" + refresh)
    print("\nAdd TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REFRESH_TOKEN as repo secrets.")


if __name__ == "__main__":
    main()

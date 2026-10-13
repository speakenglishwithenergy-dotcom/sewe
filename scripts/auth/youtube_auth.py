"""One-time: get a YouTube refresh token for the GitHub Actions secrets.

Run this on your own machine (it opens a browser and starts a tiny local
server to catch the redirect):

  YT_CLIENT_ID=... YT_CLIENT_SECRET=... python3 scripts/auth/youtube_auth.py

Prerequisites (do once in Google Cloud Console):
  1. Create a project, enable "YouTube Data API v3".
  2. OAuth consent screen: External, add yourself as a Test user.
  3. Credentials -> Create OAuth client ID -> type "Desktop app".
     Copy the client ID and secret.

It prints YT_REFRESH_TOKEN. Add these three as repository secrets:
  YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN
"""
import http.server
import os
import sys
import urllib.parse
import urllib.request
import webbrowser

SCOPE = "https://www.googleapis.com/auth/youtube.upload"
AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN = "https://oauth2.googleapis.com/token"
PORT = 8723
REDIRECT = f"http://localhost:{PORT}/"


def main():
    cid = os.environ.get("YT_CLIENT_ID")
    secret = os.environ.get("YT_CLIENT_SECRET")
    if not cid or not secret:
        sys.exit("Set YT_CLIENT_ID and YT_CLIENT_SECRET in the environment first.")

    params = urllib.parse.urlencode({
        "client_id": cid,
        "redirect_uri": REDIRECT,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    })
    url = f"{AUTH}?{params}"
    print("Opening your browser to authorize. If it doesn't open, visit:\n" + url)
    webbrowser.open(url)

    code_box = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.urlparse(self.path).query
            code_box["code"] = urllib.parse.parse_qs(q).get("code", [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h2>Done. You can close this tab.</h2>")

        def log_message(self, *a):
            pass

    with http.server.HTTPServer(("localhost", PORT), Handler) as srv:
        srv.handle_request()

    code = code_box.get("code")
    if not code:
        sys.exit("No authorization code received.")

    data = urllib.parse.urlencode({
        "code": code,
        "client_id": cid,
        "client_secret": secret,
        "redirect_uri": REDIRECT,
        "grant_type": "authorization_code",
    }).encode()
    req = urllib.request.Request(TOKEN, data=data,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    import json
    with urllib.request.urlopen(req) as resp:
        tok = json.loads(resp.read())
    refresh = tok.get("refresh_token")
    if not refresh:
        sys.exit(f"No refresh_token in response: {tok}")
    print("\nYT_REFRESH_TOKEN=" + refresh)
    print("\nAdd YT_CLIENT_ID, YT_CLIENT_SECRET and YT_REFRESH_TOKEN as repo secrets.")


if __name__ == "__main__":
    main()

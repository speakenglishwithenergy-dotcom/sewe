"""One-time: turn a short-lived Facebook user token into a non-expiring Page token.

Prerequisites (do once at https://developers.facebook.com):
  1. Create an app (type: Business). Add the "Facebook Login" product.
  2. In Graph API Explorer, select your app and your Page, and generate a
     User token with these permissions:
        pages_show_list, pages_read_engagement, pages_manage_posts
     Copy that short-lived user token.
  3. App settings -> Basic: copy the App ID and App secret.

Run:
  FB_APP_ID=... FB_APP_SECRET=... FB_USER_TOKEN=<short-lived user token> \
  python3 scripts/auth/facebook_auth.py

It prints FB_PAGE_ID and FB_PAGE_TOKEN (the page token is non-expiring when
derived from a long-lived user token). Add both as repository secrets.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

VER = os.environ.get("FB_GRAPH_VERSION", "v20.0")
GRAPH = f"https://graph.facebook.com/{VER}"


def get(path, **params):
    url = f"{GRAPH}/{path}?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        try:
            msg = json.loads(body)["error"]["message"]
        except Exception:
            msg = body
        sys.exit(f"Facebook API error ({e.code}) on /{path}: {msg}")


def main():
    app_id = os.environ.get("FB_APP_ID")
    app_secret = os.environ.get("FB_APP_SECRET")
    user_token = os.environ.get("FB_USER_TOKEN")
    if not all((app_id, app_secret, user_token)):
        sys.exit("Set FB_APP_ID, FB_APP_SECRET and FB_USER_TOKEN first.")

    # 1) short-lived -> long-lived user token
    longlived = get("oauth/access_token",
                    grant_type="fb_exchange_token",
                    client_id=app_id,
                    client_secret=app_secret,
                    fb_exchange_token=user_token)
    user_long = longlived["access_token"]

    # 2) list the pages you manage; the page token is non-expiring
    accounts = get("me/accounts", access_token=user_long)
    pages = accounts.get("data", [])
    if not pages:
        sys.exit(f"No Pages found for this user. Response: {accounts}")

    print("Pages you manage:")
    for p in pages:
        print(f"  - {p['name']}  (id {p['id']})")
    chosen = pages[0]
    if len(pages) > 1:
        want = input("Enter the Page id to use: ").strip()
        chosen = next((p for p in pages if p["id"] == want), pages[0])

    print("\nFB_PAGE_ID=" + chosen["id"])
    print("FB_PAGE_TOKEN=" + chosen["access_token"])
    print("\nAdd FB_PAGE_ID and FB_PAGE_TOKEN as repo secrets.")


if __name__ == "__main__":
    main()

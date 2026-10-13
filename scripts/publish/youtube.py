"""Publish a rendered episode to YouTube as a public Short (Data API v3).

Needs three secrets (see scripts/auth/youtube_auth.py to obtain the refresh token):
  YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN
Optional:
  YT_PRIVACY   public | unlisted | private   (default: public)
"""
import os

from . import common

TOKEN_URL = "https://oauth2.googleapis.com/token"
UPLOAD_URL = ("https://www.googleapis.com/upload/youtube/v3/videos"
              "?uploadType=resumable&part=snippet,status")

REQUIRED = ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN")


def configured(env=os.environ) -> bool:
    return all(env.get(k) for k in REQUIRED)


def _access_token(env):
    import urllib.parse
    data = urllib.parse.urlencode({
        "client_id": env["YT_CLIENT_ID"],
        "client_secret": env["YT_CLIENT_SECRET"],
        "refresh_token": env["YT_REFRESH_TOKEN"],
        "grant_type": "refresh_token",
    }).encode()
    res = common.request("POST", TOKEN_URL, data=data,
                         headers={"Content-Type": "application/x-www-form-urlencoded"})
    return res["body"]["access_token"]


def publish(video_path, meta, env=os.environ) -> dict:
    privacy = (env.get("YT_PRIVACY") or "public").strip()
    body = {
        "snippet": {
            "title": meta["title"],
            "description": meta["description"],
            "tags": meta["tags"],
            "categoryId": common.social_config().get("youtube_category_id", "23"),
        },
        "status": {
            "privacyStatus": privacy,
            "selfDeclaredMadeForKids": False,
        },
    }

    if common.dry_run():
        return {"platform": "youtube", "dry_run": True, "request": body}

    video = common.read_bytes(video_path)
    token = _access_token(env)

    # 1) open a resumable session
    start = common.request(
        "POST", UPLOAD_URL, json_body=body,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Upload-Content-Type": "video/*",
            "X-Upload-Content-Length": str(len(video)),
        },
    )
    session_url = start["headers"].get("Location") or start["headers"].get("location")
    if not session_url:
        raise common.HttpError(start["status"], str(start["headers"]), UPLOAD_URL)

    # 2) upload the bytes in one shot
    done = common.request(
        "PUT", session_url, data=video,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "video/*"},
    )
    video_id = done["body"]["id"]
    return {
        "platform": "youtube",
        "id": video_id,
        "url": f"https://youtu.be/{video_id}",
        "privacy": privacy,
    }

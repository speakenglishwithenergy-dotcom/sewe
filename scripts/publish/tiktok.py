"""Publish a rendered episode to TikTok with the Content Posting API (Direct Post).

Needs three secrets (see scripts/auth/tiktok_auth.py to obtain the refresh token):
  TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN
Optional:
  TIKTOK_PRIVACY   SELF_ONLY | PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | FOLLOWER_OF_CREATOR
                   Default SELF_ONLY. Unaudited apps may ONLY post SELF_ONLY; after your
                   app passes TikTok's audit, switch this to PUBLIC_TO_EVERYONE.

TikTok rotates the refresh token on every refresh. The new one is written to
out/tiktok_refresh_token.txt so the workflow can store it back as a secret.
"""
import math
import os
import time
from pathlib import Path

from . import common

OAUTH_URL = "https://open.tiktokapis.com/v2/oauth/token/"
INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/"
STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/"

REQUIRED = ("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REFRESH_TOKEN")

ROOT = Path(__file__).resolve().parent.parent.parent


def configured(env=os.environ) -> bool:
    return all(env.get(k) for k in REQUIRED)


def _refresh(env):
    import urllib.parse
    data = urllib.parse.urlencode({
        "client_key": env["TIKTOK_CLIENT_KEY"],
        "client_secret": env["TIKTOK_CLIENT_SECRET"],
        "grant_type": "refresh_token",
        "refresh_token": env["TIKTOK_REFRESH_TOKEN"],
    }).encode()
    res = common.request("POST", OAUTH_URL, data=data,
                         headers={"Content-Type": "application/x-www-form-urlencoded"})["body"]
    if "access_token" not in res:
        raise common.HttpError(200, str(res), OAUTH_URL)
    new_refresh = res.get("refresh_token")
    if new_refresh and new_refresh != env["TIKTOK_REFRESH_TOKEN"]:
        out = ROOT / "out"
        out.mkdir(exist_ok=True)
        (out / "tiktok_refresh_token.txt").write_text(new_refresh)
    return res["access_token"]


def publish(video_path, meta, env=os.environ) -> dict:
    privacy = (env.get("TIKTOK_PRIVACY") or "SELF_ONLY").strip()

    if common.dry_run():
        return {"platform": "tiktok", "dry_run": True,
                "privacy": privacy, "title": meta["caption"]}

    video = common.read_bytes(video_path)
    size = len(video)
    token = _refresh(env)
    auth = {"Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8"}

    # Single-chunk upload (episodes are well under the 64 MB single-chunk limit).
    chunk_size = size
    init = common.request("POST", INIT_URL, headers=auth, json_body={
        "post_info": {
            "title": meta["caption"],
            "privacy_level": privacy,
            "disable_duet": False,
            "disable_comment": False,
            "disable_stitch": False,
            "video_cover_timestamp_ms": 1000,
        },
        "source_info": {
            "source": "FILE_UPLOAD",
            "video_size": size,
            "chunk_size": chunk_size,
            "total_chunk_count": 1,
        },
    })["body"]

    err = (init.get("error") or {})
    if err.get("code") not in (None, "ok"):
        raise common.HttpError(200, str(init), INIT_URL)
    publish_id = init["data"]["publish_id"]
    upload_url = init["data"]["upload_url"]

    # PUT the whole file as one chunk.
    common.request("PUT", upload_url, data=video, headers={
        "Content-Type": "video/mp4",
        "Content-Length": str(size),
        "Content-Range": f"bytes 0-{size - 1}/{size}",
    })

    status = _poll(publish_id, token)
    return {
        "platform": "tiktok",
        "id": publish_id,
        "status": status,
        "privacy": privacy,
    }


def _poll(publish_id, token, tries=20, delay=6):
    auth = {"Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8"}
    last = None
    for _ in range(tries):
        res = common.request("POST", STATUS_URL, headers=auth,
                             json_body={"publish_id": publish_id})["body"]
        data = res.get("data", {})
        last = data.get("status")
        if last in ("PUBLISH_COMPLETE",):
            return last
        if last in ("FAILED",):
            raise common.HttpError(200, str(res), STATUS_URL)
        time.sleep(delay)
    return last or "UNKNOWN"

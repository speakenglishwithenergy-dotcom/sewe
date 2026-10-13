"""Publish a rendered episode to a Facebook Page as a Reel (Graph API).

Needs two secrets (see scripts/auth/README section for how to get a
non-expiring Page token):
  FB_PAGE_ID, FB_PAGE_TOKEN
Optional:
  FB_GRAPH_VERSION   (default: v20.0)
"""
import os

from . import common


def _ver(env):
    return (env.get("FB_GRAPH_VERSION") or "v20.0").strip()


REQUIRED = ("FB_PAGE_ID", "FB_PAGE_TOKEN")


def configured(env=os.environ) -> bool:
    return all(env.get(k) for k in REQUIRED)


def publish(video_path, meta, env=os.environ) -> dict:
    page_id = env["FB_PAGE_ID"]
    token = env["FB_PAGE_TOKEN"]
    ver = _ver(env)
    graph = f"https://graph.facebook.com/{ver}"

    if common.dry_run():
        return {"platform": "facebook", "dry_run": True,
                "description": meta["caption"]}

    video = common.read_bytes(video_path)

    # Phase 1: start an upload session
    start = common.request(
        "POST", f"{graph}/{page_id}/video_reels?upload_phase=start",
        json_body={"access_token": token},
    )["body"]
    video_id = start["video_id"]
    upload_url = start["upload_url"]

    # Phase 2: upload the binary to the rupload host
    common.request(
        "POST", upload_url, data=video,
        headers={
            "Authorization": f"OAuth {token}",
            "offset": "0",
            "file_size": str(len(video)),
        },
    )

    # Phase 3: publish
    import urllib.parse
    finish_url = (f"{graph}/{page_id}/video_reels?" + urllib.parse.urlencode({
        "upload_phase": "finish",
        "video_id": video_id,
        "video_state": "PUBLISHED",
        "description": meta["caption"],
        "access_token": token,
    }))
    common.request("POST", finish_url)

    return {
        "platform": "facebook",
        "id": video_id,
        "url": f"https://www.facebook.com/reel/{video_id}",
    }

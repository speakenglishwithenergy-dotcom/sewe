"""Publish a rendered episode to YouTube, Facebook and TikTok.

Usage:
  python3 scripts/publish.py stories/<story>.json [platform ...]

With no platform given it tries every platform that has its secrets set.
Platforms: youtube facebook tiktok  (or "all").

Behaviour:
  * A platform whose secrets are missing is skipped with a note.
  * An episode already posted to a platform (recorded in channel/history.json)
    is skipped, so re-running the workflow only fills in what is missing.
  * Each platform is independent: one failing does not stop the others.
  * DRY_RUN=1 builds and prints every request without calling the APIs.

Exit code is non-zero only if a platform that was actually attempted failed.
Writes a receipt to out/<id>.published.json and prints a summary.
"""
import json
import os
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from publish import common, notify, youtube, facebook, tiktok  # noqa: E402
from publish import tiktok_playwright  # noqa: E402

# tiktok_playwright takes priority over the API module when its session exists.
_tiktok_mod = tiktok_playwright if tiktok_playwright.configured() else tiktok
MODULES = {"youtube": youtube, "facebook": facebook, "tiktok": _tiktok_mod}
HISTORY_PATH = ROOT / "channel" / "history.json"


def already_published(story_id, platform):
    """True if history.json already records a link for this episode+platform."""
    if not HISTORY_PATH.exists():
        return False
    history = json.loads(HISTORY_PATH.read_text())
    for ep in history.get("episodes", []):
        if ep.get("id") == story_id:
            return bool((ep.get("published") or {}).get(platform))
    return False


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    story_path = Path(argv[0])
    story = json.loads(story_path.read_text())
    story_id = story["id"]

    requested = [a.lower() for a in argv[1:]] or ["all"]
    if "all" in requested:
        requested = list(MODULES)

    video_path = ROOT / "out" / f"{story_id}.mp4"
    meta = common.build_meta(story)

    results, failures = {}, []
    for name in requested:
        mod = MODULES.get(name)
        if mod is None:
            print(f"  ? unknown platform: {name}")
            continue
        if not mod.configured():
            print(f"  - {name}: secrets not set, skipping")
            continue
        if already_published(story_id, name):
            print(f"  = {name}: already published, skipping")
            continue
        if not common.dry_run() and not video_path.exists():
            print(f"  ! {name}: video not found at {video_path}")
            failures.append({"platform": name, "error": f"video not found at {video_path}"})
            continue
        try:
            print(f"  > {name}: publishing …")
            res = mod.publish(str(video_path), meta)
            results[name] = res
            print(f"    done: {res.get('url') or res.get('id') or res}")
        except Exception as e:  # noqa: BLE001
            print(f"  ! {name} failed: {e}")
            traceback.print_exc()
            failures.append({"platform": name, "error": str(e)})

    if failures and not common.dry_run():
        try:
            notify.send_failure_email(story_id, failures)
        except Exception as e:  # noqa: BLE001
            print(f"  ! failure email not sent: {e}")

    if results:
        out = ROOT / "out"
        out.mkdir(exist_ok=True)
        (out / f"{story_id}.published.json").write_text(
            json.dumps(results, indent=2, ensure_ascii=False) + "\n")

    print(json.dumps({"published": results,
                      "failed": [f["platform"] for f in failures]},
                     ensure_ascii=False))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

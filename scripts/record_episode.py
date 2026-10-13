"""Append a rendered episode to channel/history.json (episode number, score, rule).

Also records where the episode was published: it merges any links from
out/<id>.published.json (written by scripts/publish.py) into the episode's
"published" map, preserving links already stored from an earlier run.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
story = json.loads(Path(sys.argv[1]).read_text())
path = ROOT / "channel" / "history.json"
history = json.loads(path.read_text()) if path.exists() else {"episodes": []}

# Carry over any published links already recorded for this episode.
prev = next((e for e in history["episodes"] if e["episode"] == story["episode"]), {})
published = dict(prev.get("published") or {})

receipt = ROOT / "out" / f"{story['id']}.published.json"
if receipt.exists():
    for platform, res in json.loads(receipt.read_text()).items():
        if res.get("dry_run"):
            continue
        published[platform] = res.get("url") or res.get("id") or True

history["episodes"] = [e for e in history["episodes"] if e["episode"] != story["episode"]]
entry = {k: story.get(k) for k in ("episode", "date", "id", "title", "lessonType", "lessonFocus", "situation")}
if published:
    entry["published"] = published
history["episodes"].append(entry)
history["episodes"].sort(key=lambda e: e["episode"])
path.write_text(json.dumps(history, indent=1, ensure_ascii=False) + "\n")
print(f"recorded episode #{story['episode']}: {story['title']}"
      + (f"  published: {', '.join(published)}" if published else ""))

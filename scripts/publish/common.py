"""Shared helpers for publishing a rendered episode to social platforms.

Builds the post text (title / description / hashtags) from the story and the
channel bible, and gives every platform module the same small HTTP toolkit
(built on urllib, so the project keeps zero extra Python dependencies).
"""
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BIBLE = json.loads((ROOT / "channel" / "bible.json").read_text())

# Defaults used when channel/bible.json has no "social" block.
DEFAULT_SOCIAL = {
    "hashtags": ["LearnEnglish", "EnglishWithEnergy", "SpeakEnglish", "EnglishShorts", "Shorts"],
    "youtube_category_id": "27",  # Education
}


def dry_run() -> bool:
    return os.environ.get("DRY_RUN", "").strip() not in ("", "0", "false", "False")


def social_config() -> dict:
    cfg = dict(DEFAULT_SOCIAL)
    cfg.update(BIBLE.get("social", {}))
    return cfg


def _clip(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def build_meta(story: dict) -> dict:
    """Return the platform-neutral post metadata derived from a story + bible.

    Keys: title, description, caption, tags (list[str]), hashtags_line (str).
    Every platform module trims these to its own limits.
    """
    cfg = social_config()
    tags = [str(t).lstrip("#") for t in cfg.get("hashtags", [])]
    hashtags_line = " ".join("#" + t for t in tags)

    series = BIBLE.get("series", "")
    tagline = BIBLE.get("tagline", "")
    end_card = BIBLE.get("end_card", "")
    recap = story.get("recap") or {}
    phrase = recap.get("phrase") or story.get("lessonFocus", "")
    meaning_vi = recap.get("meaningVi", "")

    base_title = story.get("title") or series or "Learn English"
    title = f"{base_title} | Learn English" if "english" not in base_title.lower() else base_title

    desc_lines = []
    if phrase:
        desc_lines.append(f"📝 Today's phrase: \"{phrase}\"")
    if meaning_vi:
        desc_lines.append(f"🇻🇳 Nghĩa: {meaning_vi}")
    if tagline:
        desc_lines.append(tagline)
    if end_card:
        desc_lines.append(end_card)
    if series:
        desc_lines.append(f"— {series}")
    description = "\n".join(desc_lines).strip()
    if hashtags_line:
        description = (description + "\n\n" + hashtags_line).strip()

    # Short caption for TikTok / vertical feeds: the phrase, then hashtags.
    caption_head = f"{base_title}" + (f" — {phrase}" if phrase else "")
    caption = f"{caption_head}\n{hashtags_line}" if hashtags_line else caption_head

    return {
        "title": _clip(title, 100),
        "description": _clip(description, 4800),
        "caption": _clip(caption, 2000),
        "tags": tags,
        "hashtags_line": hashtags_line,
    }


# ------------------------------------------------------------------ HTTP
class HttpError(RuntimeError):
    def __init__(self, status, body, url):
        super().__init__(f"HTTP {status} from {url}: {body[:500]}")
        self.status = status
        self.body = body
        self.url = url


def request(method, url, *, headers=None, data=None, json_body=None,
            expect_json=True, timeout=300, retries=3):
    """Make an HTTP request with small exponential-backoff retries.

    `data` is raw bytes; `json_body` is serialised to JSON with the right header.
    Returns parsed JSON (expect_json=True) or the raw response object's body+headers.
    """
    headers = dict(headers or {})
    if json_body is not None:
        data = json.dumps(json_body).encode()
        headers.setdefault("Content-Type", "application/json")

    last_err = None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                resp_headers = dict(resp.headers.items())
                if expect_json:
                    body = json.loads(raw.decode() or "{}")
                else:
                    body = raw
                return {"body": body, "headers": resp_headers, "status": resp.status}
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            # 4xx (except 429) are not worth retrying.
            if e.code != 429 and 400 <= e.code < 500:
                raise HttpError(e.code, body, url) from None
            last_err = HttpError(e.code, body, url)
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
        if attempt < retries - 1:
            time.sleep(2 ** attempt)
    raise last_err


def read_bytes(path) -> bytes:
    return Path(path).read_bytes()

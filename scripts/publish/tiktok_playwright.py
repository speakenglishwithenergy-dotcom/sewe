"""Publish a rendered episode to TikTok via Playwright (browser automation).

Setup (one-time):
  pip install playwright playwright-stealth
  playwright install chromium

Login one-time (opens visible browser, log in manually, then press Enter):
  python3 scripts/publish/tiktok_playwright.py --login

Upload directly:
  python3 scripts/publish/tiktok_playwright.py out/demo.mp4 "Caption #funny"
  python3 scripts/publish/tiktok_playwright.py out/demo.mp4 "Caption" --visible

Via publish.py (auto-selected when channel/tiktok_session.json exists):
  python3 scripts/publish.py stories/demo.json tiktok
"""
import argparse
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
import os

# On CI: TIKTOK_SESSION env var holds the base64-encoded session JSON.
# Locally: session lives in ~/.config/stick-jokes/tiktok_session.json.
SESSION_FILE = Path(
    os.environ.get("TIKTOK_SESSION_FILE")
    or Path.home() / ".config" / "stick-jokes" / "tiktok_session.json"
)


def _ensure_session_file():
    """If TIKTOK_SESSION env var is set (CI), decode and write it to SESSION_FILE."""
    b64 = os.environ.get("TIKTOK_SESSION", "").strip()
    if not b64:
        return
    import base64
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    SESSION_FILE.write_bytes(base64.b64decode(b64))

UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload"


def _make_context(playwright, headless=True, storage_state=None):
    browser = playwright.chromium.launch(headless=headless)
    kwargs = dict(
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 800},
        locale="en-US",
        timezone_id="America/New_York",
    )
    if storage_state:
        kwargs["storage_state"] = storage_state
    ctx = browser.new_context(**kwargs)
    return browser, ctx


def _stealth(page):
    try:
        from playwright_stealth import Stealth
        Stealth().apply_stealth_sync(page)
    except ImportError:
        print("Warning: playwright-stealth not installed. Install with: pip install playwright-stealth")


def _dismiss_blockers(page):
    """Close Studio prompts that sit on top of the caption editor."""
    checks = page.locator("[role='dialog'], [class*='common-modal']").filter(
        has_text="Turn on automatic content checks"
    )
    if checks.count():
        cancel = checks.get_by_role("button", name="Cancel").first
        if cancel.is_visible():
            cancel.click()
            print("Dismissed content-check prompt.")
    got_it = page.get_by_role("button", name="Got it")
    if got_it.count() and got_it.first.is_visible():
        got_it.first.click()
        print("Dismissed sounds tip.")


def login(headless=False):
    """Open visible browser so user can log in manually, then save session."""
    from playwright.sync_api import sync_playwright

    print("Opening browser — log in to TikTok, then press Enter here.")
    with sync_playwright() as p:
        browser, ctx = _make_context(p, headless=headless)
        page = ctx.new_page()
        _stealth(page)
        page.goto("https://www.tiktok.com/login")
        input(">> Logged in? Press Enter to save session... ")
        SESSION_FILE.parent.mkdir(exist_ok=True)
        ctx.storage_state(path=str(SESSION_FILE))
        print(f"Session saved → {SESSION_FILE}")
        browser.close()


def upload(video_path: str, caption: str, headless=True) -> dict:
    """Upload video to TikTok Studio. Returns result dict."""
    from playwright.sync_api import sync_playwright

    _ensure_session_file()
    if not SESSION_FILE.exists():
        raise RuntimeError(
            f"No session at {SESSION_FILE}.\n"
            "Run once on your Mac:\n"
            "  python3 scripts/publish/tiktok_playwright.py --login\n"
            "Then add the output as GitHub Secret TIKTOK_SESSION:\n"
            "  cat ~/.config/stick-jokes/tiktok_session.json | base64 | tr -d '\\n'"
        )

    video_path = Path(video_path).resolve()
    if not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    print(f"Uploading {video_path.name} ({video_path.stat().st_size // 1024 // 1024} MB)…")

    with sync_playwright() as p:
        browser, ctx = _make_context(p, headless=headless, storage_state=str(SESSION_FILE))
        page = ctx.new_page()
        _stealth(page)

        try:
            page.goto(UPLOAD_URL, wait_until="domcontentloaded", timeout=30_000)

            # Session expired → redirected to login
            if "login" in page.url.lower():
                raise RuntimeError(
                    "Session expired. Re-run: "
                    "python3 scripts/publish/tiktok_playwright.py --login"
                )

            # Set the video file on the hidden file input
            file_input = page.locator("input[type='file']").first
            file_input.wait_for(state="attached", timeout=15_000)
            file_input.set_input_files(str(video_path))
            print("File attached, waiting for upload…")

            # Wait for the upload progress bar to appear then disappear
            try:
                page.wait_for_selector(
                    "[class*='progress'], [class*='upload-bar'], [class*='uploading']",
                    state="visible", timeout=10_000,
                )
                page.wait_for_selector(
                    "[class*='progress'], [class*='upload-bar'], [class*='uploading']",
                    state="hidden", timeout=120_000,
                )
            except Exception:
                # Progress bar might be too fast to catch; wait for caption field instead
                pass

            # Wait for caption/description field (confirms upload finished)
            caption_sel = (
                "div[class*='caption'] [contenteditable='true'], "
                "div[class*='description'] [contenteditable='true'], "
                "[contenteditable='true'][class*='editor'], "
                "[data-text='true']"
            )
            page.wait_for_selector(caption_sel, timeout=60_000)
            print("Upload done, filling caption…")
            _dismiss_blockers(page)

            caption_el = page.locator(caption_sel).first
            caption_el.click()
            page.keyboard.press("Meta+a")
            page.keyboard.press("Backspace")
            caption_el.type(caption, delay=20)
            print("Caption set.")

            # Small pause so TikTok registers the caption
            time.sleep(1)

            # Best-effort: make the video public ("Everyone"), not private.
            try:
                for label in ("Everyone", "Public"):
                    opt = page.locator(f"text=/^{label}$/i").first
                    if opt.count() and opt.is_visible():
                        opt.click()
                        print(f"Visibility set: {label}")
                        break
            except Exception:
                print("  (could not set visibility explicitly; using account default)")

            out_dir = Path(__file__).resolve().parents[2] / "out"
            out_dir.mkdir(exist_ok=True)
            try:
                page.screenshot(path=str(out_dir / "tiktok-before-post.png"))
            except Exception:
                pass

            # Click Post button
            post_btn = page.locator(
                "button:has-text('Post'), button:has-text('Upload')"
            ).last
            post_btn.wait_for(state="visible", timeout=10_000)
            post_btn.click()
            print("Post clicked, waiting for confirmation…")

            # STRONG confirmation only. A loose "complete" class is NOT trusted —
            # it can mean the file upload finished, not that the post went live.
            # Accept: a real /video/ link, an explicit success toast, or a redirect
            # to the content-manager page. Otherwise treat it as a failure.
            video_url = None
            confirmed = False
            deadline = time.time() + 90
            while time.time() < deadline:
                try:
                    link = page.locator("a[href*='/video/']").first
                    if link.count() and link.is_visible():
                        video_url = link.get_attribute("href")
                        confirmed = True
                        break
                except Exception:
                    pass
                try:
                    toast = page.locator(
                        "text=/your video (has|is) (been )?(uploaded|posted|published)/i, "
                        "text=/posted to your profile/i"
                    ).first
                    if toast.count() and toast.is_visible():
                        confirmed = True
                        break
                except Exception:
                    pass
                url = page.url.lower()
                if "tiktok.com" in url and ("/content" in url or "/manage" in url):
                    confirmed = True
                    break
                time.sleep(2)

            try:
                page.screenshot(path=str(out_dir / "tiktok-after-post.png"))
            except Exception:
                pass

            # Persist rotated cookies regardless of outcome.
            ctx.storage_state(path=str(SESSION_FILE))

            if not confirmed:
                raise RuntimeError(
                    "TikTok post not confirmed — no video link, success toast, or "
                    "content-page redirect appeared within 90s. The video may be stuck "
                    "in Drafts or blocked by TikTok's headless bot check. "
                    f"See out/tiktok-after-post.png"
                )

            print(f"Posted!{(' ' + video_url) if video_url else ''}")
            return {"platform": "tiktok_playwright", "status": "PUBLISH_COMPLETE", "url": video_url}

        finally:
            browser.close()


def configured(env=None) -> bool:
    return bool(os.environ.get("TIKTOK_SESSION")) or SESSION_FILE.exists()


def publish(video_path, meta, env=None) -> dict:
    """Drop-in for tiktok.publish() used by publish.py."""
    return upload(str(video_path), meta["caption"])


# ------------------------------------------------------------------ CLI
def main():
    parser = argparse.ArgumentParser(description="TikTok uploader via Playwright")
    parser.add_argument("--login", action="store_true",
                        help="Open browser to log in and save session")
    parser.add_argument("video", nargs="?", help="Path to .mp4 file")
    parser.add_argument("caption", nargs="?", default="", help="Post caption")
    parser.add_argument("--visible", action="store_true",
                        help="Show browser window (for debugging)")
    args = parser.parse_args()

    if args.login:
        login(headless=False)
        return

    if not args.video:
        parser.print_help()
        return

    result = upload(args.video, args.caption, headless=not args.visible)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

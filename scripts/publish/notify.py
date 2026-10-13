"""Email the operator when a platform upload fails, so they can refresh the token.

Needs (GitHub Actions secret):
  RESEND_API_KEY  API key from https://resend.com/api-keys
Optional:
  RESEND_FROM     sender (default: Kid Logic <onboarding@resend.dev>)
  ALERT_EMAIL     recipient (default: cvthang56th2@gmail.com)

onboarding@resend.dev only delivers to the email on the Resend account.
Use a verified domain in RESEND_FROM once you have one.
"""
import json
import os
import urllib.request

DEFAULT_TO = "cvthang56th2@gmail.com"
DEFAULT_FROM = "Kid Logic <onboarding@resend.dev>"
RESEND_URL = "https://api.resend.com/emails"

RESET = {
    "youtube": (
        "Lấy lại refresh token:\n"
        "  YT_CLIENT_ID=… YT_CLIENT_SECRET=… python3 scripts/auth/youtube_auth.py\n"
        "Cập nhật secret YT_REFRESH_TOKEN."
    ),
    "facebook": (
        "Lấy lại Page token:\n"
        "  FB_APP_ID=… FB_APP_SECRET=… FB_USER_TOKEN=… python3 scripts/auth/facebook_auth.py\n"
        "Cập nhật secret FB_PAGE_ID và FB_PAGE_TOKEN."
    ),
    "tiktok": (
        "Đăng nhập lại session TikTok:\n"
        "  python3 scripts/publish/tiktok_playwright.py --login\n"
        "  cat ~/.config/stick-jokes/tiktok_session.json | base64 | tr -d '\\n'\n"
        "Dán chuỗi đó vào secret TIKTOK_SESSION."
    ),
}


def run_url(env=None):
    env = env if env is not None else os.environ
    server = env.get("GITHUB_SERVER_URL", "").rstrip("/")
    repo = env.get("GITHUB_REPOSITORY", "")
    run_id = env.get("GITHUB_RUN_ID", "")
    if server and repo and run_id:
        return f"{server}/{repo}/actions/runs/{run_id}"
    return ""


def failure_email(story_id, failures, env=None):
    """Return (subject, body) for a list of {platform, error} dicts."""
    names = ", ".join(f["platform"] for f in failures)
    subject = f"Kid Logic: đăng bài lỗi — {names}"
    lines = [
        f"Tập {story_id} upload lỗi trên: {names}.",
        "Lấy lại token hoặc session, cập nhật GitHub secret, rồi chạy lại workflow.",
        "",
    ]
    for item in failures:
        platform = item["platform"]
        lines.append(f"[{platform}]")
        lines.append(item["error"].strip() or "(không có chi tiết)")
        lines.append(RESET.get(platform, "Kiểm tra secret của nền tảng này."))
        lines.append("")
    url = run_url(env)
    if url:
        lines.append(f"Log: {url}")
    return subject, "\n".join(lines).rstrip() + "\n"


def resend_body(story_id, failures, env=None):
    env = env if env is not None else os.environ
    subject, text = failure_email(story_id, failures, env)
    to = (env.get("ALERT_EMAIL") or DEFAULT_TO).strip()
    sender = (env.get("RESEND_FROM") or DEFAULT_FROM).strip()
    return {"from": sender, "to": [to], "subject": subject, "text": text}


def send_failure_email(story_id, failures, env=None):
    """Send the alert through Resend. Returns True when Resend accepts it."""
    if not failures:
        return False
    env = env if env is not None else os.environ
    api_key = (env.get("RESEND_API_KEY") or "").strip()
    if not api_key:
        print("  ! upload failed but email not sent: set RESEND_API_KEY")
        return False

    payload = resend_body(story_id, failures, env)
    req = urllib.request.Request(
        RESEND_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        resp.read()
    print(f"  ! failure email sent to {payload['to'][0]}")
    return True

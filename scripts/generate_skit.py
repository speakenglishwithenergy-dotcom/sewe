"""Write today's English-learning skit with an LLM and save it as stories/<date>-<slug>.json.

Usage:  python3 scripts/generate_skit.py            -> prints the story path

A skit is a 2-character flat-2D scene (~20-35s) that teaches ONE easy English phrase
through a tiny everyday moment — plus a bilingual recap and a short follow invite.

Free LLM providers, tried in this order: Groq, then Gemini.
Each provider can have several API keys. When a key fails (bad key, rate limit, quota,
server error) the next key is tried, then the next provider.
  GROQ_API_KEYS    one or more Groq keys, separated by commas or new lines (https://console.groq.com/keys)
  GEMINI_API_KEYS  one or more Gemini keys                                  (https://aistudio.google.com/apikey)
  (GROQ_API_KEY / GEMINI_API_KEY with a single key also work)
  GROQ_MODEL, GEMINI_MODEL  optional, comma-separated model list
LLM_MOCK_FILE=<json> skips the API and uses that file as the answer (for testing).

Each run picks a fresh lesson type + everyday situation. Past skits are listed in the prompt
so a target phrase is not retold. The skit is checked against the rules (cast, actions, line
length, a strong hook, a bilingual recap, a short follow line, ~20-35s). Errors are sent back to the model to fix,
up to 3 times. Then a "tough editor" pass sharpens the hook and the dialogue; its version is
kept only if it still passes the checks.
"""
import datetime as dt
import json, os, random, re, sys, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_bible_path = ROOT / "channel" / "bible.json"
BIBLE = json.loads(_bible_path.read_text()) if _bible_path.exists() else {}
HISTORY_PATH = ROOT / "channel" / "history.json"

ACTIONS = {"idle", "talk", "point", "shrug", "facepalm", "think", "surprised", "laugh", "phone", "phone_call",
           "cross_arms", "celebrate", "hug_pillow"}
EXPRESSIONS = {"neutral", "happy", "smug", "annoyed", "sad", "surprised", "worried"}
BACKGROUNDS = {"living_room", "kitchen", "classroom", "park", "office"}
PROPS = {"paper", "test_paper", "icecream", "coffee"}
# characters are cast per skit (flexible). These are the drawable looks the LLM may use.
LOOKS = {"dad", "mom", "man", "woman", "teen_girl", "teen_boy", "kid", "kid_girl",
         "boss", "worker", "barista", "grandpa", "teacher"}
# Hair and clothes are fixed per look, so the drawn person has one gender.
# Voice casting in skit_tts.py uses the same map — keep the two in sync.
LOOK_GENDER = {
    "dad": "m", "man": "m", "teen_boy": "m", "kid": "m", "boss": "m", "worker": "m", "grandpa": "m",
    "mom": "f", "woman": "f", "teen_girl": "f", "kid_girl": "f", "barista": "f", "teacher": "f",
}

LESSON_TYPES = ["dialogue", "vocab", "idiom", "grammar", "joke"]

SITUATIONS = [
    "ordering coffee at a cafe", "checking in at a hotel", "a job interview", "asking for directions",
    "meeting a friend's parents", "returning something to a shop", "ordering food at a restaurant",
    "small talk with a new coworker", "running late to a meeting", "booking a table by phone",
    "at the doctor's office", "buying a train ticket", "complaining politely about an order",
    "a first day at a new job", "asking a stranger for help", "making plans for the weekend",
    "declining an invitation politely", "introducing yourself at a party", "returning a gift",
    "apologizing for being late", "asking your boss for a day off", "negotiating a price at a market",
    "helping a tourist", "a phone call that drops", "ordering at a drive-through", "renting an apartment",
    "asking someone to repeat themselves", "giving a compliment", "a misunderstanding about slang",
]


# ------------------------------------------------------------------ prompt
def load_history():
    if HISTORY_PATH.exists():
        return json.loads(HISTORY_PATH.read_text())
    return {"episodes": []}


def pick_situation(history, today, seed=""):
    used = [e.get("situation") for e in history["episodes"][-12:]]
    pool = [s for s in SITUATIONS if s not in used] or SITUATIONS
    return random.Random(today.isoformat() + seed).choice(pool)


def pick_lesson_type(history, today, seed=""):
    """Rotate lesson types; avoid the last few so the channel stays varied."""
    used = [e.get("lessonType") for e in history["episodes"][-3:]]
    pool = [t for t in LESSON_TYPES if t not in used] or LESSON_TYPES
    return random.Random(today.isoformat() + "lt" + seed).choice(pool)


def build_prompt(history, situation, lesson_type, episode):
    template = (ROOT / "prompts" / "skit.md").read_text()
    past = "\n".join(f"- #{e['episode']} \"{e['title']}\" [{e.get('lessonType', '?')}] teach: {e.get('lessonFocus', '?')}"
                     for e in history["episodes"][-30:]) or "- (none yet, this is the first skit)"
    return (template.replace("{{SITUATION}}", situation)
                    .replace("{{LESSON_TYPE}}", lesson_type)
                    .replace("{{HISTORY}}", past)
                    .replace("{{LOOKS}}", ", ".join(sorted(LOOKS)))
                    .replace("{{BACKGROUNDS}}", ", ".join(sorted(BACKGROUNDS)))
                    .replace("{{PROPS}}", ", ".join(sorted(PROPS)))
                    .replace("{{ACTIONS}}", ", ".join(sorted(ACTIONS)))
                    .replace("{{EXPRESSIONS}}", ", ".join(sorted(EXPRESSIONS)))
                    .replace("{{EPISODE}}", str(episode)))


# ------------------------------------------------------------------ llm
def keys_from_env(*names):
    keys = []
    for name in names:
        for k in re.split(r"[,;\s]+", os.getenv(name, "")):
            k = k.strip().strip("'\"`")
            if "=" in k:              # pasted as NAME=value
                k = k.split("=", 1)[1]
            if k and k not in keys:
                keys.append(k)
    return keys


def providers():
    """(name, base_url, [keys], [models]) in the order they are tried: Groq first, then Gemini."""
    out = []
    groq = keys_from_env("GROQ_API_KEYS", "GROQ_API_KEY")
    if groq:
        out.append(("groq", "https://api.groq.com/openai/v1", groq,
                    [m for m in os.getenv("GROQ_MODEL", "").split(",") if m.strip()]))
    gemini = keys_from_env("GEMINI_API_KEYS", "GEMINI_API_KEY")
    if gemini:
        out.append(("gemini", "https://generativelanguage.googleapis.com/v1beta/openai", gemini,
                    [m for m in os.getenv("GEMINI_MODEL", "").split(",") if m.strip()]))
    return out


# ------------------------------------------------------------------ model discovery
# Model names get retired often, so we ask each provider which models exist today and
# pick the best text model. GROQ_MODEL / GEMINI_MODEL still win when they are set.
# Listing is optional: a 403 there must not stop the run. Chat tries the fallbacks
# and skips any name the provider no longer has.
SKIP = re.compile(r"whisper|guard|tts|speech|audio|embed|image|vision|live|playai|orpheus|transcri|"
                  r"moderation|compound|safeguard|aqa|learnlm|gemma|nano|robotics|computer-use|allam", re.I)

FALLBACK_MODELS = {
    "groq": ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
    "gemini": ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"],
}


def list_models(base, key):
    # Groq sits behind Cloudflare, which rejects Python-urllib's default User-Agent with 403.
    req = urllib.request.Request(f"{base.rstrip('/')}/models",
                                 headers={"Authorization": f"Bearer {key}", "Accept": "application/json",
                                          "User-Agent": "kid-logic-bot"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
        return [m.get("id", "").replace("models/", "") for m in data.get("data", [])]
    except Exception as e:
        print(f"  ! could not list models at {base}: {e}", file=sys.stderr)
        return []


def version_of(name):
    nums = re.findall(r"(\d+(?:\.\d+)?)", name)
    return float(nums[0]) if nums else 0.0


def size_of(name):
    m = re.search(r"(\d+)b\b", name.lower())
    return int(m.group(1)) if m else 0


def rank_models(provider, names):
    """Best-first list of chat models worth trying for creative writing."""
    names = [n for n in names if n and not SKIP.search(n)]
    if provider == "gemini":
        cand = [n for n in names if n.startswith("gemini") and ("flash" in n or "pro" in n)]
        # free tier: flash first (newest version first), stable before preview, lite last, then pro
        def key(n):
            return ("pro" in n, "lite" in n, "preview" in n or "exp" in n, -version_of(n.split("gemini-")[-1]), n)
        return sorted(cand, key=key)
    # groq: gpt-oss replaced the retired Llama models and has a much higher token budget than qwen
    prefer = ["gpt-oss", "qwen", "kimi", "llama-4-maverick", "llama-3.3-70b", "deepseek", "llama-4", "llama", "mistral"]
    def key(n):
        low = n.lower()
        rank = next((i for i, p in enumerate(prefer) if p in low), len(prefer))
        return (rank, -size_of(low), "instant" in low or "8b" in low, n)
    return sorted(names, key=key)


def models_for(name, base, keys, fixed):
    if fixed:
        return [m.strip() for m in fixed]
    for key in keys:
        found = rank_models(name, list_models(base, key))
        if found:
            print(f"  {name} models available: {', '.join(found[:5])}", file=sys.stderr)
            return found[:4]
    fallback = FALLBACK_MODELS.get(name, [])
    if fallback:
        print(f"  {name}: model list unavailable, trying {', '.join(fallback)}", file=sys.stderr)
    return fallback


def post(url, key, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                                          "Accept": "application/json", "User-Agent": "kid-logic-bot"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            raw = r.read().decode("utf-8", "replace")
            status = r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read().decode("utf-8", "replace"), e.code
    except Exception as e:  # DNS, timeout, proxy...
        raw, status = f"network error: {e}", 0
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = None
    return status, data, raw


KEY_ERRORS = {0, 401, 403, 429, 500, 502, 503, 504}  # this key/model is unusable right now -> try the next key
MAX_RATE_WAIT = 25  # seconds. Longer than this, the key stays blocked for later attempts in this run.
blocked_until = {}  # (model, key) -> time.monotonic()


def retry_after(raw):
    m = re.search(r"try again in ([0-9.]+)", raw or "", re.I)
    return float(m.group(1)) if m else None


def chat(messages):
    mock = os.getenv("LLM_MOCK_FILE")
    if mock:
        return Path(mock).read_text()
    plist = providers()
    if not plist:
        sys.exit("No LLM key configured. Add repository secrets GROQ_API_KEYS (https://console.groq.com/keys) "
                 "and/or GEMINI_API_KEYS (https://aistudio.google.com/apikey). Several keys can be separated by commas.")
    errors = []
    for name, base, keys, models in plist:
        url = f"{base.rstrip('/')}/chat/completions"
        models = models_for(name, base, keys, models)
        if not models:
            errors.append(f"{name}: no usable chat model found (check the key)")
            continue
        for model in models:
            model_missing = False
            for ki, key in enumerate(keys):
                tag = f"{name}/{model} key#{ki + 1} (...{key[-4:]})"
                wait = blocked_until.get((model, key), 0) - time.monotonic()
                if wait > MAX_RATE_WAIT:
                    print(f"  skip {tag}: rate limited for {wait:.0f}s more", file=sys.stderr)
                    continue
                if wait > 0:
                    print(f"  waiting {wait:.0f}s for {tag}", file=sys.stderr)
                    time.sleep(wait + 0.5)
                body = {"model": model, "messages": messages, "temperature": 0.9,
                        "response_format": {"type": "json_object"}}
                status, data, raw = post(url, key, body)
                if status == 400 and "response_format" in raw:
                    body.pop("response_format")  # no JSON mode: rely on the prompt
                    status, data, raw = post(url, key, body)
                if status == 429:
                    pause = retry_after(raw)
                    if pause is not None and pause <= MAX_RATE_WAIT:
                        print(f"  waiting {pause:.0f}s for {tag}", file=sys.stderr)
                        time.sleep(pause + 0.5)
                        status, data, raw = post(url, key, body)
                    elif pause is not None:
                        blocked_until[(model, key)] = time.monotonic() + pause
                if status == 200 and data and data.get("choices"):
                    print(f"  using {tag}", file=sys.stderr)
                    return data["choices"][0]["message"]["content"]
                msg = f"{tag}: HTTP {status}: {raw[:240].strip() or '(empty response)'}"
                errors.append(msg)
                print(f"  ! {msg}", file=sys.stderr)
                if status == 404 or (status == 400 and ("model" in raw.lower() or "context_length" in raw)):
                    model_missing = True  # gone, or the prompt does not fit: skip its other keys
                    break
                if status not in KEY_ERRORS:
                    continue
            if model_missing:
                continue
    sys.exit("All LLM keys failed:\n- " + "\n- ".join(errors))


def extract_json(text):
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()  # reasoning models
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if m:
        text = m.group(1)
    start, end = text.find("{"), text.rfind("}")
    return json.loads(text[start:end + 1])


# ------------------------------------------------------------------ checks
# The renderer falls back to idle/neutral for unknown poses. Fix them here so one
# invented word ("nod", "angry") does not burn another rate-limited model call.
ACTION_ALIAS = {
    "nod": "idle", "relax": "idle", "sit": "idle", "sit_down": "idle", "stand": "idle",
    "listen": "idle", "look": "idle", "watch": "idle", "wait": "idle", "smile": "idle", "wave": "idle",
    "cry": "facepalm", "sad": "facepalm", "upset": "facepalm",
    "angry": "point", "mad": "point", "yell": "point", "shout": "point",
}
EXPRESSION_ALIAS = {
    "angry": "annoyed", "mad": "annoyed", "furious": "annoyed",
    "cry": "sad", "crying": "sad", "upset": "sad",
    "smile": "happy", "excited": "happy", "proud": "smug",
    "confused": "worried", "nervous": "worried", "scared": "worried", "afraid": "worried",
    "calm": "neutral", "serious": "neutral",
}


def words(text):
    return [w for w in re.sub(r"[*]", "", text).split() if re.search(r"[A-Za-z0-9]", w)]


EXPLAIN = re.compile(r"\b(it means|that means|which means|in other words)\b", re.I)


def coerce_pose(obj, where):
    if not isinstance(obj, dict):
        return
    action, expression = obj.get("action"), obj.get("expression")
    if action not in ACTIONS:
        obj["action"] = ACTION_ALIAS.get(str(action or "").lower(), "idle")
        print(f"  {where}: action {action!r} -> {obj['action']}", file=sys.stderr)
    if expression not in EXPRESSIONS:
        obj["expression"] = EXPRESSION_ALIAS.get(str(expression or "").lower(), "neutral")
        print(f"  {where}: expression {expression!r} -> {obj['expression']}", file=sys.stderr)


def coerce_story(story):
    def lines(scene, where):
        for i, ln in enumerate(scene.get("lines") or []):
            coerce_pose(ln, f"{where} line {i + 1}")
            coerce_pose(ln.get("listener"), f"{where} line {i + 1} listener")
            for cid, lis in (ln.get("listeners") or {}).items():
                coerce_pose(lis, f"{where} line {i + 1} listener {cid}")

    lines(story.get("hook") or {}, "hook")
    for i, sc in enumerate(story.get("scenes") or []):
        lines(sc, f"scene {i + 1}")
    outro = story.get("outro") or {}
    for cid, action in list((outro.get("actions") or {}).items()):
        if action not in ACTIONS:
            outro["actions"][cid] = ACTION_ALIAS.get(str(action).lower(), "idle")
    for cid, expression in list((outro.get("expressions") or {}).items()):
        if expression not in EXPRESSIONS:
            outro["expressions"][cid] = EXPRESSION_ALIAS.get(str(expression).lower(), "neutral")


GENDERS = {"m", "f", "male", "female"}


def validate(story):
    errs = []
    for key in ("title", "lessonType", "lessonFocus", "characters", "scenes", "recap"):
        if key not in story:
            errs.append(f"missing top-level field '{key}'")
    if errs:
        return errs
    if len(words(story["title"])) > 6:
        errs.append("title must be max 6 words")
    if story.get("lessonType") not in LESSON_TYPES:
        errs.append(f"lessonType must be one of {sorted(LESSON_TYPES)}")

    chars = story.get("characters") or {}
    if not isinstance(chars, dict) or not 1 <= len(chars) <= 3:
        errs.append("define 1-3 characters in \"characters\" (2 is ideal)")
    for cid, c in chars.items():
        if (c or {}).get("look") not in LOOKS:
            errs.append(f"character '{cid}': look must be one of {sorted(LOOKS)}")
        stated = str((c or {}).get("gender", "")).lower()
        if stated not in GENDERS:
            errs.append(f"character '{cid}': gender must be m/f")
        else:
            drawn = LOOK_GENDER.get((c or {}).get("look", ""))
            short = {"male": "m", "female": "f"}.get(stated, stated[:1])
            if drawn and short != drawn:
                errs.append(
                    f"character '{cid}': look '{c.get('look')}' is drawn as "
                    f"{'female' if drawn == 'f' else 'male'}, so gender must be {drawn} (got {short}). "
                    f"Change the look or the gender so the picture matches the voice."
                )

    recap = story.get("recap") or {}
    if not (recap.get("phrase") or "").strip():
        errs.append("recap.phrase (the English target to remember) is required")
    if not (recap.get("meaningVi") or "").strip():
        errs.append("recap.meaningVi (the Vietnamese meaning) is required")
    if len(words(recap.get("phrase", ""))) > 12:
        errs.append("recap.phrase must be short (max ~12 words)")

    def check_line(ln, where, on_stage):
        if ln.get("speaker") not in on_stage:
            errs.append(f"{where}: speaker '{ln.get('speaker')}' is not on stage {sorted(on_stage)}")
        if ln.get("action") not in ACTIONS:
            errs.append(f"{where}: unknown action '{ln.get('action')}'")
        if ln.get("expression") not in EXPRESSIONS:
            errs.append(f"{where}: unknown expression '{ln.get('expression')}'")
        n = len(words(ln.get("text", "")))
        if n == 0 or n > 12:
            errs.append(f"{where}: line has {n} words, must be 1-12: \"{ln.get('text')}\"")
        for lis in [ln.get("listener")] + list((ln.get("listeners") or {}).values()):
            if lis and (lis.get("action") not in ACTIONS or lis.get("expression") not in EXPRESSIONS):
                errs.append(f"{where}: bad listener reaction {lis}")
        for w in words(ln.get("text", "")):
            if len(re.sub(r"[^A-Za-z]", "", w)) > 15:
                errs.append(f"{where}: word '{w}' is too long/hard, use a simpler word")

    def check_scene(sc, where):
        on = {sc.get(k) for k in ("left", "center", "right") if sc.get(k)}
        if not on:
            errs.append(f"{where}: no characters on stage")
        for cid in on:
            if cid not in chars:
                errs.append(f"{where}: '{cid}' is not in characters {sorted(chars)}")
        if sc.get("background") not in BACKGROUNDS:
            errs.append(f"{where}: unknown background '{sc.get('background')}'")
        for cid, prop in (sc.get("props") or {}).items():
            if prop not in PROPS:
                errs.append(f"{where}: unknown prop '{prop}'")
        return on

    if not 1 <= len(story["scenes"]) <= 2:
        errs.append("use 1 scene (2 only if the phrase cannot land in the first)")
    total = 0
    for si, sc in enumerate(story["scenes"]):
        on = check_scene(sc, f"scene {si + 1}")
        for i, ln in enumerate(sc.get("lines", [])):
            check_line(ln, f"scene {si + 1} line {i + 1}", on)
            total += 1
    if total < 4:
        errs.append(f"use 4-10 lines in total (found {total}); add a short beat so the lesson lands")
    elif total > 10:
        errs.append(f"use 4-10 lines in total (found {total}); cut lines that do not teach the one phrase")

    main = [ln for sc in story["scenes"] for ln in sc.get("lines", [])]
    opener = main[0] if main else None
    if opener is not None:
        n = len(words(opener.get("text", "")))
        if n > 8:
            errs.append(f"the opening line has {n} words, max 8, so a stranger stops scrolling")
        if float(opener.get("pause_after") or 0) < 1.0:
            opener["pause_after"] = 1.1  # the hook needs a beat to land; fix instead of failing
        if re.match(r"^(hello|hi|hey|good morning|good evening|what'?s up)\b",
                    re.sub(r"[*]", "", opener.get("text", "")).strip(), re.I):
            errs.append("the opening line must not be a greeting; start with a bold claim, a forbidden phrase, or a curious question")
    spoken = sum(len(words(ln.get("text", ""))) for ln in main)
    pauses = sum(float(ln.get("pause_after", 0.35) or 0.35) for ln in main)
    est = spoken / 2.6 + pauses + 5
    if not 18 <= est <= 40:
        hint = ("add one short beat so the lesson lands" if est < 18 else "cut extra lines — one moment, one phrase")
        errs.append(f"estimated length {est:.0f}s, aim for 20-35s: {hint}")
    return errs


# ------------------------------------------------------------------ editor pass
EDITOR = """You are a short-form editor for an English-learning channel. Read the skit out loud. Make it simpler, closer to real life, and easier to stay for.
Fix anything that is:
- too complicated: cut plot, backstory, a second joke, a grammar lecture, or a twist that needs explaining. One scene, one phrase, 5-8 short lines;
- weak opening: the first line makes a learner think "wait, I say that." A bold claim or a forbidden phrase (e.g. Never say *"X"*). Max 8 words, one or two words in *emphasis*, pause_after 1.1. Not a greeting, not "subscribe";
- unclear teaching: the target phrase is said once, naturally, in *asterisks*. The recap matches it. Nothing else is taught;
- unnatural or hard: A2 words only. Every line is something a real person would say. Prefer 4-8 words a line;
- missing follow: the LAST spoken line is a warm, short invite such as "Follow. One easy phrase a day." It is not a sales pitch and it is not the lesson.
Keep the same lesson, characters, JSON format and all the rules from the brief. About 20-35 seconds. Never pad.
Make the actions and expressions act the lines. Keep recap.phrase and recap.meaningVi accurate.
Answer with the full improved JSON only."""


def edit_pass(messages, answer):
    if os.getenv("LLM_MOCK_FILE") or os.getenv("SKIP_EDITOR"):
        return None
    try:
        better = extract_json(chat(messages + [{"role": "assistant", "content": answer}, {"role": "user", "content": EDITOR}]))
        coerce_story(better)
        errs = validate(better)
    except (Exception, SystemExit) as e:  # out of quota etc.: the first draft is still good
        print(f"  editor pass failed, keeping the first draft: {e}", file=sys.stderr)
        return None
    if errs:
        print(f"  editor version breaks {len(errs)} rules, keeping the first draft: {errs[:3]}", file=sys.stderr)
        return None
    return better


# ------------------------------------------------------------------ main
def main():
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).date()
    history = load_history()
    episode = (history["episodes"][-1]["episode"] + 1) if history["episodes"] else 1
    # a seed makes the two daily runs pick different situations/lesson types
    seed = os.getenv("SKIT_SEED", "")
    situation = os.getenv("SITUATION") or pick_situation(history, today, seed)
    lesson_type = os.getenv("LESSON_TYPE") or pick_lesson_type(history, today, seed)
    print(f"Skit #{episode}, {lesson_type}, situation: {situation}", file=sys.stderr)

    messages = [
        {"role": "system", "content": "You write short, simple, natural English-learning skits for a vertical video channel. "
                                       "Every skit teaches ONE easy phrase through one everyday moment a learner already knows, "
                                       "opens with a familiar mistake, and ends with a short warm follow invite plus a bilingual recap. "
                                       "You answer with JSON only."},
        {"role": "user", "content": build_prompt(history, situation, lesson_type, episode)},
    ]
    story, errs = None, ["no answer"]
    for attempt in range(4):
        answer = chat(messages)
        try:
            story = extract_json(answer)
            story.setdefault("lessonType", lesson_type)
            coerce_story(story)
            errs = validate(story)
        except Exception as e:
            errs = [f"invalid JSON: {e}"]
        if not errs:
            break
        print(f"  attempt {attempt + 1}: {len(errs)} problems: {errs[:5]}", file=sys.stderr)
        if os.getenv("LLM_MOCK_FILE"):
            break
        messages += [{"role": "assistant", "content": answer},
                     {"role": "user", "content": "Fix these problems and answer with the full corrected JSON only:\n- " + "\n- ".join(errs)}]
    if errs:
        sys.exit("Skit still breaks the rules:\n- " + "\n- ".join(errs))
    story = edit_pass(messages, answer) or story

    slug = re.sub(r"[^a-z0-9]+", "-", story.get("title", "skit").lower()).strip("-")[:40] or "skit"
    story.update(id=f"ep{episode:03d}-{slug}", episode=episode,
                 lessonType=story.get("lessonType", lesson_type),
                 lessonFocus=story.get("lessonFocus") or (story.get("recap") or {}).get("phrase", ""),
                 situation=situation, date=today.isoformat())
    out = ROOT / "stories" / f"{today.isoformat()}-ep{episode:03d}.json"
    out.write_text(json.dumps(story, indent=1, ensure_ascii=False))
    print(out.relative_to(ROOT))


if __name__ == "__main__":
    main()

"""Story JSON -> mixed audio track + timeline for Remotion.

Usage:  python3 scripts/tts.py stories/demo.json
Env:    TTS_ENGINE=supertonic (default) | kokoro      FPS=30 (default)

A story has an optional cold-open `hook` and a list of `scenes`, each with its own
background and cast. Words wrapped in *asterisks* are emphasised on screen.

Outputs into public/build/<id>/:
  audio.wav      voices + background music (ducked) + SFX, 48 kHz
  timeline.json  scenes, per-line timings, word timings, mouth envelope per frame
"""
import json, os, re, sys
from math import gcd
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfilt

FPS = int(os.getenv("FPS", "30"))
SR = 48000
LEAD_IN = 0.35          # speech starts almost immediately: the hook must land in the first second
GAP = 0.3               # pause between lines
OPENING_HOLD = 1.1      # after the first line, hold so the hook can land before the story moves on
HOOK_HOLD = 1.2         # the cold-open caption stays on screen so viewers can read it
HOOK_TRANSITION = 1.3   # freeze + rewind after the cold open
SCENE_TRANSITION = 0.75 # whip-pan between scenes
OUTRO = 2.4
ROOT = Path(__file__).resolve().parent.parent
RNG = np.random.default_rng(11)


# ------------------------------------------------------------------ engines
class SupertonicEngine:
    name = "supertonic"

    def __init__(self):
        from supertonic import TTS
        self.tts = TTS(auto_download=True)
        self.sr = self.tts.sample_rate
        self._styles = {}

    def say(self, text, voice, speed=1.0):
        if voice not in self._styles:
            self._styles[voice] = self.tts.get_voice_style(voice_name=voice)
        wav, _ = self.tts.synthesize(text, voice_style=self._styles[voice], speed=1.05 * speed,
                                     total_steps=int(os.getenv("SUPERTONIC_STEPS", "12")), lang="en")
        return np.asarray(wav, dtype=np.float32).squeeze()


class KokoroEngine:
    """Apache-2.0 model, files hosted on GitHub releases. Voices can be blended:
    "am_michael:0.6+am_fenrir:0.4"."""
    name = "kokoro"

    def __init__(self):
        from kokoro_onnx import Kokoro
        m = ROOT / "models"
        model = m / "kokoro.onnx" if (m / "kokoro.onnx").exists() else m / "kokoro.int8.onnx"
        self.k = Kokoro(str(model), str(m / "voices.bin"))
        self.sr = 24000

    def _voice(self, spec):
        if "+" not in spec and ":" not in spec:
            return spec
        style = None
        for part in spec.split("+"):
            name, _, w = part.partition(":")
            v = self.k.get_voice_style(name.strip()) * float(w or 1)
            style = v if style is None else style + v
        return style

    def say(self, text, voice, speed=1.0):
        s, _ = self.k.create(text, voice=self._voice(voice), speed=speed, lang="en-us")
        return np.asarray(s, dtype=np.float32)


def make_engine():
    return KokoroEngine() if os.getenv("TTS_ENGINE", "supertonic").lower() == "kokoro" else SupertonicEngine()


# ------------------------------------------------------------------ voice casting
# A character's voice always matches its gender; no two characters share a voice.
LOOK_GENDER = {"dad": "male", "man": "male", "teen_boy": "male", "kid": "male", "boss": "male", "worker": "male",
               "grandpa": "male", "mom": "female", "woman": "female", "teen_girl": "female", "kid_girl": "female",
               "barista": "female", "teacher": "female"}
YOUNG_LOOKS = {"teen_boy", "teen_girl", "kid", "kid_girl"}
VOICE_BANK = {
    "kokoro": {
        "male_adult": ["am_michael:0.6+am_fenrir:0.4", "bm_george:0.6+am_michael:0.4", "am_onyx:0.5+am_eric:0.5", "am_adam"],
        "male_young": ["am_puck", "am_liam", "am_echo"],
        "female_adult": ["af_bella", "af_nicole:0.5+af_heart:0.5", "bf_emma", "af_sarah"],
        "female_young": ["af_heart", "af_sky", "af_nova"],
    },
    "supertonic": {
        "male_adult": ["M1", "M3", "M5"], "male_young": ["M2", "M4"],
        "female_adult": ["F1", "F3", "F5"], "female_young": ["F2", "F4"],
    },
}


def voice_gender(engine, voice):
    v = voice.split(":")[0].split("+")[0].strip()
    if engine == "kokoro":
        return "female" if v[1:2] == "f" else "male"
    return "female" if v.upper().startswith("F") else "male"


def cast_voices(story, engine):
    used, cast = set(), {}
    for cid, c in story["characters"].items():
        gender = c.get("gender") or LOOK_GENDER.get(c.get("look", ""), "male")
        c["gender"] = gender
        bucket = f"{gender}_{'young' if c.get('look') in YOUNG_LOOKS else 'adult'}"
        wanted = (c.get("voice") or {}).get(engine)
        if wanted and voice_gender(engine, wanted) == gender and wanted not in used:
            voice = wanted
        else:
            if wanted:
                print(f"  ! {cid}: voice {wanted} does not match gender '{gender}', recasting")
            pool = VOICE_BANK[engine][bucket] + VOICE_BANK[engine][f"{gender}_adult"]
            voice = next(v for v in pool if v not in used)
        used.add(voice)
        c.setdefault("voice", {})[engine] = voice
        cast[cid] = voice
        print(f"  voice {cid} ({gender}, {c.get('look')}): {voice}")
    return cast


# ------------------------------------------------------------------ dsp helpers
def lowpass(x, hz, order=4):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x).astype(np.float32)


def highpass(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x).astype(np.float32)


def resample(x, sr_from, sr_to=SR):
    """Band-limited polyphase resampling (linear interpolation adds harsh aliasing)."""
    if sr_from == sr_to:
        return x.astype(np.float32)
    g = gcd(sr_from, sr_to)
    return resample_poly(x, sr_to // g, sr_from // g).astype(np.float32)


def fade(y, ms=12):
    f = min(len(y) // 2, int(ms / 1000 * SR))
    if f > 0:
        y[:f] *= np.linspace(0, 1, f)
        y[-f:] *= np.linspace(1, 0, f)
    return y


def trim(x, thresh=0.012, pad=0.05):
    idx = np.where(np.abs(x) > thresh)[0]
    if len(idx) == 0:
        return x
    p = int(pad * SR)
    return fade(x[max(0, idx[0] - p): min(len(x), idx[-1] + p)].copy())


def clean_voice(x):
    """Remove rumble, tame harsh highs, normalise each line to the same loudness."""
    x = highpass(x, 70)
    x = lowpass(x, 9500, order=2)
    rms = np.sqrt(np.mean(x ** 2)) or 1
    x = x * (0.11 / rms)
    peak = np.max(np.abs(x))
    if peak > 0.8:  # rare loud syllable: scale down instead of clipping
        x *= 0.8 / peak
    return fade(x)


def secs(d):
    return np.arange(int(d * SR)) / SR


def pop_sfx():
    t = secs(0.07)
    f = 520 + 900 * t / t[-1]
    return fade((np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 60) * 0.18).astype(np.float32), 3)


def whoosh_sfx(d=0.45, gain=0.16):
    t = secs(d)
    n = lowpass(RNG.standard_normal(len(t)).astype(np.float32), 2500)
    env = np.sin(np.pi * t / d) ** 2
    return fade((n * env * gain * 2.5).astype(np.float32))


def boom_sfx():
    """Deep cinematic hit for the hook."""
    t = secs(1.2)
    f = 90 * np.exp(-t * 3) + 38
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    click = lowpass(RNG.standard_normal(len(t)).astype(np.float32), 1800) * np.exp(-t * 40) * 0.25
    return fade((body * 0.55 + click).astype(np.float32), 2)


def dun_dun_sfx():
    """Two low dramatic hits ("dun... DUN") for the cold-open freeze."""
    out = np.zeros(int(1.3 * SR), dtype=np.float32)
    for at, f0, g in [(0.0, 98, 0.45), (0.38, 73, 0.7)]:
        t = secs(0.8)
        w = (np.sin(2 * np.pi * f0 * t) + 0.5 * np.sin(2 * np.pi * f0 * 2 * t)) * np.exp(-t * 4.5)
        a = int(at * SR)
        out[a:a + len(w)] += (w * g).astype(np.float32)
    return fade(lowpass(out, 1200))


def rimshot_sfx():
    def tom(f0, d=0.2):
        t = secs(d)
        f = f0 * np.exp(-t * 6)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 16)

    tc = secs(1.0)
    cym = highpass(lowpass(RNG.standard_normal(len(tc)).astype(np.float32), 7000), 3000) * np.exp(-tc * 4.5) * 0.28
    out = np.zeros(int(1.5 * SR), dtype=np.float32)
    for at, f0, g in [(0, 180, 0.7), (0.15, 125, 0.85)]:
        w = tom(f0)
        a = int(at * SR)
        out[a:a + len(w)] += w * g
    c = int(0.34 * SR)
    out[c:c + len(cym)] += cym[: len(out) - c]
    return fade(out * 0.5)


def rewind_sfx(d=1.0):
    t = secs(d)
    f = 1200 * np.exp(-t * 1.6) + 180 + 100 * np.sin(2 * np.pi * 14 * t)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.22
    chop = 0.65 + 0.35 * (np.sin(2 * np.pi * 22 * t) > 0)
    hiss = lowpass(RNG.standard_normal(len(t)).astype(np.float32), 3000) * 0.05
    env = np.minimum(1, t / 0.05) * np.minimum(1, (d - t) / 0.2)
    return fade(((tone + hiss) * chop * env).astype(np.float32))


def pluck(freq, dur):
    """Soft plucked note: harmonic sine partials with a fast attack and natural decay.
    (Karplus-Strong seeded with white noise caused audible crackle.)"""
    t = secs(dur)
    attack = np.minimum(1, t / 0.008)
    out = np.zeros_like(t)
    for h, g in [(1, 1.0), (2, 0.45), (3, 0.22), (4, 0.1)]:
        out += g * np.sin(2 * np.pi * freq * h * t) * np.exp(-t * (2.8 + h * 1.6))
    return fade((out * attack).astype(np.float32), 20)


def music(duration, bpm=104):
    """Light, upbeat loop: C - Am - F - G plucked arpeggios + soft bass."""
    beat = 60 / bpm
    note = lambda m: 440 * 2 ** ((m - 69) / 12)
    chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]
    bass = [36, 33, 41, 43]
    arp = [0, 1, 2, 1, 0, 2, 1, 2]
    total = np.zeros(int((duration + 2) * SR), dtype=np.float32)
    cache = {}

    def put(m, at, dur, g):
        if (m, dur) not in cache:
            cache[(m, dur)] = pluck(note(m), dur)
        w = cache[(m, dur)]
        a = int(at * SR)
        if a < len(total):
            seg = w[: len(total) - a]
            total[a:a + len(seg)] += seg * g

    bar, t = 0, 0.0
    while t < duration + 1:
        ch = chords[bar % 4]
        put(bass[bar % 4], t, beat * 3, 0.7)
        put(bass[bar % 4], t + beat * 2, beat * 2, 0.45)
        for k, idx in enumerate(arp):
            put(ch[idx] + 12, t + k * beat / 2, beat * 1.4, 0.32 if k % 2 == 0 else 0.22)
        t += beat * 4
        bar += 1
    total = lowpass(total[: int(duration * SR)], 5000)
    f = int(1.5 * SR)
    total[-f:] *= np.linspace(1, 0, f)
    return total / (np.max(np.abs(total)) or 1)


def frame_env(x, n_frames):
    hop = SR / FPS
    env = np.zeros(n_frames, dtype=np.float32)
    for i in range(n_frames):
        seg = x[int(i * hop): int((i + 1) * hop)]
        if len(seg):
            env[i] = np.sqrt(np.mean(seg ** 2))
    return env


def syllables(word):
    w = re.sub(r"[^a-z]", "", word.lower())
    return max(1, len(re.findall(r"[aeiouy]+", w)) - (1 if w.endswith("e") and len(w) > 3 else 0))


def word_timings(text, wav, start):
    """Word times weighted by syllables, snapped to the voiced part of the clip."""
    words = text.split()
    voiced = np.where(np.abs(wav) > 0.02)[0]
    v0 = voiced[0] / SR if len(voiced) else 0
    v1 = voiced[-1] / SR if len(voiced) else len(wav) / SR
    w = np.array([syllables(x) + (0.6 if re.search(r"[,.?!]\**$", x) else 0) for x in words], dtype=float)
    edges = start + v0 + np.concatenate([[0], np.cumsum(w)]) / w.sum() * (v1 - v0)
    return [{"w": x, "s": round(float(edges[i]), 3), "e": round(float(edges[i + 1]), 3)} for i, x in enumerate(words)]


def add(track, clip, at):
    a = max(0, int(at * SR))
    end = min(len(track), a + len(clip))
    if end > a:
        track[a:end] += clip[: end - a]


def line_pause(ln, opening, role):
    """Silence after a line. The first line of the video always holds, even if the script rushes it."""
    default = 0.55 if role == "hook" else GAP
    pause = float(ln.get("pause_after", default) or default)
    return max(pause, OPENING_HOLD) if opening else pause


# A leading "Ben:" is a script label the writer sometimes leaves in; strip one such prefix.
SPEAKER_LABEL = re.compile(r"^\s*\*?[A-Za-z][A-Za-z_]{1,14}\*?\s*:\s+")


def strip_speaker_label(text):
    return SPEAKER_LABEL.sub("", text, count=1)


def spoken(text):
    return strip_speaker_label(text).replace("*", "")


# ------------------------------------------------------------------ main
def apply_bible(story):
    """Skits use flexible per-skit characters. The bible only carries the channel identity
    (series name/badge). The ending is a bilingual recap card built from story["recap"]."""
    recap = story.get("recap") or {}
    if recap.get("phrase"):
        story.setdefault("outro", {
            "label": "SAY THIS",
            "text": recap["phrase"],
            "meaningVi": recap.get("meaningVi", ""),
        })
    path = ROOT / "channel" / "bible.json"
    bible = json.loads(path.read_text()) if path.exists() else {}
    series = None
    badge = bible.get("badge") or bible.get("series")
    if badge:
        series = {"name": badge, "episode": None, "score": None,
                  "end_card": bible.get("end_card"), "palette": bible.get("palette")}
    return story, series


def normalise_story(story):
    """Accept the old single-scene format too."""
    if "scenes" not in story:
        sides = {c.get("side"): cid for cid, c in story["characters"].items()}
        story["scenes"] = [{"background": story.get("background", "living_room"),
                            "left": sides.get("left"), "right": sides.get("right"), "lines": story["lines"]}]
    hook = story.get("hook")
    if hook and "scene" not in hook:
        s0 = story["scenes"][0]
        hook["scene"] = {k: s0[k] for k in ("background", "left", "center", "right") if k in s0}
    return story


def main(story_path):
    story = normalise_story(json.loads(Path(story_path).read_text()))
    story, series = apply_bible(story)
    out = ROOT / "public" / "build" / story["id"]
    out.mkdir(parents=True, exist_ok=True)
    engine = make_engine()
    print(f"TTS engine: {engine.name}")
    voices = cast_voices(story, engine.name)

    hook = story.get("hook")
    blocks = []
    if hook:
        blocks.append(dict(hook["scene"], lines=hook["lines"], role="hook", caption=hook.get("caption")))
    for s in story["scenes"]:
        blocks.append(dict(s, role="scene"))

    clips, lines, scenes, cursor = [], [], [], LEAD_IN
    hook_end = main_start = hold_start = signoff_at = None
    opening = True
    transitions = []
    n_lines = sum(len(b["lines"]) for b in blocks)
    for bi, b in enumerate(blocks):
        if bi > 0:
            prev = blocks[bi - 1]
            gap = HOOK_TRANSITION if prev["role"] == "hook" else SCENE_TRANSITION
            if prev["role"] != "hook":
                scenes[-1]["end"] = round(cursor, 3)
            if prev["role"] == "hook":
                hold_start = round(cursor, 3)
                cursor += HOOK_HOLD
                hook_end = round(cursor, 3)
                scenes[-1]["end"] = hook_end
                main_start = round(cursor + gap, 3)
            else:
                transitions.append(round(cursor, 3))
            cursor += gap
        scene = {k: v for k, v in b.items() if k not in ("lines", "enter")}
        scene.update(index=bi, start=round(cursor if bi else 0.0, 3), enter={})
        scenes.append(scene)
        for li, ln in enumerate(b["lines"]):
            c = story["characters"][ln["speaker"]]
            speed = ln.get("speed", 0.92 if b["role"] == "hook" else 1.0) * (1.04 if c.get("look") in YOUNG_LOOKS else 1.0)
            script = strip_speaker_label(ln["text"])
            wav = clean_voice(trim(resample(engine.say(spoken(script), voices[ln["speaker"]], speed), engine.sr)))
            dur = len(wav) / SR
            pause = line_pause(ln, opening, b["role"])
            opening = False
            line = dict(ln, text=script, scene=bi, hook=b["role"] == "hook", pause_after=pause)
            line.update(start=round(cursor, 3), end=round(cursor + dur, 3), words=word_timings(script, wav, cursor))
            line["env"] = [round(float(v), 4) for v in frame_env(wav, int(np.ceil(dur * FPS)))]
            for who, at_line in (b.get("enter") or {}).items():
                if at_line == li:
                    scene["enter"][who] = round(cursor, 3)
            clips.append((wav, cursor))
            cursor += dur
            if ln.get("punchline"):
                line["sting_at"] = round(cursor + 0.12, 3)
            if ln.get("signoff"):
                signoff_at = line["start"]
            cursor += pause
            lines.append(line)
            print(f"  [{len(lines)}/{n_lines}] {b['role']} {bi} {ln['speaker']}: {dur:.2f}s")
    scenes[-1]["end"] = round(cursor, 3)

    duration = cursor + (0.3 if signoff_at is not None else OUTRO)
    n = int(duration * SR)
    voice_tr = np.zeros(n, dtype=np.float32)
    sfx_tr = np.zeros(n, dtype=np.float32)
    for wav, at in clips:
        add(voice_tr, wav, at)

    pop = pop_sfx()
    for l in lines:
        if not l["hook"]:
            add(sfx_tr, pop, l["start"] - 0.06)
        if l.get("punchline"):
            add(sfx_tr, whoosh_sfx(), l["start"] - 0.35)
            add(sfx_tr, rimshot_sfx(), l["sting_at"])
    if hook:
        add(sfx_tr, boom_sfx(), LEAD_IN - 0.1)
        add(sfx_tr, rewind_sfx(HOOK_TRANSITION - 0.2), hook_end + 0.1)
        add(sfx_tr, dun_dun_sfx(), hold_start + 0.05)  # dramatic beat while the caption sits on screen
    for tr in transitions:
        add(sfx_tr, whoosh_sfx(0.5, 0.2), tr + 0.05)

    # background music: silent during the cold open (tension), starts with the story
    bg = music(duration)[:n]
    bg = np.pad(bg, (0, n - len(bg)))
    if main_start is not None:
        a, b = int((main_start - 0.2) * SR), int((main_start + 0.3) * SR)
        bg[:a] = 0
        bg[a:b] *= np.linspace(0, 1, b - a)
    hop = SR // 100
    speech = np.repeat([np.sqrt(np.mean(voice_tr[i:i + hop] ** 2)) for i in range(0, n, hop)], hop)[:n]
    speech = np.convolve(speech, np.ones(30 * hop) / (30 * hop), mode="same")
    duck = np.clip(1 - speech / (np.max(speech) or 1) * 2.2, 0.35, 1.0)
    mix = voice_tr + sfx_tr + bg * 0.075 * duck
    mix *= 0.89 / (np.max(np.abs(mix)) or 1)   # clean peak normalisation, no saturation
    sf.write(out / "audio.wav", mix.astype(np.float32), SR, subtype="PCM_16")

    m = max((max(l["env"]) for l in lines if l["env"]), default=1) or 1
    for l in lines:
        l["env"] = [round(min(1.0, v / m * 1.5), 3) for v in l["env"]]

    timeline = {
        "id": story["id"], "title": story["title"], "characters": story["characters"], "outro": story.get("outro"),
        "scenes": scenes, "transitions": transitions,
        "hook": {"hold_start": hold_start, "end": hook_end, "main_start": main_start, "caption": hook.get("caption", "1 HOUR EARLIER")} if hook else None,
        "fps": FPS, "audio_duration": round(duration, 3), "outro_start": round(signoff_at - 0.25 if signoff_at is not None else cursor - 0.3, 3), "series": series,
        "duration_in_frames": int(np.ceil(duration * FPS)),
        "lead_in": LEAD_IN, "lines": lines, "audio": f"build/{story['id']}/audio.wav",
    }
    (out / "timeline.json").write_text(json.dumps(timeline, indent=1))
    print(f"-> {out}/audio.wav ({duration:.1f}s)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "stories/demo.json")

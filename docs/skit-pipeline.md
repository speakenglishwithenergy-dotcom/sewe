# SEWE skit pipeline — animated English-learning shorts

A fully-automated pipeline (modeled on the stick-jokes flow) that produces vertical
1080×1920 shorts: two flat-2D **human** characters act out a tiny English-learning scene,
with a bilingual recap at the end. Runs 2×/day on GitHub Actions.

```
topic  →  generate_skit.py  →  skit_tts.py  →  render.mjs  →  publish.py  →  record_episode.py
          (LLM writes skit)    (voices+timing)  (Remotion)    (YT/FB/TikTok)  (history.json)
```

## Pieces
- `scripts/generate_skit.py` — an LLM writes today's skit (strong hook, one lesson, bilingual recap),
  validated against the rules, with a tough-editor pass. Rotates `lessonType`
  (dialogue / vocab / idiom / grammar / joke) and uses `channel/history.json` so phrases aren't repeated.
- `prompts/skit.md` — the brief given to the model.
- `scripts/skit_tts.py` — kokoro (default) or supertonic voices with **word-level timing** + mouth
  envelope, procedural music (ducked under speech) and SFX. Writes `public/build/<id>/{audio.wav,timeline.json}`.
- `src/short/skit/remotion/` — the Remotion engine: `HumanFigure` (flat-2D person, re-skinned from a
  stick-figure rig), `Background`, `SkitVideo`, `poses`.
- `src/short/skit/render.mjs` — renders the timeline to `out/<id>.mp4`.
- `scripts/publish.py` + `scripts/publish/*` — posts to YouTube, Facebook Reels and TikTok.
- `channel/bible.json` — channel identity (name/badge, palette, hashtags).

## Run locally
```bash
npm ci
pip install -r requirements.txt            # numpy, scipy, soundfile, kokoro-onnx
# download kokoro model into models/ (see .github/workflows/skit-episode.yml)
npm run skit:generate                       # -> stories/<date>-epNNN.json  (needs an LLM key)
npm run skit:tts -- stories/<file>.json     # -> public/build/<id>/{audio.wav,timeline.json}
npm run skit:render -- stories/<file>.json  # -> out/<id>.mp4
npm run skit:studio                         # live preview in the browser
```

### Quick visual demo (no model download, macOS)
```bash
npm run skit:demo        # uses `say` + ffmpeg -> output/demo/skit-demo.mp4
```
Edit the scene in `src/short/skit/demo/demo-skit.json`.

## Daily automation
`.github/workflows/skit-episode.yml` runs at **08:00 and 18:00 Vietnam time** (2 videos/day) and on
demand. It generates → voices → renders → publishes → commits the skit + history.

### Secrets / variables (repo → Settings → Secrets and variables → Actions)
- **LLM (required):** `GROQ_API_KEYS` and/or `GEMINI_API_KEYS` (comma-separated keys allowed).
- **Publishing is ON by default** for the 08:00 and 18:00 schedule. A manual run publishes unless
  `publish` is unchecked. Platform secrets:
  - YouTube: `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`
  - Facebook Reels: `FB_PAGE_ID`, `FB_PAGE_TOKEN`
  - TikTok: `TIKTOK_SESSION` (Playwright session, base64)
  - `RESEND_API_KEY` — emails reset steps if a platform upload fails
- Voice engine: `TTS_ENGINE=kokoro` (default) or `supertonic`.

## Tests / checks
```bash
npm run typecheck        # main TS
npm run skit:test        # skit validator checks
```

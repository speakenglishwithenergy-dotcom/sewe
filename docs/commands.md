# CLI Reference

All commands are run from the project root. Pass CLI flags after `--` so npm forwards them to the script.

```bash
npm run <script> -- [flags]
```

---

## Quick reference

| Command | Purpose |
|---------|---------|
| `npm run generate` | Create or resume a podcast/short video project |
| `npm run publish` | Upload an existing project to YouTube, Facebook, and/or TikTok |
| `npm run youtube:auth` | One-time YouTube OAuth setup |
| `npm run tiktok:auth` | One-time TikTok OAuth setup |
| `npm run generate:conversations-audio` | Generate TTS audio for basic-english-conversations episodes |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run typecheck` | Type-check without emitting files |

---

## `npm run generate`

Main pipeline: script → TTS → subtitles → video → social metadata (and optionally publish).

**Entry point:** `src/index.ts`

### Modes (pick one)

| Flag | Required | Description |
|------|----------|-------------|
| `--topic="..."` | Yes (new project) | Start a new project with this topic. Quotes optional. |
| `--project=ID` | Yes (resume) | Resume an existing project by ID (e.g. `20260614-185052`). |
| `--list` | — | List all projects and exit. No other flags needed. |

### Pipeline flags

| Flag | Default | Description |
|------|---------|-------------|
| `--test` | off | Script only — no audio, video, or thumbnails. Prints a preview. |
| `--short` | off | Generate podcast script + short video only (skip full podcast). |
| `--podcast` | off | Generate podcast script + full podcast video only (skip short). |
| *(none)* | — | Full pipeline: podcast + short in parallel. |

When neither `--short` nor `--podcast` is set, both formats are produced.

### Cache / re-run flags

| Flag | Requires | Description |
|------|----------|-------------|
| `--force` | `--project` | Clear cached artifacts and re-run. Keeps `thumbnail.png` and `short-thumbnail.png`. Scope follows `--short` / `--podcast` (see below). |

**`--force` cache scope:**

| Combined with | Clears |
|---------------|--------|
| *(none)* | All podcast + short artifacts |
| `--short` | Short artifacts only |
| `--podcast` | Podcast artifacts only |

### Metadata flags

| Flag | Requires | Description |
|------|----------|-------------|
| `--regenerate-metadata` | `--project` | Re-export social metadata. Uses cached `social-metadata.json` when present (normalize); otherwise calls the LLM. |
| `--regenerate-metadata=normalize` | `--project` | Re-export metadata from cache only (no LLM). |
| `--regenerate-metadata=generate` | `--project` | Regenerate metadata via LLM. |

Metadata-only mode skips video generation. Cannot be combined with `--test`, `--short`, `--podcast`, or `--force`.

### Publish flags

| Flag | Description |
|------|-------------|
| `--publish` | After generation (or metadata regen), upload to configured platforms. |
| `--force-publish` | Re-upload even if `publish/publish-status.json` shows a prior upload. |

`--publish` cannot be used with `--test` (no video is produced in test mode).

In `--short` mode, `--publish` uploads short-format only. In full or `--podcast` mode, both long and short are uploaded when available.

### Examples

```bash
# New project — full pipeline
npm run generate -- --topic="Why Smart People Stay Stuck"

# Quick script preview (no video)
npm run generate -- --topic="Why Smart People Stay Stuck" --test

# Short only
npm run generate -- --topic="Why Smart People Stay Stuck" --short

# Podcast only
npm run generate -- --topic="Why Smart People Stay Stuck" --podcast

# Resume existing project
npm run generate -- --project=20260614-185052

# Re-run everything (keep thumbnails)
npm run generate -- --project=20260614-185052 --force

# Re-run short only
npm run generate -- --project=20260614-185052 --short --force

# Re-run podcast only
npm run generate -- --project=20260614-185052 --podcast --force

# Regenerate social metadata
npm run generate -- --project=20260614-185052 --regenerate-metadata
npm run generate -- --project=20260614-185052 --regenerate-metadata=generate

# Generate and auto-publish
npm run generate -- --project=20260614-185052 --publish
npm run generate -- --project=20260614-185052 --publish --force-publish

# List projects
npm run generate -- --list
```

### Invalid combinations

| Flags | Error |
|-------|-------|
| `--short` + `--podcast` | Mutually exclusive |
| `--regenerate-metadata` + `--test` / `--short` / `--podcast` / `--force` | Mutually exclusive |
| `--publish` + `--test` | No video in test mode |
| `--force` without `--project` | Force only applies when resuming |
| `--regenerate-metadata` without `--project` | Metadata regen requires an existing project |
| `--force` + `--test` | Cannot force-re-run in test mode |

### Output layout

Projects are stored under `output/projects/<project-id>/`:

```
output/projects/<id>/
  script.json              # Podcast script
  short-script.json        # Short script (when generated)
  audio/                   # Per-line WAV segments
  podcast.mp3              # Merged podcast audio
  subtitles.ass            # Podcast subtitles
  short-subtitles.ass      # Short subtitles
  thumbnail.png            # Podcast thumbnail
  short-thumbnail.png      # Short thumbnail
  videos/                  # Final rendered MP4s (title-based filenames)
  publish/                 # Social metadata + publish status
    social-metadata.json
    publish-status.json
    youtube/long/          # title.txt, description.txt, tags.txt, pinned-comment.txt
    youtube/short/
    facebook/long/
    facebook/short/
    tiktok/short/
```

---

## `npm run publish`

Upload videos and post captions/comments for an existing project. Does not re-render video.

**Entry point:** `src/publish.ts`

### Arguments

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--project=ID` | **Yes** | — | Project ID to publish. |
| `--force` | No | off | Re-upload even if already published. |
| `--youtube-only` | No | all platforms | Publish to YouTube only. |
| `--facebook-only` | No | all platforms | Publish to Facebook only. |
| `--tiktok-only` | No | all platforms | Publish to TikTok only. |
| `--long-only` | No | long + short | Publish long-form only (YouTube + Facebook). |
| `--short-only` | No | long + short | Publish short-form only (YouTube Short, Facebook Reel, TikTok). |

Only one platform-only flag may be used at a time. `--long-only` and `--short-only` are mutually exclusive.

If `publish/social-metadata.json` is missing, metadata is generated from the script before upload.

### Examples

```bash
# Publish everything (YouTube long + short, Facebook long + short, TikTok short)
npm run publish -- --project=20260614-185052

# YouTube long-form only
npm run publish -- --project=20260614-185052 --youtube-only --long-only

# Re-upload short to TikTok
npm run publish -- --project=20260614-185052 --tiktok-only --short-only --force
```

### Invalid combinations

| Flags | Error |
|-------|-------|
| `--youtube-only` + `--facebook-only` / `--tiktok-only` | Only one platform filter |
| `--long-only` + `--short-only` | Mutually exclusive |

---

## `npm run youtube:auth`

One-time OAuth flow to obtain a YouTube refresh token.

**Entry point:** `scripts/youtube-oauth.ts`

### Prerequisites

1. Create OAuth 2.0 credentials (Desktop app) in Google Cloud Console.
2. Enable YouTube Data API v3.
3. Set `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` in `.env`.

### Usage

```bash
npm run youtube:auth
```

No CLI arguments. Opens a browser URL, listens on `http://localhost:53682/oauth2callback`, and prints `YOUTUBE_REFRESH_TOKEN=...` to add to `.env`.

---

## `npm run tiktok:auth`

One-time OAuth flow to obtain TikTok access and refresh tokens.

**Entry point:** `scripts/tiktok-oauth.ts`

### Prerequisites

1. Create an app at [TikTok for Developers](https://developers.tiktok.com/).
2. Enable Login Kit (Desktop) + Content Posting API; add scope `video.publish`.
3. Register redirect URI: `http://localhost:53683/callback`.
4. Set `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` in `.env`.

### Usage

```bash
npm run tiktok:auth
```

No CLI arguments. Opens a browser URL, listens on `http://localhost:53683/callback`, and prints tokens to add to `.env`.

---

## `npm run generate:conversations-audio`

Generate merged `podcast.mp3` for episodes in the basic-english-conversations collection (TTS only — no video).

**Entry point:** `src/conversations-audio.ts`

### Arguments

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--dir=PATH` | No | `output/basic-english-conversations` | Collection folder containing `manifest.json` and episode subfolders. |
| `--id=N` | No | all episodes | Process a single episode by manifest `id` (positive integer). |
| `--force` | No | off | Regenerate audio even if `podcast.mp3` already exists. |
| `--help`, `-h` | — | — | Print usage and exit. |

Each episode folder must contain a `script.json` with `title` and `script` (dialogue lines).

### Examples

```bash
# All episodes in default collection
npm run generate:conversations-audio

# Single episode
npm run generate:conversations-audio -- --id=1

# Custom collection, force regenerate
npm run generate:conversations-audio -- --dir=output/basic-english-conversations --force
```

---

## `npm run build` / `npm run typecheck`

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript (`tsc`) to `dist/`. |
| `npm run typecheck` | Run `tsc --noEmit` — type-check only. |

No CLI arguments.

---

## Environment variables

Variables read by the CLI and pipeline (set in `.env`):

### Core

| Variable | Used by | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | generate | Required for script, metadata, thumbnails, keywords. |
| `OPENAI_MODEL` | generate | LLM model (default: `gpt-4o`). |
| `OPENAI_TTS_MODEL` | — | TTS model if OpenAI TTS is used (default: `tts-1`). |
| `OPENAI_IMAGE_MODEL` | generate | Thumbnail image model (default: `gpt-image-1`). |
| `DISABLE_THUMBNAIL_GENERATION` | generate | `true` / `1` — skip AI thumbnails; wait for manual PNG in project folder. |
| `SUPERTONIC_ONNX_DIR` | generate, conversations-audio | Path to Supertonic ONNX models (default: `assets/supertonic-3/onnx`). |
| `SUPERTONIC_VOICES_DIR` | generate, conversations-audio | Voice style files (default: `assets/supertonic-3/voice_styles`). |
| `SUPERTONIC_TOTAL_STEPS` | generate | TTS quality steps (default: `10`). |
| `SUPERTONIC_TTS_RETRIES` | generate | TTS retry count (default: `3`). |

### YouTube publish

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `YOUTUBE_CLIENT_ID` | yes | — | OAuth client ID. |
| `YOUTUBE_CLIENT_SECRET` | yes | — | OAuth client secret. |
| `YOUTUBE_REFRESH_TOKEN` | yes | — | From `npm run youtube:auth`. |
| `YOUTUBE_PUBLISH_PRIVACY` | no | `private` | `private`, `unlisted`, or `public`. |
| `YOUTUBE_CATEGORY_ID` | no | `27` | YouTube category (27 = Education). |

### Facebook publish

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FACEBOOK_PAGE_ID` | yes | — | Facebook Page ID. |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | yes | — | Long-lived Page access token. See [docs.md](../docs.md) for setup. |
| `FACEBOOK_PUBLISH_LIVE` | no | `false` | `true` to publish live; `false` for draft/unpublished. |

### TikTok publish

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TIKTOK_CLIENT_KEY` | yes | — | App client key. |
| `TIKTOK_CLIENT_SECRET` | yes | — | App client secret. |
| `TIKTOK_ACCESS_TOKEN` | one of* | — | Access token from `npm run tiktok:auth`. |
| `TIKTOK_REFRESH_TOKEN` | one of* | — | Refresh token (used when access token expires). |
| `TIKTOK_PUBLISH_PRIVACY` | no | `SELF_ONLY` | `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `FOLLOWER_OF_CREATOR`, or `SELF_ONLY`. |

\*At least one of `TIKTOK_ACCESS_TOKEN` or `TIKTOK_REFRESH_TOKEN` must be set.

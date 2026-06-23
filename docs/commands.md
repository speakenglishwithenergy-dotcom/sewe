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
| `npm run shadowing` | Format a draft script (Victor only) → IPA → audio → shadowing MP4 |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run typecheck` | Type-check without emitting files |

---

## Multi-channel workflow

Each channel lives under `channels/<channel-id>/` with a `channel.yaml` config and `assets/` folder. Projects are stored under `output/<channel-id>/projects/<timestamp>/`.

```bash
# List configured channels
npm run generate -- --list-channels

# New project (channel required)
npm run generate -- --channel=speak-english-with-energy --topic="Why Smart People Stay Stuck"

# New project with a custom script draft (AI uses it as reference)
npm run generate -- --channel=devtalk-english --topic="Why I started a programming channel" --script-file=./my-draft.txt

# Resume existing project (channel loaded from project.json)
npm run generate -- --project=20260614-185052

# List projects (optionally filter by channel)
npm run generate -- --list
npm run generate -- --list --channel=speak-english-with-energy
```

### Adding a new channel

1. Copy `channels/speak-english-with-energy/` as a template
2. Edit `channel.yaml` (name, hosts, script sections, publish URLs, `env.prefix`)
3. Replace assets (intro, outro, thumbnails, logo)
4. Add OAuth env vars with the new prefix to `.env`
5. Run `npm run youtube:auth -- --channel=<new-id>` and `npm run tiktok:auth -- --channel=<new-id>`

Set `short.enabled: false` in `channel.yaml` to disable short-form generation for a channel.

---

## `npm run generate`

Main pipeline: script → TTS → subtitles → video → social metadata (and optionally publish).

**Entry point:** `src/index.ts`

### Modes (pick one)

| Flag | Required | Description |
|------|----------|-------------|
| `--channel=ID` | Yes (new project) | Channel to generate for (see `--list-channels`). |
| `--topic="..."` | Yes (new project) | Start a new project with this topic. Quotes optional. |
| `--project=ID` | Yes (resume) | Resume an existing project by ID (e.g. `20260614-185052`). |
| `--list-channels` | — | List all configured channels and exit. |
| `--list` | — | List all projects. Optional `--channel=ID` to filter. |

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
| `--now` | Publish immediately — skip channel schedule (uses env privacy settings). |

`--publish` cannot be used with `--test` (no video is produced in test mode).

In `--short` mode, `--publish` uploads short-format only. In full or `--podcast` mode, both long and short are uploaded when available.

### Examples

```bash
# New project — full pipeline
npm run generate -- --channel=speak-english-with-energy --topic="Why Smart People Stay Stuck"

# Quick script preview (no video)
npm run generate -- --channel=speak-english-with-energy --topic="Why Smart People Stay Stuck" --test

# Short only
npm run generate -- --channel=speak-english-with-energy --topic="Why Smart People Stay Stuck" --short

# Podcast only
npm run generate -- --channel=speak-english-with-energy --topic="Why Smart People Stay Stuck" --podcast

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
  script-draft.txt         # Optional author draft (reference for script generation)
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
| `--now` | No | off | Publish immediately (skip channel schedule). Uses `YOUTUBE_PUBLISH_PRIVACY` / `FACEBOOK_PUBLISH_LIVE`. |
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

# Publish long-form immediately (no schedule)
npm run publish -- --project=20260614-185052 --long-only --now

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
3. Set `{PREFIX}_YOUTUBE_CLIENT_ID` and `{PREFIX}_YOUTUBE_CLIENT_SECRET` in `.env` (e.g. `SEWE_YOUTUBE_CLIENT_ID`).

### Usage

```bash
npm run youtube:auth -- --channel=speak-english-with-energy
```

Opens a browser URL, listens on `http://localhost:53682/oauth2callback`, and prints the prefixed refresh token env var to add to `.env`.

---

## `npm run tiktok:auth`

One-time OAuth flow to obtain TikTok access and refresh tokens.

**Entry point:** `scripts/tiktok-oauth.ts`

### Prerequisites

1. Create an app at [TikTok for Developers](https://developers.tiktok.com/).
2. Enable Login Kit (Desktop) + Content Posting API; add scope `video.publish`.
3. Register redirect URI: `http://localhost:53683/callback`.
4. Set `{PREFIX}_TIKTOK_CLIENT_KEY` and `{PREFIX}_TIKTOK_CLIENT_SECRET` in `.env`.

### Usage

```bash
npm run tiktok:auth -- --channel=speak-english-with-energy
```

Opens a browser URL, listens on `http://localhost:53683/callback`, and prints prefixed tokens to add to `.env`.

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

## `npm run shadowing`

Shadowing pipeline: parse your draft into speakable lines, then generate IPA, TTS, subtitles, and MP4. Script text is taken directly from draft **Audio** blocks when present, otherwise split deterministically without rewriting.

**Entry point:** `src/shadowing.ts`

Workspaces live under `shadowing/workspaces/<timestamp>/`. Default profile and background: `shadowing/defaults/`.

### Workflow

1. **Draft → video** — create workspace and render in one step:
   ```bash
   npm run shadowing -- --draft=./my-script.txt
   ```
2. **Resume** — regenerate or continue an existing workspace:
   ```bash
   npm run shadowing -- --workspace=<id>
   ```

Optional preview of formatted lines only (no audio/video):

```bash
npm run shadowing -- --draft=./my-script.txt --test
```

### Arguments

| Flag | Required | Description |
|------|----------|-------------|
| `--draft=PATH` | Yes (new) | Text file with your script draft. Creates workspace and runs the full pipeline. |
| `--workspace=ID` | Yes (resume) | Continue workspace (e.g. `20260616-230137`). |
| `--title=TEXT` | No | Override episode title. |
| `--test` | No | Format `script.json` only — no IPA, audio, or video. |
| `--force` | No | Regenerate `script.json` and all media from `draft.txt`. |
| `--force-audio` | No | Regenerate TTS + `podcast.mp3` only — keeps `script.json`, subtitles, and video. |
| `--force-subtitles` | No | Regenerate `subtitles.ass` + `shadowing.mp4` only — keeps `script.json` and audio. |
| `--force-media` | No | Regenerate all media (audio + subtitles + video) — keeps `script.json`. |
| `--list` | — | List shadowing workspaces. |

Pick one regen flag at a time (`--force-audio`, `--force-subtitles`, or `--force-media`). Mutually exclusive with `--force` and `--test`.

### Examples

```bash
# New workspace + full video from draft
npm run shadowing -- --draft=./my-script.txt

# Preview script.json only
npm run shadowing -- --draft=./my-script.txt --test

# Resume existing workspace
npm run shadowing -- --workspace=20260616-230137

# Regenerate script + media after editing draft.txt
npm run shadowing -- --workspace=20260616-230137 --force

# Regenerate TTS + podcast.mp3 only (keeps existing subtitles and video)
npm run shadowing -- --workspace=20260617-001341 --force-audio

# Regenerate subtitles + video only (e.g. after subtitle styling fix)
npm run shadowing -- --workspace=20260617-001341 --force-subtitles

# Regenerate all media (audio + subtitles + video)
npm run shadowing -- --workspace=20260617-001341 --force-media
```

### Output layout

```
shadowing/workspaces/<id>/
  draft.txt
  script.json
  shadowing/
    audio/001.wav …
    podcast.mp3
    subtitles.ass
    shadowing.mp4
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
| `GROQ_API_KEY` | generate, shadowing | Groq API key for LLM (script, metadata, IPA). Auto-selected when set. |
| `GROQ_MODEL` | generate, shadowing | Groq model (default: `llama-3.3-70b-versatile`). |
| `LLM_PROVIDER` | generate, shadowing | `groq` or `openai` — override auto-detection when both keys are set. |
| `OPENAI_API_KEY` | generate | Required for TTS/thumbnails; LLM fallback when Groq is not configured. |
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

### Scheduled publishing (YouTube + Facebook)

Set `youtubeSchedule` and/or `facebookSchedule` in `channel.yaml` under the `publish` key to automatically schedule uploads:

```yaml
publish:
  youtubeSchedule:
    longTime: "11:30"   # wall-clock time for long-form video (24-h HH:MM)
    shortTime: "17:30"  # wall-clock time for Shorts
    timezone: "Asia/Ho_Chi_Minh"  # IANA timezone (default: UTC)
  facebookSchedule:
    longTime: "11:30"   # wall-clock time for long-form video
    shortTime: "17:30"  # wall-clock time for Reels
    timezone: "Asia/Ho_Chi_Minh"
```

When a schedule is configured, the video is uploaded immediately and held as scheduled/private. The platform publishes it at the next occurrence of the specified wall-clock time. If the target time for today has already passed, the video is scheduled for the following day.

Use `--now` on `npm run publish` or `npm run generate -- --publish` to skip scheduling and publish live immediately (respects `YOUTUBE_PUBLISH_PRIVACY` and `FACEBOOK_PUBLISH_LIVE`).

- **YouTube**: uploaded with `privacyStatus: private` + `publishAt`.
- **Facebook video**: uploaded with `published: false` + `scheduled_publish_time`. First comment must be posted manually after it goes live.
- **Facebook Reel**: uploaded with `video_state: SCHEDULED` + `scheduled_publish_time`. First comment must be posted manually after it goes live.

### Facebook publish

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FACEBOOK_PAGE_ID` | yes | — | Facebook Page ID. |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | yes | — | Long-lived Page access token. See [docs.md](../docs.md) for setup. |
| `FACEBOOK_PUBLISH_LIVE` | no | `false` | `true` to publish live; `false` for draft/unpublished. Ignored when `facebookSchedule` is set. |

### TikTok publish

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TIKTOK_CLIENT_KEY` | yes | — | App client key. |
| `TIKTOK_CLIENT_SECRET` | yes | — | App client secret. |
| `TIKTOK_ACCESS_TOKEN` | one of* | — | Access token from `npm run tiktok:auth`. |
| `TIKTOK_REFRESH_TOKEN` | one of* | — | Refresh token (used when access token expires). |
| `TIKTOK_PUBLISH_PRIVACY` | no | `SELF_ONLY` | `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `FOLLOWER_OF_CREATOR`, or `SELF_ONLY`. |

\*At least one of `TIKTOK_ACCESS_TOKEN` or `TIKTOK_REFRESH_TOKEN` must be set.

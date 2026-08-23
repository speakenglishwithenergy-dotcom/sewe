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
| `npm run batch` | Weekly batch: AI topics → generate 2–3 episodes → schedule publish (supports `--resume`) |
| `npm run remind` | Send Monday batch reminder email |
| `npm run remind:install` | Install macOS launchd job for weekly Monday reminder |
| `npm run publish` | Upload an existing project to YouTube, Facebook, and/or TikTok |
| `npm run youtube:auth` | One-time YouTube OAuth setup |
| `npm run tiktok:auth` | One-time TikTok OAuth setup |
| `npm run generate:conversations-audio` | Generate TTS audio for basic-english-conversations episodes |
| `npm run shadowing` | Read draft → TTS + IPA + subtitles + shadowing MP4 (workspace under `shadowing/workspaces/`) |
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

## `npm run batch`

Weekly batch workflow: generate and schedule **2 or 3** episodes per run.

**Entry point:** `src/batch.ts`

```bash
npm run batch -- --channel=speak-english-with-energy
npm run batch -- --channel=speak-english-with-energy --count=2
npm run batch -- --channel=speak-english-with-energy --dates=2,4
npm run batch -- --channel=speak-english-with-energy --dates=2026-07-21,2026-07-23
npm run batch -- --channel=speak-english-with-energy --count=3 --dates=2,4,6
npm run batch -- --channel=speak-english-with-energy --resume
```

### What it does

1. If an incomplete batch exists in `topics.json`, either:
   - `--resume` continues it immediately, or
   - a normal `batch` run asks `[y]` resume / `[n]` start a new batch
2. Choose batch size: **2 or 3** episodes (`--count=2|3`, inferred from `--dates`, or interactive prompt) — skipped when resuming
3. Loads topic history from `channels/<channel-id>/topics.json` (imports existing projects on first run)
4. AI suggests 2 or 3 new topics that do not overlap with past topics
5. Interactive topic review in the terminal:
   - `[1-2]` or `[1-3]` edit a topic
   - `[r]` regenerate suggestions
   - `[y]` confirm
   - `[q]` quit
6. Interactive publish-date review (defaults to next Mon/Wed or Mon/Wed/Fri):
   - `[1-2]` or `[1-3]` change date by **weekday number** or `YYYY-MM-DD`
   - Weekday numbers: `2`=Thứ hai, `3`=Thứ ba, `4`=Thứ tư, `5`=Thứ năm, `6`=Thứ sáu, `7`=Thứ bảy, `8`=Chủ nhật
   - Entering `2` picks the **next** Thứ hai from today (including today)
   - `[d]` reset defaults
   - `[y]` confirm and start
   - `[q]` quit
7. Runs in 3 phases across all episodes:
   1. **Create folders** — project dirs under `output/<channel-id>/projects/`
   2. **Generate files** — full `generate` pipeline for each project
   3. **Publish** — schedule each project on its chosen date (long at `youtubeSchedule.longTime`, short at `youtubeSchedule.shortTime`)
8. Saves every topic to `channels/<channel-id>/topics.json` (persists even if you delete project folders later)

Publish dates accept weekday numbers (`2`–`8`) or `YYYY-MM-DD`. CLI example: `--dates=2,4,6` schedules next Mon / Wed / Fri.

Times and timezone come from `publish.youtubeSchedule` / `publish.facebookSchedule` in `channel.yaml`.

### Resume incomplete batch

If a batch stops mid-way (status `failed` / `pending` / `generating` / `generated`), you can continue without re-picking topics:

```bash
npm run batch -- --channel=speak-english-with-energy --resume
```

Behavior:

- Groups topics by shared `createdAt` (one weekly batch run)
- Skips episodes already `published`
- Same 3 phases: create missing folders → generate unfinished episodes → publish remaining
- Skips generate when long + short videos already exist on disk (marks status `generated`)
- Reuses existing `projectId` when present (`generate --project=...`), then publishes with the stored schedule
- `--resume` ignores `--count` / `--dates`

### Topic registry

Past topics live in `channels/<channel-id>/topics.json`, not in project folders.

- `npm run batch` reads this file to avoid duplicate AI suggestions, and writes status through the batch lifecycle.
- `npm run generate` (new project only: `--channel` + `--topic`) also upserts a record: `generating` → `generated` / `failed`. Resume (`--project`) does not touch the registry.

---

## `npm run remind`

Email reminder every **Monday morning** to run the weekly batch.

**Entry point:** `src/remind.ts`

### Setup (one time)

**Option A — GitHub Actions (recommended)** — không cần Mac bật lúc 8h sáng.

1. Push repo lên GitHub
2. Vào **Settings → Secrets and variables → Actions**, thêm secrets:

| Secret | Required | Example |
|--------|----------|---------|
| `REMINDER_EMAIL_TO` | yes | `you@gmail.com` |
| `RESEND_API_KEY` | yes | `re_...` |
| `REMINDER_EMAIL_FROM` | no | `SEWE Reminder <onboarding@resend.dev>` |
| `REMINDER_TIMEZONE` | no | `Asia/Ho_Chi_Minh` |
| `REMINDER_CHANNEL_ID` | no | `speak-english-with-energy` |

3. Workflow `.github/workflows/batch-reminder.yml` chạy **mỗi thứ 2 lúc 8:00 sáng** (giờ Việt Nam)
4. Test thủ công: **Actions → Batch reminder → Run workflow**

**Option B — macOS launchd** — chạy local, Mac phải bật lúc 8h sáng.

1. Create a free account at [resend.com](https://resend.com) and get an API key
2. Add to `.env`:

```bash
REMINDER_EMAIL_TO=you@gmail.com
RESEND_API_KEY=re_...
REMINDER_EMAIL_FROM=SEWE Reminder <onboarding@resend.dev>
REMINDER_TIMEZONE=Asia/Ho_Chi_Minh
```

3. Test:

```bash
npm run remind -- --dry-run
npm run remind -- --force
```

4. Install schedule:

```bash
npm run remind:install

# Custom time
REMINDER_HOUR=7 REMINDER_MINUTE=30 npm run remind:install
```

Uses `launchd` — runs even when Terminal is closed (Mac must be on and awake).

### Commands

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview email without sending |
| `--force` | Send even if not Monday or already sent today |

Logs: `.sewe/reminder.log`

---

## `npm run generate`

Main pipeline: script → TTS → subtitles → video → social metadata (and optionally publish).

**Entry point:** `src/index.ts`

### Modes (pick one)

| Flag | Required | Description |
|------|----------|-------------|
| `--channel=ID` | Yes (new project) | Channel to generate for (see `--list-channels`). |
| `--topic="..."` | Yes (new project) | Episode topic and title (used verbatim for `script.json` title and video filename). Quotes optional. |
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

Read a draft file verbatim, split into sentences for shadowing, then generate IPA, TTS audio, subtitles, and shadowing MP4. No text is dropped or rewritten — only sentence boundaries create new lines.

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
| `--draft=PATH` | Yes (new) | Text file with your script draft (alias: `--file=PATH`). Creates workspace and runs the full pipeline. |
| `--workspace=ID` | Yes (resume) | Continue workspace (e.g. `20260616-230137`). |
| `--title=TEXT` | No | Override episode title. |
| `--voice=NAME` | No | Voice preset, e.g. `M1` or `F1` (default: `shadowing/defaults/profile.yaml`). |
| `--speed=NUMBER` | No | Speech speed, `0.7`–`2.0` (default: `0.85`). |
| `--test` | No | Build `script.json` only — no IPA, audio, or video. |
| `--force` | No | Regenerate `script.json` and all media from `draft.txt`. |
| `--force-audio` | No | Regenerate TTS + `podcast.mp3` only — keeps `script.json`, subtitles, and video. |
| `--force-subtitles` | No | Regenerate `subtitles.ass` + `shadowing.mp4` only — keeps `script.json` and audio. |
| `--force-media` | No | Regenerate all media (audio + subtitles + video) — keeps `script.json`. |
| `--list` | — | List shadowing workspaces. |
| `--list-voices` | — | List available Supertonic voice presets. |

Pick one regen flag at a time (`--force-audio`, `--force-subtitles`, or `--force-media`). Mutually exclusive with `--force` and `--test`.

### Examples

```bash
# New workspace + full video from draft
npm run shadowing -- --draft=./draft-scripts/script.txt

# Custom voice and speed
npm run shadowing -- --draft=./draft-scripts/script.txt --voice=F1 --speed=1.0

# Preview script.json only
npm run shadowing -- --draft=./my-script.txt --test

# Resume existing workspace
npm run shadowing -- --workspace=20260616-230137

# Regenerate script + media after editing draft.txt
npm run shadowing -- --workspace=20260616-230137 --force

# Regenerate TTS + podcast.mp3 only
npm run shadowing -- --workspace=20260617-001341 --force-audio

# List voices
npm run shadowing -- --list-voices
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
| `GEMINI_API_KEY` | generate, shadowing | Gemini API key for LLM (first in the quota fallback chain). |
| `GEMINI_MODEL` | generate, shadowing | Gemini model (default: `gemini-2.5-flash`). |
| `GROQ_API_KEY` | generate, shadowing | Groq API key for LLM. Used after Gemini quota errors. |
| `GROQ_MODEL` | generate, shadowing | Groq model (default: `qwen/qwen3.6-27b`). |
| `CEREBRAS_API_KEY` | generate, shadowing | Cerebras API key for LLM. Used after Gemini and Groq quota errors. |
| `CEREBRAS_MODEL` | generate, shadowing | Cerebras model (default: `llama-3.3-70b`). |
| `LLM_PROVIDER` | generate, shadowing | Leave unset for `gemini → groq → cerebras`. Pin with `gemini`, `groq`, `cerebras`, or `openai`. |
| `OPENAI_API_KEY` | generate | Required for TTS/thumbnails; LLM fallback when no Gemini/Groq/Cerebras key is set. |
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
| `FACEBOOK_FIRST_COMMENT` | no | `true` | `true` to auto-post the first comment after live publish; `false` to skip (post manually). Ignored when video is scheduled or draft. |

### TikTok publish

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TIKTOK_PUBLISH_ENABLED` | no | `false` | `true` to include TikTok in default publish (`npm run publish` and pipeline `--publish`) and in generated social metadata (TikTok caption file + TikTok links/CTAs). When `false`, meta omits TikTok; `--tiktok-only` still works for publish. |
| `TIKTOK_CLIENT_KEY` | yes | — | App client key. |
| `TIKTOK_CLIENT_SECRET` | yes | — | App client secret. |
| `TIKTOK_ACCESS_TOKEN` | one of* | — | Access token from `npm run tiktok:auth`. |
| `TIKTOK_REFRESH_TOKEN` | one of* | — | Refresh token (used when access token expires). |
| `TIKTOK_PUBLISH_PRIVACY` | no | `SELF_ONLY` | `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `FOLLOWER_OF_CREATOR`, or `SELF_ONLY`. |

\*At least one of `TIKTOK_ACCESS_TOKEN` or `TIKTOK_REFRESH_TOKEN` must be set.

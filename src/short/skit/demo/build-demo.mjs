// Build a demo skit timeline + audio WITHOUT the production Python TTS, so a demo
// can be rendered offline on macOS. Uses the built-in `say` voices and derives the
// mouth envelope from each line's audio (RMS per frame). The production path
// (scripts/skit_tts.py, kokoro/supertonic) produces the same Timeline shape with
// true word-level timings — this is only for a quick visual demo.
//
// Usage: node build-demo.mjs [skit.json] [outDir]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skitPath = path.resolve(process.argv[2] ?? path.join(here, 'demo-skit.json'));
const outDir = path.resolve(process.argv[3] ?? path.join(here, 'build'));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skit-demo-'));
fs.mkdirSync(outDir, { recursive: true });

const SR = 48000;
const PAN = 0.75;      // scene whip-pan gap (must match SkitVideo PAN)
const LEAD_IN = 0.45;  // beat before the first line
const DEFAULT_PAUSE = 0.35;

const skit = JSON.parse(fs.readFileSync(skitPath, 'utf8'));
const fps = skit.fps ?? 30;

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

// `say` wants plain text (strip the *emphasis* markers); the timeline keeps them.
const plain = (t) => t.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

/** synth one line to a 48k mono 16-bit wav, return { wav, duration, env } */
function synthLine(text, voice, idx) {
  const aiff = path.join(tmpDir, `l${idx}.aiff`);
  const wav = path.join(tmpDir, `l${idx}.wav`);
  const args = ['-o', aiff, '-r', '186'];
  if (voice) args.unshift('-v', voice);
  sh('say', [...args, plain(text)]);
  sh('ffmpeg', ['-y', '-i', aiff, '-ac', '1', '-ar', String(SR), '-sample_fmt', 's16', wav]);

  const buf = fs.readFileSync(wav);
  // locate the data chunk (skip RIFF header; chunks are 8-byte tagged)
  let p = 12;
  let dataOff = 44;
  let dataLen = buf.length - 44;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const len = buf.readUInt32LE(p + 4);
    if (id === 'data') { dataOff = p + 8; dataLen = len; break; }
    p += 8 + len + (len & 1);
  }
  const n = Math.floor(dataLen / 2);
  const duration = n / SR;

  // RMS envelope, one value per video frame, normalized to 0..1
  const frames = Math.max(1, Math.ceil(duration * fps));
  const env = new Array(frames).fill(0);
  const win = Math.floor(SR / fps);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    let c = 0;
    const s0 = f * win;
    for (let i = s0; i < s0 + win && i < n; i++) {
      const v = buf.readInt16LE(dataOff + i * 2) / 32768;
      sum += v * v;
      c++;
    }
    env[f] = c ? Math.sqrt(sum / c) : 0;
  }
  const peak = Math.max(1e-4, ...env);
  // a gentle curve so the mouth opens convincingly but not jittery
  const shaped = env.map((v) => Math.min(1, Math.pow(v / peak, 0.6)));
  return { wav, duration, env: shaped };
}

/** split line text into word tokens (keeping *emphasis* markers) with even timings */
function wordsFor(text, start, end) {
  const toks = text.trim().split(/\s+/);
  const span = (end - start) / toks.length;
  return toks.map((w, i) => ({ w, s: +(start + i * span).toFixed(3), e: +(start + (i + 1) * span).toFixed(3) }));
}

// ── Lay out the timeline ─────────────────────────────────────────────────────
const lines = [];
const scenes = [];
const transitions = [];
const mixParts = []; // { wav, atSec }
let cursor = LEAD_IN;
let lineIdx = 0;

skit.scenes.forEach((sc, si) => {
  if (si > 0) cursor += PAN; // whip-pan gap between scenes
  const sceneStart = cursor;
  sc.lines.forEach((ln) => {
    const voice = skit.characters[ln.speaker]?.voice;
    const { wav, duration, env } = synthLine(ln.text, voice, lineIdx++);
    const start = cursor;
    const end = start + duration;
    mixParts.push({ wav, atSec: start });
    lines.push({
      speaker: ln.speaker,
      text: ln.text,
      action: ln.action ?? 'talk',
      expression: ln.expression ?? 'neutral',
      listener: ln.listener,
      start: +start.toFixed(3),
      end: +end.toFixed(3),
      words: wordsFor(ln.text, start, end),
      env,
      scene: si,
      pause_after: ln.pause_after ?? DEFAULT_PAUSE,
    });
    cursor = end + (ln.pause_after ?? DEFAULT_PAUSE);
  });
  const sceneEnd = cursor + 0.1;
  scenes.push({
    index: si,
    role: 'scene',
    background: sc.background,
    caption: sc.caption,
    left: sc.left,
    center: sc.center,
    right: sc.right,
    props: sc.props,
    enter: {},
    start: +sceneStart.toFixed(3),
    end: +sceneEnd.toFixed(3),
  });
  if (si > 0) transitions.push(+sceneStart.toFixed(3));
  cursor = sceneEnd;
});

// outro / recap card holds at the end on the last scene
const outroStart = +(cursor + 0.2).toFixed(3);
const RECAP_HOLD = 2.6;
const audioDuration = outroStart + RECAP_HOLD;
scenes[scenes.length - 1].end = +(audioDuration).toFixed(3);

// ── Mix all line audio into one track at the right offsets ───────────────────
const audioOut = path.join(outDir, 'audio.wav');
const inputs = mixParts.flatMap((m) => ['-i', m.wav]);
const delays = mixParts
  .map((m, i) => `[${i}:a]adelay=${Math.round(m.atSec * 1000)}:all=1[a${i}]`)
  .join(';');
const mixIns = mixParts.map((_, i) => `[a${i}]`).join('');
const filter = `${delays};${mixIns}amix=inputs=${mixParts.length}:normalize=0:dropout_transition=0[m];[m]apad=whole_dur=${audioDuration}[out]`;
sh('ffmpeg', ['-y', ...inputs, '-filter_complex', filter, '-map', '[out]', '-ac', '1', '-ar', String(SR), audioOut]);

// ── Write the timeline ───────────────────────────────────────────────────────
const characters = {};
for (const [id, c] of Object.entries(skit.characters)) {
  characters[id] = { look: c.look, scale: c.scale ?? 1.0, gender: c.gender };
}

const timeline = {
  id: skit.id,
  title: skit.title,
  fps,
  audio: 'audio.wav',
  audio_duration: +audioDuration.toFixed(3),
  duration_in_frames: Math.ceil(audioDuration * fps),
  lead_in: LEAD_IN,
  outro_start: outroStart,
  characters,
  lines,
  scenes,
  transitions,
  outro: skit.recap
    ? { label: 'SAY THIS', text: skit.recap.phrase }
    : { text: 'Follow to learn more!' },
};

const timelineOut = path.join(outDir, 'timeline.json');
fs.writeFileSync(timelineOut, JSON.stringify(timeline, null, 2));
console.log(`audio    -> ${audioOut}`);
console.log(`timeline -> ${timelineOut}  (${timeline.duration_in_frames} frames @ ${fps}fps, ${audioDuration.toFixed(1)}s)`);

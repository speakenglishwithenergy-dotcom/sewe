// Render a skit into a vertical MP4 with Remotion.
//
// Two ways to call it:
//   Production (like stick-jokes):
//     node render.mjs stories/<file>.json
//       -> reads public/build/<id>/timeline.json (written by scripts/skit_tts.py)
//       -> writes out/<id>.mp4 ; publicDir is <repo>/public
//   Explicit (demo / custom):
//     node render.mjs <timeline.json> <publicDir> <outFile>
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const arg1 = process.argv[2];
if (!arg1) {
  console.error('Usage: node render.mjs <story.json> | <timeline.json> <publicDir> <outFile>');
  process.exit(1);
}

const firstJson = JSON.parse(fs.readFileSync(arg1, 'utf8'));
let timelinePath, publicDir, outFile;

if (firstJson.duration_in_frames && Array.isArray(firstJson.lines)) {
  // explicit timeline mode
  timelinePath = arg1;
  publicDir = path.resolve(process.argv[3] ?? path.join(here, 'remotion', 'public'));
  outFile = path.resolve(process.argv[4] ?? path.join(repoRoot, 'out', 'skit.mp4'));
} else {
  // production story mode
  const id = firstJson.id;
  if (!id) { console.error('story JSON has no "id"'); process.exit(1); }
  publicDir = path.join(repoRoot, 'public');
  timelinePath = path.join(publicDir, 'build', id, 'timeline.json');
  outFile = path.join(repoRoot, 'out', `${id}.mp4`);
}

const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
fs.mkdirSync(path.dirname(outFile), { recursive: true });

// CHROME_PATH lets you point at a local Chromium; otherwise Remotion downloads its own.
const browserExecutable = process.env.CHROME_PATH || null;

const serveUrl = await bundle({ entryPoint: path.join(here, 'remotion', 'index.ts'), publicDir });
const inputProps = { timeline };
const composition = await selectComposition({ serveUrl, id: 'SkitVideo', inputProps, browserExecutable });

let last = -1;
await renderMedia({
  composition, serveUrl, inputProps, browserExecutable,
  codec: 'h264', crf: Number(process.env.CRF || 18), x264Preset: process.env.X264_PRESET || 'medium',
  imageFormat: 'jpeg', jpegQuality: 100, colorSpace: 'bt709',
  audioCodec: 'aac', audioBitrate: '256k',
  outputLocation: outFile,
  concurrency: Math.max(1, os.cpus().length),
  chromiumOptions: { gl: 'swangle' },
  onProgress: ({ progress }) => {
    const p = Math.floor(progress * 10);
    if (p !== last) { last = p; process.stdout.write(`render ${p * 10}%\n`); }
  },
});
console.log(`-> ${outFile}`);

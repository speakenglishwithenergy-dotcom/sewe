import fs from 'fs/promises';
import path from 'path';
import { PodcastScript, ShortScript } from '../types';
import { buildPodcastVideoPath, buildShortVideoPath } from '../utils/filename.util';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function firstExisting(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

/**
 * True when the project already has the required videos on disk.
 * Used by batch resume to skip re-running generate.
 */
export async function projectHasReadyVideos(
  projectDir: string,
  shortRequired: boolean,
  longRequired = true,
): Promise<boolean> {
  const scriptPath = path.join(projectDir, 'script.json');
  if (!(await fileExists(scriptPath))) return false;

  const script = JSON.parse(await fs.readFile(scriptPath, 'utf-8')) as PodcastScript;

  if (longRequired) {
    const longPath = await firstExisting([
      buildPodcastVideoPath(projectDir, script.title),
      path.join(projectDir, 'final.mp4'),
      path.join(projectDir, 'podcast-video.mp4'),
    ]);
    if (!longPath) return false;
  }

  if (!shortRequired) return true;

  let shortTitle: string | undefined;
  const shortScriptPath = path.join(projectDir, 'short-script.json');
  if (await fileExists(shortScriptPath)) {
    const shortScript = JSON.parse(await fs.readFile(shortScriptPath, 'utf-8')) as ShortScript;
    shortTitle = shortScript.title;
  }

  const shortCandidates = [
    buildShortVideoPath(projectDir, script.title),
    path.join(projectDir, 'short.mp4'),
  ];
  if (shortTitle && shortTitle !== script.title) {
    shortCandidates.splice(1, 0, buildShortVideoPath(projectDir, shortTitle));
  }

  return (await firstExisting(shortCandidates)) !== null;
}

/** True when BATCH_GENERATE_FLAGS includes --short (CI short-only runs). */
export function isBatchShortOnly(): boolean {
  return /\b--short\b/.test(process.env.BATCH_GENERATE_FLAGS ?? '');
}

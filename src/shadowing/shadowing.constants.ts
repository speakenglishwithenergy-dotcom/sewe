import path from 'path';

export const SHADOWING_DIR = 'shadowing';
export const DEFAULTS_DIR = 'defaults';
export const WORKSPACES_DIR = 'workspaces';

export const DRAFT_FILE = 'draft.txt';
export const REVIEW_FILE = 'script.md';
export const SCRIPT_FILE = 'script.json';
export const WORKSPACE_META_FILE = 'workspace.json';

export const SHADOWING_OUTPUT_DIR = 'shadowing';
export const AUDIO_DIR_NAME = 'audio';
export const PODCAST_AUDIO_FILE = 'podcast.mp3';
export const SUBTITLES_FILE = 'subtitles.ass';
export const VIDEO_FILE = 'shadowing.mp4';

export const PROFILE_FILE = 'profile.yaml';

export const DEFAULT_MAX_WORDS_PER_LINE = 20;

export function getShadowingRoot(rootDir = process.cwd()): string {
  return path.join(rootDir, SHADOWING_DIR);
}

export function getDefaultsDir(rootDir = process.cwd()): string {
  return path.join(getShadowingRoot(rootDir), DEFAULTS_DIR);
}

export function getWorkspacesRoot(rootDir = process.cwd()): string {
  return path.join(getShadowingRoot(rootDir), WORKSPACES_DIR);
}

import path from 'path';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const DASHES = /[—–]/g;
export const VIDEO_OUTPUT_SUBDIR = 'videos';

/** Turn an episode title into a safe filesystem basename (no extension). */
export function sanitizeTitleForFilename(title: string, maxLength = 120): string {
  return title
    .normalize('NFKC')
    .replace(INVALID_FILENAME_CHARS, '')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, maxLength)
    .trim();
}

export function getVideoOutputDir(projectDir: string): string {
  return path.join(projectDir, VIDEO_OUTPUT_SUBDIR);
}

export function buildPodcastVideoPath(projectDir: string, title: string): string {
  return path.join(getVideoOutputDir(projectDir), `${sanitizeTitleForFilename(title)}.mp4`);
}

export function buildShortVideoPath(projectDir: string, shortTitle: string): string {
  return path.join(
    getVideoOutputDir(projectDir),
    `${sanitizeTitleForFilename(shortTitle)} - Short.mp4`,
  );
}

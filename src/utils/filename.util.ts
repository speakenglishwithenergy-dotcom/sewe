import path from 'path';

const DASHES = /[—–]/g;
export const VIDEO_OUTPUT_SUBDIR = 'videos';

/** Turn an episode title into a cross-platform slug basename (no extension). */
export function sanitizeTitleForFilename(title: string, maxLength = 80): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(DASHES, '-')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug.length <= maxLength) return slug;

  const trimmed = slug.slice(0, maxLength).replace(/-+$/g, '');
  return trimmed.length > 0 ? trimmed : 'video';
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
    `${sanitizeTitleForFilename(shortTitle)}-short.mp4`,
  );
}

import fs from 'fs/promises';
import path from 'path';
import {
  getImageDimensions,
  normalizePodcastThumbnail,
  scaleShortThumbnailToVideoSize,
  SHORT_THUMB_HEIGHT,
  SHORT_THUMB_WIDTH,
  YOUTUBE_THUMB_HEIGHT,
  YOUTUBE_THUMB_WIDTH,
} from './thumbnail-image.util';
import { logger } from '../utils/logger';
import { waitForEnter } from '../utils/wait-for-input';

export type ManualThumbnailKind = 'podcast' | 'short';

const TARGETS: Record<
  ManualThumbnailKind,
  { width: number; height: number; label: string; referenceFile: string }
> = {
  podcast: {
    width: YOUTUBE_THUMB_WIDTH,
    height: YOUTUBE_THUMB_HEIGHT,
    label: '16:9 podcast / YouTube thumbnail',
    referenceFile: 'demo-thumbnail.png',
  },
  short: {
    width: SHORT_THUMB_WIDTH,
    height: SHORT_THUMB_HEIGHT,
    label: '9:16 short-form thumbnail',
    referenceFile: 'demo-short-thumbnail.png',
  },
};

export function printManualThumbnailInstructions(
  kind: ManualThumbnailKind,
  outputPath: string,
  referencePath: string,
  prompt: string,
): void {
  const target = TARGETS[kind];
  const fileName = path.basename(outputPath);

  logger.divider('─');
  logger.info(`Manual thumbnail mode (${target.label})`);
  logger.divider('─');
  console.log(`
1. Open ChatGPT (https://chatgpt.com) — use image edit / upload reference + prompt.
2. Upload the reference template:
   ${referencePath}
3. Paste this prompt:

${prompt}

4. Download the generated image and save it as:
   ${outputPath}
   (filename must be exactly "${fileName}")

Recommended size: ${target.width}x${target.height} (${target.label}).
Other sizes are OK — the pipeline will normalize before rendering video.
`);
}

export async function waitForManualThumbnailFile(outputPath: string): Promise<void> {
  if (await fileExists(outputPath)) {
    logger.info(`Manual thumbnail already present → ${outputPath}`);
    return;
  }

  await waitForEnter(
    `\nSave the image to the path above, then press Enter to continue... `,
  );

  if (!(await fileExists(outputPath))) {
    throw new Error(
      `Thumbnail not found at ${outputPath}. Save the downloaded image there and re-run, or press Enter only after the file exists.`,
    );
  }
}

export async function normalizeManualThumbnail(
  kind: ManualThumbnailKind,
  outputPath: string,
): Promise<void> {
  const target = TARGETS[kind];
  const raw = await fs.readFile(outputPath);
  const before = await getImageDimensions(raw);

  logger.info(
    `Manual thumbnail detected → ${before.width}x${before.height} (target ${target.width}x${target.height})`,
  );

  const normalized =
    kind === 'short'
      ? await scaleShortThumbnailToVideoSize(raw)
      : await normalizePodcastThumbnail(raw);
  const after = await getImageDimensions(normalized);

  if (before.width !== after.width || before.height !== after.height) {
    logger.info(`Normalized manual thumbnail → ${after.width}x${after.height}`);
    await fs.writeFile(outputPath, normalized);
  } else {
    logger.info(`Manual thumbnail size OK — no resize needed`);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

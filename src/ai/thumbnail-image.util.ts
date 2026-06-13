import sharp from 'sharp';

/** YouTube recommended thumbnail size */
export const YOUTUBE_THUMB_WIDTH = 1280;
export const YOUTUBE_THUMB_HEIGHT = 720;

/** 16:9 content area inside gpt-image-1's fixed 1536x1024 (3:2) canvas */
export const API_CANVAS_WIDTH = 1536;
export const API_CANVAS_HEIGHT = 1024;
export const CONTENT_WIDTH = API_CANVAS_WIDTH;
export const CONTENT_HEIGHT = Math.round(CONTENT_WIDTH / (16 / 9)); // 864
export const CONTENT_TOP = Math.round((API_CANVAS_HEIGHT - CONTENT_HEIGHT) / 2); // 80

const LETTERBOX_BG = { r: 242, g: 244, b: 247 };

/**
 * Fit the 16:9 demo reference into gpt-image-1's 3:2 canvas so the model
 * does not stretch or crop the template during edit.
 */
export async function prepareReferenceImage(inputPath: string): Promise<Buffer> {
  return sharp(inputPath)
    .resize(CONTENT_WIDTH, CONTENT_HEIGHT, { fit: 'fill' })
    .extend({
      top: CONTENT_TOP,
      bottom: API_CANVAS_HEIGHT - CONTENT_HEIGHT - CONTENT_TOP,
      background: LETTERBOX_BG,
    })
    .png()
    .toBuffer();
}

/**
 * Crop the 16:9 content band from the API canvas and resize to YouTube size.
 */
export async function finalizeThumbnailImage(apiBuffer: Buffer): Promise<Buffer> {
  return sharp(apiBuffer)
    .extract({
      left: 0,
      top: CONTENT_TOP,
      width: CONTENT_WIDTH,
      height: CONTENT_HEIGHT,
    })
    .resize(YOUTUBE_THUMB_WIDTH, YOUTUBE_THUMB_HEIGHT)
    .png()
    .toBuffer();
}

export async function getImageDimensions(
  buffer: Buffer,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

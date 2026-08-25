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

/** Short-form vertical thumbnail size (9:16) */
export const SHORT_THUMB_WIDTH = 1080;
export const SHORT_THUMB_HEIGHT = 1920;

/** Portrait API canvas (2:3) for gpt-image-1 short thumbnails */
export const API_PORTRAIT_WIDTH = 1024;
export const API_PORTRAIT_HEIGHT = 1536;

/** 9:16 content area inside portrait 1024x1536 canvas */
export const SHORT_CONTENT_HEIGHT = API_PORTRAIT_HEIGHT;
export const SHORT_CONTENT_WIDTH = Math.round(SHORT_CONTENT_HEIGHT * (9 / 16)); // 864
export const SHORT_CONTENT_LEFT = Math.round((API_PORTRAIT_WIDTH - SHORT_CONTENT_WIDTH) / 2); // 80

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
 * Load a demo reference as PNG for Gemini (native 16:9 / 9:16 — no letterbox).
 */
export async function loadReferenceImagePng(inputPath: string): Promise<Buffer> {
  return sharp(inputPath).png().toBuffer();
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

/**
 * Fit the 9:16 demo reference into gpt-image-1's portrait 2:3 canvas so the model
 * does not stretch or crop the template during edit.
 */
export async function prepareShortReferenceImage(inputPath: string): Promise<Buffer> {
  return sharp(inputPath)
    .resize(SHORT_CONTENT_WIDTH, SHORT_CONTENT_HEIGHT, { fit: 'fill' })
    .extend({
      left: SHORT_CONTENT_LEFT,
      right: API_PORTRAIT_WIDTH - SHORT_CONTENT_WIDTH - SHORT_CONTENT_LEFT,
      background: LETTERBOX_BG,
    })
    .png()
    .toBuffer();
}

/**
 * Scale the full API canvas to short-form video size without cropping.
 */
export async function scaleShortThumbnailToVideoSize(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(SHORT_THUMB_WIDTH, SHORT_THUMB_HEIGHT, {
      fit: 'contain',
      background: LETTERBOX_BG,
    })
    .png()
    .toBuffer();
}

/** Normalize an arbitrary uploaded image to YouTube thumbnail size (16:9). */
export async function normalizePodcastThumbnail(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(YOUTUBE_THUMB_WIDTH, YOUTUBE_THUMB_HEIGHT, {
      fit: 'contain',
      background: LETTERBOX_BG,
    })
    .png()
    .toBuffer();
}

/**
 * Crop the 9:16 content band from the API canvas and resize to short-form size.
 * @deprecated Prefer scaleShortThumbnailToVideoSize to preserve the full image.
 */
export async function finalizeShortThumbnailImage(apiBuffer: Buffer): Promise<Buffer> {
  return sharp(apiBuffer)
    .extract({
      left: SHORT_CONTENT_LEFT,
      top: 0,
      width: SHORT_CONTENT_WIDTH,
      height: SHORT_CONTENT_HEIGHT,
    })
    .resize(SHORT_THUMB_WIDTH, SHORT_THUMB_HEIGHT)
    .png()
    .toBuffer();
}

export async function getImageDimensions(
  buffer: Buffer,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

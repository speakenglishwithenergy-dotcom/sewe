/** When true, skip OpenAI image generation and wait for a manually placed PNG. */
export const DISABLE_THUMBNAIL_GENERATION =
  process.env.DISABLE_THUMBNAIL_GENERATION === 'true' ||
  process.env.DISABLE_THUMBNAIL_GENERATION === '1';

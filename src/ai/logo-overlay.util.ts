import fs from 'fs/promises';
import sharp from 'sharp';

export type LogoAnchor =
  | 'top-left'
  | 'top-right'
  | 'top-center'
  | 'bottom-left'
  | 'bottom-right';

export interface LogoOverlayOptions {
  anchor: LogoAnchor;
  /** Logo width as a fraction of canvas width (default 0.2). */
  widthRatio?: number;
  /** Margin from edges as a fraction of the smaller canvas side (default 0.035). */
  marginRatio?: number;
  /**
   * Treat near-black pixels as transparent (circular logos on black squares).
   * Default true.
   */
  punchBlack?: boolean;
}

/**
 * Overlay the official channel logo onto a generated thumbnail.
 * Logo is never AI-redrawn — this is the pixel-perfect brand lock.
 */
export async function compositeChannelLogo(
  imageBuffer: Buffer,
  logoPath: string,
  options: LogoOverlayOptions,
): Promise<Buffer> {
  const widthRatio = options.widthRatio ?? 0.2;
  const marginRatio = options.marginRatio ?? 0.035;
  const punchBlack = options.punchBlack ?? true;

  const base = sharp(imageBuffer);
  const meta = await base.metadata();
  const canvasW = meta.width ?? 0;
  const canvasH = meta.height ?? 0;
  if (canvasW <= 0 || canvasH <= 0) {
    throw new Error('Cannot composite logo onto image with unknown dimensions');
  }

  const logoTargetW = Math.max(32, Math.round(canvasW * widthRatio));
  let logo = sharp(await fs.readFile(logoPath)).resize(logoTargetW, logoTargetW, {
    fit: 'inside',
    withoutEnlargement: false,
  });

  if (punchBlack) {
    logo = sharp(await punchNearBlackToTransparent(await logo.png().toBuffer()));
  }

  const logoMeta = await logo.metadata();
  const logoW = logoMeta.width ?? logoTargetW;
  const logoH = logoMeta.height ?? logoTargetW;
  const margin = Math.round(Math.min(canvasW, canvasH) * marginRatio);
  const { left, top } = anchorPosition(options.anchor, canvasW, canvasH, logoW, logoH, margin);

  return base
    .composite([{ input: await logo.png().toBuffer(), left, top }])
    .png()
    .toBuffer();
}

function anchorPosition(
  anchor: LogoAnchor,
  canvasW: number,
  canvasH: number,
  logoW: number,
  logoH: number,
  margin: number,
): { left: number; top: number } {
  switch (anchor) {
    case 'top-left':
      return { left: margin, top: margin };
    case 'top-center':
      return { left: Math.round((canvasW - logoW) / 2), top: margin };
    case 'top-right':
      return { left: canvasW - logoW - margin, top: margin };
    case 'bottom-left':
      return { left: margin, top: canvasH - logoH - margin };
    case 'bottom-right':
      return { left: canvasW - logoW - margin, top: canvasH - logoH - margin };
    default:
      return { left: canvasW - logoW - margin, top: margin };
  }
}

/** Convert near-black RGB pixels to fully transparent (keeps circular logos clean). */
async function punchNearBlackToTransparent(pngBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const threshold = 18;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= threshold && g <= threshold && b <= threshold) {
      data[i + 3] = 0;
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

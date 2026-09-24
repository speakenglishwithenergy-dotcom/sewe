import sharp from 'sharp';
import type { LogoAnchor } from './logo-overlay.util';

export interface LogoAnchorClearOptions {
  anchor: LogoAnchor;
  /** Logo width as fraction of canvas width (same as overlay). */
  widthRatio: number;
  /** Margin from edges as fraction of the smaller canvas side. */
  marginRatio?: number;
  /** Kept for API compat. */
  padRatio?: number;
  /** 'circle' for badge logos; 'rect' for wordmarks. */
  shape?: 'circle' | 'rect';
}

/**
 * Remove AI-painted logo placeholders (navy discs) near the logo corner.
 * Clone-stamps wood from the same scanline (preserves grain) onto navy pixels only.
 */
export async function clearLogoAnchorBackground(
  imageBuffer: Buffer,
  options: LogoAnchorClearOptions,
): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) return imageBuffer;

  const shape = options.shape ?? 'circle';
  if (shape === 'rect') {
    return clearRectWordmarkSlot(imageBuffer, options, width, height);
  }

  return sameRowCloneNavy(imageBuffer, options, width, height);
}

async function sameRowCloneNavy(
  imageBuffer: Buffer,
  options: LogoAnchorClearOptions,
  width: number,
  height: number,
): Promise<Buffer> {
  const logoW = Math.max(32, Math.round(width * options.widthRatio));
  // Scan desk corner large enough to catch oversized AI logo discs
  const span = Math.min(width, height, Math.round(Math.max(logoW * 3.5, Math.min(width, height) * 0.42)));
  const scan =
    options.anchor === 'bottom-left'
      ? { left: 0, top: height - span, right: span, bottom: height }
      : options.anchor === 'bottom-right'
        ? { left: width - span, top: height - span, right: width, bottom: height }
        : { left: 0, top: height - span, right: span, bottom: height };

  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const out = Buffer.from(data);

  const navyIdx: number[] = [];
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;

  for (let y = scan.top; y < scan.bottom; y++) {
    for (let x = scan.left; x < scan.right; x++) {
      const i = (y * width + x) * channels;
      if (!isPlaceholderNavy(data[i], data[i + 1], data[i + 2])) continue;
      navyIdx.push(y * width + x);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (navyIdx.length < Math.round(logoW * logoW * 0.45)) return imageBuffer;

  const discW = maxX - minX + 1;
  const sign = options.anchor.includes('left') ? 1 : -1;

  // Pick horizontal offset where same-row samples are mostly wood
  let bestOx = sign * (discW + 16);
  let bestScore = -1;
  for (let mag = Math.max(40, Math.round(discW * 0.6)); mag < discW + 280; mag += 12) {
    const ox = sign * mag;
    let wood = 0;
    let total = 0;
    for (let i = 0; i < navyIdx.length; i += 7) {
      const p = navyIdx[i]!;
      const x = p % width;
      const y = Math.floor(p / width);
      const sx = x + ox;
      if (sx < 0 || sx >= width) continue;
      total++;
      const si = (y * width + sx) * channels;
      if (isWoodTone(data[si], data[si + 1], data[si + 2])) wood++;
      if (isPlaceholderNavy(data[si], data[si + 1], data[si + 2])) wood -= 2;
    }
    const score = total > 0 ? wood / total : -1;
    if (score > bestScore) {
      bestScore = score;
      bestOx = ox;
    }
    if (bestScore > 0.7) break;
  }

  if (bestScore < 0.25) return imageBuffer;

  for (const p of navyIdx) {
    const x = p % width;
    const y = Math.floor(p / width);
    let sx = clamp(x + bestOx, 0, width - 1);
    // Walk further if source is still navy
    for (let t = 0; t < 10; t++) {
      const si = (y * width + sx) * channels;
      if (!isPlaceholderNavy(data[si], data[si + 1], data[si + 2])) break;
      sx = clamp(sx + sign * 20, 0, width - 1);
    }
    const si = (y * width + sx) * channels;
    const di = (y * width + x) * channels;
    // Prefer wood; if source isn't wood, use nearest wood on this row
    if (!isWoodTone(data[si], data[si + 1], data[si + 2])) {
      const woodX = findWoodOnRow(data, width, channels, y, sx, sign);
      if (woodX >= 0) {
        const wi = (y * width + woodX) * channels;
        out[di] = data[wi];
        out[di + 1] = data[wi + 1];
        out[di + 2] = data[wi + 2];
        continue;
      }
    }
    out[di] = data[si];
    out[di + 1] = data[si + 1];
    out[di + 2] = data[si + 2];
  }

  // Dilate: dark anti-aliased rim next to filled navy
  const rim: Array<[number, number]> = [];
  const navySet = new Set(navyIdx);
  for (const p of navyIdx) {
    const x = p % width;
    const y = Math.floor(p / width);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const np = ny * width + nx;
      if (navySet.has(np)) continue;
      const i = np * channels;
      // Dark fringe / leftover navy rim
      if (out[i] < 75 && out[i + 1] < 70 && out[i + 2] < 100) {
        rim.push([nx, ny]);
      }
    }
  }
  for (const [x, y] of rim) {
    let sx = clamp(x + bestOx, 0, width - 1);
    const woodX = findWoodOnRow(data, width, channels, y, sx, sign);
    if (woodX >= 0) sx = woodX;
    const si = (y * width + sx) * channels;
    const di = (y * width + x) * channels;
    out[di] = data[si];
    out[di + 1] = data[si + 1];
    out[di + 2] = data[si + 2];
  }

  return sharp(out, { raw: { width, height, channels } })
    .png()
    .toBuffer();
}

function findWoodOnRow(
  data: Buffer,
  width: number,
  channels: number,
  y: number,
  startX: number,
  sign: number,
): number {
  for (let step = 0; step < width; step += 4) {
    const x = clamp(startX + sign * step, 0, width - 1);
    const i = (y * width + x) * channels;
    if (isWoodTone(data[i], data[i + 1], data[i + 2])) return x;
    if (x === 0 || x === width - 1) break;
  }
  return -1;
}

async function clearRectWordmarkSlot(
  imageBuffer: Buffer,
  options: LogoAnchorClearOptions,
  width: number,
  height: number,
): Promise<Buffer> {
  const widthRatio = options.widthRatio;
  const marginRatio = options.marginRatio ?? 0.02;
  const padRatio = options.padRatio ?? 1.15;
  const logoW = Math.max(32, Math.round(width * widthRatio));
  const logoH = Math.max(24, Math.round(logoW * 0.38));
  const coverW = Math.round(logoW * padRatio);
  const coverH = Math.round(logoH * padRatio);
  const margin = Math.round(Math.min(width, height) * marginRatio);
  const { left: logoLeft, top: logoTop } = anchorPosition(
    options.anchor,
    width,
    height,
    logoW,
    logoH,
    margin,
  );
  const left = clamp(logoLeft - Math.round((coverW - logoW) / 2), 0, width - coverW);
  const top = clamp(logoTop - Math.round((coverH - logoH) / 2), 0, height - coverH);

  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;

  let bright = 0;
  let n = 0;
  for (let y = top; y < top + coverH; y += 2) {
    for (let x = left; x < left + coverW; x += 2) {
      const i = (y * width + x) * channels;
      n++;
      if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) bright++;
    }
  }
  if (n === 0 || bright / n < 0.12) return imageBuffer;

  const sW = Math.max(24, Math.round(coverW * 0.8));
  const sH = Math.max(24, Math.round(coverH * 0.8));
  const sampleLeft = clamp(width - coverW - sW - 16, 0, width - sW);
  const sampleTop = clamp(Math.round(height * 0.3), 0, height - sH);

  const patch = await sharp(imageBuffer)
    .extract({ left: sampleLeft, top: sampleTop, width: sW, height: sH })
    .resize(coverW, coverH, { fit: 'fill' })
    .png()
    .toBuffer();

  const maskSvg = Buffer.from(
    `<svg width="${coverW}" height="${coverH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${coverW}" height="${coverH}" rx="${Math.round(Math.min(coverW, coverH) * 0.1)}" fill="white"/>
    </svg>`,
  );
  const covered = await sharp(patch)
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer();

  return sharp(imageBuffer)
    .composite([{ input: covered, left, top }])
    .png()
    .toBuffer();
}

function isPlaceholderNavy(r: number, g: number, b: number): boolean {
  return r < 50 && g < 55 && b < 100 && b >= r - 2 && (b - Math.min(r, g) >= 6 || r + g + b < 70);
}

function isWoodTone(r: number, g: number, b: number): boolean {
  return r > 70 && g > 40 && b < 90 && r > b + 20 && g > b + 5 && r - g < 80;
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

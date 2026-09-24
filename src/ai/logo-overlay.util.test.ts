import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import path from 'path';
import { compositeChannelLogo } from './logo-overlay.util';

describe('compositeChannelLogo', () => {
  it('overlays the SEWE logo onto a blank 1280x720 canvas at top-right', async () => {
    const canvas = await sharp({
      create: {
        width: 1280,
        height: 720,
        channels: 3,
        background: { r: 30, g: 40, b: 60 },
      },
    })
      .png()
      .toBuffer();

    const logoPath = path.resolve(
      'channels/speak-english-with-energy/assets/sewe-logo.png',
    );

    const result = await compositeChannelLogo(canvas, logoPath, {
      anchor: 'top-right',
      widthRatio: 0.18,
    });

    const meta = await sharp(result).metadata();
    assert.equal(meta.width, 1280);
    assert.equal(meta.height, 720);

    // Crop top-right logo region and assert it is no longer flat navy
    const region = await sharp(result)
      .extract({ left: 1050, top: 20, width: 200, height: 200 })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let nonNavy = 0;
    const step = region.info.channels;
    for (let i = 0; i < region.data.length; i += step) {
      if (
        region.data[i] !== 30 ||
        region.data[i + 1] !== 40 ||
        region.data[i + 2] !== 60
      ) {
        nonNavy += 1;
      }
    }
    assert.ok(nonNavy > 500, `expected logo pixels in top-right (got ${nonNavy} non-navy)`);
  });
});

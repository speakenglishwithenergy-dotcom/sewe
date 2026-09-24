import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { compositeThumbnailHeadline, isPunchLine } from './headline-overlay.util';

describe('compositeThumbnailHeadline', () => {
  it('marks quoted lines as punch', () => {
    const lines = ['NEVER', 'SAY', '"I DON\'T KNOW"', 'IN INTERVIEWS'];
    assert.equal(isPunchLine(lines[2], 2, lines), true);
    assert.equal(isPunchLine(lines[0], 0, lines), false);
  });

  it('paints stacked headline text onto a blank podcast canvas', async () => {
    const canvas = await sharp({
      create: {
        width: 1280,
        height: 720,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .png()
      .toBuffer();

    const result = await compositeThumbnailHeadline(
      canvas,
      'NEVER\nSAY\n"I DON\'T KNOW"\nIN INTERVIEWS',
      'podcast',
    );

    const meta = await sharp(result).metadata();
    assert.equal(meta.width, 1280);
    assert.equal(meta.height, 720);

    const region = await sharp(result)
      .extract({ left: 40, top: 80, width: 480, height: 420 })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let darkPixels = 0;
    const step = region.info.channels;
    for (let i = 0; i < region.data.length; i += step) {
      if (region.data[i] < 40 && region.data[i + 2] < 80) darkPixels += 1;
    }
    assert.ok(darkPixels > 1000, `expected navy headline panel (got ${darkPixels} dark pixels)`);
  });
});

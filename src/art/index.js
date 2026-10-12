// The discs on offer. Every face is painted in code when the page loads; nothing is downloaded.
//   kind    which surface the disc shader uses under the art
//   inner   where the print (or, on records, the grooves) begins, mm from the centre
//   outer   where the print ends
//   shadow  how dark a shadow the disc throws on the page
//   tilt    the lean of its thumbnail in the dock, degrees
import { preview } from './kit.js';
import { paintStickers, paintStickersBase } from './stickers.js';
import { paintGolden, previewGolden } from './golden.js';
import { paintRose, previewRose } from './rose.js';
import { paintSwirl, previewSwirl } from './swirl.js';

export function makeDiscs() {
  const stickers = paintStickers();
  return [
    {
      slug: 'stickers', name: '스티커 범벅', kind: 'holo', inner: 16.2, outer: 59.1, shadow: 0.25, tilt: -4,
      art: stickers,
      thumb: preview(128, (g) => {
        paintStickersBase(g);
        g.drawImage(stickers, -60, -60, 120, 120);
      }),
    },
    {
      slug: 'golden', name: '금빛 판각', kind: 'gold', inner: 20, outer: 58, shadow: 0.24, tilt: 5,
      art: paintGolden(), relief: true,
      thumb: preview(128, previewGolden),
    },
    {
      slug: 'rose', name: '벨벳 장미', kind: 'vinyl', inner: 23.4, outer: 59.1, shadow: 0.3, tilt: -3,
      art: paintRose(),
      thumb: preview(128, previewRose),
    },
    {
      slug: 'swirl', name: '흘린 잉크', kind: 'print', inner: 20, outer: 58, shadow: 0.2, tilt: 6,
      art: paintSwirl(),
      thumb: preview(128, previewSwirl),
    },
  ];
}

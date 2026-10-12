// Face 4: marbled paint, printed edge to edge. A plane is folded over itself a few times with
// sines, and the folded coordinate is read through a striped palette, so the stripes come out as
// ribbons that pool and curl like poured ink.
import { SIZE } from './kit.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// position along the stripe cycle, colour
const RIBBON = [
  [0.0, '#060a2e'],
  [0.1, '#0f2fd0'],
  [0.2, '#59b0ff'],
  [0.27, '#fff6e6'],
  [0.34, '#ffb23d'],
  [0.44, '#f2331f'],
  [0.56, '#a30f2c'],
  [0.66, '#2a0b3f'],
  [0.76, '#7a25d8'],
  [0.84, '#ff66c4'],
  [0.9, '#fff0f6'],
  [0.96, '#1a1f8a'],
  [1.0, '#060a2e'],
].map(([t, c]) => [t, hex(c)]);

function ribbon(t, out) {
  t -= Math.floor(t);
  let i = 0;
  while (t > RIBBON[i + 1][0]) i++;
  const [t0, a] = RIBBON[i];
  const [t1, b] = RIBBON[i + 1];
  let k = (t - t0) / (t1 - t0);
  k = k * k * (3 - 2 * k);
  out[0] = a[0] + (b[0] - a[0]) * k;
  out[1] = a[1] + (b[1] - a[1]) * k;
  out[2] = a[2] + (b[2] - a[2]) * k;
}

function marble(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  const px = img.data;
  const rgb = [0, 0, 0];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i / n) * 2 - 1;
      const y = (j / n) * 2 - 1;
      // fold
      let ax = x * 1.55 + 0.3;
      let ay = y * 1.55 - 0.2;
      for (let k = 1; k <= 5; k++) {
        const nx = ax + (0.62 / k) * Math.sin(k * 1.9 * ay + 1.3 * k);
        const ny = ay + (0.58 / k) * Math.cos(k * 1.7 * ax + 0.7 * k + 0.9);
        ax = nx;
        ay = ny;
      }
      const t = 0.62 * ax + 0.5 * ay + 0.22 * Math.sin(2.2 * ax - 1.4 * ay);
      ribbon(t * 0.72 + 0.11, rgb);
      // a wet gloss along the crests of the folds
      const crest = Math.pow(0.5 + 0.5 * Math.sin(6.0 * t + 2.0 * ax), 14);
      const o = (j * n + i) * 4;
      px[o] = rgb[0] + (255 - rgb[0]) * crest * 0.35;
      px[o + 1] = rgb[1] + (255 - rgb[1]) * crest * 0.35;
      px[o + 2] = rgb[2] + (255 - rgb[2]) * crest * 0.35;
      px[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

let small = null;
const marbled = () => (small ??= marble(896));

export function paintSwirl() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(marbled(), 0, 0, SIZE, SIZE);
  return c;
}

export function previewSwirl(g) {
  g.drawImage(marbled(), -60, -60, 120, 120);
}

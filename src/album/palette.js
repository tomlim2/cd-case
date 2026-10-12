// Colour. A palette is five roles: the paper it is printed on (bg), the ink text is set in (ink),
// and three colours to draw with (a, b, c).

// [bg, ink, a, b, c]
const SETS = [
  ['#f4efe6', '#1d1d1b', '#e4572e', '#2e86ab', '#f3a712'],
  ['#0e1116', '#f2f2f2', '#ff4d6d', '#4cc9f0', '#ffd166'],
  ['#efe9f4', '#231942', '#5e548e', '#e0b1cb', '#be95c4'],
  ['#f7f3e3', '#2f3e46', '#84a98c', '#bc4749', '#cad2c5'],
  ['#101820', '#f0f0f0', '#fee715', '#ff6b35', '#00a8e8'],
  ['#fdf0d5', '#003049', '#c1121f', '#669bbc', '#780000'],
  ['#eaf4f4', '#1b4332', '#40916c', '#ffb703', '#95d5b2'],
  ['#fff1e6', '#3d405b', '#e07a5f', '#81b29a', '#f2cc8f'],
  ['#0b132b', '#eef0f2', '#5bc0be', '#ff9f1c', '#6fffe9'],
  ['#f8f9fa', '#212529', '#e63946', '#457b9d', '#a8dadc'],
  ['#1a1423', '#f2e9e4', '#b75d69', '#eacdc2', '#774c60'],
  ['#fefae0', '#283618', '#bc6c25', '#606c38', '#dda15e'],
  ['#e0fbfc', '#293241', '#ee6c4d', '#3d5a80', '#98c1d9'],
  ['#ffe5ec', '#590d22', '#ff4d6d', '#c9184a', '#ff8fa3'],
  ['#161a1d', '#f5f3f4', '#e5383b', '#b1a7a6', '#ffffff'],
  ['#f0ead2', '#3a3a2e', '#6c584c', '#adc178', '#a98467'],
  ['#03045e', '#caf0f8', '#00b4d8', '#ff6d00', '#90e0ef'],
  ['#fbf8cc', '#22223b', '#f15bb5', '#00bbf9', '#00f5d4'],
  ['#2b2d42', '#edf2f4', '#ef233c', '#ffd60a', '#8d99ae'],
  ['#f6f1f1', '#0b2447', '#576cbc', '#19376d', '#a5d7e8'],
  ['#fffcf2', '#252422', '#eb5e28', '#403d39', '#ccc5b9'],
  ['#10002b', '#e0aaff', '#7b2cbf', '#ff9e00', '#c77dff'],
  ['#edf6f9', '#006d77', '#e29578', '#83c5be', '#ffddd2'],
  ['#fff8e8', '#2d3142', '#ef8354', '#4f5d75', '#bfc0c0'],
];

export const toRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
export const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};
// how light a colour looks, 0..1
export const light = (hex) => {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const alpha = (hex, a) => `rgba(${toRgb(hex).join(',')},${a})`;
// black or white, whichever reads on it
export const inkOn = (hex) => (light(hex) > 0.32 ? '#141416' : '#f6f4ef');

function roles([bg, ink, a, b, c]) {
  return { bg, ink, a, b, c, dark: light(bg) < 0.2, list: [bg, ink, a, b, c] };
}

export function seedPalette(R) {
  const set = [...R.pick(SETS)];
  // now and then, the same colours with the drawing colours changing places
  if (R.chance(0.4)) [set[2], set[3]] = [set[3], set[2]];
  if (R.chance(0.25)) [set[3], set[4]] = [set[4], set[3]];
  return roles(set);
}

// A palette out of a picture: boil it down to a handful of colours and hand out the roles.
export function imagePalette(image) {
  const n = 24;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0, n, n);
  const px = g.getImageData(0, 0, n, n).data;
  // bucket by coarse colour, keep each bucket's mean and count
  const buckets = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const key = (px[i] >> 5) * 64 + (px[i + 1] >> 5) * 8 + (px[i + 2] >> 5);
    const b = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
    b.r += px[i];
    b.g += px[i + 1];
    b.b += px[i + 2];
    b.n++;
    buckets.set(key, b);
  }
  const found = [...buckets.values()]
    .map((b) => {
      const rgb = [b.r / b.n, b.g / b.n, b.b / b.n];
      const max = Math.max(...rgb);
      const min = Math.min(...rgb);
      return { hex: toHex(rgb), share: b.n / (n * n), vivid: max ? (max - min) / max : 0 };
    })
    .sort((x, y) => y.share - x.share);
  // the paper: the commonest colour; drawing colours: the most vivid ones that are not close to it
  const bg = found[0].hex;
  const far = (x, y) => {
    const p = toRgb(x);
    const q = toRgb(y);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  };
  const picks = [];
  for (const f of [...found].sort((x, y) => y.vivid * Math.sqrt(y.share) - x.vivid * Math.sqrt(x.share))) {
    if (far(f.hex, bg) < 60 || picks.some((p) => far(p, f.hex) < 60)) continue;
    picks.push(f.hex);
    if (picks.length === 3) break;
  }
  const ink = inkOn(bg);
  while (picks.length < 3) picks.push(mix(bg, ink, 0.35 + 0.2 * picks.length));
  return roles([bg, ink, ...picks]);
}

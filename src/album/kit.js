// Small canvas helpers shared by everything that paints a printed face.

export function sheet(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { c, g };
}

const ramp = (grad, stops) => {
  stops.forEach((s, i) => (Array.isArray(s) ? grad.addColorStop(s[0], s[1]) : grad.addColorStop(i / (stops.length - 1), s)));
  return grad;
};
export const lin = (g, x0, y0, x1, y1, stops) => ramp(g.createLinearGradient(x0, y0, x1, y1), stops);
export const rad = (g, x, y, r0, r1, stops) => ramp(g.createRadialGradient(x, y, r0, x, y, r1), stops);

export function disc(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// A little tooth, like ink on uncoated stock: a tile of noise laid over the whole face.
let tile = null;
export function grain(g, size, amount = 0.08) {
  if (!tile) {
    tile = document.createElement('canvas');
    tile.width = tile.height = 160;
    const t = tile.getContext('2d');
    const img = t.createImageData(160, 160);
    // a fixed scramble, not Math.random, so a seed always prints the same
    let s = 1234567;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const v = (s >>> 24) & 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    t.putImageData(img, 0, 0);
  }
  g.save();
  g.globalAlpha = amount;
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = g.createPattern(tile, 'repeat');
  g.fillRect(0, 0, size, size);
  g.restore();
}

/* ---- type ---- */

export const FONTS = {
  // name: [weight and style, family]
  grotesk: ['700', '"Helvetica Neue", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", Arial, sans-serif'],
  light: ['300', '"Helvetica Neue", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", Arial, sans-serif'],
  black: ['900', '"Arial Black", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif'],
  serif: ['italic 600', 'Georgia, "AppleMyungjo", "Nanum Myeongjo", "Noto Serif KR", serif'],
  mono: ['500', '"SF Mono", Menlo, Consolas, "Apple SD Gothic Neo", "Noto Sans KR", monospace'],
};
export const font = (name, px) => `${FONTS[name][0]} ${px}px ${FONTS[name][1]}`;

// break text into lines no wider than `width` at the current font; a single long word is left whole
export function wrap(g, text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const tryLine = line ? `${line} ${w}` : w;
    if (line && g.measureText(tryLine).width > width) {
      lines.push(line);
      line = w;
    } else {
      line = tryLine;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// Set text in a box: the largest size (up to `max`) at which it wraps into at most `rows` lines
// that all fit the width. Returns { size, lines } with the font left set.
export function fit(g, text, face, width, max, rows = 2, min = 8) {
  let size = max;
  let lines = [text];
  for (; size >= min; size *= 0.93) {
    g.font = font(face, size);
    lines = wrap(g, text, width);
    if (lines.length <= rows && lines.every((l) => g.measureText(l).width <= width)) break;
  }
  return { size, lines };
}

// one line, ellipsised if it will not fit
export function clip(g, text, width) {
  if (g.measureText(text).width <= width) return text;
  let t = String(text);
  while (t.length > 1 && g.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// Text set round a circle centred on (cx, cy): `at` is the angle of its middle (0 = right,
// clockwise as the canvas has it), and the letters stand with their feet toward the centre unless
// `flip`, when they hang head down so that text along the bottom still reads left to right.
export function arcText(g, text, cx, cy, radius, at, { flip = false, tracking = 0 } = {}) {
  const chars = [...String(text)];
  const widths = chars.map((ch) => g.measureText(ch).width + tracking);
  const span = widths.reduce((a, b) => a + b, 0);
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let run = -span / 2;
  chars.forEach((ch, i) => {
    const mid = run + widths[i] / 2;
    run += widths[i];
    const a = at + ((flip ? -1 : 1) * mid) / radius;
    g.save();
    g.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    g.rotate(a + (flip ? -Math.PI / 2 : Math.PI / 2));
    g.fillText(ch, 0, 0);
    g.restore();
  });
  g.restore();
  return span / radius; // the angle it took up
}

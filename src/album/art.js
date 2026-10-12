// Cover art. Seven ways of filling a square, each driven by the seed's random stream and palette.
// These draw the picture only; the lettering goes on afterwards (faces.js).
import { lin, rad, disc, grain } from './kit.js';
import { mix, alpha, light, toRgb } from './palette.js';

const TAU = Math.PI * 2;

/* 1. aura: soft lights drifting over a ground, and one hard-edged thing for the eye to hold */
function aura(g, S, R, p) {
  g.fillStyle = p.bg;
  g.fillRect(0, 0, S, S);
  const cols = R.shuffle([p.a, p.b, p.c, p.a, p.b]);
  for (let i = 0; i < 7; i++) {
    const x = R.range(-0.1, 1.1) * S;
    const y = R.range(-0.1, 1.1) * S;
    const r = R.range(0.28, 0.62) * S;
    g.fillStyle = rad(g, x, y, 0, r, [alpha(cols[i % cols.length], 0.85), alpha(cols[i % cols.length], 0.35), alpha(cols[i % cols.length], 0)]);
    g.fillRect(0, 0, S, S);
  }
  // a small sun, or a ring, or a bar
  const x = R.range(0.25, 0.75) * S;
  const y = R.range(0.25, 0.75) * S;
  const kind = R.int(3);
  g.fillStyle = p.dark ? '#ffffff' : p.ink;
  g.strokeStyle = g.fillStyle;
  if (kind === 0) disc(g, x, y, R.range(0.03, 0.07) * S);
  else if (kind === 1) {
    g.lineWidth = S * 0.006;
    g.beginPath();
    g.arc(x, y, R.range(0.1, 0.22) * S, 0, TAU);
    g.stroke();
  } else g.fillRect(x - S * 0.16, y, S * 0.32, S * 0.008);
  grain(g, S, 0.16);
}

/* 2. marble: the plane folded over itself with sines, read through a striped ribbon of colour */
function marble(g, S, R, p) {
  const n = 384;
  const small = document.createElement('canvas');
  small.width = small.height = n;
  const sg = small.getContext('2d');
  const img = sg.createImageData(n, n);
  const ribbon = [p.bg, p.a, mix(p.a, '#ffffff', 0.7), p.b, p.ink, p.c, mix(p.c, '#ffffff', 0.6), p.bg].map(toRgb);
  const ph = Array.from({ length: 12 }, () => R.range(0, TAU));
  const zoom = R.range(1.2, 1.9);
  const twist = R.range(0.45, 0.7);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let ax = ((i / n) * 2 - 1) * zoom;
      let ay = ((j / n) * 2 - 1) * zoom;
      for (let k = 1; k <= 5; k++) {
        const nx = ax + (twist / k) * Math.sin(k * 1.9 * ay + ph[k]);
        const ny = ay + (twist / k) * Math.cos(k * 1.7 * ax + ph[k + 5]);
        ax = nx;
        ay = ny;
      }
      let t = (0.6 * ax + 0.5 * ay + 0.22 * Math.sin(2.2 * ax - 1.4 * ay)) * 0.6 + ph[11];
      t = (t - Math.floor(t)) * (ribbon.length - 1);
      const k = Math.floor(t);
      let f = t - k;
      f = f * f * (3 - 2 * f);
      const a = ribbon[k];
      const b = ribbon[k + 1];
      const o = (j * n + i) * 4;
      img.data[o] = a[0] + (b[0] - a[0]) * f;
      img.data[o + 1] = a[1] + (b[1] - a[1]) * f;
      img.data[o + 2] = a[2] + (b[2] - a[2]) * f;
      img.data[o + 3] = 255;
    }
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, S, S);
  grain(g, S, 0.08);
}

/* 3. riso: a grid of plain shapes in two or three spot inks, overprinted and a little off register */
function riso(g, S, R, p) {
  g.fillStyle = p.bg;
  g.fillRect(0, 0, S, S);
  const n = R.pick([3, 3, 4, 5]);
  const cell = S / n;
  const inks = R.shuffle([p.a, p.b, p.c]);
  g.save();
  g.globalCompositeOperation = p.dark ? 'screen' : 'multiply';
  const tile = (ink, shift) => {
    g.fillStyle = ink;
    g.strokeStyle = ink;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (R.chance(0.28)) continue;
        const x = i * cell + shift;
        const y = j * cell + shift;
        const kind = R.int(7);
        g.save();
        g.beginPath();
        g.rect(x, y, cell, cell);
        g.clip();
        if (kind === 0) disc(g, x + cell / 2, y + cell / 2, cell * 0.46);
        else if (kind === 1) {
          // a quarter circle out of one corner
          const cx = x + (R.chance(0.5) ? 0 : cell);
          const cy = y + (R.chance(0.5) ? 0 : cell);
          disc(g, cx, cy, cell);
        } else if (kind === 2) {
          const up = R.chance(0.5);
          g.beginPath();
          g.arc(x + cell / 2, y + (up ? cell : 0), cell / 2, 0, TAU);
          g.fill();
        } else if (kind === 3) {
          g.lineWidth = cell * 0.08;
          for (let k = 0; k < 5; k++) {
            g.beginPath();
            g.moveTo(x, y + cell * (0.1 + k * 0.2));
            g.lineTo(x + cell, y + cell * (0.1 + k * 0.2));
            g.stroke();
          }
        } else if (kind === 4) {
          g.beginPath();
          g.moveTo(x, y + cell);
          g.lineTo(x + cell, y + cell);
          g.lineTo(R.chance(0.5) ? x : x + cell, y);
          g.fill();
        } else if (kind === 5) {
          for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) disc(g, x + cell * (0.125 + a * 0.25), y + cell * (0.125 + b * 0.25), cell * 0.07);
        } else {
          g.lineWidth = cell * 0.07;
          for (let k = 1; k <= 3; k++) {
            g.beginPath();
            g.arc(x, y + cell, cell * k * 0.3, 0, TAU);
            g.stroke();
          }
        }
        g.restore();
      }
    }
  };
  const off = S * 0.006;
  tile(inks[0], 0);
  tile(inks[1], off);
  if (R.chance(0.6)) tile(inks[2], -off);
  g.restore();
  grain(g, S, 0.2);
}

/* 4. orbit: rings round an off-centre point, cut by a horizon, with a small moon */
function orbit(g, S, R, p) {
  g.fillStyle = lin(g, 0, 0, 0, S, [p.bg, mix(p.bg, p.a, 0.25)]);
  g.fillRect(0, 0, S, S);
  const cx = R.range(0.3, 0.7) * S;
  const cy = R.range(0.3, 0.6) * S;
  const rings = 5 + R.int(7);
  const big = R.range(0.34, 0.5) * S;
  const cols = R.shuffle([p.a, p.b, p.c]);
  for (let i = 0; i < rings; i++) {
    g.fillStyle = i % 2 ? p.bg : cols[(i >> 1) % cols.length];
    disc(g, cx, cy, big * (1 - i / rings));
  }
  // the horizon: everything below it is a flat field, striped where the rings would have been
  const h = cy + R.range(0.08, 0.3) * S;
  g.fillStyle = p.dark ? mix(p.bg, '#000000', 0.35) : mix(p.bg, p.ink, 0.86);
  g.fillRect(0, h, S, S - h);
  g.fillStyle = alpha(cols[0], 0.9);
  for (let i = 0; i < 9; i++) {
    const y = h + (S - h) * Math.pow(i / 9, 1.6);
    g.fillRect(cx - big * (1 - i * 0.07), y, big * 2 * (1 - i * 0.07), Math.max(2, (S - h) * 0.012 * (i + 1)));
  }
  g.fillStyle = p.dark ? '#ffffff' : cols[1];
  disc(g, R.range(0.12, 0.88) * S, R.range(0.1, 0.3) * S, S * R.range(0.015, 0.035));
  grain(g, S, 0.14);
}

/* 5. contour: a few soft hills, drawn as the lines a map would give them */
function contour(g, S, R, p) {
  g.fillStyle = p.bg;
  g.fillRect(0, 0, S, S);
  const hills = Array.from({ length: 5 + R.int(3) }, () => ({ x: R.range(0, 1), y: R.range(0, 1), w: R.range(0.14, 0.34), h: R.range(-1, 1.4) }));
  const height = (x, y) => hills.reduce((sum, k) => sum + k.h * Math.exp(-((x - k.x) ** 2 + (y - k.y) ** 2) / (2 * k.w * k.w)), 0);
  const n = 120;
  const field = new Float32Array((n + 1) * (n + 1));
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const v = height(i / n, j / n);
      field[j * (n + 1) + i] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  // a wash of colour under the lines, heavier on the high ground
  const peak = hills.reduce((best, k) => (k.h > best.h ? k : best), hills[0]);
  g.fillStyle = rad(g, peak.x * S, peak.y * S, 0, S * 0.6, [alpha(p.a, 0.9), alpha(p.b, 0.35), alpha(p.b, 0)]);
  g.fillRect(0, 0, S, S);
  // marching squares, one level at a time
  const levels = 16;
  const at = (i, j) => field[j * (n + 1) + i];
  const cross = (a, b, level) => (level - a) / (b - a);
  g.strokeStyle = p.ink;
  for (let l = 1; l < levels; l++) {
    const level = lo + ((hi - lo) * l) / levels;
    g.lineWidth = S * (l % 4 === 0 ? 0.0042 : 0.0022);
    g.beginPath();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i + 1, j + 1);
        const d = at(i, j + 1);
        const pts = [];
        if (a < level !== b < level) pts.push([i + cross(a, b, level), j]);
        if (b < level !== c < level) pts.push([i + 1, j + cross(b, c, level)]);
        if (d < level !== c < level) pts.push([i + cross(d, c, level), j + 1]);
        if (a < level !== d < level) pts.push([i, j + cross(a, d, level)]);
        for (let k = 0; k + 1 < pts.length; k += 2) {
          g.moveTo((pts[k][0] / n) * S, (pts[k][1] / n) * S);
          g.lineTo((pts[k + 1][0] / n) * S, (pts[k + 1][1] / n) * S);
        }
      }
    }
    g.stroke();
  }
  // a survey mark on the summit
  g.fillStyle = p.c;
  disc(g, peak.x * S, peak.y * S, S * 0.012);
  grain(g, S, 0.12);
}

/* 6. bloom: a flower from above, petal by petal from the outside in */
function bloom(g, S, R, p) {
  const ground = p.dark ? p.bg : mix(p.ink, p.bg, 0.06);
  g.fillStyle = ground;
  g.fillRect(0, 0, S, S);
  const petal = R.pick([p.a, p.b, p.c].filter((c) => light(c) > 0.08 && light(c) < 0.75)) || p.a;
  const deep = mix(petal, '#12020a', 0.82);
  const lip = mix(petal, '#ffffff', 0.45);
  const golden = 2.399963;
  const layers = 9 + R.int(4);
  const spin = R.range(0, TAU);
  const big = S * R.range(0.4, 0.47);
  const radius = (L) => big * Math.pow(1 - L / (layers - 1), 1.3) + S * 0.035;
  g.save();
  g.translate(S / 2, S / 2);
  let k = 0;
  for (let L = 0; L < layers; L++) {
    const f = L / (layers - 1);
    const Rr = radius(L);
    const inner = L < layers - 1 ? radius(L + 1) : 0;
    const count = L < 2 ? 5 : L < 7 ? 4 : 3;
    const wide = 0.72 + f * 0.8;
    for (let i = 0; i < count; i++) {
      const a = spin + k * golden + L * 0.37;
      k++;
      const reach = Rr * R.range(0.93, 1.06);
      const w = wide * R.range(0.9, 1.1);
      const dip = R.range(0.04, 0.11);
      g.beginPath();
      g.moveTo(Math.cos(a - w * 0.5) * reach * 0.12, Math.sin(a - w * 0.5) * reach * 0.12);
      for (let s = 0; s <= 28; s++) {
        const t = (s / 28) * 2 - 1;
        const r = reach * (1 - Math.pow(Math.abs(t), 3) * 0.45) * (1 - dip * Math.exp(-t * t * 9));
        g.lineTo(Math.cos(a + t * w) * r, Math.sin(a + t * w) * r);
      }
      g.closePath();
      g.save();
      g.shadowColor = alpha(mix(deep, '#000000', 0.5), 0.9);
      g.shadowBlur = S * (0.036 - f * 0.018);
      g.shadowOffsetX = S * 0.004;
      g.shadowOffsetY = S * 0.006;
      g.fillStyle = rad(g, 0, 0, inner * 0.82, reach, [
        [0, deep],
        [0.3, mix(deep, petal, 0.45)],
        [0.72, petal],
        [0.94, mix(petal, lip, 0.5)],
        [1, lip],
      ]);
      g.fill();
      g.restore();
      g.strokeStyle = alpha(lip, 0.5);
      g.lineWidth = S * 0.0018;
      g.stroke();
    }
  }
  g.restore();
  // one light for the whole flower
  g.fillStyle = lin(g, S * 0.15, S * 0.1, S * 0.85, S * 0.9, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.3)']);
  g.fillRect(0, 0, S, S);
  grain(g, S, 0.1);
}

/* 7. bands: the plainest sleeve there is. Stripes, one of them broken by a circle */
function bands(g, S, R, p) {
  g.fillStyle = p.bg;
  g.fillRect(0, 0, S, S);
  const cols = R.shuffle([p.a, p.b, p.c, p.ink]);
  const upright = R.chance(0.5);
  const n = 4 + R.int(5);
  let at = R.range(0.08, 0.2) * S;
  g.save();
  if (upright) {
    g.translate(S, 0);
    g.rotate(Math.PI / 2);
  }
  for (let i = 0; i < n && at < S * 0.92; i++) {
    const w = R.range(0.03, 0.14) * S;
    g.fillStyle = cols[i % cols.length];
    g.fillRect(0, at, S, w);
    at += w + R.range(0.015, 0.07) * S;
  }
  g.restore();
  const r = R.range(0.16, 0.3) * S;
  const x = R.range(0.3, 0.7) * S;
  const y = R.range(0.3, 0.7) * S;
  g.fillStyle = p.bg;
  disc(g, x, y, r * 1.12);
  g.fillStyle = cols[0];
  disc(g, x, y, r);
  g.fillStyle = p.bg;
  disc(g, x + r * 0.3, y - r * 0.3, r * 0.22);
  grain(g, S, 0.14);
}

/* a picture the visitor brought, filling the square */
function photo(g, S, image) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const side = Math.min(w, h);
  g.imageSmoothingQuality = 'high';
  g.drawImage(image, (w - side) / 2, (h - side) / 2, side, side, 0, 0, S, S);
}

const STYLES = { aura, marble, riso, orbit, contour, bloom, bands };
export const pickStyle = (R) => R.weighted({ aura: 3, marble: 3, riso: 3, orbit: 2.5, contour: 2.5, bloom: 1.5, bands: 2.5 });

export function drawArt(g, S, { style, image }, R, palette) {
  if (image) photo(g, S, image);
  else STYLES[style](g, S, R, palette);
}

// just the lines of the hills, for engraving: strokes only, in whatever style is current
export function engraveContours(g, cx, cy, radius, R) {
  const hills = Array.from({ length: 5 }, () => ({ x: R.range(-0.7, 0.7), y: R.range(-0.7, 0.7), w: R.range(0.2, 0.42), h: R.range(0.4, 1.4) }));
  const height = (x, y) => hills.reduce((sum, k) => sum + k.h * Math.exp(-((x - k.x) ** 2 + (y - k.y) ** 2) / (2 * k.w * k.w)), 0);
  const n = 96;
  const v = (i, j) => height((i / n) * 2 - 1, (j / n) * 2 - 1);
  const field = new Float32Array((n + 1) * (n + 1));
  let hi = 0;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) hi = Math.max(hi, (field[j * (n + 1) + i] = v(i, j)));
  const at = (i, j) => field[j * (n + 1) + i];
  const cross = (a, b, level) => (level - a) / (b - a);
  const px = (u) => (u / n) * 2 - 1;
  for (let l = 1; l < 9; l++) {
    const level = (hi * l) / 9;
    g.beginPath();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i + 1, j + 1);
        const d = at(i, j + 1);
        const pts = [];
        if (a < level !== b < level) pts.push([i + cross(a, b, level), j]);
        if (b < level !== c < level) pts.push([i + 1, j + cross(b, c, level)]);
        if (d < level !== c < level) pts.push([i + cross(d, c, level), j + 1]);
        if (a < level !== d < level) pts.push([i, j + cross(a, d, level)]);
        for (let k = 0; k + 1 < pts.length; k += 2) {
          g.moveTo(cx + px(pts[k][0]) * radius, cy + px(pts[k][1]) * radius);
          g.lineTo(cx + px(pts[k + 1][0]) * radius, cy + px(pts[k + 1][1]) * radius);
        }
      }
    }
    g.stroke();
  }
}

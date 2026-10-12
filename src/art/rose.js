// Face 3: a red rose seen from above, printed on black vinyl. Painted petal by petal from the
// outside in, each one shading the ones beneath it. Transparent where the bare record shows.
import { board, lin, rad } from './kit.js';

const TAU = Math.PI * 2;
const GOLDEN = 2.399963; // the angle leaves and petals turn by from one to the next

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One petal: a fan from the heart of the flower out to radius R, spanning `wide` radians either
// side of angle a. Its lip is not round: it dips in the middle, and the shoulders fall away.
function petalPath(a, R, wide, rnd) {
  const p = new Path2D();
  const n = 30;
  const dip = 0.04 + rnd() * 0.07;
  const lean = (rnd() - 0.5) * 0.3;
  const root = R * 0.12;
  p.moveTo(Math.cos(a - wide * 0.5) * root, Math.sin(a - wide * 0.5) * root);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * 2 - 1; // -1 .. 1 across the lip
    const ang = a + t * wide;
    const shoulder = 1 - Math.pow(Math.abs(t), 3.0) * 0.45;
    const r = R * shoulder * (1 - dip * Math.exp(-t * t * 9) + lean * t * 0.12);
    p.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
  }
  p.lineTo(Math.cos(a + wide * 0.5) * root, Math.sin(a + wide * 0.5) * root);
  p.closePath();
  return p;
}

export function drawRose(g, scale = 1) {
  const rnd = seeded(11);
  const px = (g.canvas.width / 120) * scale; // device pixels per millimetre, for shadows
  g.save();
  g.scale(scale, scale);
  g.rotate(-0.35);
  const layers = 11;
  const radius = (L) => 53 * Math.pow(1 - L / (layers - 1), 1.3) + 4.6;
  let k = 0;
  for (let L = 0; L < layers; L++) {
    const f = L / (layers - 1); // 0 = outermost, 1 = the bud
    const R = radius(L);
    const inner = L < layers - 1 ? radius(L + 1) : 0;
    const count = L < 2 ? 5 : L < 7 ? 4 : 3;
    const wide = 0.72 + f * 0.8; // inner petals wrap further round
    for (let i = 0; i < count; i++) {
      const a = k * GOLDEN + L * 0.37;
      k++;
      const reach = R * (0.93 + rnd() * 0.13);
      const path = petalPath(a, reach, wide * (0.9 + rnd() * 0.2), rnd);

      // Only the band between this layer's lip and the next layer's stays in sight. Across that band
      // the petal comes up out of the shadow of the ones above it, and its lip curls into the light.
      g.save();
      g.shadowColor = 'rgba(22, 0, 4, 0.92)';
      g.shadowBlur = (4.6 - f * 2.4) * px;
      g.shadowOffsetX = 0.5 * px;
      g.shadowOffsetY = 0.7 * px;
      const from = inner * 0.82;
      g.fillStyle = rad(g, 0, 0, from, reach, [
        [0, '#2a0006'],
        [0.2, '#70000f'],
        [0.45, '#b8081e'],
        [0.72, '#e0142e'],
        [0.92, '#f53a4e'],
        [1, '#ff6a7a'],
      ]);
      g.fill(path);
      g.restore();

      g.save();
      g.clip(path);
      // each petal is a shallow cup: brighter toward the lamp on one flank, darker on the other
      const cx = Math.cos(a) * (inner + reach) * 0.5;
      const cy = Math.sin(a) * (inner + reach) * 0.5;
      const span = reach * 0.75;
      g.fillStyle = lin(g, cx - span * 0.6, cy - span * 0.8, cx + span * 0.6, cy + span * 0.8, [
        [0, 'rgba(255, 150, 150, 0.34)'],
        [0.45, 'rgba(255, 60, 80, 0)'],
        [1, 'rgba(30, 0, 6, 0.34)'],
      ]);
      g.fillRect(-64, -64, 128, 128);
      // a soft gleam just inside the lip
      g.globalAlpha = 0.5;
      g.strokeStyle = 'rgba(255, 150, 160, 0.5)';
      g.lineWidth = 1.6 + (1 - f) * 1.4;
      g.filter = `blur(${0.5 * px}px)`;
      g.stroke(path);
      g.restore();

      // the lip itself, a thin lit edge
      g.save();
      g.globalAlpha = 0.55;
      g.strokeStyle = '#ff97a0';
      g.lineWidth = 0.22;
      g.stroke(path);
      g.restore();
    }
  }
  // the whole flower stands in one light: the upper left catches it, the lower right falls away
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = lin(g, -40, -46, 40, 46, [
    [0, 'rgba(255, 120, 120, 0.16)'],
    [0.5, 'rgba(0, 0, 0, 0)'],
    [1, 'rgba(18, 0, 6, 0.3)'],
  ]);
  g.fillRect(-64, -64, 128, 128);
  // and it is deepest at the heart
  g.fillStyle = rad(g, 0, 0, 0, 16, ['rgba(20, 0, 4, 0.5)', 'rgba(20, 0, 4, 0)']);
  g.fillRect(-64, -64, 128, 128);
  g.globalCompositeOperation = 'source-over';
  g.restore();
}

export function paintRose() {
  const { c, g } = board();
  drawRose(g);
  return c;
}

export function previewRose(g) {
  g.fillStyle = '#0a0a0c';
  g.fillRect(-64, -64, 128, 128);
  // source-atop inside drawRose must only touch the flower, so it is painted on a layer of its own
  const layer = document.createElement('canvas');
  layer.width = layer.height = 256;
  const lg = layer.getContext('2d');
  lg.translate(128, 128);
  lg.scale(256 / 120, 256 / 120);
  drawRose(lg);
  g.drawImage(layer, -60, -60, 120, 120);
}

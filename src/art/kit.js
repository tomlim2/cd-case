// Shared bits for painting disc faces on a 2D canvas. A face is a square covering the 120 mm disc;
// the context is set up so that drawing happens in millimetres with the origin at the spindle.
export const SIZE = 2048;
export const PX = SIZE / 120; // device pixels per millimetre

export function board(size = SIZE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  g.scale(size / 120, size / 120);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { c, g };
}

// run fn in a frame centred on disc position (x, y), y up, turned counter-clockwise by rot
export function at(g, x, y, rot, fn) {
  g.save();
  g.translate(x, -y);
  g.rotate(-rot);
  fn(g);
  g.restore();
}

const ramp = (grad, stops) => {
  stops.forEach((s, i) => (Array.isArray(s) ? grad.addColorStop(s[0], s[1]) : grad.addColorStop(i / (stops.length - 1), s)));
  return grad;
};
export const lin = (g, x0, y0, x1, y1, stops) => ramp(g.createLinearGradient(x0, y0, x1, y1), stops);
export const rad = (g, x, y, r0, r1, stops) => ramp(g.createRadialGradient(x, y, r0, x, y, r1), stops);
export const conic = (g, a, x, y, stops) => ramp(g.createConicGradient(a, x, y), stops);

export const PAPER = '#f7f5ff';
export const INK = '#170c3d';

export function rr(x, y, w, h, r) {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  return p;
}
export function poly(pts) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}
export function ring(r, cx = 0, cy = 0) {
  const p = new Path2D();
  p.arc(cx, cy, r, 0, Math.PI * 2);
  return p;
}
// a four-pointed sparkle
export function sparkle(r, waist = 0.26) {
  const p = new Path2D();
  const w = r * waist;
  p.moveTo(0, -r);
  p.quadraticCurveTo(w * 0.35, -w * 0.35, r, 0);
  p.quadraticCurveTo(w * 0.35, w * 0.35, 0, r);
  p.quadraticCurveTo(-w * 0.35, w * 0.35, -r, 0);
  p.quadraticCurveTo(-w * 0.35, -w * 0.35, 0, -r);
  p.closePath();
  return p;
}
export function heart(s) {
  const p = new Path2D();
  p.moveTo(0, s * 0.82);
  p.bezierCurveTo(-s * 1.5, -s * 0.2, -s * 0.75, -s * 1.15, 0, -s * 0.42);
  p.bezierCurveTo(s * 0.75, -s * 1.15, s * 1.5, -s * 0.2, 0, s * 0.82);
  p.closePath();
  return p;
}

// the white paper edge of a die-cut sticker, with a little shadow on whatever it is stuck to
export function dieCut(g, path, pad = 1.2) {
  g.save();
  g.shadowColor = 'rgba(0, 0, 0, 0.6)';
  g.shadowBlur = 0.9 * PX;
  g.shadowOffsetY = 0.35 * PX;
  g.strokeStyle = PAPER;
  g.fillStyle = PAPER;
  g.lineWidth = pad * 2;
  g.stroke(path);
  g.fill(path);
  g.restore();
}
export function outline(g, path, w = 0.34, color = INK) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = w;
  g.stroke(path);
  g.restore();
}
export function within(g, path, paint) {
  g.save();
  g.clip(path);
  paint(g);
  g.restore();
}
// paper edge, picture, key line
export function sticker(g, path, paint, pad = 1.2) {
  dieCut(g, path, pad);
  within(g, path, paint);
  outline(g, path);
}

// Fat lettering with a paper edge, a dark extruded side and a painted face. face / side are fill
// styles (or functions of the text's half width, for gradients sized to it).
export function lettering(g, text, size, { face, side = INK, depth = [0.5, 0.7], pad = 1.1, font = '"Arial Black", "Helvetica Neue", Arial, sans-serif', weight = 900, slant = 0, key = 0.36, spacing = 0 }) {
  g.save();
  g.font = `${weight} ${size}px ${font}`;
  if (spacing) g.letterSpacing = `${spacing}px`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (slant) g.transform(1, 0, -slant, 1, 0, 0);
  const half = g.measureText(text).width / 2;
  const style = (s) => (typeof s === 'function' ? s(g, half, size) : s);
  const n = 6;
  g.save();
  g.shadowColor = 'rgba(0, 0, 0, 0.6)';
  g.shadowBlur = 0.9 * PX;
  g.shadowOffsetY = 0.35 * PX;
  g.strokeStyle = PAPER;
  g.lineWidth = pad * 2;
  g.strokeText(text, depth[0], depth[1]);
  g.restore();
  g.strokeStyle = PAPER;
  g.lineWidth = pad * 2;
  for (let k = 0; k <= n; k++) g.strokeText(text, (depth[0] * k) / n, (depth[1] * k) / n);
  g.fillStyle = style(side);
  g.strokeStyle = g.fillStyle;
  g.lineWidth = key;
  for (let k = n; k >= 1; k--) {
    g.strokeText(text, (depth[0] * k) / n, (depth[1] * k) / n);
    g.fillText(text, (depth[0] * k) / n, (depth[1] * k) / n);
  }
  g.strokeStyle = INK;
  g.lineWidth = key;
  g.strokeText(text, 0, 0);
  g.fillStyle = style(face);
  g.fillText(text, 0, 0);
  g.restore();
  return half;
}

// a round preview of a face, for the dock: the disc as it sits, hole and all
export function preview(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  g.scale(size / 128, size / 128); // a little air round the 120 mm disc
  g.save();
  const disc = new Path2D();
  disc.arc(0, 0, 60, 0, Math.PI * 2);
  disc.arc(0, 0, 7.5, 0, Math.PI * 2, true);
  g.clip(disc, 'evenodd');
  paint(g);
  g.restore();
  g.strokeStyle = 'rgba(17, 17, 20, 0.22)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.arc(0, 0, 59.6, 0, Math.PI * 2);
  g.stroke();
  return c;
}

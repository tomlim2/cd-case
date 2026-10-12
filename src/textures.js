// Procedural disc prints drawn on a 2D canvas (no external image assets).
import * as THREE from 'three';

const S = 1024;
const C = S / 2;

function canvas(size = S) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function holoGrad(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  ['#ff7ad9', '#ffd36b', '#7affc8', '#6bb8ff', '#c78bff', '#ff7ad9'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
  return g;
}

// white die-cut border + art, drawn at (x, y) rotated by rot
function sticker(ctx, x, y, rot, scale, shape, art, border = 20) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  shape(ctx);
  ctx.lineJoin = 'round';
  ctx.lineWidth = border * 2;
  ctx.strokeStyle = '#f4f6ff';
  ctx.stroke();
  ctx.fillStyle = '#f4f6ff';
  ctx.fill();
  ctx.save();
  shape(ctx);
  ctx.clip();
  art(ctx);
  ctx.restore();
  ctx.restore();
}

function textSticker(ctx, x, y, rot, text, size, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `900 ${size}px "Arial Black", "Helvetica Neue", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.3;
  ctx.strokeStyle = '#f4f6ff';
  ctx.strokeText(text, 0, 0);
  ctx.lineWidth = size * 0.1;
  ctx.strokeStyle = '#1b1240';
  ctx.strokeText(text, 0, 0);
  const w = ctx.measureText(text).width;
  ctx.fillStyle = fill ? fill(ctx, w, size) : '#fff';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function sparkle(ctx, x, y, r, color = '#bff4ff') {
  ctx.save();
  ctx.translate(x, y);
  const p = () => {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.quadraticCurveTo(0, 0, 0, r);
    ctx.quadraticCurveTo(0, 0, -r, 0);
    ctx.quadraticCurveTo(0, 0, 0, -r);
    ctx.closePath();
  };
  p();
  ctx.lineWidth = r * 0.35;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#f4f6ff';
  ctx.stroke();
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  p();
  ctx.fill();
  ctx.restore();
}

function drawStickers() {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  const P = (dx, dy) => [C + dx, C + dy];

  // banner: SHADER
  {
    const [x, y] = P(-170, -285);
    sticker(ctx, x, y, -0.28, 1,
      (g) => rr(g, -170, -52, 340, 104, 22),
      (g) => {
        const gr = g.createLinearGradient(-170, -52, 170, 52);
        gr.addColorStop(0, '#2b1b7a'); gr.addColorStop(1, '#0d0d3a');
        g.fillStyle = gr; g.fillRect(-170, -52, 340, 104);
        g.fillStyle = holoGrad(g, -170, 0, 170, 0);
        g.font = '900 78px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('SHADER', 0, 6);
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-170, -52, 340, 22);
      });
  }
  // banner: CD CASE
  {
    const [x, y] = P(185, -255);
    sticker(ctx, x, y, 0.36, 1,
      (g) => rr(g, -150, -50, 300, 100, 50),
      (g) => {
        g.fillStyle = holoGrad(g, -150, -50, 150, 50); g.fillRect(-150, -50, 300, 100);
        g.fillStyle = '#17123a'; g.font = '900 64px "Arial Black", Impact, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CD CASE', 0, 4);
      });
  }
  // heart
  {
    const [x, y] = P(-315, -35);
    sticker(ctx, x, y, -0.2, 1,
      (g) => { g.beginPath(); g.moveTo(0, 58); g.bezierCurveTo(-110, -20, -70, -90, 0, -40); g.bezierCurveTo(70, -90, 110, -20, 0, 58); g.closePath(); },
      (g) => {
        const gr = g.createLinearGradient(-90, -80, 90, 60); gr.addColorStop(0, '#ffa6e0'); gr.addColorStop(1, '#ff3d9a');
        g.fillStyle = gr; g.fillRect(-120, -100, 240, 180);
        g.fillStyle = '#fff'; g.font = '800 38px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('cmd', 0, -4);
      });
  }
  // planet
  {
    const [x, y] = P(235, -35);
    sticker(ctx, x, y, -0.25, 1,
      (g) => { g.beginPath(); g.ellipse(0, 0, 112, 46, -0.35, 0, Math.PI * 2); g.moveTo(54, 0); g.arc(0, 0, 54, 0, Math.PI * 2); },
      (g) => {
        g.fillStyle = '#1b0f5c'; g.fillRect(-130, -80, 260, 160);
        const gr = g.createRadialGradient(-18, -18, 6, 0, 0, 54); gr.addColorStop(0, '#fff6a8'); gr.addColorStop(0.45, '#ff8ad8'); gr.addColorStop(1, '#5a2fd6');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#7ff0ff'; g.lineWidth = 11; g.beginPath(); g.ellipse(0, 0, 100, 36, -0.35, 0, Math.PI * 2); g.stroke();
      });
  }
  // disco ball
  {
    const [x, y] = P(175, 255);
    sticker(ctx, x, y, 0, 1,
      (g) => { g.beginPath(); g.arc(0, 0, 66, 0, Math.PI * 2); },
      (g) => {
        const gr = g.createRadialGradient(-20, -24, 6, 0, 0, 70); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#9ec8ff'); gr.addColorStop(1, '#4a2bb5');
        g.fillStyle = gr; g.fillRect(-70, -70, 140, 140);
        g.strokeStyle = 'rgba(20,10,80,.55)'; g.lineWidth = 3;
        for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 24, -70); g.quadraticCurveTo(i * 36, 0, i * 24, 70); g.stroke(); g.beginPath(); g.moveTo(-70, i * 24); g.quadraticCurveTo(0, i * 30, 70, i * 24); g.stroke(); }
      });
  }
  // checker
  {
    const [x, y] = P(-175, 305);
    sticker(ctx, x, y, 0.35, 1,
      (g) => rr(g, -80, -50, 160, 100, 6),
      (g) => {
        for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) { g.fillStyle = (i + j) % 2 ? '#101018' : '#fff'; g.fillRect(-80 + i * 20, -50 + j * 20, 20, 20); }
      });
  }
  // monitor
  {
    const [x, y] = P(-325, 175);
    sticker(ctx, x, y, -0.12, 1,
      (g) => { rr(g, -70, -58, 140, 108, 16); },
      (g) => {
        const gr = g.createLinearGradient(0, -58, 0, 50); gr.addColorStop(0, '#9b6bff'); gr.addColorStop(1, '#3a1aa8');
        g.fillStyle = gr; g.fillRect(-70, -58, 140, 108);
        g.fillStyle = '#10062e'; rr(g, -56, -44, 112, 80, 8); g.fill();
        g.strokeStyle = '#7ffcff'; g.lineWidth = 7; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-22, -14); g.lineTo(-22, -4); g.moveTo(22, -14); g.lineTo(22, -4); g.stroke();
        g.beginPath(); g.arc(0, 4, 20, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      });
  }
  // can
  {
    const [x, y] = P(25, 325);
    sticker(ctx, x, y, 0.15, 1,
      (g) => rr(g, -38, -72, 76, 144, 14),
      (g) => {
        const gr = g.createLinearGradient(-38, 0, 38, 0); gr.addColorStop(0, '#2c6cff'); gr.addColorStop(0.5, '#8fe2ff'); gr.addColorStop(1, '#3b2bd0');
        g.fillStyle = gr; g.fillRect(-38, -72, 76, 144);
        g.fillStyle = '#ff2f6d'; g.fillRect(-38, -14, 76, 36);
        g.fillStyle = '#fff'; g.font = '900 20px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('3JS', 0, 5);
      });
  }
  // cursor
  {
    const [x, y] = P(300, 155);
    sticker(ctx, x, y, 0.1, 1,
      (g) => { g.beginPath(); g.moveTo(-26, -40); g.lineTo(-26, 34); g.lineTo(-6, 16); g.lineTo(10, 46); g.lineTo(24, 38); g.lineTo(8, 10); g.lineTo(34, 8); g.closePath(); },
      (g) => { g.fillStyle = holoGrad(g, -30, -40, 36, 46); g.fillRect(-40, -50, 90, 110); });
  }

  textSticker(ctx, ...P(-55, -400), 0.05, 'WEBGL', 70, (g, w) => holoGrad(g, -w / 2, 0, w / 2, 0));
  textSticker(ctx, ...P(325, 25), 1.2, 'three.js', 62, (g, w) => { const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0); gr.addColorStop(0, '#7ffcff'); gr.addColorStop(1, '#ff9be6'); return gr; });
  textSticker(ctx, ...P(-130, 420), -0.05, 'NO MODELS', 48, () => '#fff');

  [[-20, -300, 30], [-400, -190, 22], [380, -170, 24], [310, 330, 26], [-300, 380, 18], [110, 130, 16], [-110, 140, 14], [60, -150, 18], [-250, 270, 20]]
    .forEach(([dx, dy, r]) => sparkle(ctx, C + dx, C + dy, r));

  return c;
}

function drawMetal(stops, tracks = 0.12) {
  const c = canvas();
  const ctx = c.getContext('2d');
  // conic sheen
  const g = ctx.createConicGradient(0.4, C, C);
  stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // fine tracks
  ctx.lineWidth = 1;
  for (let r = 180; r < 500; r += 3) {
    ctx.strokeStyle = `rgba(0,0,0,${tracks * (0.4 + 0.6 * Math.random())})`;
    ctx.beginPath(); ctx.arc(C, C, r, 0, Math.PI * 2); ctx.stroke();
  }
  // printed label ring
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(C, C, 200, 0, Math.PI * 2); ctx.stroke();
  return c;
}

function drawSwirl() {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d9dce6';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const a0 = (i / 90) * Math.PI * 2;
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.02) {
      const r = 170 + t * 340;
      const a = a0 + t * 2.4;
      const x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    const l = 60 + (i % 7) * 5;
    ctx.strokeStyle = `hsla(${(i * 4) % 360},35%,${l}%,.55)`;
    ctx.lineWidth = 14;
    ctx.stroke();
  }
  return c;
}

export const VARIANTS = [
  { name: 'stickers', base: [0.035, 0.035, 0.045], holo: 1.0, holoPrint: 0.22, make: drawStickers },
  { name: 'gold', base: [0.5, 0.36, 0.14], holo: 0.3, holoPrint: 0.28, make: () => drawMetal(['#f6d98a', '#b98a2c', '#fff0b8', '#a8761a', '#f3cf72', '#8f6414', '#f6d98a']) },
  { name: 'rose', base: [0.55, 0.36, 0.38], holo: 0.35, holoPrint: 0.28, make: () => drawMetal(['#f6c4c2', '#c98a8f', '#ffe3df', '#b9747c', '#f4b8b8', '#a96670', '#f6c4c2']) },
  { name: 'swirl', base: [0.7, 0.72, 0.78], holo: 0.5, holoPrint: 0.35, make: drawSwirl },
];

export function buildTextures() {
  return VARIANTS.map((v) => {
    const cv = v.make();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return { ...v, canvas: cv, tex };
  });
}

// round dock thumbnails
export function paintThumb(target, v) {
  const ctx = target.getContext('2d');
  const n = target.width;
  ctx.clearRect(0, 0, n, n);
  ctx.save();
  ctx.beginPath(); ctx.arc(n / 2, n / 2, n / 2 - 1, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = `rgb(${v.base.map((x) => Math.round(Math.min(1, x * 1.6) * 255)).join(',')})`;
  ctx.fillRect(0, 0, n, n);
  ctx.drawImage(v.canvas, 0, 0, n, n);
  const g = ctx.createConicGradient(0.8, n / 2, n / 2);
  ['rgba(255,255,255,0)', 'rgba(255,255,255,.35)', 'rgba(255,255,255,0)', 'rgba(255,255,255,.3)', 'rgba(255,255,255,0)'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(n / 2, n / 2, n * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(n / 2, n / 2, n * 0.19, 0, Math.PI * 2); ctx.stroke();
}

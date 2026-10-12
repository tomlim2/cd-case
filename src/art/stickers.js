// Face 1: a black CD covered in die-cut stickers. Transparent wherever the bare disc should show.
import { board, at, lin, rad, conic, rr, poly, ring, sparkle, heart, sticker, dieCut, outline, within, lettering, PAPER, INK } from './kit.js';

const TAU = Math.PI * 2;
const d2r = Math.PI / 180;
const on = (r, a) => [r * Math.cos(a * d2r), r * Math.sin(a * d2r)];
const gloss = (c, x, y, rx, ry, tilt, alpha = 0.7) => {
  c.fillStyle = `rgba(255,255,255,${alpha})`;
  c.beginPath();
  c.ellipse(x, y, rx, ry, tilt, 0, TAU);
  c.fill();
};
const text = (c, str, x, y, font, fill, edge, edgeWidth) => {
  c.save();
  c.font = font;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (edge) {
    c.lineWidth = edgeWidth;
    c.strokeStyle = edge;
    c.strokeText(str, x, y);
  }
  c.fillStyle = fill;
  c.fillText(str, x, y);
  c.restore();
};
const FAT = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const ROUND = '"Arial Rounded MT Bold", "Arial Black", Arial, sans-serif';

/* ---- the stickers, each drawn round its own origin, in millimetres ---- */

function wordmark(g) {
  // the big one: fat slanted letters with a foil face and a deep blue side
  lettering(g, 'JEWEL', 10.4, {
    slant: 0.2,
    depth: [1.0, 1.3],
    pad: 1.25,
    side: '#1b1570',
    face: (c, half) => lin(c, -half, -4, half, 4, ['#7df9ff', '#ffffff', '#a6b7ff', '#ff9bea', '#fff3a6', '#7dffcf']),
  });
  // a line of small print under it
  text(g, 'shaders all the way down', 1.2, 8.8, `italic 700 2.6px ${ROUND}`, '#ffffff', INK, 1.1);
}

function blockText(g) {
  // NO 3D MODELS NEEDED: three stacked lines on a slab, like a pile of neon signs
  const slabPath = poly([[-13.5, -10], [9.5, -12.2], [14.5, -7.4], [14.5, 8.4], [-8.5, 12.2], [-13.5, 7.4]]);
  sticker(g, slabPath, (c) => {
    c.fillStyle = lin(c, -13, -10, 14, 10, ['#2a1466', '#6a22b8', '#1a2a8a']);
    c.fillRect(-16, -14, 34, 28);
    // the slab's lit edge
    c.fillStyle = lin(c, 0, 6, 0, 12.5, ['#ffb14a', '#ff5d6c', '#b3204f']);
    c.fill(poly([[-13.5, 7.4], [-8.5, 12.2], [14.5, 8.4], [14.5, 4.6], [-8.5, 8.4], [-13.5, 3.6]]));
    c.fillStyle = 'rgba(255,255,255,0.1)';
    for (let i = -14; i < 16; i += 2.2) c.fillRect(i, -14, 0.5, 28);
    gloss(c, -8, -8.6, 5, 1.1, -0.1, 0.25);
  }, 1.3);
  g.save();
  g.transform(1, -0.1, 0, 1, 0, 0);
  const sun = (c) => lin(c, 0, -3, 0, 3, ['#fff7a8', '#ffb347', '#ff5e8a']);
  const ice = (c, half) => lin(c, -half, 0, half, 0, ['#7df9ff', '#b79bff', '#ff8be0']);
  at(g, 0.5, 5.6, 0, (c) => lettering(c, 'NO 3D', 5.9, { face: sun, side: '#7a1140', depth: [0.5, 0.65], pad: 0, key: 0.3 }));
  at(g, 0.5, 0.1, 0, (c) => lettering(c, 'MODELS', 5.1, { face: '#ffffff', side: '#3a1a8a', depth: [0.45, 0.6], pad: 0, key: 0.3 }));
  at(g, 0.5, -5.0, 0, (c) => lettering(c, 'NEEDED', 4.5, { face: ice, side: '#101050', depth: [0.4, 0.55], pad: 0, key: 0.28 }));
  g.restore();
}

function hearts(g) {
  const one = (c, word, tilt) => {
    c.save();
    c.rotate(tilt);
    const h = heart(6.4);
    sticker(c, h, (cc) => {
      cc.fillStyle = rad(cc, -1.5, -2.5, 0.5, 9.5, ['#ffb8ea', '#ff4fb0', '#d01872']);
      cc.fillRect(-10, -10, 20, 20);
      gloss(cc, -3.2, -3.4, 2.0, 1.05, -0.6, 0.8);
      gloss(cc, 3.6, -3.9, 0.7, 0.45, 0.5, 0.6);
    });
    // a chrome rim just inside the edge
    c.save();
    c.scale(0.87, 0.87);
    outline(c, h, 0.55, 'rgba(255,255,255,0.8)');
    c.restore();
    text(c, word, 0, -0.4, 'italic 700 4px Georgia, "Times New Roman", serif', '#ffffff', 'rgba(150,10,80,0.55)', 0.7);
    c.restore();
  };
  // the little chain between them
  g.save();
  g.strokeStyle = PAPER;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(-2, -5.6);
  g.quadraticCurveTo(0.5, -9, 3.2, -6.6);
  g.stroke();
  g.strokeStyle = '#b9b3d6';
  g.lineWidth = 0.6;
  g.stroke();
  g.restore();
  at(g, -5.4, 1.6, 0, (c) => one(c, 'hi', -0.28));
  at(g, 5.6, -1.9, 0, (c) => one(c, 'fi', 0.3));
}

function badge(g) {
  // "just SHADERS!" arched in every colour, over a rainbow pill and a comic burst
  const burst = new Path2D();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const r = i % 2 ? 2.5 : 5.2;
    const p = [-15 + r * Math.cos(a), 3.6 + r * Math.sin(a)];
    i ? burst.lineTo(...p) : burst.moveTo(...p);
  }
  burst.closePath();
  const pill = rr(-12, 0.8, 27.5, 6.2, 3.1);
  dieCut(g, pill, 1.15);
  dieCut(g, burst, 0.95);
  within(g, pill, (c) => {
    c.fillStyle = lin(c, -12, 0, 15.5, 0, ['#ff5fa8', '#ff9a3d', '#ffe14d', '#4be3a0', '#4db8ff', '#a678ff']);
    c.fillRect(-13, 0, 30, 8);
    gloss(c, 2, 1.7, 11, 0.7, 0, 0.3);
  });
  outline(g, pill);
  within(g, burst, (c) => {
    c.fillStyle = rad(c, -15, 3.6, 0.5, 5.6, ['#fffbd0', '#ffd21f', '#ff9a1f']);
    c.fillRect(-22, -3, 14, 14);
  });
  outline(g, burst);
  text(g, 'NO MESHES', 2.4, 4.1, `900 3.7px ${FAT}`, '#ffffff', 'rgba(23,12,61,0.5)', 0.6);

  // the arch, laid down in three passes so no letter's paper edge covers its neighbour
  const hues = ['#ff4d6d', '#ff8c2e', '#ffd426', '#4ddf8f', '#3db8ff', '#8f6bff', '#ff5fd0', '#ff4d6d'];
  const word = [...'SHADERS!'];
  const spot = (i) => {
    const a = (i - (word.length - 1) / 2) * 0.172;
    return [1.8 + Math.sin(a) * 27, -7.4 + (1 - Math.cos(a)) * 27, a];
  };
  g.save();
  g.font = `900 6.4px ${ROUND}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const each = (fn) =>
    word.forEach((ch, i) => {
      const [x, y, a] = spot(i);
      g.save();
      g.translate(x, y);
      g.rotate(a);
      fn(ch, i);
      g.restore();
    });
  g.lineWidth = 2.7;
  g.strokeStyle = PAPER;
  each((ch) => g.strokeText(ch, 0, 0));
  g.lineWidth = 1.0;
  g.strokeStyle = INK;
  each((ch) => g.strokeText(ch, 0, 0));
  each((ch, i) => {
    g.fillStyle = hues[i];
    g.fillText(ch, 0, 0);
    // a lit top half on each letter
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.save();
    g.beginPath();
    g.rect(-4, -4, 8, 3.2);
    g.clip();
    g.fillText(ch, 0, 0);
    g.restore();
  });
  g.restore();
  g.save();
  g.translate(-11.5, -11.2);
  g.rotate(-0.42);
  text(g, 'just', 0, 0, 'italic 700 4px Georgia, serif', INK, PAPER, 1.9);
  g.restore();
}

function can(g) {
  const body = rr(-5.6, -11.4, 11.2, 22.8, 2.3);
  sticker(g, body, (c) => {
    c.fillStyle = lin(c, -5.6, 0, 5.6, 0, ['#1637b8', '#3f7bff', '#e2f1ff', '#4a86ff', '#1a2fa6', '#0f1c70']);
    c.fillRect(-6, -12, 12, 24);
    // top and bottom rims
    c.fillStyle = lin(c, -5.6, 0, 5.6, 0, ['#8d97b8', '#f4f7ff', '#9aa4c4', '#5d6688']);
    c.fillRect(-6, -11.4, 12, 2.5);
    c.fillRect(-6, 9.2, 12, 2.2);
    // the label
    c.fillStyle = lin(c, 0, -3.8, 0, 4.2, ['#ff3d77', '#ff9a3d']);
    c.fillRect(-6, -3.7, 12, 7.8);
    c.fillStyle = '#fff36b';
    c.fill(poly([[1.1, -8.2], [-1.3, -5.4], [0.1, -5.4], [-0.9, -3.9], [1.7, -6.4], [0.3, -6.4]]));
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillRect(-3.8, -8.6, 1.1, 17.4);
  });
  text(g, 'POP', 0, 0.5, `900 4.6px ${FAT}`, '#ffffff', 'rgba(120,10,40,0.5)', 0.6);
  // fizz escaping
  for (const [x, y, r] of [[1.5, -14.2, 1.6], [-2.8, -16.2, 1.2], [4.0, -17.4, 0.95]]) {
    const b = ring(r, x, y);
    sticker(g, b, (c) => {
      c.fillStyle = rad(c, x - r * 0.3, y - r * 0.3, 0.1, r * 1.4, ['#ffffff', '#b99bff']);
      c.fillRect(x - 2, y - 2, 4, 4);
    }, 0.6);
  }
}

function bolt(g) {
  const p = poly([[2.2, -8], [-4.2, 0.8], [-0.6, 0.8], [-2.6, 8], [4.4, -1.6], [0.8, -1.6]]);
  sticker(g, p, (c) => {
    c.fillStyle = lin(c, -4, -8, 4, 8, ['#fff36b', '#7dffd9', '#6fd6ff']);
    c.fillRect(-6, -9, 12, 18);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fill(poly([[1.6, -6.6], [-2.2, -0.9], [-0.9, -0.9], [0.9, -3.6]]));
  }, 1.0);
}

function monitor(g) {
  const shell = rr(-8.8, -8.2, 17.6, 14.4, 2.3);
  const foot = rr(-4.6, 5.6, 9.2, 3.1, 1);
  dieCut(g, foot, 1.15);
  dieCut(g, shell, 1.15);
  within(g, foot, (c) => {
    c.fillStyle = lin(c, 0, 5.6, 0, 8.7, ['#8d77e6', '#5a42b8']);
    c.fillRect(-6, 5, 12, 5);
  });
  outline(g, foot);
  within(g, shell, (c) => {
    c.fillStyle = lin(c, -8, -8, 8, 6, ['#e2d4ff', '#9b7bff', '#5d3fd3']);
    c.fillRect(-9, -9, 18, 16);
  });
  outline(g, shell);
  const screen = rr(-6.8, -6.3, 13.6, 9.9, 1.4);
  within(g, screen, (c) => {
    c.fillStyle = rad(c, 0, -1.5, 1, 9, ['#2a1a7a', '#0b0630']);
    c.fillRect(-8, -8, 16, 12);
    // a smile in fat pixels
    c.fillStyle = '#ffb86b';
    const dot = (x, y) => c.fillRect(x - 0.5, y - 0.5, 1, 1);
    [[-2.5, -3.6], [2.5, -3.6], [-3.3, -0.6], [-2.2, 0.5], [-1.1, 1.1], [0, 1.3], [1.1, 1.1], [2.2, 0.5], [3.3, -0.6]].forEach(([x, y]) => dot(x, y));
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.fill(poly([[-7, -7], [-1, -7], [-5, 4], [-7, 4]]));
  });
  outline(g, screen, 0.3);
}

function discoBall(g) {
  const ball = ring(7.8);
  sticker(g, ball, (c) => {
    c.fillStyle = rad(c, -2.4, -2.8, 0.6, 10.8, ['#ffffff', '#b8d4ff', '#5b6dff', '#2a1a8a']);
    c.fillRect(-8, -8, 16, 16);
    // mirror tiles: meridians and parallels
    c.strokeStyle = 'rgba(16, 8, 70, 0.6)';
    c.lineWidth = 0.28;
    for (let i = -3; i <= 3; i++) {
      c.beginPath();
      c.ellipse(0, 0, Math.abs(i) * 2.55 + 0.01, 7.8, 0, 0, TAU);
      c.stroke();
      c.beginPath();
      c.moveTo(-8, i * 2.25);
      c.quadraticCurveTo(0, i * 3.0, 8, i * 2.25);
      c.stroke();
    }
    // a streak of spectrum across it
    c.globalAlpha = 0.62;
    c.fillStyle = lin(c, -6, 3, 6, -1, ['rgba(255,80,160,0)', '#ff5fa8', '#ffe14d', '#4be3a0', '#4db8ff', 'rgba(120,90,255,0)']);
    c.fillRect(-8, -1.5, 16, 4.4);
    c.globalAlpha = 1;
    gloss(c, -3, -3.6, 1.8, 1.1, -0.7, 0.75);
  });
  at(g, 4.8, 5.8, 0.3, (c) => {
    c.fillStyle = '#ffffff';
    c.fill(sparkle(2.6));
  });
}

function planet(g) {
  const body = ring(5.4);
  const hoop = new Path2D();
  hoop.ellipse(0, 0, 10.8, 3.4, -0.38, 0, TAU);
  dieCut(g, hoop, 1.0);
  dieCut(g, body, 1.0);
  // the far half of the ring
  g.save();
  g.strokeStyle = '#59e6ff';
  g.lineWidth = 1.35;
  g.stroke(hoop);
  g.restore();
  within(g, body, (c) => {
    c.fillStyle = rad(c, -1.8, -2, 0.4, 7.8, ['#fff3a6', '#ff9bd6', '#8a4dff', '#3a1a9a']);
    c.fillRect(-6, -6, 12, 12);
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 0.5;
    for (const y of [-2, 0.6, 2.8]) {
      c.beginPath();
      c.moveTo(-6, y);
      c.quadraticCurveTo(0, y + 1.4, 6, y - 0.4);
      c.stroke();
    }
  });
  outline(g, body);
  // the near half, over the planet
  g.save();
  const front = new Path2D();
  front.ellipse(0, 0, 10.8, 3.4, -0.38, 0.05, Math.PI - 0.05);
  g.strokeStyle = INK;
  g.lineWidth = 1.95;
  g.stroke(front);
  g.strokeStyle = lin(g, -10, 0, 10, 0, ['#59e6ff', '#ffffff', '#ff8be0']);
  g.lineWidth = 1.35;
  g.stroke(front);
  g.restore();
}

function jar(g) {
  const glass = rr(-7.2, -6.6, 14.4, 16.4, 3.5);
  const lid = rr(-5.8, -10.6, 11.6, 4.8, 1.2);
  dieCut(g, glass, 1.15);
  dieCut(g, lid, 1.15);
  within(g, glass, (c) => {
    c.fillStyle = lin(c, -7, -6, 7, 10, ['#ffd0f2', '#d6c2ff', '#a9e4ff']);
    c.fillRect(-8, -8, 16, 19);
    const stars = [[-3.8, -2.8, 1.4, '#fff36b'], [3.0, -3.6, 1.1, '#ffffff'], [4.4, 1.8, 1.3, '#ff8be0'], [-4.6, 4.6, 1.2, '#7dffd9'], [0.4, 7.2, 1.4, '#fff36b'], [-0.6, -4.9, 0.9, '#ff8be0'], [3.6, 7.0, 0.9, '#ffffff']];
    for (const [x, y, r, col] of stars) {
      c.save();
      c.translate(x, y);
      c.fillStyle = col;
      c.fill(sparkle(r, 0.4));
      c.restore();
    }
    c.fillStyle = 'rgba(255,255,255,0.62)';
    c.fillRect(-5.6, -5, 1.1, 12.4);
  });
  outline(g, glass);
  within(g, lid, (c) => {
    c.fillStyle = lin(c, 0, -10.6, 0, -5.8, ['#ff9bd6', '#ff4fb0', '#c81e78']);
    c.fillRect(-6, -11, 12, 6);
    c.fillStyle = 'rgba(255,255,255,0.4)';
    for (let x = -5.2; x < 6; x += 1.5) c.fillRect(x, -10.6, 0.5, 4.8);
  });
  outline(g, lid);
  text(g, '100%', 0, -0.5, `900 3.1px ${FAT}`, INK, PAPER, 1.3);
  text(g, 'GLSL', 0, 3.3, `900 3.1px ${FAT}`, INK, PAPER, 1.3);
}

function checker(g) {
  const flag = rr(-8.5, -4.3, 17, 8.6, 0.9);
  sticker(g, flag, (c) => {
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 4; j++) {
        c.fillStyle = (i + j) % 2 ? '#0d0d16' : '#ffffff';
        c.fillRect(-8.5 + i * 2.125, -4.3 + j * 2.15, 2.125, 2.15);
      }
    }
  }, 0.9);
}

function cursor(g) {
  const p = poly([[-2.8, -4.8], [-2.8, 4.2], [-0.5, 2.1], [1.2, 5.6], [3.0, 4.7], [1.3, 1.4], [4.4, 1.2]]);
  sticker(g, p, (c) => {
    c.fillStyle = lin(c, -3, -5, 4, 6, ['#fff36b', '#ffb347']);
    c.fillRect(-4, -6, 10, 13);
  }, 0.9);
}

function smallHeart(g) {
  const h = heart(4.3);
  sticker(g, h, (c) => {
    c.fillStyle = lin(c, -5, -4, 5, 4, ['#ff7ad9', '#ffe27a', '#8dffc4', '#6fd6ff', '#b79bff']);
    c.fillRect(-7, -6, 14, 12);
    gloss(c, -2.1, -2.3, 1.3, 0.7, -0.6);
  }, 1.0);
}

function galaxy(g) {
  // a scalloped flower with a galaxy in it
  const p = new Path2D();
  const petals = 8;
  for (let i = 0; i <= petals * 24; i++) {
    const a = (i / (petals * 24)) * TAU;
    const r = 6.4 + 1.5 * Math.abs(Math.cos((a * petals) / 2));
    i ? p.lineTo(r * Math.cos(a), r * Math.sin(a)) : p.moveTo(r * Math.cos(a), r * Math.sin(a));
  }
  p.closePath();
  sticker(g, p, (c) => {
    c.fillStyle = rad(c, 0, 0, 0.5, 8.5, ['#1a0f70', '#2a1fd0', '#120a55']);
    c.fillRect(-9, -9, 18, 18);
    c.save();
    c.rotate(-0.5);
    c.scale(1, 0.55);
    c.fillStyle = rad(c, 0, 0, 0.2, 6.5, ['#ffffff', '#ffb3f0', '#ff5fd0', 'rgba(120,60,255,0)']);
    c.beginPath();
    c.arc(0, 0, 6.5, 0, TAU);
    c.fill();
    c.restore();
    c.fillStyle = '#ffffff';
    for (const [x, y, r] of [[-4.6, -3.2, 0.3], [4.4, 3.6, 0.35], [3.6, -4.6, 0.25], [-3.8, 4.6, 0.28], [5.6, -0.6, 0.2], [-5.8, 0.8, 0.22]]) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
  }, 1.0);
}

function shout(g) {
  // a little burst with the Korean for "a copy made to learn from"
  const p = new Path2D();
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU - 0.2;
    const r = i % 2 ? 5.2 : 7.4;
    i ? p.lineTo(r * Math.cos(a) * 1.25, r * Math.sin(a)) : p.moveTo(r * Math.cos(a) * 1.25, r * Math.sin(a));
  }
  p.closePath();
  sticker(g, p, (c) => {
    c.fillStyle = rad(c, 0, 0, 1, 9, ['#ffffff', '#fff36b', '#ffb02e']);
    c.fillRect(-10, -8, 20, 16);
  }, 0.9);
  text(g, '모작!', 0, 0.3, '900 5.2px "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif', '#e0245e', INK, 0.5);
}

function smiley(g) {
  const face = ring(5.6);
  sticker(g, face, (c) => {
    c.fillStyle = rad(c, -1.6, -2, 0.5, 8, ['#fff9b0', '#ffd91f', '#ff9d1f']);
    c.fillRect(-6, -6, 12, 12);
    c.fillStyle = INK;
    c.beginPath();
    c.ellipse(-1.9, -1.4, 0.75, 1.3, 0, 0, TAU);
    c.ellipse(1.9, -1.4, 0.75, 1.3, 0, 0, TAU);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 0.75;
    c.beginPath();
    c.arc(0, 0.3, 3.3, 0.18 * Math.PI, 0.82 * Math.PI);
    c.stroke();
    gloss(c, -2.4, -3.4, 1.5, 0.7, -0.5, 0.6);
  }, 1.0);
}

function twinkle(g, r, hue = 0) {
  const s = sparkle(r, 0.3);
  dieCut(g, s, 0.55);
  within(g, s, (c) => {
    c.fillStyle = conic(c, hue, 0, 0, ['#ffffff', '#b79bff', '#6fd6ff', '#ffffff', '#ff9bea', '#ffffff']);
    c.fillRect(-r, -r, 2 * r, 2 * r);
  });
}

/* ---- where they go: distance from the spindle, bearing, turn (both degrees), size ---- */

export function paintStickers() {
  const { c, g } = board();
  const put = (r, a, rot, k, fn) =>
    at(g, ...on(r, a), rot * d2r, (c2) => {
      c2.scale(k, k);
      fn(c2);
    });

  // small things first, so the big ones lap over them the way a sticker bomb builds up
  [[51, 74, 2.1, 0], [54, 6, 1.8, 1], [33, 64, 1.6, 2], [52, -24, 1.7, 0], [30, -64, 1.5, 1], [53, -113, 2.0, 2], [31, 197, 1.6, 0],
   [54, 151, 1.9, 1], [29, 150, 1.4, 2], [45, 111, 1.6, 0], [55, 209, 1.5, 1], [24, -42, 1.2, 2], [55, 41, 1.4, 1], [24, 252, 1.3, 0], [36, -2, 1.3, 2]]
    .forEach(([r, a, size, hue]) => put(r, a, (a * 7) % 40, 1, (c2) => twinkle(c2, size, hue)));

  put(49.5, -124, 32, 1.05, checker);
  put(25.5, 90, -14, 0.95, planet);
  put(27.5, 38, 0, 1.12, discoBall);
  put(25, 8, 8, 0.95, smiley);
  put(26.5, -24, 10, 1.2, smallHeart);
  put(24.5, -70, -24, 1.2, cursor);
  put(26, 238, 14, 1.0, shout);
  put(48.5, 56, -8, 1.3, bolt);
  put(42.5, 87, -62, 1.3, can);
  put(41, 22, -8, 1.25, monitor);
  put(45, -6, 14, 1.15, galaxy);
  put(42.5, -98, 10, 1.3, jar);
  put(38.5, 178, 72, 1.16, blockText);
  put(43, 219, 48, 1.2, hearts);
  put(41.5, 131, 50, 1.1, badge);
  put(40, -52, 40, 1.12, wordmark);
  return c;
}

// the bare disc under the stickers, for the dock's preview
export function paintStickersBase(g) {
  g.fillStyle = '#08080c';
  g.fillRect(-64, -64, 128, 128);
  g.fillStyle = conic(g, 0.6, 0, 0, ['rgba(80,255,170,0.0)', 'rgba(80,255,170,0.35)', 'rgba(255,220,90,0.3)', 'rgba(255,90,200,0.0)', 'rgba(110,120,255,0.3)', 'rgba(80,220,255,0.3)', 'rgba(80,255,170,0.0)']);
  g.fillRect(-64, -64, 128, 128);
}

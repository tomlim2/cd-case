// Face 2: a gold record, engraved. This one is not a picture but a relief the disc shader reads:
//   red   = engraving, cut through the brushing (1 where a line is)
//   green = the brushing itself, circle by circle (0.5 = even)
import { board, conic } from './kit.js';

const TAU = Math.PI * 2;

// a tiny seeded generator, so the record comes out the same every time
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The diagrams, stroked in whatever style is current. They are the sort of thing a record meant for
// strangers carries: how to play it, how fast, where it came from.
export function engrave(g) {
  const rnd = seeded(7);
  const line = (x0, y0, x1, y1) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };
  const circ = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.stroke();
  };
  // a row of binary ticks: | for one, - for nought
  const ticks = (x, y, angle, n, step = 1.1) => {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    for (let i = 0; i < n; i++) {
      if (rnd() > 0.45) line(i * step, -0.55, i * step, 0.55);
      else line(i * step - 0.3, 0, i * step + 0.3, 0);
    }
    g.restore();
  };

  // 1. the record seen from above, with its stylus, ringed by a count in binary
  g.save();
  g.translate(27, -30);
  g.lineWidth = 0.42;
  circ(0, 0, 10.5);
  circ(0, 0, 3.1);
  g.lineWidth = 0.3;
  circ(0, 0, 0.7);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * TAU;
    const long = rnd() > 0.5;
    line(Math.cos(a) * 11.6, Math.sin(a) * 11.6, Math.cos(a) * (long ? 13.4 : 12.3), Math.sin(a) * (long ? 13.4 : 12.3));
  }
  g.lineWidth = 0.42;
  line(7.4, -7.4, 12.6, -12.6);
  circ(13.6, -13.6, 1.4);
  g.restore();

  // 2. the same record edge on, and the time one turn takes
  g.save();
  g.translate(-36, -17);
  g.lineWidth = 0.42;
  g.strokeRect(-9, -1.1, 18, 2.2);
  line(0, -1.1, 0, -4.2);
  g.strokeRect(-1.6, -6.6, 3.2, 2.4);
  g.lineWidth = 0.3;
  ticks(-8.4, 4.2, 0, 16);
  g.restore();

  // 3. a frame with the first picture's scan lines in it
  g.save();
  g.translate(-27, 33);
  g.rotate(-0.12);
  g.lineWidth = 0.42;
  g.strokeRect(-9.5, -7, 19, 14);
  g.lineWidth = 0.28;
  g.beginPath();
  for (let i = 0; i <= 26; i++) {
    const x = -8 + (i / 26) * 16;
    const y = (i % 2 ? -1 : 1) * (2.2 + 2.2 * Math.sin(i * 0.7));
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  circ(5.4, -3.6, 1.7);
  ticks(-8.6, 9.3, 0, 15);
  g.restore();

  // 4. a burst of bearings, each with its own code: where this was sent from
  g.save();
  g.translate(31, 28);
  g.lineWidth = 0.34;
  const spokes = [[0.2, 21], [0.62, 12], [1.05, 16], [1.6, 9], [2.25, 18], [2.8, 11], [3.3, 14.5], [3.95, 8], [4.5, 13], [5.05, 10], [5.5, 19], [5.95, 7]];
  for (const [a, len] of spokes) {
    line(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    g.lineWidth = 0.24;
    ticks(Math.cos(a) * 3 - Math.sin(a) * 0.9, Math.sin(a) * 3 + Math.cos(a) * 0.9, a, Math.floor((len - 4) / 1.0), 1.0);
    g.lineWidth = 0.34;
  }
  g.restore();

  // 5. two atoms and the line between them: the unit everything else is counted in
  g.save();
  g.translate(-3, 45);
  g.lineWidth = 0.4;
  circ(-5.5, 0, 2.3);
  circ(5.5, 0, 2.3);
  line(-3.2, 0, 3.2, 0);
  line(-5.5, -2.3, -5.5, -3.8);
  line(5.5, 2.3, 5.5, 3.8);
  g.fillStyle = g.strokeStyle;
  for (const x of [-5.5, 5.5]) {
    g.beginPath();
    g.arc(x, 0, 0.55, 0, TAU);
    g.fill();
  }
  g.restore();

  // a fine scale all the way round the rim
  g.lineWidth = 0.22;
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * TAU;
    const r1 = i % 10 === 0 ? 55.6 : i % 5 === 0 ? 56.3 : 56.8;
    line(Math.cos(a) * r1, Math.sin(a) * r1, Math.cos(a) * 57.6, Math.sin(a) * 57.6);
  }
}

export function paintGolden() {
  const { c, g } = board();
  const rnd = seeded(31);
  g.fillStyle = 'rgb(0, 128, 0)';
  g.fillRect(-60, -60, 120, 120);
  // lathe marks: every circle catches the light a little differently from its neighbours
  for (let r = 19; r < 60; r += 0.16) {
    const v = Math.round(128 + (rnd() - 0.5) * 70 + 18 * Math.sin(r * 0.9) + 10 * Math.sin(r * 3.7));
    g.strokeStyle = `rgb(0, ${Math.max(40, Math.min(215, v))}, 0)`;
    g.lineWidth = 0.19;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.stroke();
  }
  // a few long scuffs
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgb(70, 30, 0)';
  g.lineWidth = 0.16;
  for (const [x0, y0, x1, y1] of [[-52, 10, -8, 38], [12, -52, 49, -22], [-20, -50, -46, -30], [18, 12, 52, 6]]) {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgb(255, 128, 0)';
  engrave(g);
  return c;
}

export function previewGolden(g) {
  g.fillStyle = conic(g, 0.4, 0, 0, ['#b98a2c', '#f7dd8f', '#a8781c', '#f3cf72', '#8f6414', '#f1d27c', '#b98a2c']);
  g.fillRect(-64, -64, 128, 128);
  g.strokeStyle = 'rgba(255, 244, 196, 0.85)';
  engrave(g);
  g.fillStyle = '#0c0b0a';
  g.beginPath();
  g.arc(0, 0, 20, 0, TAU);
  g.fill();
}

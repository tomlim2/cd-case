// The printed faces of an album: the booklet's front and back, both sides of the card under the
// tray, and the disc. Each is a square canvas the stage uses as a texture.
import { sheet, lin, disc, grain, font, fit, wrap, clip, arcText } from './kit.js';
import { mix, alpha, inkOn } from './palette.js';
import { rng } from './rng.js';
import { total } from './words.js';
import { drawArt, engraveContours } from './art.js';

const TAU = Math.PI * 2;
const KIND_KO = { print: '은빛 인쇄', holo: '검은 홀로그램', gold: '금', vinyl: '바이닐' };

/* ---------------------------------------------------------------- the booklet's front */

// The lettering sits on a label of its own, the way a sticker or a paper band does, so it reads
// over any picture.
function lettering(g, S, album) {
  const p = album.palette;
  const R = rng(album.seed, 'label');
  const layout = album.image ? R.pick(['box', 'obi']) : R.weighted({ box: 3, band: 2, obi: 2, bare: 2 });
  const { title, artist } = album;
  g.textBaseline = 'alphabetic';

  if (layout === 'box' || layout === 'bare') {
    const w = S * (layout === 'box' ? 0.52 : 0.8);
    const pad = S * 0.04;
    const t = fit(g, title, album.type, w - pad * 2, S * (layout === 'box' ? 0.078 : 0.11), 3);
    const small = S * 0.027;
    const h = pad * 2 + t.lines.length * t.size * 1.1 + small * 1.9;
    const left = R.chance(0.6);
    const top = R.chance(0.35);
    const m = S * 0.055;
    const x = left ? m : S - m - w;
    const y = top ? m : S - m - h;
    let ink = p.ink;
    if (layout === 'box') {
      g.fillStyle = p.bg;
      g.fillRect(x, y, w, h);
    } else {
      // straight on the picture: a soft scrim behind, so it still reads
      ink = '#ffffff';
      g.fillStyle = lin(g, 0, top ? 0 : S, 0, top ? y + h * 1.6 : y - h * 0.6, ['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']);
      g.fillRect(0, top ? 0 : y - h * 0.6, S, h * 1.6 + m);
    }
    g.fillStyle = ink;
    g.textAlign = 'left';
    g.font = font('mono', small);
    g.fillText(clip(g, artist.toUpperCase(), w - pad * 2), x + pad, y + pad + small);
    g.font = font(album.type, t.size);
    t.lines.forEach((line, i) => g.fillText(line, x + pad, y + pad + small * 1.9 + t.size * (0.86 + i * 1.1)));
  } else if (layout === 'band') {
    const top = R.chance(0.5);
    const h = S * 0.2;
    const y = top ? 0 : S - h;
    g.fillStyle = p.bg;
    g.fillRect(0, y, S, h);
    g.fillStyle = p.a;
    g.fillRect(0, top ? h : y - S * 0.012, S, S * 0.012);
    const pad = S * 0.055;
    const t = fit(g, title, album.type, S * 0.62, S * 0.085, 2);
    g.fillStyle = p.ink;
    g.textAlign = 'left';
    t.lines.forEach((line, i) => g.fillText(line, pad, y + h / 2 + t.size * (0.36 + i * 1.08 - (t.lines.length - 1) * 0.54)));
    g.font = font('mono', S * 0.026);
    g.textAlign = 'right';
    g.fillText(clip(g, artist.toUpperCase(), S * 0.28), S - pad, y + h / 2 + S * 0.009);
  } else {
    // an obi: the paper band down one side of a Japanese pressing, lettered sideways
    const w = S * 0.15;
    g.fillStyle = p.ink;
    g.fillRect(0, 0, w, S);
    g.fillStyle = p.a;
    g.fillRect(w, 0, S * 0.01, S);
    g.save();
    g.translate(w / 2, S * 0.94);
    g.rotate(-Math.PI / 2);
    g.fillStyle = p.bg;
    g.textAlign = 'left';
    const t = fit(g, title, album.type, S * 0.62, w * 0.5, 1);
    g.fillText(clip(g, title, S * 0.62), 0, t.size * 0.36);
    g.font = font('mono', S * 0.024);
    g.textAlign = 'right';
    g.fillText(clip(g, artist.toUpperCase(), S * 0.24), S * 0.88, S * 0.009);
    g.restore();
  }
}

export function paintArt(album, S) {
  const { c, g } = sheet(S);
  drawArt(g, S, album, rng(album.seed, 'art'), album.palette);
  return c;
}

function cover(album, S) {
  const { c, g } = sheet(S);
  g.drawImage(album.art, 0, 0, S, S);
  lettering(g, S, album);
  return c;
}

/* ---------------------------------------------------------------- the booklet's back page */

function linerPage(album, S) {
  const p = album.palette;
  const { c, g } = sheet(S);
  g.fillStyle = p.bg;
  g.fillRect(0, 0, S, S);
  const m = S * 0.085;
  // a slice of the cover down the right-hand side
  const strip = S * 0.2;
  g.drawImage(album.art, album.art.width * 0.4, 0, album.art.width * 0.2, album.art.height, S - m - strip, m, strip, S - m * 2);
  const w = S - m * 3 - strip;
  g.fillStyle = p.ink;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = font('mono', S * 0.024);
  g.fillText(clip(g, album.artist.toUpperCase(), w), m, m + S * 0.024);
  const t = fit(g, album.title, album.type, w, S * 0.085, 3);
  let y = m + S * 0.06;
  t.lines.forEach((line) => {
    y += t.size * 1.08;
    g.fillText(line, m, y);
  });
  y += S * 0.04;
  g.fillStyle = p.a;
  g.fillRect(m, y, S * 0.09, S * 0.008);
  y += S * 0.065;
  // liner notes
  g.fillStyle = alpha(p.ink, 0.86);
  const body = S * 0.029;
  g.font = font('light', body);
  for (const para of album.notes) {
    for (const line of wrap(g, para, w)) {
      g.fillText(line, m, y);
      y += body * 1.55;
    }
    y += body * 0.7;
  }
  // the small print at the foot
  const rows = [
    ['구운 곳', '오늘의 디스크'],
    ['시드', album.seed],
    ['디스크', KIND_KO[album.kind]],
    ['수록', `${album.tracks.length}곡 · ${total(album.tracks)}`],
  ];
  g.font = font('mono', S * 0.021);
  let fy = S - m - (rows.length - 1) * S * 0.034;
  for (const [k, v] of rows) {
    g.fillStyle = alpha(p.ink, 0.5);
    g.fillText(k, m, fy);
    g.fillStyle = p.ink;
    g.fillText(clip(g, String(v), w - S * 0.14), m + S * 0.13, fy);
    fy += S * 0.034;
  }
  grain(g, S, 0.1);
  return c;
}

/* ---------------------------------------------------------------- the card under the tray */

// what shows round the disc when the case is open
function cardInside(album, S) {
  const p = album.palette;
  const R = rng(album.seed, 'inside');
  const { c, g } = sheet(S);
  const ground = R.pick([p.a, p.b, p.c]);
  const mark = mix(ground, inkOn(ground), 0.14);
  g.fillStyle = ground;
  g.fillRect(0, 0, S, S);
  g.fillStyle = mark;
  g.strokeStyle = mark;
  const kind = R.int(3);
  if (kind === 0) {
    const step = S / 26;
    for (let j = 0; j < 27; j++) for (let i = 0; i < 27; i++) disc(g, i * step + (j % 2 ? step / 2 : 0), j * step, step * 0.16);
  } else if (kind === 1) {
    g.lineWidth = S * 0.012;
    for (let i = -S; i < S * 2; i += S * 0.05) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + S, S);
      g.stroke();
    }
  } else {
    g.lineWidth = S * 0.006;
    for (let r = S * 0.04; r < S * 0.8; r += S * 0.03) {
      g.beginPath();
      g.arc(S / 2, S / 2, r, 0, TAU);
      g.stroke();
    }
  }
  g.fillStyle = inkOn(ground);
  g.font = font('mono', S * 0.022);
  g.textAlign = 'left';
  g.fillText(album.catalog, S * 0.06, S * 0.955);
  g.textAlign = 'right';
  g.fillText('DISC 1 / 1', S * 0.94, S * 0.955);
  grain(g, S, 0.12);
  return c;
}

function barcode(g, x, y, w, h, R) {
  g.fillStyle = '#ffffff';
  g.fillRect(x - w * 0.06, y - h * 0.12, w * 1.12, h * 1.36);
  g.fillStyle = '#111111';
  let at = x;
  while (at < x + w) {
    const bar = (1 + R.int(3)) * (w / 90);
    if (at + bar > x + w) break;
    g.fillRect(at, y, bar, h);
    at += bar + (1 + R.int(3)) * (w / 90);
  }
}

// the back of the case: what is on the record, with a spine down either edge
function cardBack(album, S) {
  const p = album.palette;
  const { c, g } = sheet(S);
  g.fillStyle = p.bg;
  g.fillRect(0, 0, S, S);
  const spine = S * 0.058;
  // spines: unfolded here, they are the two edges of the card
  g.fillStyle = p.ink;
  g.fillRect(0, 0, spine, S);
  g.fillRect(S - spine, 0, spine, S);
  const spineText = `${album.artist}  —  ${album.title}`;
  g.fillStyle = p.bg;
  g.textBaseline = 'middle';
  for (const [x, turn] of [[spine / 2, -1], [S - spine / 2, 1]]) {
    g.save();
    g.translate(x, S / 2);
    g.rotate((turn * Math.PI) / 2);
    g.font = font('grotesk', spine * 0.46);
    g.textAlign = 'center';
    g.fillText(clip(g, spineText, S * 0.7), 0, spine * 0.03);
    g.font = font('mono', spine * 0.34);
    g.textAlign = 'right';
    g.fillText(album.catalog, S * 0.47, spine * 0.03);
    g.restore();
  }
  g.textBaseline = 'alphabetic';
  const x0 = spine + S * 0.065;
  const x1 = S - spine - S * 0.065;
  const w = x1 - x0;
  g.fillStyle = p.ink;
  g.textAlign = 'left';
  g.font = font('mono', S * 0.023);
  g.fillText(clip(g, album.artist.toUpperCase(), w), x0, S * 0.1);
  const t = fit(g, album.title, album.type, w, S * 0.07, 2);
  let y = S * 0.115;
  t.lines.forEach((line) => {
    y += t.size * 1.1;
    g.fillText(line, x0, y);
  });
  y += S * 0.03;
  g.fillStyle = p.a;
  g.fillRect(x0, y, w, S * 0.006);
  // the tracks
  const top = y + S * 0.055;
  const foot = S * 0.83;
  const n = album.tracks.length;
  const row = Math.min(S * 0.052, (foot - top) / n);
  const size = Math.min(S * 0.031, row * 0.62);
  album.tracks.forEach((track, i) => {
    const ty = top + row * (i + 0.7);
    g.font = font('mono', size * 0.8);
    g.fillStyle = p.a;
    g.textAlign = 'left';
    g.fillText(String(i + 1).padStart(2, '0'), x0, ty);
    g.fillStyle = alpha(p.ink, 0.6);
    g.textAlign = 'right';
    g.fillText(track.time, x1, ty);
    g.font = font('grotesk', size);
    g.fillStyle = p.ink;
    g.textAlign = 'left';
    g.fillText(clip(g, track.name, w - S * 0.17), x0 + S * 0.06, ty);
  });
  // the foot: running time, catalogue number, bars
  g.font = font('mono', S * 0.02);
  g.fillStyle = alpha(p.ink, 0.6);
  g.textAlign = 'left';
  g.fillText(`${n} tracks · ${total(album.tracks)}`, x0, S * 0.9);
  g.fillText(`${album.catalog} · seed ${album.seed}`, x0, S * 0.932);
  barcode(g, x1 - S * 0.2, S * 0.868, S * 0.2, S * 0.056, rng(album.seed, 'bars'));
  grain(g, S, 0.1);
  return c;
}

/* ---------------------------------------------------------------- the disc */

// lettering round the rim: the title over the top, who it is by along the bottom
function rimText(g, D, album, radius, size, fill, under = `${album.artist} · ${album.catalog}`) {
  const k = D / 120;
  g.fillStyle = fill;
  g.font = font('grotesk', size * k);
  const maxChars = Math.floor((radius * k * 2.2) / (size * k * 0.62));
  const short = (s) => ([...s].length > maxChars ? `${[...s].slice(0, maxChars - 1).join('')}…` : s);
  arcText(g, short(album.title), D / 2, D / 2, radius * k, -Math.PI / 2, { tracking: size * k * 0.08 });
  g.font = font('mono', size * 0.62 * k);
  arcText(g, short(under.toUpperCase()), D / 2, D / 2, radius * k, Math.PI / 2, { flip: true, tracking: size * k * 0.1 });
}

function discFace(album, D) {
  const p = album.palette;
  const R = rng(album.seed, 'disc');
  const { c, g } = sheet(D);
  const k = D / 120; // pixels per millimetre
  const C = D / 2;
  const ring = (r0, r1) => {
    g.beginPath();
    g.arc(C, C, r1 * k, 0, TAU);
    g.arc(C, C, r0 * k, 0, TAU, true);
    g.fill('evenodd');
  };

  if (album.kind === 'print') {
    // printed edge to edge with the cover's picture, a plain band round the rim for the words
    g.drawImage(album.art, 0, 0, D, D);
    g.fillStyle = alpha(p.bg, 0.92);
    ring(45.5, 54.5);
    rimText(g, D, album, 50, 4.4, p.ink);
  } else if (album.kind === 'holo') {
    // mostly bare: a black disc is at its best with the rainbow showing. One bold shape and the words.
    const motif = R.int(3);
    g.fillStyle = p.a;
    if (motif === 0) {
      const a0 = R.range(0, TAU);
      g.beginPath();
      g.moveTo(C, C);
      g.arc(C, C, 60 * k, a0, a0 + Math.PI * R.range(0.55, 0.95));
      g.fill();
    } else if (motif === 1) {
      ring(27, 39);
      g.fillStyle = p.b;
      const a = R.range(0, TAU);
      disc(g, C + Math.cos(a) * 33 * k, C + Math.sin(a) * 33 * k, 9 * k);
    } else {
      const a0 = R.range(0, TAU);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = [p.a, p.b, p.c][i];
        g.beginPath();
        g.moveTo(C, C);
        g.arc(C, C, 44 * k, a0 + (i * TAU) / 3, a0 + (i * TAU) / 3 + 0.7);
        g.fill();
      }
    }
    rimText(g, D, album, 51.5, 4.2, '#f4f4f4');
  } else if (album.kind === 'gold') {
    // Not a picture but a relief the disc shader reads: red is engraving, green the brushing
    // (0.5 = even). Lathe marks first, then lines cut through them.
    g.fillStyle = 'rgb(0, 128, 0)';
    g.fillRect(0, 0, D, D);
    g.lineWidth = 0.19 * k;
    for (let r = 19; r < 60; r += 0.17) {
      const v = Math.round(128 + (R() - 0.5) * 70 + 18 * Math.sin(r * 0.9) + 10 * Math.sin(r * 3.7));
      g.strokeStyle = `rgb(0, ${Math.max(40, Math.min(215, v))}, 0)`;
      g.beginPath();
      g.arc(C, C, r * k, 0, TAU);
      g.stroke();
    }
    g.strokeStyle = 'rgb(255, 128, 0)';
    g.fillStyle = 'rgb(255, 128, 0)';
    g.save();
    g.beginPath();
    g.arc(C, C, 45 * k, 0, TAU);
    g.arc(C, C, 23 * k, 0, TAU, true);
    g.clip('evenodd');
    g.lineWidth = 0.34 * k;
    engraveContours(g, C, C, 46 * k, R);
    g.restore();
    g.lineWidth = 0.3 * k;
    for (const r of [22, 46.2, 56.4]) {
      g.beginPath();
      g.arc(C, C, r * k, 0, TAU);
      g.stroke();
    }
    rimText(g, D, album, 51.3, 4.2, 'rgb(255, 128, 0)');
  } else {
    // vinyl: only the label is printed; the rest is groove
    const lr = 31;
    g.save();
    g.beginPath();
    g.arc(C, C, lr * k, 0, TAU);
    g.clip();
    const side = lr * 2 * k;
    g.drawImage(album.art, C - side / 2, C - side / 2, side, side);
    g.restore();
    g.strokeStyle = p.bg;
    g.lineWidth = 0.9 * k;
    g.beginPath();
    g.arc(C, C, (lr - 0.45) * k, 0, TAU);
    g.stroke();
    g.fillStyle = alpha(p.bg, 0.92);
    ring(19.5, 27);
    rimText(g, D, album, 23.2, 3.1, p.ink, `${album.artist} · side A · 33⅓`);
  }
  return c;
}

/* ---------------------------------------------------------------- all of them */

export function paintFaces(album, sizes) {
  return {
    cover: cover(album, sizes.paper),
    liner: linerPage(album, sizes.paper),
    inside: cardInside(album, sizes.paper),
    back: cardBack(album, sizes.paper),
    disc: discFace(album, sizes.disc),
  };
}

// a tiny picture of the album for the corner of the page
export function swatch(album) {
  return [album.palette.bg, album.palette.a, album.palette.b, album.palette.c];
}


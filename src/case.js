// The jewel case as a parts list, sized by measuring stills of the reference against its 120 mm disc.
// Millimetres. The case lies in its own XY plane, front toward +z, hinge on the left (-x).
// Everything is either a rod (a path swept with a rounded section) or a slab (a flat clear sheet).
import { Rods, slab, mergeSlabs, discGeometry, paperGeometry, fillet, arc, circle, roundRect, roundSquare } from './geometry.js';

export const HALF = 73; // a 146 mm square
export const HINGE = { x: -72, z: 4 }; // the lid turns about this line, which runs along y
export const DISC = { outer: 60, top: -1.2, bottom: -2.4, hole: 7.5, clear: 15 };
// the paper inside: a booklet held against the lid by its tabs, and a card under the tray
export const BOOKLET = { half: 67.5, corner: 2, z: 3.15 }; // in the lid's frame
export const CARD = { half: 70.5, corner: 6.5, z: -4.2 }; // in the tray's
// the heights shadows are cast from
export const LEVEL = { tray: CARD.z, lid: BOOKLET.z };

const deg = Math.PI / 180;
const polar = (r, a) => [r * Math.cos(a * deg), r * Math.sin(a * deg)];
const tube = (w, h, round, z, extra = {}) => ({ hw: w / 2, hh: h / 2, rc: Math.min(w, h) / 2 * round, z, ...extra });

export function buildTray({ clearHub }) {
  const r = new Rods();

  /* the frame: one fat tube round the edge, a thin bead under its outer side */
  const frame = tube(6.2, 6.0, 0.87, -0.6);
  const rail = HALF - frame.hw;
  r.add(roundSquare(rail, 6), frame, true);
  r.add(roundSquare(72.2, 7.2), tube(1.4, 1.4, 0.95, -4.4, { seg: 4 }), true);

  /* sleeves: short fatter collars along it. None in the middle of the hinge side, where the grip is */
  const sleeve = tube(7.2, 6.8, 0.88, frame.z, { ends: 'flat' });
  const sleeveAt = [-35.5, -11.5, 11.5, 35.5];
  for (const at of sleeveAt) {
    for (const side of [-1, 1]) {
      r.add([[at - 3.2, side * rail], [at + 3.2, side * rail]], sleeve);
      if (side > 0 || Math.abs(at) > 20) r.add([[side * rail, at - 3.2], [side * rail, at + 3.2]], sleeve);
    }
  }

  /* an inner rail that only survives as four corner brackets, each tied back to the frame */
  const bracket = tube(4.6, 5.0, 0.9, -1.1);
  const tie = tube(3.6, 4.2, 0.82, bracket.z);
  const inner = 64;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const reachY = sx < 0 ? 27 : 34; // the hinge-side pair stop short of the grip
      const reachX = 36;
      r.add(fillet([[sx * inner, sy * reachY], [sx * inner, sy * inner], [sx * reachX, sy * inner]], 4.6), bracket);
      r.add([[sx * inner, sy * reachY], [sx * rail, sy * reachY]], tie);
      r.add([[sx * reachX, sy * inner], [sx * reachX, sy * rail]], tie);
    }
  }

  /* the well the disc drops into, and four clips that reach over its edge */
  r.add(circle(0, 0, 61.8, 1.1), tube(2.2, 3.2, 0.86, -2.0, { seg: 5 }), true);
  r.add(circle(0, 0, 60.2, 1.1), tube(1.0, 1.5, 0.9, -2.9, { seg: 4 }), true);
  for (const a of [60, 120, 237, 303]) {
    r.add([polar(58.4, a), polar(63.4, a)], tube(3.0, 1.9, 0.84, -0.55, { seg: 4 }));
  }

  /* two finger scoops reaching up from the bottom brackets */
  for (const sx of [-1, 1]) {
    r.add(fillet([[sx * 45.5, -inner], [sx * 45.5, -50], [sx * 42, -46]], 4), tube(3.6, 3.6, 0.95, -1.9));
  }

  /* the grip on the hinge side: a low pad with a C-shaped ridge and a small window. It has to stay
     under the booklet, which lies just above it when the lid is shut */
  const pad = { cx: -62, hw: 11, hh: 22 };
  r.add(roundRect(pad.cx, 0, pad.hw - 0.8, pad.hh - 0.8, 3.5), tube(1.6, 1.6, 0.94, 1.3, { seg: 4 }), true);
  r.add(fillet([[-69, 13.5], [-58.5, 13.5], [-58.5, -13.5], [-69, -13.5]], 3.2), tube(2.6, 1.8, 0.9, 1.9));
  r.add(roundRect(-55.2, 0, 4.2, 3.0, 1.2), tube(1.3, 1.1, 0.9, 1.9, { seg: 3 }), true);

  /* the hub: stacked rings, and four posts round the spindle */
  r.add(circle(0, 0, 18.6, 0.7), tube(1.6, 1.5, 0.92, -0.5, { seg: 4 }), true);
  r.add(circle(0, 0, 16.4, 0.7), tube(0.9, 0.9, 0.93, -0.15, { seg: 3 }), true);
  r.add(circle(0, 0, 9.5, 0.6), tube(1.9, 1.9, 0.95, 0, { seg: 4 }), true);
  r.add(circle(0, 0, 6.5, 0.5), tube(1.1, 1.7, 0.9, -0.35, { seg: 3 }), true);
  const posts = [];
  for (const a of [45, 135, 225, 315]) {
    const [x, y] = polar(12.4, a);
    r.add(circle(x, y, 2, 0.4), tube(0.9, 1.2, 0.93, -0.3, { seg: 3 }), true);
    posts.push(circle(x, y, 1.7, 0.4));
  }

  /* hinge pins */
  const pinTube = tube(4.2, 4.2, 0.99, HINGE.z, { ends: 'flat' });
  for (const sy of [-1, 1]) r.add([[HINGE.x, sy * 44], [HINGE.x, sy * 63]], pinTube);

  const sheets = [
    slab(roundSquare(HALF, 8), -5.2, -3.8), // the floor
    slab(roundRect(pad.cx, 0, pad.hw, pad.hh, 4.2), 0.6, 2.0), // the grip's pad
    slab(circle(0, 0, 19.2, 0.7), -1.1, -0.2, [circle(0, 0, 6.1, 0.5), ...posts]), // the hub's plate
  ];
  if (clearHub) {
    // A CD is clear in the middle. That ring is drawn with the tray's plastic, so the hub shows through it.
    sheets.push(slab(circle(0, 0, DISC.clear, 0.6), DISC.bottom, DISC.top, [circle(0, 0, DISC.hole, 0.5)]));
    r.add(circle(0, 0, DISC.hole + 0.25, 0.5), tube(0.5, 1.2, 0.95, (DISC.top + DISC.bottom) / 2, { seg: 3 }), true);
  }
  return { rods: r.build(), sheets: mergeSlabs(sheets) };
}

export function buildLid() {
  const r = new Rods();
  /* the rim, and a fine lip just inside it */
  r.add(roundSquare(72, 7), tube(2, 2, 0.98, 4, { seg: 5 }), true);
  const lip = 69.5;
  r.add(roundSquare(lip, 5), tube(0.84, 0.8, 0.9, 3.3, { seg: 3 }), true);
  /* Half-moon tabs, two on each of the long edges, and small catches on the other two. The booklet
     slides in between these and the sheet, so they sit just under it. */
  const under = BOOKLET.z - 0.45;
  for (const side of [-1, 1]) {
    for (const x of [-41, 32]) {
      const [a0, a1] = side > 0 ? [Math.PI, Math.PI * 2] : [0, Math.PI];
      r.add(arc([x, side * lip], 4.2, a0, a1, 0.5), tube(0.84, 0.76, 0.9, under, { seg: 3 }));
    }
    for (const y of [-30, 30]) r.add([[side * lip, y - 3], [side * lip, y + 3]], tube(1.0, 0.8, 0.88, under, { seg: 3 }));
  }
  /* hinge barrels */
  const barrel = tube(4, 4, 0.99, HINGE.z, { ends: 'flat' });
  for (const sy of [-1, 1]) r.add([[HINGE.x, sy * 20], [HINGE.x, sy * 42]], barrel);
  return { rods: r.build(), sheets: mergeSlabs([slab(roundSquare(HALF, 8), 3.4, 5)]) };
}

export const buildBooklet = () => paperGeometry(BOOKLET.half, BOOKLET.corner, BOOKLET.z);
export const buildCard = () => paperGeometry(CARD.half, CARD.corner, CARD.z);
export const buildDisc = ({ clearHub }) => discGeometry(clearHub ? DISC.clear : DISC.hole, DISC.outer, DISC.top, DISC.bottom);

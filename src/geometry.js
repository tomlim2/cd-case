// Geometry is built in code: flat 2D paths (millimetres, in the case's own XY plane) swept into rods
// with a rounded-rectangle section, flat slabs cut from outlines, and the disc.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

/* ---------------------------------------------------------------- paths */

export function arc(c, r, a0, a1, chord = 1.2) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / chord));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return out;
}

export function circle(cx, cy, r, chord = 1) {
  const n = Math.max(24, Math.ceil((TAU * r) / chord));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

// replaces every corner of a polyline with an arc of radius r
export function fillet(pts, r, closed = false) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (!closed && (i === 0 || i === n - 1)) {
      out.push(p);
      continue;
    }
    const a = unit(sub(pts[(i - 1 + n) % n], p));
    const b = unit(sub(pts[(i + 1) % n], p));
    const half = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) / 2;
    if (half > Math.PI / 2 - 1e-3) {
      out.push(p); // no corner here
      continue;
    }
    const run = r / Math.tan(half);
    const centre = add(p, mul(unit(add(a, b)), r / Math.sin(half)));
    const from = add(p, mul(a, run));
    const to = add(p, mul(b, run));
    const a0 = Math.atan2(from[1] - centre[1], from[0] - centre[0]);
    let a1 = Math.atan2(to[1] - centre[1], to[0] - centre[0]);
    if (a1 - a0 > Math.PI) a1 -= TAU;
    if (a0 - a1 > Math.PI) a1 += TAU;
    out.push(...arc(centre, r, a0, a1, 0.8));
  }
  return out;
}

export const roundRect = (cx, cy, hw, hh, r) =>
  fillet([[cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh], [cx - hw, cy - hh]], r, true);
export const roundSquare = (half, r) => roundRect(0, 0, half, half, r);

/* ---------------------------------------------------------------- rods */

// outline of the section in (across, up), counter-clockwise, with its outward normals
function sectionOutline({ hw, hh, rc }, seg) {
  const pts = [];
  const nrm = [];
  const corners = [
    [hw - rc, hh - rc, 0],
    [-(hw - rc), hh - rc, Math.PI / 2],
    [-(hw - rc), -(hh - rc), Math.PI],
    [hw - rc, -(hh - rc), Math.PI * 1.5],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      const p = [cx + rc * Math.cos(a), cy + rc * Math.sin(a)];
      if (pts.length && close(p, pts[pts.length - 1])) continue;
      pts.push(p);
      nrm.push([Math.cos(a), Math.sin(a)]);
    }
  }
  if (close(pts[0], pts[pts.length - 1])) {
    pts.pop();
    nrm.pop();
  }
  return { pts, nrm };
}

// Collects rods into one mesh. Besides position and normal every vertex carries the rod it belongs
// to (the point of its centre line, the axis across it, the section's size) so the shader can follow
// a ray through the section it entered.
export class Rods {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.centre = [];
    this.side = [];
    this.size = [];
    this.cap = [];
    this.index = [];
  }

  vertex(p, n, c, s, sec, cap) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.centre.push(c[0], c[1], c[2]);
    this.side.push(s[0], s[1], 0);
    this.size.push(sec.hw, sec.hh, sec.rc);
    this.cap.push(cap);
    return this.pos.length / 3 - 1;
  }

  // sec: { hw, hh, rc, z, seg = 6, ends = 'round' | 'flat' }
  add(path, sec, closed = false) {
    const { pts: out, nrm: outN } = sectionOutline(sec, sec.seg ?? 6);
    const m = out.length;
    const n = path.length;
    const z = sec.z;

    // a frame at every point of the path: tangent, and the axis across (to the right of travel)
    const frames = path.map((p, i) => {
      const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const t = unit(sub(b, a));
      return { p, t, s: [t[1], -t[0]] };
    });

    const ring = (f, shrink = 1, push = 0, round = null) => {
      const c = [f.p[0], f.p[1], z];
      const first = this.pos.length / 3;
      for (let j = 0; j < m; j++) {
        const [a, h] = out[j];
        const [na, nh] = outN[j];
        const p = [c[0] + f.s[0] * a * shrink + f.t[0] * push, c[1] + f.s[1] * a * shrink + f.t[1] * push, z + h * shrink];
        let nv = [f.s[0] * na, f.s[1] * na, nh];
        if (round) {
          // on a rounded end the normal leans over toward the tip
          nv = [nv[0] * round.c + f.t[0] * round.s, nv[1] * round.c + f.t[1] * round.s, nv[2] * round.c];
          const l = Math.hypot(...nv) || 1;
          nv = nv.map((v) => v / l);
        }
        this.vertex(p, nv, c, f.s, sec, 0);
      }
      return first;
    };
    const band = (r0, r1, flip) => {
      for (let j = 0; j < m; j++) {
        const k = (j + 1) % m;
        if (flip) this.index.push(r0 + j, r0 + k, r1 + j, r0 + k, r1 + k, r1 + j);
        else this.index.push(r0 + j, r1 + j, r0 + k, r0 + k, r1 + j, r1 + k);
      }
    };

    const rings = frames.map((f) => ring(f));
    const spans = closed ? n : n - 1;
    for (let i = 0; i < spans; i++) band(rings[i], rings[(i + 1) % n], false);

    if (!closed) {
      const ends = [
        [frames[0], rings[0], -1],
        [frames[n - 1], rings[n - 1], 1],
      ];
      for (const [f, r, dir] of ends) {
        if (sec.ends === 'flat') {
          // a flat end is a window into the rod
          const c = [f.p[0], f.p[1], z];
          const nv = [f.t[0] * dir, f.t[1] * dir, 0];
          const hub = this.vertex(c, nv, c, f.s, sec, 1);
          const rim = out.map(([a, h]) => this.vertex([c[0] + f.s[0] * a, c[1] + f.s[1] * a, z + h], nv, c, f.s, sec, 1));
          for (let j = 0; j < m; j++) {
            const k = (j + 1) % m;
            if (dir > 0) this.index.push(hub, rim[k], rim[j]);
            else this.index.push(hub, rim[j], rim[k]);
          }
        } else {
          // a rounded end: the section shrinks to a point over a quarter turn
          const reach = 0.8 * Math.min(sec.hw, sec.hh);
          let prev = r;
          const steps = 5;
          for (let k = 1; k <= steps; k++) {
            const a = (k / steps) * (Math.PI / 2);
            const fd = { p: f.p, t: [f.t[0] * dir, f.t[1] * dir], s: f.s };
            const next = ring(fd, Math.cos(a), Math.sin(a) * reach, { c: Math.cos(a), s: Math.sin(a) * 1.1 });
            band(prev, next, dir < 0);
            prev = next;
          }
        }
      }
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aLine', new THREE.Float32BufferAttribute(this.centre, 3));
    g.setAttribute('aAcross', new THREE.Float32BufferAttribute(this.side, 3));
    g.setAttribute('aSection', new THREE.Float32BufferAttribute(this.size, 3));
    g.setAttribute('aEnd', new THREE.Float32BufferAttribute(this.cap, 1));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

/* ---------------------------------------------------------------- slabs */

// A flat sheet between z0 and z1, drawn as one face through its middle (its edges always sit under
// a rod, and the shader accounts for both surfaces at once). Every vertex carries the thickness.
export function slab(outline, z0, z1, holes = []) {
  const toV2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
  const shape = new THREE.Shape(toV2(outline));
  for (const h of holes) shape.holes.push(new THREE.Path(toV2(h)));
  const flat = new THREE.ShapeGeometry(shape, 1);
  const P = flat.attributes.position;
  const pos = [];
  const nrm = [];
  const z = (z0 + z1) / 2;
  for (let i = 0; i < P.count; i++) {
    pos.push(P.getX(i), P.getY(i), z);
    nrm.push(0, 0, 1);
  }
  const idx = Array.from(flat.index.array);
  flat.dispose();
  return { pos, nrm, idx, thick: new Array(pos.length / 3).fill(z1 - z0) };
}

export function mergeSlabs(parts) {
  const pos = [];
  const nrm = [];
  const thick = [];
  const idx = [];
  for (const p of parts) {
    const base = pos.length / 3;
    pos.push(...p.pos);
    nrm.push(...p.nrm);
    thick.push(...p.thick);
    for (const i of p.idx) idx.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aThick', new THREE.Float32BufferAttribute(thick, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------------- disc */

// An annulus with a printed face (aFace 0), a data side (1) and its two edges (2).
export function discGeometry(inner, outer, zTop, zBottom, around = 256) {
  const pos = [];
  const nrm = [];
  const face = [];
  const idx = [];
  const flatFace = (z, up, tag) => {
    const base = pos.length / 3;
    for (const r of [inner, outer]) {
      for (let i = 0; i < around; i++) {
        const a = (i / around) * TAU;
        pos.push(r * Math.cos(a), r * Math.sin(a), z);
        nrm.push(0, 0, up);
        face.push(tag);
      }
    }
    for (let i = 0; i < around; i++) {
      const a = base + i;
      const b = base + ((i + 1) % around);
      const c = a + around;
      const d = b + around;
      if (up > 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  };
  const wall = (r, out) => {
    const base = pos.length / 3;
    for (const z of [zBottom, zTop]) {
      for (let i = 0; i < around; i++) {
        const a = (i / around) * TAU;
        pos.push(r * Math.cos(a), r * Math.sin(a), z);
        nrm.push(out * Math.cos(a), out * Math.sin(a), 0);
        face.push(2);
      }
    }
    for (let i = 0; i < around; i++) {
      const a = base + i;
      const b = base + ((i + 1) % around);
      const c = a + around;
      const d = b + around;
      if (out > 0) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  };
  flatFace(zTop, 1, 0);
  flatFace(zBottom, -1, 1);
  wall(outer, 1);
  wall(inner, -1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aFace', new THREE.Float32BufferAttribute(face, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

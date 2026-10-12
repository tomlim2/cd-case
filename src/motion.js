// How the case moves: a pose is { x, y, z, yaw, pitch, roll, size, lid, spread, fade } and everything
// here turns a time into one. Angles in radians, distances in millimetres.

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
};

// A smooth curve through keys [[time, value], ...] that never overshoots between two of them
// (a monotone cubic: Fritsch and Carlson's limiter on Hermite tangents).
export function curve(keys) {
  const n = keys.length;
  const t = keys.map((k) => k[0]);
  const v = keys.map((k) => k[1]);
  const rise = [];
  for (let i = 0; i < n - 1; i++) rise.push((v[i + 1] - v[i]) / (t[i + 1] - t[i]));
  const m = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) m[i] = rise[i - 1] * rise[i] <= 0 ? 0 : (rise[i - 1] + rise[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (rise[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / rise[i];
    const b = m[i + 1] / rise[i];
    const far = a * a + b * b;
    if (far > 9) {
      const k = 3 / Math.sqrt(far);
      m[i] = k * a * rise[i];
      m[i + 1] = k * b * rise[i];
    }
  }
  return (x) => {
    if (x <= t[0]) return v[0];
    if (x >= t[n - 1]) return v[n - 1];
    let i = 0;
    while (x > t[i + 1]) i++;
    const h = t[i + 1] - t[i];
    const s = (x - t[i]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * v[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

export const blank = () => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, size: 1, lid: 0, spread: 0, fade: 1 });

// At rest the case is turned a little toward the light and never quite still.
export function resting(t, seed, calm = 1) {
  const p = blank();
  p.yaw = -0.18 + (0.095 * Math.sin(0.85 * t + seed) + 0.03 * Math.sin(2.0 * t + 2.1 * seed)) * calm;
  p.pitch = -0.11 + 0.042 * Math.sin(0.66 * t + 1.6 * seed) * calm;
  p.roll = 0.034 + 0.017 * Math.sin(0.47 * t + 0.8 * seed) * calm;
  p.y = 1.7 * Math.sin(1.05 * t + seed) * calm;
  return p;
}

const TURN = Math.PI * 2;
export const LID_OPEN = 3.04; // not quite flat: the lid rests on its own rim

// Opening: the case leans back a touch, spins once round, and the lid swings out through the
// second half of the turn so that it lands open as the case faces front again.
export const OPENING = {
  time: 1.7,
  yaw: curve([[0, 0], [0.22, -0.1], [0.5, 0.35], [0.72, 1.6], [0.9, 3.15], [1.08, 4.75], [1.25, 5.95], [1.42, 6.38], [1.7, TURN]]),
  lid: curve([[0, 0], [0.55, 0], [0.72, 0.35], [0.9, 1.25], [1.08, 2.25], [1.25, 2.9], [1.42, 3.14], [1.7, LID_OPEN]]),
  spread: curve([[0, 0], [0.6, 0], [1.3, 0.9], [1.7, 1]]),
  pitch: curve([[0, 0], [0.95, 0], [1.7, -0.1]]),
};

// Closing: the lid drops fast, hangs half way, then falls shut and bounces once on the catch,
// and the whole case nods as it lands.
export const CLOSING = {
  time: 1.5,
  lid: curve([[0, LID_OPEN], [0.16, 2.0], [0.4, 1.6], [0.8, 1.1], [1.05, 0.62], [1.2, 0.25], [1.28, 0], [1.34, 0.065], [1.42, 0]]),
  spread: curve([[0, 1], [0.25, 0.92], [0.9, 0.5], [1.3, 0]]),
  yaw: curve([[0, 0], [0.4, 0.2], [1.0, 0.1], [1.42, 0]]),
  pitch: curve([[0, -0.1], [1.2, -0.05], [1.28, 0.04], [1.38, -0.012], [1.5, 0]]),
  roll: curve([[0, 0], [0.6, -0.05], [1.5, 0]]),
};

// the pose of a case that is (or is on its way to being) open; at = seconds into the phase
export function lidPose(phase, at, t, seed, calm) {
  const p = resting(t, seed, calm);
  if (phase === 'opening') {
    const e = Math.min(at, OPENING.time);
    p.yaw = lerp(p.yaw, 0, clamp01(e / 0.8)) + OPENING.yaw(e);
    p.pitch = lerp(p.pitch, OPENING.pitch(e), clamp01(e / 1.1));
    p.roll *= 1 - clamp01(e / 1.1);
    p.lid = OPENING.lid(e);
    p.spread = OPENING.spread(e);
  } else if (phase === 'open') {
    p.yaw = 0.055 * Math.sin(0.6 * t) * calm;
    p.pitch = -0.1 + 0.02 * Math.sin(0.8 * t) * calm;
    p.roll = 0;
    p.lid = LID_OPEN + 0.024 * Math.sin(1.3 * t) * calm;
    p.spread = 1;
  } else if (phase === 'closing') {
    const e = Math.min(at, CLOSING.time);
    // hand back to the resting sway over the last stretch
    const back = ease.inOut(clamp01((e - 0.75) / (CLOSING.time - 0.75)));
    p.yaw = lerp(CLOSING.yaw(e), p.yaw, back);
    p.pitch = lerp(CLOSING.pitch(e), p.pitch, back);
    p.roll = lerp(CLOSING.roll(e), p.roll, back);
    p.lid = CLOSING.lid(e);
    p.spread = CLOSING.spread(e);
  }
  return p;
}

// Changing discs, as two tracks read off the reference clip. The old case swings out one way,
// drops back behind and thins away; the new one comes out from behind it the other way, swings
// wide, passes a little in front of where it will sit, and lands with a wobble. v runs 0..1.
export const SWAP_TIME = 1.0;
const SPAN = 146;

const OUT = {
  y: curve([[0, 0], [0.32, 0.6], [0.58, 0.8], [1, 0.18]]),
  z: curve([[0, 0], [0.5, -40], [1, -84]]),
  size: curve([[0, 1], [0.55, 0.86], [1, 0.58]]),
  roll: curve([[0, 0], [0.5, 0.19], [1, 0.06]]),
  pitch: curve([[0, 0], [0.42, 0.28], [1, 0]]),
  fade: curve([[0, 1], [0.5, 0.82], [0.8, 0.38], [1, 0]]),
};
const IN = {
  y: curve([[0, 0.12], [0.2, 0.52], [0.42, 0.86], [0.76, 0.16], [1, 0]]),
  z: curve([[0, -58], [0.26, -31], [0.55, 25], [1, 0]]),
  size: curve([[0, 0.58], [0.42, 0.9], [1, 1]]),
  roll: curve([[0, -0.26], [0.42, 0.1], [0.7, 0]]),
  pitch: curve([[0, 0.1], [0.42, -0.36], [0.8, 0.12], [1, 0]]),
};

export function leaving(p, v, dir) {
  p.y -= OUT.y(v) * dir * SPAN;
  p.z += OUT.z(v);
  p.size *= OUT.size(v);
  p.roll += OUT.roll(v) * dir;
  p.pitch += OUT.pitch(v) * dir;
  p.fade = OUT.fade(v);
  return p;
}

export function arriving(p, v, dir) {
  // the wobble as it lands
  const u = clamp01((v - 0.62) / 0.38);
  const ring = Math.exp(-4.5 * u) * Math.sin(13 * u) * (u > 0 ? 1 : 0);
  p.y += IN.y(v) * dir * SPAN;
  p.z += IN.z(v);
  p.size *= IN.size(v);
  p.roll += (IN.roll(v) + 0.045 * ring) * dir;
  p.pitch += IN.pitch(v) * dir;
  return p;
}

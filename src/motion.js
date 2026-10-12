// How the case moves: a pose is { x, y, z, yaw, pitch, roll, size, lid, spread, fade } and everything
// here turns a time into one. Angles in radians, distances in millimetres.

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

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
  p.yaw = -0.16 + (0.08 * Math.sin(0.8 * t + seed) + 0.025 * Math.sin(1.9 * t + 2.1 * seed)) * calm;
  p.pitch = -0.1 + 0.038 * Math.sin(0.63 * t + 1.6 * seed) * calm;
  p.roll = 0.03 + 0.015 * Math.sin(0.45 * t + 0.8 * seed) * calm;
  p.y = 1.6 * Math.sin(1.0 * t + seed) * calm;
  return p;
}

export const LID_OPEN = 3.04; // not quite flat: the lid rests on its own rim

// Opening: the catch gives with a little pop, the lid hangs there a beat, then swings right over,
// a touch too far, and settles. The case straightens up to face you as it goes.
export const OPENING = {
  time: 1.15,
  lid: curve([[0, 0], [0.1, 0.1], [0.2, 0.085], [0.5, 1.5], [0.76, 3.13], [0.94, 2.98], [1.15, LID_OPEN]]),
  spread: curve([[0, 0], [0.18, 0], [0.85, 1], [1.15, 1]]),
  pitch: curve([[0, 0], [0.1, 0.035], [0.5, -0.05], [1.15, -0.09]]),
  roll: curve([[0, 0], [0.1, -0.02], [0.4, 0.015], [1.15, 0]]),
};

// Closing: the lid comes over in one go, lands, bounces once on the catch, and the case nods.
export const CLOSING = {
  time: 0.95,
  lid: curve([[0, LID_OPEN], [0.5, 0.6], [0.66, 0], [0.74, 0.06], [0.83, 0]]),
  spread: curve([[0, 1], [0.55, 0.12], [0.72, 0]]),
  pitch: curve([[0, -0.09], [0.6, -0.04], [0.68, 0.04], [0.8, -0.012], [0.95, 0]]),
};

// the pose of a case whose lid is (or is on its way to being) open; at = seconds into the phase
export function lidPose(phase, at, t, seed, calm) {
  const p = resting(t, seed, calm);
  if (phase === 'opening') {
    const e = Math.min(at, OPENING.time);
    const square = smooth(clamp01(e / 0.8));
    p.yaw *= 1 - square;
    p.pitch = lerp(p.pitch, OPENING.pitch(e), square);
    p.roll = lerp(p.roll, OPENING.roll(e), square);
    p.lid = OPENING.lid(e);
    p.spread = OPENING.spread(e);
  } else if (phase === 'open') {
    p.yaw = 0.05 * Math.sin(0.6 * t) * calm;
    p.pitch = -0.09 + 0.018 * Math.sin(0.8 * t) * calm;
    p.roll = 0;
    p.lid = LID_OPEN + 0.022 * Math.sin(1.3 * t) * calm;
    p.spread = 1;
  } else if (phase === 'closing') {
    const e = Math.min(at, CLOSING.time);
    // hand back to the resting sway over the last stretch
    const back = smooth(clamp01((e - 0.45) / (CLOSING.time - 0.45)));
    p.yaw *= back;
    p.pitch = lerp(CLOSING.pitch(e), p.pitch, back);
    p.roll *= back;
    p.lid = CLOSING.lid(e);
    p.spread = CLOSING.spread(e);
  }
  return p;
}

// Changing albums is flicking through a rack: the one in front is pushed off to one side, turning
// away as it goes, and the next comes in from the other side and settles. v runs 0..1, dir is
// which way the rack is moving, reach how far off stage is (mm).
export const SWAP_TIME = 0.85;

const OUT = { x: curve([[0, 0], [0.25, 0.08], [0.7, 0.8], [1, 1]]), yaw: curve([[0, 0], [0.5, 0.55], [1, 0.75]]) };
const IN = {
  x: curve([[0, 1], [0.15, 0.95], [0.6, 0.12], [0.8, -0.025], [1, 0]]),
  yaw: curve([[0, -0.75], [0.6, -0.12], [0.8, 0.04], [1, 0]]),
  roll: curve([[0, -0.06], [0.6, 0.03], [1, 0]]),
};

export function leaving(p, v, dir, reach) {
  p.x -= OUT.x(v) * dir * reach;
  p.yaw += OUT.yaw(v) * dir;
  p.z -= 20 * v;
  return p;
}

export function arriving(p, v, dir, reach) {
  p.x += IN.x(v) * dir * reach;
  p.yaw += IN.yaw(v) * dir;
  p.roll += IN.roll(v) * dir;
  return p;
}

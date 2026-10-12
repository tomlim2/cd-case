// Everything about an album comes out of its seed, so the same seed always gives the same album.
// Each part (words, colours, art) draws from its own stream, so changing one never shifts another.

// a string to 32 bits (FNV-1a)
export function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// a small generator (mulberry32) with a few conveniences hung on it
export function rng(seed, stream = '') {
  let s = hash(`${seed}/${stream}`) || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + (b - a) * next();
  next.int = (n) => Math.floor(next() * n);
  next.chance = (p) => next() < p;
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.shuffle = (list) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  // one of the keys of { key: weight }
  next.weighted = (table) => {
    const entries = Object.entries(table);
    let at = next() * entries.reduce((sum, [, w]) => sum + w, 0);
    for (const [key, w] of entries) {
      at -= w;
      if (at <= 0) return key;
    }
    return entries[entries.length - 1][0];
  };
  return next;
}

// today's seed: the date, so everyone opening the page on the same day gets the same disc
export function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}
export const isDate = (seed) => /^20\d{6}$/.test(seed);
export const fresh = () => Math.random().toString(36).slice(2, 8);

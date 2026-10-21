// Small seeded PRNG so every character is reproducible from its seed.

/** FNV-1a hash of a string -> uint32. Used to derive independent seeds. */
export function hashString(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 wrapped with a few convenience samplers. */
export function makeRng(seed) {
  let a = (typeof seed === "number" ? seed : hashString(seed)) >>> 0;

  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** weights: { option: weight, ... } */
    weighted: (weights) => {
      const entries = Object.entries(weights).filter(([, w]) => w > 0);
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [key, w] of entries) {
        r -= w;
        if (r <= 0) return key;
      }
      return entries.length ? entries[entries.length - 1][0] : undefined;
    },
  };
}

// Palette utilities: perceptual colour space, k-means extraction, nearest lookup
// and preset resampling. Pure functions only, so this module is safe to import
// from both the main thread and the colour-extraction worker.

// ---------------------------------------------------------------------------
// sRGB <-> CIELAB
// ---------------------------------------------------------------------------

// Lookup table for sRGB -> linear, indexed by 0..255. Built once per thread.
const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const linearToSrgb = (c) => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};

// D65 reference white
const XN = 0.95047, YN = 1.0, ZN = 1.08883;

const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const labFInv = (t) => {
  const t3 = t * t * t;
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
};

/** [r,g,b] 0..255 -> [L,a,b] */
export function rgbToLab(rgb) {
  const R = SRGB_TO_LINEAR[rgb[0] | 0];
  const G = SRGB_TO_LINEAR[rgb[1] | 0];
  const B = SRGB_TO_LINEAR[rgb[2] | 0];

  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / XN;
  const y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / YN;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / ZN;

  const fx = labF(x), fy = labF(y), fz = labF(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** [L,a,b] -> [r,g,b] 0..255 */
export function labToRgb(lab) {
  const fy = (lab[0] + 16) / 116;
  const fx = lab[1] / 500 + fy;
  const fz = fy - lab[2] / 200;

  const x = labFInv(fx) * XN;
  const y = labFInv(fy) * YN;
  const z = labFInv(fz) * ZN;

  const R = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const G = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const B = x * 0.0557 + y * -0.204 + z * 1.057;

  return [linearToSrgb(R), linearToSrgb(G), linearToSrgb(B)];
}

/** Perceptual lightness 0..100 for [r,g,b]. */
export function lightness(rgb) {
  return rgbToLab(rgb)[0];
}

function labDist2(a, b) {
  const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

// ---------------------------------------------------------------------------
// Nearest-colour lookup
// ---------------------------------------------------------------------------

/**
 * Build a matcher for a fixed palette. Returns a function that maps [r,g,b]
 * to the index of the nearest palette entry in Lab space.
 */
export function makeNearestMatcher(paletteRgb) {
  const labs = paletteRgb.map(rgbToLab);
  const n = labs.length;
  // excludeIdx: optional palette index to skip (used so a background never
  // collapses onto its glyph's colour). Ignored when it would leave no choice.
  return (rgb, excludeIdx = -1) => {
    if (n === 0) return -1;
    const lab = rgbToLab(rgb);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (i === excludeIdx && n > 1) continue;
      const d = labDist2(lab, labs[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };
}

/** Return a copy of the palette sorted dark -> light by Lab lightness. */
export function sortByLightness(paletteRgb) {
  return paletteRgb
    .map((rgb) => ({ rgb, l: lightness(rgb) }))
    .sort((a, b) => a.l - b.l)
    .map((e) => e.rgb);
}

// ---------------------------------------------------------------------------
// k-means++ extraction (deterministic via seeded PRNG)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Extract k representative colours from RGBA pixel data.
 *
 * @param {Uint8ClampedArray} data   RGBA bytes (ImageData.data)
 * @param {number} k                 number of colours wanted (>= 1)
 * @param {object} [opts]
 * @param {number} [opts.maxSamples=8000]  cap on pixels used for clustering
 * @param {number} [opts.iterations=24]
 * @param {number} [opts.seed=1]
 * @returns {number[][]}  array of [r,g,b], most-populous cluster first
 */
export function extractPaletteKMeans(data, k, opts = {}) {
  const maxSamples = opts.maxSamples ?? 8000;
  const iterations = opts.iterations ?? 24;
  const rand = mulberry32(opts.seed ?? 1);

  k = Math.max(1, Math.floor(k));

  // ---- Sample pixels (skip near-transparent ones)
  const totalPx = data.length / 4;
  const stride = Math.max(1, Math.floor(totalPx / maxSamples));
  const samples = [];
  for (let p = 0; p < totalPx; p += stride) {
    const i = p * 4;
    if (data[i + 3] < 128) continue;
    samples.push(rgbToLab([data[i], data[i + 1], data[i + 2]]));
  }
  if (samples.length === 0) return [[0, 0, 0]];
  if (samples.length <= k) return samples.map(labToRgb);

  // ---- k-means++ init
  const centroids = [samples[Math.floor(rand() * samples.length)].slice()];
  const d2 = new Float64Array(samples.length).fill(Infinity);

  while (centroids.length < k) {
    const last = centroids[centroids.length - 1];
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      const d = labDist2(samples[i], last);
      if (d < d2[i]) d2[i] = d;
      sum += d2[i];
    }
    if (sum === 0) {
      // All samples identical to existing centroids; pad with duplicates.
      centroids.push(last.slice());
      continue;
    }
    let r = rand() * sum;
    let chosen = samples.length - 1;
    for (let i = 0; i < samples.length; i++) {
      r -= d2[i];
      if (r <= 0) { chosen = i; break; }
    }
    centroids.push(samples[chosen].slice());
  }

  // ---- Lloyd iterations
  const assign = new Int32Array(samples.length);
  const counts = new Int32Array(k);
  const sums = new Float64Array(k * 3);

  for (let it = 0; it < iterations; it++) {
    counts.fill(0);
    sums.fill(0);

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = labDist2(s, centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      assign[i] = best;
      counts[best]++;
      sums[best * 3] += s[0];
      sums[best * 3 + 1] += s[1];
      sums[best * 3 + 2] += s[2];
    }

    let moved = 0;
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        // Empty cluster: re-seed at the sample farthest from its centroid.
        let far = 0, farD = -1;
        for (let i = 0; i < samples.length; i++) {
          const d = labDist2(samples[i], centroids[assign[i]]);
          if (d > farD) { farD = d; far = i; }
        }
        centroids[c] = samples[far].slice();
        moved += 1;
        continue;
      }
      const nc = [sums[c * 3] / counts[c], sums[c * 3 + 1] / counts[c], sums[c * 3 + 2] / counts[c]];
      moved += labDist2(nc, centroids[c]);
      centroids[c] = nc;
    }

    if (moved < 0.01) break;
  }

  // ---- Order by cluster population (dominant first) and convert back to RGB
  return centroids
    .map((lab, i) => ({ lab, n: counts[i] }))
    .sort((a, b) => b.n - a.n)
    .map((e) => labToRgb(e.lab));
}

// ---------------------------------------------------------------------------
// Preset helpers
// ---------------------------------------------------------------------------

export function hexToRgbArr(hex) {
  const s = String(hex).replace("#", "");
  if (s.length !== 6) return [0, 0, 0];
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbArrToHex(rgb) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}`;
}

export function lerpRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * Resample a list of colours to exactly n entries by treating the list as
 * evenly spaced stops on a gradient. n === list length returns a copy.
 */
export function resamplePalette(paletteRgb, n) {
  const L = paletteRgb.length;
  n = Math.max(1, Math.floor(n));
  if (L === 0) return [];
  if (n === 1) return [paletteRgb[0].slice()];
  if (n === L) return paletteRgb.map((c) => c.slice());

  const out = [];
  for (let i = 0; i < n; i++) {
    const pos = (i / (n - 1)) * (L - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(L - 1, lo + 1);
    out.push(lerpRgb(paletteRgb[lo], paletteRgb[hi], pos - lo));
  }
  return out;
}

/**
 * Merge freshly generated colours into an existing palette, keeping locked
 * slots where they are and filling the rest. Generated colours that are
 * near-duplicates of a locked colour are used last.
 *
 * @param {{rgb:number[], locked:boolean}[]} current
 * @param {number[][]} generated
 * @param {number} n  target length
 */
export function mergeWithLocks(current, generated, n) {
  const locked = current.filter((s) => s && s.locked).map((s) => s.rgb);
  const lockedLab = locked.map(rgbToLab);

  const ranked = generated
    .map((rgb, i) => {
      const lab = rgbToLab(rgb);
      let minD = Infinity;
      for (const l of lockedLab) minD = Math.min(minD, labDist2(lab, l));
      return { rgb, i, minD };
    })
    // farthest-from-locked first, stable on original order
    .sort((a, b) => (b.minD - a.minD) || (a.i - b.i))
    .map((e) => e.rgb);

  const out = [];
  let g = 0;
  for (let i = 0; i < n; i++) {
    const cur = current[i];
    if (cur && cur.locked) {
      out.push({ rgb: cur.rgb.slice(), locked: true });
    } else {
      const rgb = ranked[g] ?? ranked[ranked.length - 1] ?? [0, 0, 0];
      g++;
      out.push({ rgb: rgb.slice(), locked: false });
    }
  }
  return out;
}

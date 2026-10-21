// Procedural alien generator.
//
// generateCharacter(params, { size, seed, outline }) returns:
//   {
//     size,                      // pixels per side
//     layers: { name: Uint8Array(size*size) },   // palette index per pixel, 0 = empty
//     pixels: Uint8Array,        // all layers flattened
//     palette: [[r,g,b], ...],   // indexed by IDX
//     background: [r,g,b],       // suggested backdrop, not part of the grid
//   }
//
// Geometry is defined in normalised units (0..1) and sampled at pixel centres,
// so the same parameters render at any size. Everything is mirrored around the
// vertical centre line by working in "half space": a = |u - 0.5|.

import { makeRng, hashString } from "./rng.js";
import { PARAMS, SPECIES, SPECIES_KEYS, DEFAULT_RANGES } from "./schema.js";

export const IDX = {
  NONE: 0,
  OUTLINE: 1,
  SKIN: 2,
  SKIN_SHADOW: 3,
  SKIN_LIGHT: 4,
  ACCENT: 5,
  EYE_WHITE: 6,
  EYE_DARK: 7,
  EYE_IRIS: 8,
  MOUTH: 9,
  CLOTH: 10,
  CLOTH_SHADOW: 11,
  SHINE: 12,
};

export const PALETTE_NAMES = [
  "none", "outline", "skin", "skin shadow", "skin light", "accent", "eye white",
  "eye dark", "eye iris", "mouth", "cloth", "cloth shadow", "shine",
];

// Bottom to top. Traits will slot in as further layers later.
export const LAYER_ORDER = ["back", "body", "head", "markings", "mouth", "eyes", "outline"];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapHue = (h) => ((h % 360) + 360) % 360;

function hslToRgb(h, s, l) {
  h = wrapHue(h) / 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export function buildPalette(p) {
  const h = p.skinHue, s = p.skinSat, l = p.skinLight;
  const pal = [];
  pal[IDX.NONE] = [0, 0, 0];
  pal[IDX.OUTLINE] = hslToRgb(h - 20, Math.min(40, s + 10), 9);
  pal[IDX.SKIN] = hslToRgb(h, s, l);
  pal[IDX.SKIN_SHADOW] = hslToRgb(h - 14, Math.min(100, s + 8), l - 15);
  pal[IDX.SKIN_LIGHT] = hslToRgb(h + 10, Math.max(0, s - 6), Math.min(93, l + 13));
  pal[IDX.ACCENT] = hslToRgb(h + p.accentShift, clamp(s + 15, 45, 95), clamp(l + 2, 38, 68));
  pal[IDX.EYE_WHITE] = hslToRgb(h, 14, 93);
  pal[IDX.EYE_DARK] = hslToRgb(h + 200, 30, 9);
  pal[IDX.EYE_IRIS] = hslToRgb(p.eyeHue, 88, 55);
  pal[IDX.MOUTH] = hslToRgb(h - 10, Math.min(90, s + 10), Math.max(8, l - 38));
  pal[IDX.CLOTH] = hslToRgb(p.clothHue, 38, 34);
  pal[IDX.CLOTH_SHADOW] = hslToRgb(p.clothHue - 8, 42, 23);
  pal[IDX.SHINE] = [255, 255, 255];
  return pal;
}

export function backgroundFor(p) {
  return hslToRgb(p.skinHue + 180, 40, 80);
}

// ---------------------------------------------------------------------------
// Parameter sampling
// ---------------------------------------------------------------------------

const snap = (v, def) => {
  const stepped = Math.round(v / def.step) * def.step;
  return clamp(+stepped.toFixed(4), def.min, def.max);
};

/** Roll a full parameter set for a species ("any" picks one). Deterministic. */
export function rollParams(speciesKey, seed) {
  const rng = makeRng(hashString(`roll:${speciesKey}:${seed}`));
  let key = speciesKey;
  if (!SPECIES[key]) key = rng.pick(SPECIES_KEYS);
  const preset = SPECIES[key];

  const out = { species: key };
  for (const def of PARAMS) {
    const spec = preset[def.key] ?? DEFAULT_RANGES[def.key];
    if (def.type === "number") {
      const [lo, hi] = spec ?? [def.min, def.max];
      out[def.key] = snap(rng.range(lo, hi), def);
    } else {
      const weights = spec ?? Object.fromEntries(def.options.map((o) => [o, 1]));
      out[def.key] = rng.weighted(weights);
    }
  }
  return out;
}

/**
 * Blend two parameter sets. strength 0 returns base, 1 returns fresh.
 * Numbers interpolate; choices flip to the fresh value with probability = strength.
 */
export function mixParams(base, fresh, strength, seed) {
  if (strength >= 1) return { ...fresh };
  const rng = makeRng(hashString(`mix:${seed}`));
  const out = { species: base.species };
  for (const def of PARAMS) {
    const a = base[def.key], b = fresh[def.key];
    if (def.type === "number") {
      // jitter the blend a little per parameter so variants differ from each other
      const t = clamp(strength * (0.4 + rng.next() * 1.2), 0, 1);
      if (def.key.endsWith("Hue") || def.key === "accentShift") {
        // shortest way round the hue circle
        let d = ((b - a + 540) % 360) - 180;
        out[def.key] = snap(wrapHue(a + d * t), def);
      } else {
        out[def.key] = snap(lerp(a, b, t), def);
      }
    } else {
      out[def.key] = rng.chance(strength) ? b : a;
    }
  }
  return out;
}

/** Fill in any parameters missing from a (possibly older) saved set. */
export function completeParams(p) {
  const fallback = rollParams(p?.species ?? "any", 1);
  const out = { ...fallback, ...(p || {}) };
  for (const def of PARAMS) {
    if (def.type === "number") {
      const v = Number(out[def.key]);
      out[def.key] = Number.isFinite(v) ? clamp(v, def.min, def.max) : fallback[def.key];
    } else if (!def.options.includes(out[def.key])) {
      out[def.key] = fallback[def.key];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Compositing
// ---------------------------------------------------------------------------

export function compositeLayers(layers, size, hidden = null) {
  const out = new Uint8Array(size * size);
  for (const name of LAYER_ORDER) {
    if (hidden && hidden.has(name)) continue;
    const L = layers[name];
    if (!L) continue;
    for (let i = 0; i < out.length; i++) if (L[i]) out[i] = L[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateCharacter(p, { size = 24, seed = 1, outline = true } = {}) {
  const N = Math.max(8, Math.round(size));
  const rng = makeRng(hashString(`detail:${seed}`));
  const px1 = 1 / N; // one pixel in normalised units

  const layers = {};
  for (const name of LAYER_ORDER) layers[name] = new Uint8Array(N * N);

  // ---- raster helpers -----------------------------------------------------
  const set = (L, x, y, idx) => {
    if (x >= 0 && x < N && y >= 0 && y < N) L[y * N + x] = idx;
  };
  const setSym = (L, x, y, idx) => { set(L, x, y, idx); set(L, N - 1 - x, y, idx); };
  // Thin features (stalks, antennae, tentacles) get a second pixel of width at
  // larger sizes so they keep the same visual weight. Centre-line strokes are
  // already two pixels wide once mirrored, so they are left alone.
  const thick = N >= 40;
  const strokeSym = (L, x, y, idx) => {
    setSym(L, x, y, idx);
    if (thick && x > N / 2) setSym(L, x + 1, y, idx);
  };
  const colOf = (a) => Math.round((0.5 + a) * N - 0.5); // half-space a -> right-side column
  const rowOf = (v) => Math.round(v * N - 0.5);

  /** test(a, v, u, x, y) -> palette index or 0. Symmetric whenever it only uses a. */
  const fill = (L, test) => {
    for (let y = 0; y < N; y++) {
      const v = (y + 0.5) / N;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N;
        const idx = test(Math.abs(u - 0.5), v, u, x, y);
        if (idx) L[y * N + x] = idx;
      }
    }
  };

  /** Mirrored line between two half-space points. idx may be a function of step t (0..1). */
  const lineSym = (L, a0, v0, a1, v1, idx) => {
    let x0 = colOf(a0), y0 = rowOf(v0);
    const x1 = colOf(a1), y1 = rowOf(v1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    const steps = Math.max(dx, dy) || 1;
    let err = dx - dy, i = 0;
    for (;;) {
      strokeSym(L, x0, y0, typeof idx === "function" ? idx(i / steps) : idx);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
      i++;
    }
  };

  /** Point-in-triangle test in half space. */
  const inTri = (a, v, A, B, C) => {
    const s = (P, Q) => (a - Q[0]) * (P[1] - Q[1]) - (P[0] - Q[0]) * (v - Q[1]);
    const d1 = s(A, B), d2 = s(B, C), d3 = s(C, A);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };

  // ---- head geometry ------------------------------------------------------
  const cy = p.headY, rx = p.headW, ry = p.headH, n = p.headShape;
  const top = cy - ry, bottom = cy + ry;

  /** Half-width of the head at height v (0 outside). */
  const halfW = (v) => {
    const dy = (v - cy) / ry;
    if (dy <= -1 || dy >= 1) return 0;
    const taper = dy > 0
      ? 1 - p.chinTaper * Math.pow(dy, 1.5)
      : 1 - p.crownTaper * Math.pow(-dy, 1.5);
    if (taper <= 0) return 0;
    return rx * taper * Math.pow(1 - Math.pow(Math.abs(dy), n), 1 / n);
  };
  const inHead = (a, v) => a < halfW(v);

  // ---- top appendages (behind the head) -----------------------------------
  const back = layers.back;
  const spread = p.appSpread, len = p.appLen;
  const minV = 0.5 * px1; // top row centre
  let stalkEyes = null;   // when set, eyes sit on stalks instead of on the face

  if (p.top === "antennae") {
    const baseV = top + ry * 0.3;
    const a0 = Math.min(spread * rx * 0.8, halfW(baseV) * 0.85);
    const a1 = a0 + len * 0.5 * spread + px1;
    const v1 = Math.max(minV, top - len);
    lineSym(back, a0, baseV, a1, v1, IDX.SKIN_SHADOW);
    const tx = colOf(a1), ty = rowOf(v1);
    setSym(back, tx, ty, IDX.ACCENT);
    if (N >= 32) {
      setSym(back, tx + 1, ty, IDX.ACCENT); setSym(back, tx - 1, ty, IDX.ACCENT);
      setSym(back, tx, ty + 1, IDX.ACCENT); if (ty > 0) setSym(back, tx, ty - 1, IDX.ACCENT);
    }
  } else if (p.top === "horns") {
    const baseV = top + ry * 0.45;
    const ac = Math.min(spread * rx * 0.8, Math.max(px1, halfW(baseV) * 0.8));
    const bw = Math.max(1.2 * px1, rx * 0.2);
    const A = [Math.max(0, ac - bw), baseV], B = [ac + bw, baseV];
    const C = [ac + len * 0.45 * spread + bw * 0.3, Math.max(minV, top - len * 0.85)];
    fill(back, (a, v) => (inTri(a, v, A, B, C) ? (a > ac ? IDX.SKIN_SHADOW : IDX.EYE_WHITE) : 0));
  } else if (p.top === "crest") {
    const cw = Math.max(0.9 * px1, 0.03 + spread * 0.02);
    const vTop = Math.max(0, top - len);
    const vEnd = cy - ry * 0.35;
    fill(back, (a, v, u, x, y) => {
      if (v < vTop || v > top + ry * 0.5) return 0;
      const w = cw + (y % 2 === 0 ? px1 : 0); // serrated edge
      return a < w ? IDX.ACCENT : 0;
    });
    // continue the ridge down the forehead, over the head
    fill(layers.markings, (a, v) => (v >= top && v <= vEnd && a < cw && inHead(a, v) ? IDX.ACCENT : 0));
  } else if (p.top === "stalks") {
    const tips = [];
    const baseV = top + ry * 0.35;
    const outer = Math.min(0.44, spread * rx * 0.95 + 0.05);
    const tipV = Math.max(p.eyeSize * p.eyeAspect + 1.5 * px1, top - len);
    const pair = (aTip, vTip, scale) => {
      lineSym(back, Math.min(aTip * 0.55, halfW(baseV) * 0.8), baseV, aTip, vTip, IDX.SKIN_SHADOW);
      tips.push({ a: aTip, v: vTip, scale });
    };
    if (p.eyeLayout === "one") pair(0, tipV, 1.2);
    else if (p.eyeLayout === "two") pair(outer, tipV, 1);
    else if (p.eyeLayout === "three") { pair(0, Math.max(tipV - len * 0.15, tipV * 0.6), 1); pair(outer, tipV + len * 0.3, 0.85); }
    else { pair(outer * 0.5, tipV, 0.9); pair(outer, tipV + len * 0.4, 0.8); }
    stalkEyes = tips;
  }

  // ---- side appendages ----------------------------------------------------
  if (p.sides === "ears") {
    const vA = cy - ry * 0.25, vB = cy + ry * 0.2;
    const base = Math.max(halfW(vA), halfW(vB)) * 0.85;
    const tip = [Math.min(0.49, halfW(cy) + len * 0.9), Math.max(minV, vA - len * 0.8)];
    fill(back, (a, v) => (inTri(a, v, [base, vA], [base, vB], tip) ? (v > lerp(vA, vB, 0.5) ? IDX.SKIN_SHADOW : IDX.SKIN) : 0));
  } else if (p.sides === "fins") {
    for (let k = 0; k < 3; k++) {
      const vk = cy - ry * 0.3 + k * ry * 0.32;
      const h = Math.max(px1, ry * 0.11);
      const base = halfW(vk) * 0.85;
      const tip = [Math.min(0.495, halfW(vk) + len * (0.8 - k * 0.2)), vk - h * 0.4];
      fill(back, (a, v) => (inTri(a, v, [base, vk - h], [base, vk + h], tip) ? IDX.ACCENT : 0));
    }
  } else if (p.sides === "tendrils") {
    for (let k = 0; k < 2; k++) {
      const v0 = cy + ry * (0.05 + k * 0.3);
      const a0 = halfW(v0) * 0.9 + px1 * 0.5;
      const rows = Math.max(2, Math.round((len * (1.5 - k * 0.4)) * N));
      const phase = rng.next() * 6.28;
      for (let i = 0; i <= rows; i++) {
        const a = a0 + px1 * (1 + Math.sin(i * 0.9 + phase) * 1.1) + (i / rows) * len * 0.3;
        strokeSym(back, colOf(a), rowOf(v0) + i, i === rows ? IDX.ACCENT : IDX.SKIN_SHADOW);
      }
    }
  }

  // ---- body ---------------------------------------------------------------
  const body = layers.body;
  if (p.body !== "none") {
    const sy = Math.max(p.shoulderY, bottom - ry * 0.1); // shoulders never above the chin
    const skinBody = p.body === "blob" || p.body === "tiny";
    const base = skinBody ? IDX.SKIN : IDX.CLOTH;
    const shade = skinBody ? IDX.SKIN_SHADOW : IDX.CLOTH_SHADOW;

    fill(body, (a, v, u) => {
      if (p.body === "blob") {
        // a dome rising from below the frame that the head melts into
        const cyB = 1.04, ryB = cyB - (cy + ry * 0.15), rxB = p.shoulderW * 1.08;
        const dy = (v - cyB) / ryB;
        if (dy < -1) return 0;
        const w = rxB * Math.sqrt(Math.max(0, 1 - dy * dy));
        if (a >= w) return 0;
        return u - 0.5 > w * 0.45 ? IDX.SKIN_SHADOW : IDX.SKIN;
      }

      // neck (always skin)
      if (v >= cy && v < sy + px1 && a < p.neckW) {
        return u - 0.5 > p.neckW * 0.35 ? IDX.SKIN_SHADOW : IDX.SKIN;
      }
      if (v < sy) return 0;

      let w;
      if (p.body === "robe") {
        w = lerp(p.neckW * 1.7, p.shoulderW * 1.15, clamp((v - sy) / Math.max(px1, 1 - sy), 0, 1));
        if (a < w && a < 0.75 * px1) return IDX.ACCENT; // centre seam
      } else {
        const t = clamp((v - sy) / 0.1, 0, 1);
        const scale = p.body === "tiny" ? 0.62 : 1;
        w = p.shoulderW * scale * (1 - p.shoulderSlope * (1 - t) * (1 - t));
      }
      if (a >= w) return 0;
      return u - 0.5 > w * 0.5 ? shade : base;
    });
  }

  // ---- head ---------------------------------------------------------------
  const head = layers.head;
  fill(head, (a, v, u) => {
    if (!inHead(a, v)) return 0;
    // light from the upper left
    const d = ((u - 0.5) / rx) * 0.72 + ((v - cy) / ry) * 0.6;
    if (d > 0.5) return IDX.SKIN_SHADOW;
    if (d < -0.62) return IDX.SKIN_LIGHT;
    return IDX.SKIN;
  });

  // shadow the head casts on whatever is directly beneath it
  const castRows = N >= 40 ? 2 : 1;
  for (let y = 1; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!body[i] || head[i]) continue;
      let under = false;
      for (let k = 1; k <= castRows; k++) if (y - k >= 0 && head[(y - k) * N + x]) under = true;
      if (!under) continue;
      if (body[i] === IDX.SKIN) body[i] = IDX.SKIN_SHADOW;
      else if (body[i] === IDX.CLOTH) body[i] = IDX.CLOTH_SHADOW;
    }
  }

  // ---- eyes ---------------------------------------------------------------
  const eyes = layers.eyes;
  const eRx = p.eyeSize, eRy = p.eyeSize * p.eyeAspect;
  let eyeBottom = top; // lowest point reached by a face eye, for mouth placement

  const drawEye = (aC, vC, scale, onFace) => {
    const rX = Math.max(0.55 * px1, eRx * scale), rY = Math.max(0.55 * px1, eRy * scale);
    const central = aC < px1 * 0.5;
    const slant = central ? 0 : p.eyeSlant;
    const rPx = rX * N;
    const style = p.eyeStyle;

    fill(eyes, (a, v, u, x, y) => {
      const ex = central ? a : a - aC;          // + is outward
      const ey = v - vC + slant * ex;           // positive slant lifts the outer corner
      const q = (ex / rX) ** 2 + (ey / rY) ** 2;
      if (q > 1) return 0;

      if (style === "almond") return IDX.EYE_DARK;
      if (style === "compound") return (x + y) % 2 === 0 ? IDX.EYE_DARK : IDX.EYE_IRIS;
      if (style === "glow") return q < 0.2 && rPx >= 1.5 ? IDX.SHINE : IDX.EYE_IRIS;
      if (style === "slit") {
        return Math.abs(ex) <= Math.max(0.5 * px1, rX * 0.22) ? IDX.EYE_DARK : IDX.EYE_IRIS;
      }
      // round: sclera, iris ring, pupil
      if (rPx < 1.2) return IDX.EYE_DARK;
      if (q < 0.24) return IDX.EYE_DARK;
      if (q < 0.55 && rPx >= 2.6) return IDX.EYE_IRIS;
      return IDX.EYE_WHITE;
    });

    // guarantee at least one pixel
    const cxPx = colOf(central ? 0 : aC), cyPx = rowOf(vC);
    if (cxPx >= 0 && cxPx < N && cyPx >= 0 && cyPx < N && !eyes[cyPx * N + cxPx]) {
      setSym(eyes, cxPx, cyPx, style === "glow" || style === "slit" ? IDX.EYE_IRIS : IDX.EYE_DARK);
    }

    // a single catch-light towards the light source, same side on both eyes
    if (rPx >= 1.4 && (style === "almond" || style === "round" || style === "slit")) {
      const sy = rowOf(vC - rY * 0.4);
      const offs = rX * 0.4;
      const xs = central ? [Math.round((0.5 - offs) * N - 0.5)]
        : [Math.round((0.5 + aC - offs) * N - 0.5), Math.round((0.5 - aC - offs) * N - 0.5)];
      for (const sx of xs) if (eyes[sy * N + sx]) set(eyes, sx, sy, IDX.SHINE);
    }

    if (onFace) eyeBottom = Math.max(eyeBottom, vC + rY);
  };

  if (stalkEyes) {
    for (const t of stalkEyes) {
      // a skin socket behind each stalk eye so it reads as an eyeball on a stem
      const rS = Math.max(eRx, eRy) * t.scale + px1;
      fill(back, (a, v) => {
        const ex = t.a < px1 * 0.5 ? a : a - t.a;
        return ex * ex + (v - t.v) * (v - t.v) <= rS * rS ? IDX.SKIN : 0;
      });
      drawEye(t.a, t.v, t.scale, false);
    }
  } else {
    const vE = clamp(cy + p.eyeY * ry, top + eRy * 0.5, bottom - px1);
    const fit = (aC, v, r) => clamp(aC, r + 0.6 * px1, Math.max(r + 0.6 * px1, halfW(v) * 0.95));
    const sp = fit(p.eyeSpacing, vE, eRx);
    switch (p.eyeLayout) {
      case "one":
        drawEye(0, vE, 1.55, true);
        break;
      case "three":
        drawEye(sp, vE, 1, true);
        drawEye(0, Math.max(top + eRy, vE - eRy * 1.3 - ry * 0.22), 0.7, true);
        break;
      case "four": {
        const d = eRy * 0.95 + px1;
        drawEye(fit(p.eyeSpacing * 1.1, vE - d, eRx * 0.8), vE - d, 0.8, true);
        drawEye(fit(p.eyeSpacing * 0.75, vE + d, eRx * 0.6), vE + d, 0.6, true);
        break;
      }
      case "many": {
        drawEye(0, vE, 0.9, true);
        const d = eRy * 0.9 + px1;
        drawEye(fit(p.eyeSpacing * 1.15, vE - d * 0.6, eRx * 0.6), vE - d * 0.6, 0.6, true);
        drawEye(fit(p.eyeSpacing * 1.6, vE + d * 0.5, eRx * 0.45), vE + d * 0.5, 0.45, true);
        break;
      }
      case "two":
      default:
        drawEye(sp, vE, 1, true);
    }
  }

  // ---- mouth --------------------------------------------------------------
  const mouth = layers.mouth;
  if (p.mouth !== "none") {
    const lo = Math.min(bottom - 2 * px1, eyeBottom + 1.5 * px1);
    const mv = clamp(cy + p.mouthY * ry, lo, bottom - 1.5 * px1);
    const mw = Math.max(0.8 * px1, Math.min(p.mouthW, halfW(mv) * 0.78));
    const yM = rowOf(mv);
    const wPx = Math.max(1, Math.round(mw * N));
    const x0 = Math.floor(N / 2);
    const curve = Math.max(1, Math.round(N / 20));

    if (p.mouth === "slit" || p.mouth === "smile" || p.mouth === "frown") {
      for (let i = 0; i < wPx; i++) {
        const bend = wPx > 1 ? Math.round(curve * (i / (wPx - 1)) ** 2) : 0;
        const y = p.mouth === "smile" ? yM - bend : p.mouth === "frown" ? yM + bend : yM;
        setSym(mouth, x0 + i, y, IDX.MOUTH);
      }
    } else if (p.mouth === "teeth") {
      const h = Math.max(2, Math.round(N * 0.075));
      for (let r = 0; r < h; r++) {
        for (let i = 0; i < wPx; i++) {
          let idx = IDX.MOUTH;
          if (r === 0 && i % 2 === 0) idx = IDX.EYE_WHITE;
          if (h >= 3 && r === h - 1 && i % 2 === 1) idx = IDX.EYE_WHITE;
          setSym(mouth, x0 + i, yM + r, idx);
        }
      }
    } else if (p.mouth === "o") {
      const r = Math.max(px1, mw * 0.5);
      fill(mouth, (a, v) => ((a / r) ** 2 + ((v - mv) / (r * 1.15)) ** 2 <= 1 ? IDX.MOUTH : 0));
      if (!mouth[yM * N + x0]) setSym(mouth, x0, yM, IDX.MOUTH);
    } else if (p.mouth === "tentacles") {
      const count = N >= 32 ? 3 : 2;
      for (let i = 0; i < wPx; i++) setSym(mouth, x0 + i, yM, IDX.SKIN_SHADOW); // upper lip
      for (let j = 0; j < count; j++) {
        const aj = mw * ((j + 0.5) / count);
        const rows = Math.max(2, Math.round((p.appLen * (1.1 - j * 0.18) + 0.04) * N));
        const phase = rng.next() * 6.28;
        for (let i = 1; i <= rows; i++) {
          const a = aj + px1 * Math.sin(i * 0.8 + phase) * 0.9;
          const idx = i === rows ? IDX.ACCENT : j % 2 === 0 ? IDX.SKIN : IDX.SKIN_SHADOW;
          strokeSym(mouth, colOf(Math.max(0, a)), yM + i, idx);
        }
      }
    } else if (p.mouth === "mandibles") {
      for (let i = 0; i < Math.max(1, Math.round(wPx / 2)); i++) setSym(mouth, x0 + i, yM, IDX.MOUTH);
      lineSym(mouth, mw * 1.35, mv - 1.5 * px1, mw * 0.35, mv + Math.max(2 * px1, 0.09), (t) => (t > 0.7 ? IDX.EYE_WHITE : IDX.ACCENT));
    }
  }

  // ---- markings (only ever on the head) -----------------------------------
  const marks = layers.markings;
  const onHead = (x, y) => x >= 0 && x < N && y >= 0 && y < N && head[y * N + x] !== 0;
  const density = p.markDensity;

  if (p.markings === "spots") {
    const k = Math.round(density * 7) + 1;
    const spots = [];
    for (let i = 0; i < k; i++) {
      spots.push([rng.next() * rx, lerp(top, bottom, 0.08 + rng.next() * 0.84), 0.018 + rng.next() * 0.045]);
    }
    fill(marks, (a, v, u, x, y) => {
      if (!onHead(x, y)) return 0;
      for (const [sa, sv, sr] of spots) if ((a - sa) ** 2 + (v - sv) ** 2 <= sr * sr) return IDX.ACCENT;
      return 0;
    });
  } else if (p.markings === "stripes") {
    const period = Math.max(2, Math.round(N * (0.15 - 0.07 * density)));
    const thick = N >= 40 ? 2 : 1;
    const y0 = rowOf(top);
    fill(marks, (a, v, u, x, y) => {
      if (!onHead(x, y)) return 0;
      if (v > cy + ry * 0.55) return 0;
      if (a < halfW(v) * 0.5) return 0;        // keep the face clear
      return (y - y0) % period < thick ? IDX.ACCENT : 0;
    });
  } else if (p.markings === "gem") {
    const gv = top + ry * 0.42;
    const gw = Math.max(px1, 0.03 + density * 0.03);
    fill(marks, (a, v, u, x, y) => {
      if (!onHead(x, y)) return 0;
      const q = a / gw + Math.abs(v - gv) / (gw * 1.35);
      if (q > 1) return 0;
      return q < 0.35 && gw * N >= 1.5 ? IDX.SHINE : IDX.EYE_IRIS;
    });
  } else if (p.markings === "freckles") {
    const k = Math.round(density * 10) + 2;
    const vLo = Math.min(bottom, Math.max(top, eyeBottom));
    for (let i = 0; i < k; i++) {
      const v = lerp(vLo, bottom, rng.next() * 0.7);
      const a = halfW(v) * (0.3 + rng.next() * 0.6);
      const x = colOf(a), y = rowOf(v);
      if (onHead(x, y)) setSym(marks, x, y, IDX.SKIN_SHADOW);
    }
  }

  // ---- outline ------------------------------------------------------------
  const flat = compositeLayers(layers, N);
  if (outline) {
    const out = layers.outline;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (flat[i]) continue;
        if ((x > 0 && flat[i - 1]) || (x < N - 1 && flat[i + 1]) || (y > 0 && flat[i - N]) || (y < N - 1 && flat[i + N])) {
          out[i] = IDX.OUTLINE;
        }
      }
    }
  }

  return {
    size: N,
    layers,
    pixels: compositeLayers(layers, N),
    palette: buildPalette(p),
    background: backgroundFor(p),
  };
}

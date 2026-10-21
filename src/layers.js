// Layer store.
//
// The app keeps all of its settings as window.* globals, and every control and
// the renderer read them from there. A layer is simply a snapshot of the
// per-layer subset of those globals. The ACTIVE layer always lives in
// window.* (so the existing controls keep working unchanged); the others are
// held here and swapped in temporarily when they need to be drawn.
//
// Global (not per layer): flat background colour/alpha, PNG width, the image.

export const MAX_LAYERS = 5;

export const LAYER_KEYS = [
  // layer opacity
  "layerGlyphAlpha", "layerBgAlpha",
  // colour mode
  "useImageColors", "colorCount", "LERP",
  "imageGlyphHueOffset", "imageGlyphSatOffset", "imageGlyphLightOffset",
  // characters
  "baseDensity", "zeroCount", "spaceCount", "density",
  "cF", "mP", "gridColumns",
  // manual colours
  "startColor", "middleColor", "endColor",
  // pixel background
  "advancedBgMode", "pixelColorRGB", "hOffset", "sOffset", "lOffset",
  // shadows
  "shadowMode", "shadowColorMode",
  "shadowDx", "shadowDy", "shadowDx2", "shadowDy2", "shadowSymmetric", "shadowAlphaMult",
  "shadowHueOffset", "shadowSatOffset", "shadowLightOffset",
  "shadowHueOffset2", "shadowSatOffset2", "shadowLightOffset2",
  "shadow1RGB", "shadow1A", "shadow2RGB", "shadow2A",
  // palette constraint
  "paletteEnabled", "paletteSize", "paletteSource", "paletteMapping", "palette",
];

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const store = {
  layers: [],   // [{ state: {...}, visible: true }]
  active: 0,
};

export function snapshotWindow() {
  const s = {};
  for (const k of LAYER_KEYS) if (window[k] !== undefined) s[k] = clone(window[k]);
  return s;
}

export function applySnapshot(s) {
  for (const k of LAYER_KEYS) if (k in s) window[k] = clone(s[k]);
}

/** Start with a single layer holding whatever is in window.* right now. */
export function initLayers() {
  store.layers = [{ state: snapshotWindow(), visible: true }];
  store.active = 0;
}

export const getLayerCount = () => store.layers.length;
export const getActiveLayer = () => store.active;
export const isLayerVisible = (i) => store.layers[i]?.visible !== false;
export const getLayerState = (i) => (i === store.active ? null : store.layers[i]?.state ?? null);

/** Copy the live window.* into the active layer's slot. */
export function saveActive() {
  if (store.layers[store.active]) store.layers[store.active].state = snapshotWindow();
}

export function setActiveLayer(i) {
  if (!store.layers[i] || i === store.active) return false;
  saveActive();
  store.active = i;
  applySnapshot(store.layers[i].state);
  return true;
}

export function setLayerVisible(i, visible) {
  if (store.layers[i]) store.layers[i].visible = !!visible;
}

/**
 * Grow or shrink the stack. makeFresh() must return a state snapshot for a
 * brand-new layer. Shrinking drops the top layers.
 */
export function setLayerCount(n, makeFresh) {
  n = Math.max(1, Math.min(MAX_LAYERS, Math.round(Number(n)) || 1));
  saveActive();
  while (store.layers.length < n) store.layers.push({ state: makeFresh(), visible: true });
  while (store.layers.length > n) store.layers.pop();
  if (store.active >= n) {
    store.active = n - 1;
    applySnapshot(store.layers[store.active].state);
  }
  return n;
}

/**
 * Run fn with window.* holding layer i's settings. The active layer runs on
 * the live globals; any other layer is swapped in and swapped back out again.
 */
export function withLayer(i, fn) {
  if (i === store.active || !store.layers[i]) return fn();
  const live = snapshotWindow();
  applySnapshot(store.layers[i].state);
  try {
    return fn();
  } finally {
    applySnapshot(live);
  }
}

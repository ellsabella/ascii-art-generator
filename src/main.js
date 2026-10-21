import p5 from "p5";
import "./styles.css";
import { initializeControls, loadNewImage } from "./controls.js";
import { loadFont, getSubsetFont, fontToBase64 } from "./fontsubset.js";
import { updateColorMap, hslToRgb, rgbToHsl, getActivePaletteRgb } from "./colorUtils.js";
import { applyHslOffsetToRgb, clamp } from "./colorUtils.js";
import { makeNearestMatcher, sortByLightness, rgbToLab } from "./paletteUtils.js";
import { withLayer, getLayerCount, isLayerVisible, getActiveLayer } from "./layers.js";

// Asset paths. Overridable via .env (VITE_DEFAULT_FONT / VITE_DEFAULT_IMAGE),
// but fall back to the bundled assets in /public so a fresh clone runs.
const DEFAULT_FONT_PATH = import.meta.env.VITE_DEFAULT_FONT || "/fonts/geom2.ttf";
const DEFAULT_IMAGE_PATH = import.meta.env.VITE_DEFAULT_IMAGE || "/img/sun.png";

let p5Instance;
let animationFrameId = null;
let colorExtractionWorker = new Worker(
  new URL("./color-extraction-worker.js", import.meta.url),
  { type: "module" }
);
let gridCellColors = null;          // cell colours of the layer currently being drawn
const cellColorCache = new Map();   // layerIndex -> { columns, rows, colors }
const cellColorPending = new Set(); // layer indices with an extraction in flight

function createSketch(p) {
  let font;
  let gridRows, gw, ar, windowAR, offscreen, highResImg;
  window.useImageColors = false;
  window.baseDensity = "RRBZ21";
  window.zeroCount = 4;
  window.spaceCount = 0;
  window.density = window.baseDensity + "0".repeat(window.zeroCount) + " ".repeat(window.spaceCount);
  window.colorCount = 2;
  window.gridColumns = 150;
  window.printRes = 900;
  window.cF = 0.55;
  window.mP = 141;
  window.LERP = true;
  window.startColor = [30, 100, 100, 1];  // HSLA
  window.middleColor = [45, 100, 50, 1]; // HSLA
  window.endColor = [0, 0, 33, 1];   // HSLA
  if (typeof window.hOffset !== "number") window.hOffset = 0;
  if (typeof window.sOffset !== "number") window.sOffset = 0;
  if (typeof window.lOffset !== "number") window.lOffset = 0;
  window.bgColorRGB = window.bgColorRGB || [0, 0, 0];
  if (typeof window.bgAlpha !== "number") window.bgAlpha = 1;

  window.advancedBgMode = window.advancedBgMode || "off";

  let colorMap;
  let isDownloading = false;

  function updateColumns(newColumns) {
    window.gridColumns = newColumns;
    // Per-layer cell colours are keyed by grid size, so a stale cache is
    // detected at draw time and re-extracted automatically.
    window.updateSketch();
  }

  window.updateColumns = updateColumns;

  window.updateSketch = function () {

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    animationFrameId = requestAnimationFrame(() => {
      try {
        if (!window.img || typeof window.img.height === "undefined" || typeof window.img.width === "undefined") {
          console.log("No valid image available");
          return;
        }

        if (!p || typeof p.floor !== "function" || typeof p.width === "undefined") {
          console.log("p5 instance not properly initialized");
          return;
        }

        gridRows = p.floor(window.gridColumns * (window.img.height / window.img.width));
        gw = p.width / window.gridColumns;

        drawAsciiArt();
        p.redraw();
      } catch (error) {
        console.error("Error in updateSketch:", error);
      }
    });
  };

  /** Ask the worker for per-cell average colours for one layer's grid. */
  function requestCellColors(layerIndex, columns, rows) {
    if (!window.img || cellColorPending.has(layerIndex)) return;
    cellColorPending.add(layerIndex);
    window.isExtractingColors = true;
    const imgData = window.img.canvas.getContext("2d").getImageData(0, 0, window.img.width, window.img.height);
    colorExtractionWorker.postMessage({
      type: "gridColors",
      imageData: imgData,
      gridColumns: columns,
      gridRows: rows,
      layerIndex: layerIndex,
    });
  }

  /** Forget cached cell colours: one layer, or all of them (e.g. new image). */
  window.invalidateCellColors = function (layerIndex) {
    if (layerIndex === undefined) {
      cellColorCache.clear();
      cellColorPending.clear();
    } else {
      cellColorCache.delete(layerIndex);
      cellColorPending.delete(layerIndex);
    }
    window.isExtractingColors = cellColorPending.size > 0;
  };

  // Kept for the controls: re-extract the active layer's colours.
  window.extractColors = function () {
    window.invalidateCellColors(getActiveLayer());
    window.updateSketch();
  };

  // Ask the worker for k representative colours from the current image.
  // The result arrives via colorExtractionWorker.onmessage -> window.applyExtractedPalette.
  window.extractPalette = function (k, requestId) {
    if (!window.img || !window.img.canvas) return;
    const imgData = window.img.canvas.getContext("2d").getImageData(0, 0, window.img.width, window.img.height);
    const cols = window.gridColumns;
    const rows = gridRows || Math.max(1, Math.floor(cols * (window.img.height / window.img.width)));
    colorExtractionWorker.postMessage({
      type: "palette",
      imageData: imgData,
      gridColumns: cols,
      gridRows: rows,
      k: k,
      seed: 1,
      requestId: requestId,
    });
  };

  p.preload = function () {
    const defaultFontPath = DEFAULT_FONT_PATH;
    const defaultImagePath = DEFAULT_IMAGE_PATH;

    font = p.loadFont(defaultFontPath, () => {
      console.log("Font loaded successfully.");
    }, (err) => {
      console.error("Error loading font:", err);
    });

    window.defaultImageLoaded = new Promise((resolve, reject) => {
      loadNewImage(defaultImagePath, p, true, resolve);
    });
  };

  p.setup = function () {
    if (!font) {
      console.error("Font not loaded before setup.");
      return;
    }

    let canvas = p.createCanvas(100, 100);
    canvas.parent("canvas-container");
    const ctx = canvas.elt.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      console.warn("Failed to set 'willReadFrequently' on canvas context.");
    }

    p.frameRate(60);
    p.pixelDensity(1);
    p.textFont(font);

    window.p5Instance = p;

    window.defaultImageLoaded
      .then(() => {
        initializeSketch();
      })
      .catch((error) => {
        console.error("Error loading default image:", error);
      });
      p.redraw();
  };

  function initializeSketch() {
    if (!window.img) {
      console.error("No image loaded to initialize sketch.");
      return;
    }
    setCanvasSize();
    window.img.resize(p.width, 0);

    gridRows = p.floor(window.gridColumns * (p.height / p.width));
    gw = p.width / window.gridColumns;

    p.textSize(gw * 0.9);
    p.textAlign(p.CENTER, p.CENTER);

    createOffscreenBuffer();
    // updateColorMap(p, window);
    colorMap = updateColorMap(p, window);

    window.sketchReady = true;
    window.dispatchEvent(new Event("sketchReady"));

    initializeControls(p);
    window.updateSketch();
  }

  p.windowResized = function () {
    setCanvasSize();
    if (window.img) {
      window.img.resize(p.width, 0);
    }
    gridRows = p.floor(window.gridColumns * (p.height / p.width));
    gw = p.width / window.gridColumns;
    createOffscreenBuffer();
    window.updateSketch();
  };

  function setCanvasSize() {
    const w = p.windowWidth - 300;
    const h = p.windowHeight;
    windowAR = w / h;
    if (window.img) {
      ar = window.img.width / window.img.height;
    } else {
      console.error("No image loaded in setCanvasSize");
      return;
    }

    if (windowAR > ar) {
      p.resizeCanvas(Math.floor(h * ar), h);
    } else {
      p.resizeCanvas(w, Math.floor(w / ar));
    }
  }

  function createOffscreenBuffer() {
    const scaleFactor = window.printRes / Math.max(p.width, p.height);
    const offscreenWidth = Math.floor(p.width * scaleFactor);
    const offscreenHeight = Math.floor(p.height * scaleFactor);

    if (offscreen) {
      offscreen.resizeCanvas(offscreenWidth, offscreenHeight);
    } else {
      offscreen = p.createGraphics(offscreenWidth, offscreenHeight);
    }

    if (window.img) {
      highResImg = window.img.get();
      highResImg.resize(offscreenWidth, offscreenHeight);
    }
  }

/**
 * Draw the whole picture: the global flat background, then every visible
 * layer in order (layer 1 at the bottom). Each layer is rendered with its own
 * settings swapped into window.*, so drawLayer() can keep reading globals.
 */
function drawAsciiArt(graphics = null) {
  const isOffscreen = graphics !== null;
  const canvas = isOffscreen ? graphics : p;
  const imgToUse = isOffscreen ? highResImg : window.img;

  // ---- Flat background: global, drawn once beneath all layers
  const [br, bg, bb] = window.bgColorRGB || [0, 0, 0];
  const bgA = Math.round((window.bgAlpha ?? 1) * 255);
  canvas.background(br, bg, bb, bgA);
  canvas.textFont(font);
  imgToUse.loadPixels();

  const ratio = window.img.height / window.img.width;
  let waiting = false;

  const count = getLayerCount() || 1;
  for (let i = 0; i < count; i++) {
    if (!isLayerVisible(i)) continue;
    withLayer(i, () => {
      const rows = Math.max(1, Math.floor(window.gridColumns * ratio));

      if (window.useImageColors) {
        const cache = cellColorCache.get(i);
        if (!cache || cache.columns !== window.gridColumns || cache.rows !== rows) {
          requestCellColors(i, window.gridColumns, rows);
          waiting = true;
          return; // this layer is drawn once its colours arrive
        }
        gridCellColors = cache.colors;
        colorMap = null;
      } else {
        gridCellColors = null;
        colorMap = updateColorMap(p, window);
      }

      gridRows = rows;
      drawLayer(canvas, imgToUse);
    });
  }

  if (waiting && !isOffscreen) {
    p.push();
    p.noStroke();
    p.fill(0, 170);
    p.rect(0, p.height / 2 - 22, p.width, 44);
    p.fill(255);
    p.textFont("monospace");
    p.textSize(18);
    p.textAlign(p.CENTER, p.CENTER);
    p.text("Extracting colors...", p.width / 2, p.height / 2);
    p.pop();
    canvas.textFont(font);
  }
}

/** Draw one layer's glyphs and pixel backgrounds using the current window.* settings. */
function drawLayer(canvas, imgToUse) {
  // Per-layer opacity. Pixel backgrounds use the layer's own alpha (the global
  // "Background alpha" only affects the flat canvas background now); glyphs and
  // their shadows are scaled by the layer's glyph opacity on top of any
  // per-colour alpha they already carry.
  // (drawLayer declares its own `clamp` further down, so clamp inline here)
  const clamp01 = (v) => Math.max(0, Math.min(1, typeof v === "number" ? v : 1));
  const layerBgK = clamp01(window.layerBgAlpha);
  const layerGlyphK = clamp01(window.layerGlyphAlpha);
  const bgA = Math.round(layerBgK * 255);
  const drawGlyphs = layerGlyphK > 0;
  const scaleGlyphAlpha = (col) =>
    layerGlyphK >= 1 || !col || !col.levels
      ? col
      : p.color(col.levels[0], col.levels[1], col.levels[2], Math.round((col.levels[3] ?? 255) * layerGlyphK));

  const useOriginalGrid = window.useImageColors && gridCellColors;

  let scaledGridColumns, scaledGridRows;
  if (useOriginalGrid) {
    scaledGridColumns = window.gridColumns;
    scaledGridRows = gridRows;
  } else {
    const scaleX = canvas.width / p.width;
    const scaleY = canvas.height / p.height;
    scaledGridColumns = Math.max(1, Math.floor(window.gridColumns * scaleX));
    scaledGridRows = Math.max(1, Math.floor(gridRows * scaleY));
  }

  const cellWidth = canvas.width / scaledGridColumns;
  const cellHeight = canvas.height / scaledGridRows;

  // No shrink: allow glyph to use full cell baseline/leading
  const fontSize = Math.min(cellWidth, cellHeight);
  canvas.textSize(fontSize);
  canvas.textAlign(p.CENTER, p.CENTER);
  canvas.textLeading(fontSize);

  imgToUse.loadPixels();

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // ---------------------------------------------------------------------------
  // Background mode
  // ---------------------------------------------------------------------------
  const advancedBgMode = window.advancedBgMode || "off";

  // ---------------------------------------------------------------------------
  // Shadow config (Stage 2)
  // ---------------------------------------------------------------------------
  const shadowMode = window.shadowMode || "off";                 // "off" | "single" | "double"
  const shadowColorMode = window.shadowColorMode || "offset";    // "manual" | "offset"

  // IMPORTANT: coerce checkbox/radio values into a real boolean
  const coerceBool = (v, fallback = true) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      if (v.toLowerCase() === "true") return true;
      if (v.toLowerCase() === "false") return false;
    }
    return fallback;
  };

  const shadowSymmetric = coerceBool(window.shadowSymmetric, true);

  // Offsets stored as cell fractions
  const shadowDxFrac = typeof window.shadowDx === "number" ? window.shadowDx : 0.15;
  const shadowDyFrac = typeof window.shadowDy === "number" ? window.shadowDy : 0.10;

  // Only used when symmetric is OFF (otherwise we mirror dx1/dy1)
  const shadowDx2Frac =
    typeof window.shadowDx2 === "number" ? window.shadowDx2 : -shadowDxFrac;
  const shadowDy2Frac =
    typeof window.shadowDy2 === "number" ? window.shadowDy2 : -shadowDyFrac;

  const shadowAlphaMult =
    typeof window.shadowAlphaMult === "number" ? window.shadowAlphaMult : 0.6; // 0..1

  // Manual shadow colours (RGB + A in 0..1)
  const shadow1RGB = Array.isArray(window.shadow1RGB) ? window.shadow1RGB : [255, 0, 80];
  const shadow2RGB = Array.isArray(window.shadow2RGB) ? window.shadow2RGB : [0, 200, 255];
  const shadow1A = typeof window.shadow1A === "number" ? window.shadow1A : 0.6;
  const shadow2A = typeof window.shadow2A === "number" ? window.shadow2A : 0.6;

  const getP5Rgb = (col) => {
    if (!col || !col.levels || col.levels.length < 3) return [255, 255, 255];
    return [col.levels[0], col.levels[1], col.levels[2]];
  };

  const getP5Alpha01 = (col) => {
    if (!col || !col.levels || col.levels.length < 4) return 1;
    return clamp((col.levels[3] ?? 255) / 255, 0, 1);
  };

  const makeShadowFill = (baseCharColor, layerIndex) => {
    // layerIndex: 1 or 2
    const mode = window.shadowColorMode || "offset"; // "manual" | "offset"
    const alphaMult =
      typeof window.shadowAlphaMult === "number" ? window.shadowAlphaMult : 0.6;

    if (mode === "manual") {
      const rgb = layerIndex === 1
        ? (Array.isArray(window.shadow1RGB) ? window.shadow1RGB : [255, 0, 80])
        : (Array.isArray(window.shadow2RGB) ? window.shadow2RGB : [0, 200, 255]);

      const a = layerIndex === 1
        ? (typeof window.shadow1A === "number" ? window.shadow1A : 0.6)
        : (typeof window.shadow2A === "number" ? window.shadow2A : 0.6);

      const alpha255 = Math.round(clamp(a * alphaMult, 0, 1) * 255);
      return p.color(rgb[0] ?? 255, rgb[1] ?? 255, rgb[2] ?? 255, alpha255);
    }

    // "offset" mode: derive from main glyph colour using shared applyHslOffsetToRgb()
    const baseRgb = getP5Rgb(baseCharColor);

    const shH = typeof window.shadowHueOffset === "number" ? window.shadowHueOffset : 20;
    const shS = typeof window.shadowSatOffset === "number" ? window.shadowSatOffset : 10;
    const shL = typeof window.shadowLightOffset === "number" ? window.shadowLightOffset : -10;

    // layer 2 uses opposite hue for a chromatic feel
    const hueOffset = layerIndex === 2 ? -shH : shH;

    const outRgb = applyHslOffsetToRgb(baseRgb, hueOffset, shS, shL);

    const baseA01 = getP5Alpha01(baseCharColor);
    const alpha255 = Math.round(clamp(baseA01 * alphaMult, 0, 1) * 255);

    if (!outRgb) return p.color(255, 255, 255, alpha255);
    return p.color(outRgb[0], outRgb[1], outRgb[2], alpha255);
  };

  const drawGlyph = (ch, xCenter, yCenter, fillCol, dxPx = 0, dyPx = 0) => {
    canvas.fill(scaleGlyphAlpha(fillCol));
    canvas.text(ch, xCenter + dxPx, yCenter + dyPx);
  };

  const drawShadows = shadowMode === "single" || shadowMode === "double";

  // ---------------------------------------------------------------------------
  // Palette constraint (image-colour mode). In manual mode the palette is
  // applied inside updateColorMap instead, so nothing extra is needed here.
  // ---------------------------------------------------------------------------
  // One canonical ordering (dark -> light) so indices agree across mappings.
  const activePaletteRaw = getActivePaletteRgb(window);
  const activePalette = activePaletteRaw ? sortByLightness(activePaletteRaw) : null;
  const paletteNearest = activePalette ? makeNearestMatcher(activePalette) : null;
  const paletteLab = activePalette ? activePalette.map(rgbToLab) : null;
  const paletteMapping = window.paletteMapping === "brightness" ? "brightness" : "nearest";

  // Two colours are hue-compatible unless both are clearly chromatic and their
  // hues sit far apart. Near-neutrals (black, grey, white) go with anything.
  // This is what stops e.g. an orange background appearing behind a cyan glyph.
  const NEUTRAL_CHROMA = 12;    // Lab chroma below which a colour has no real hue
  const MAX_HUE_DIFF_DEG = 75;
  const hueCompatible = (a, b) => {
    const ca = Math.hypot(a[1], a[2]);
    const cb = Math.hypot(b[1], b[2]);
    if (ca < NEUTRAL_CHROMA || cb < NEUTRAL_CHROMA) return true;
    let d = Math.abs(Math.atan2(a[2], a[1]) - Math.atan2(b[2], b[1])) * (180 / Math.PI);
    if (d > 180) d = 360 - d;
    return d <= MAX_HUE_DIFF_DEG;
  };

  // Nearest palette entry (Lab) to an arbitrary colour, restricted to entries
  // of compatible hue. Returns -1 when there is none.
  const nearestCompatible = (lab, excludeIdx) => {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < paletteLab.length; i++) {
      if (i === excludeIdx) continue;
      const pl = paletteLab[i];
      if (!hueCompatible(lab, pl)) continue;
      const dl = lab[0] - pl[0], da = lab[1] - pl[1], db = lab[2] - pl[2];
      const d = dl * dl + da * da + db * db;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  // For every palette entry, its best darker (dir -1) or lighter (dir +1)
  // partner: same hue family first, then neutrals, never an opposing hue.
  // Lightness is weighted low because a lightness change is the whole point.
  const buildStepTable = (dir) =>
    paletteLab.map((g, gi) => {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < paletteLab.length; i++) {
        if (i === gi) continue;
        const pl = paletteLab[i];
        if (dir < 0 ? pl[0] >= g[0] : pl[0] <= g[0]) continue;
        if (!hueCompatible(g, pl)) continue;
        const dl = pl[0] - g[0], da = pl[1] - g[1], db = pl[2] - g[2];
        const d = da * da + db * db + 0.25 * dl * dl;
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    });
  const stepDarker = activePalette ? buildStepTable(-1) : null;
  const stepLighter = activePalette ? buildStepTable(1) : null;

  // "By brightness" glyph mapping: palette entry closest in Lab lightness.
  const nearestByLightness = (L) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < paletteLab.length; i++) {
      const d = Math.abs(paletteLab[i][0] - L);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  // Snap a derived pixel-background colour to the palette. The N-colour budget
  // is shared between glyphs and backgrounds.
  //   1) Take the nearest palette entry of compatible hue to the derived colour.
  //   2) If that is the glyph's own entry, move to the glyph's darker or lighter
  //      partner (following the sign of the lightness offset). Partners are
  //      chosen by hue, not by position in the lightness order, so a cyan glyph
  //      gets dark teal behind it rather than orange.
  //   3) If no suitable partner exists the cell stays flat in the glyph colour,
  //      so black stays black and no clashing hue is introduced.
  const snapBackgroundToPalette = (rgb, glyphIdx, direction) => {
    if (activePalette.length === 1) return activePalette[0];

    const lab = rgbToLab(rgb);
    let idx = nearestCompatible(lab, -1);
    if (idx < 0) idx = glyphIdx >= 0 ? glyphIdx : paletteNearest(rgb);
    if (glyphIdx < 0 || idx !== glyphIdx) return activePalette[idx];

    let partner;
    if (direction < 0) partner = stepDarker[glyphIdx];
    else if (direction > 0) partner = stepLighter[glyphIdx];
    else partner = nearestCompatible(lab, glyphIdx);

    return activePalette[partner >= 0 ? partner : glyphIdx];
  };

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  for (let y = 0; y < scaledGridRows; y++) {
    for (let x = 0; x < scaledGridColumns; x++) {
      // Map cell → image region
      const imgX = Math.floor((x / scaledGridColumns) * imgToUse.width);
      const imgY = Math.floor((y / scaledGridRows) * imgToUse.height);
      const w = Math.ceil(imgToUse.width / scaledGridColumns);
      const h = Math.ceil(imgToUse.height / scaledGridRows);

      // Brightness and character
      const avg = getAverageGrayscale(imgToUse, imgX, imgY, w, h);
      const adjustedAvg = adjustBrightnessContrast(avg, window.cF, window.mP);

      const charIndex = Math.floor(
        p.map(adjustedAvg, 0, 255, window.density.length - 1, 0)
      );
      const c = window.density.charAt(charIndex);

      // Character color
      let charColor;
      let glyphPaletteIdx = -1; // which palette entry the glyph uses (if any)
      if (window.useImageColors && gridCellColors) {
        const colorIndex = y * scaledGridColumns + x;

        let r = 255, g = 255, b = 255;
        if (colorIndex < gridCellColors.length) {
          const arr = gridCellColors[colorIndex];
          if (Array.isArray(arr) && arr.length === 3) {
            r = arr[0]; g = arr[1]; b = arr[2];
          }
        }

        // Apply image-glyph HSL offsets (global). These run BEFORE palette
        // snapping so they steer which palette entry a cell lands on rather
        // than pushing the output outside the palette.
        const hOff = typeof window.imageGlyphHueOffset === "number" ? window.imageGlyphHueOffset : 0;
        const sOff = typeof window.imageGlyphSatOffset === "number" ? window.imageGlyphSatOffset : 0;
        const lOff = typeof window.imageGlyphLightOffset === "number" ? window.imageGlyphLightOffset : 0;

        let outRgb = applyHslOffsetToRgb([r, g, b], hOff, sOff, lOff) || [r, g, b];

        // Snap to the constrained palette, if one is active
        if (activePalette) {
          if (paletteMapping === "brightness") {
            // Entry closest in lightness to the cell's own colour (hue ignored).
            // Uses the real cell colour, not the contrast-adjusted glyph value,
            // so the darkest and lightest entries are reachable at any contrast.
            glyphPaletteIdx = nearestByLightness(rgbToLab(outRgb)[0]);
          } else {
            glyphPaletteIdx = paletteNearest(outRgb);
          }
          outRgb = activePalette[glyphPaletteIdx];
        }

        // Opaque here; the per-layer "Chars" opacity is applied when the glyph is drawn
        charColor = p.color(outRgb[0], outRgb[1], outRgb[2], 255);
      } else if (colorMap) {
        charColor = colorMap.get(c);
        // Manual mode: colorMap already yields palette colours; find the index
        if (activePalette && charColor) {
          glyphPaletteIdx = paletteNearest(getP5Rgb(charColor));
        }
      }

      const baseChar = charColor || p.color(255);

      // ---- Pixel background per cell (optional)
      let bgRectColor = null;

      // Decide a base RGB for bg offset mode
      let baseRgbForHslOffset = null;
      if (charColor) {
        baseRgbForHslOffset = getP5Rgb(charColor);
      } else if (window.useImageColors && gridCellColors) {
        const cellIndex = y * scaledGridColumns + x;
        const arr = gridCellColors?.[cellIndex];
        if (Array.isArray(arr) && arr.length === 3) baseRgbForHslOffset = [arr[0], arr[1], arr[2]];
      }
      if (!baseRgbForHslOffset) {
        const lGrey = clamp((adjustedAvg / 255) * 100, 0, 100);
        const [gr, gg, gb] = hslToRgb(0, 0, lGrey);
        baseRgbForHslOffset = [gr, gg, gb];
      }

      let bgRgb = null;
      switch (advancedBgMode) {
        case "hslOffset": {
          bgRgb = applyHslOffsetToRgb(
            baseRgbForHslOffset,
            window.hOffset || 0,
            window.sOffset || 0,
            window.lOffset || 0
          );
          break;
        }

        case "colorPicker": {
          const [pr, pg, pb] = window.bgColorRGB || [120, 170, 255];
          const [hh, ss] = rgbToHsl(pr, pg, pb);
          const ll = Math.round((adjustedAvg / 255) * 100);
          bgRgb = hslToRgb(hh, ss, ll);
          break;
        }

        case "off":
        default:
          break;
      }

      // Pixel backgrounds share the palette budget with glyphs
      if (bgRgb && activePalette) {
        const direction = advancedBgMode === "hslOffset" ? Math.sign(window.lOffset || 0) : 0;
        bgRgb = snapBackgroundToPalette(bgRgb, glyphPaletteIdx, direction);
      }
      if (bgRgb) bgRectColor = p.color(bgRgb[0], bgRgb[1], bgRgb[2], bgA);

      if (bgRectColor && layerBgK > 0) {
        canvas.noStroke();
        canvas.fill(bgRectColor);

        // Pixel-perfect rects (avoid seams)
        const x0 = Math.floor(x * cellWidth);
        const y0 = Math.floor(y * cellHeight);
        const x1 = Math.ceil((x + 1) * cellWidth);
        const y1 = Math.ceil((y + 1) * cellHeight);
        canvas.rect(x0, y0, x1 - x0, y1 - y0);
      }

      // Cell center
      const xPos = (x + 0.5) * cellWidth;
      const yPos = (y + 0.5) * cellHeight;

      // Shadow offsets (cell fraction → px)
      const dx1 = shadowDxFrac * cellWidth;
      const dy1 = shadowDyFrac * cellHeight;

      let dx2 = 0, dy2 = 0;
      const isDouble = shadowMode === "double";

      if (isDouble) {
        if (shadowSymmetric) {
          dx2 = -dx1;
          dy2 = -dy1;
        } else {
          dx2 = shadowDx2Frac * cellWidth;
          dy2 = shadowDy2Frac * cellHeight;
        }
      }

      // Shadows behind
      if (drawShadows) {
        if (shadowMode === "double") {
          drawGlyph(c, xPos, yPos, makeShadowFill(baseChar, 2), dx2, dy2);
        }
        drawGlyph(c, xPos, yPos, makeShadowFill(baseChar, 1), dx1, dy1);
      }

      // Main glyph
      if (drawGlyphs) {
        canvas.fill(scaleGlyphAlpha(baseChar));
        canvas.text(c, xPos, yPos);
      }
    }
  }
}
  function getBgColor() {
    const rgb = window.bgColorRGB || [0, 0, 0];
    const a = typeof window.bgAlpha === "number" ? window.bgAlpha : 1;
    const [r, g, b] = rgb;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  } 

  function getAverageGrayscale(imgPixels, x, y, w, h) {
    let total = 0;
    const endX = p.min(x + w, imgPixels.width);
    const endY = p.min(y + h, imgPixels.height);
    for (let i = x; i < endX; i++) {
      for (let j = y; j < endY; j++) {
        const idx = (i + j * imgPixels.width) * 4;
        total += (imgPixels.pixels[idx] + imgPixels.pixels[idx + 1] + imgPixels.pixels[idx + 2]) / 3;
      }
    }
    return total / ((endX - x) * (endY - y));
  }

  function adjustBrightnessContrast(value, contrastFactor, midpoint) {
    return (value - midpoint) * contrastFactor + midpoint;
  }

  window.drawAsciiArt = drawAsciiArt;
  window.createOffscreenBuffer = createOffscreenBuffer;
  window.initializeSketch = initializeSketch;

  window.updateDensity = function () {
    window.baseDensity = document.getElementById("density-input").value;
    window.zeroCount = parseInt(document.getElementById("zero-slider").value, 10);
    window.spaceCount = parseInt(document.getElementById("space-slider").value, 10);
    window.density = window.baseDensity + "0".repeat(window.zeroCount) + " ".repeat(window.spaceCount);
    window.updateSketch();
  };

  window.downloadPNG = function () {
    if (isDownloading) {
      console.log("Download already in progress");
      return;
    }

    isDownloading = true;
    const downloadButton = document.getElementById("download-png");
    if (downloadButton) {
      downloadButton.disabled = true;
    }

    console.log("Downloading PNG...");

    const pngWidth = parseInt(document.getElementById("png-width").value, 10);
    if (isNaN(pngWidth) || pngWidth <= 0) {
      isDownloading = false;
      if (downloadButton) {
        downloadButton.disabled = false;
      }
      return;
    }
    const pngHeight = Math.round(pngWidth / (p.width / p.height));
    const offscreenBuffer = p.createGraphics(pngWidth, pngHeight);

    drawAsciiArt(offscreenBuffer);
    const safeName = window.density.replace(/\s+/g, "_").slice(0, 50);
    p.saveCanvas(offscreenBuffer, safeName, "png");
    offscreenBuffer.remove();

    setTimeout(() => {
      isDownloading = false;
      if (downloadButton) {
        downloadButton.disabled = false;
      }
      console.log("Download process completed");
    }, 1000);
  };

  window.createAndDownloadSVG = async function () {
    if (isDownloading) {
      console.log("Download already in progress");
      return;
    }
  
    isDownloading = true;
    const downloadButton = document.getElementById("download-svg");
    if (downloadButton) {
      downloadButton.disabled = true;
    }
  
    console.log("Preparing SVG download...");
  
    try {
      const width = window.gridColumns;
      const height = Math.floor(window.gridColumns * (p.height / p.width));
  
      // Ensure we have the latest color data from the web worker
      if (window.useImageColors && (!gridCellColors || gridCellColors.length !== width * height)) {
        await new Promise((resolve) => {
          window.extractColors();
          colorExtractionWorker.onmessage = function(e) {
            if (e.data?.type === "palette") return;
            gridCellColors = e.data.colors;
            console.log("Color extraction completed. Total colors:", gridCellColors.length);
            resolve();
          };
        });
      }
  
      const uniqueChars = [...new Set(window.density)].join("");
      if (!window.loadedFont) {
        window.loadedFont = await loadFont(DEFAULT_FONT_PATH);
      }
      const subsetFontData = await getSubsetFont(window.loadedFont, uniqueChars);
      const fontBase64 = fontToBase64(subsetFontData);
  
      let colorStyle = "";
      let colorMap;
      let isSingleColor = false;
  
      if (window.useImageColors && gridCellColors) {

        colorMap = new Map();
        gridCellColors.forEach((color, index) => {
          const char = window.density[index % window.density.length];
          colorMap.set(char, p.color(color[0], color[1], color[2]));
        });
        colorStyle = Array.from(new Set(gridCellColors.map(color => color.join(',')))).map(color => {
          const [r, g, b] = color.split(',').map(Number);
          return `.c${r}_${g}_${b}{fill:rgb(${r},${g},${b})}`;
        }).join('');
      } else {

        isSingleColor = window.colorCount === 1;
        if (isSingleColor) {
          const singleColor = `rgb(${hslToRgb(...window.startColor.slice(0, 3)).join(',')})`;
          colorStyle = `text{fill:${singleColor}}`;
        } else {
          colorMap = updateColorMap(p, window);
          colorStyle = Array.from(colorMap).map(([char, color]) => 
            `.c${char}{fill:rgb(${color.levels[0]},${color.levels[1]},${color.levels[2]})}`)
            .join('');
        }
      }
  
      const cellSize = 10;
      const fontSize = cellSize * 0.9;
  
      let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width * cellSize} ${height * cellSize}">
        <defs>
          <style>
            @font-face{font-family:AsciiArtFont;src:url(${fontBase64}) format('truetype')}
            ${colorStyle}
            text{font-family:AsciiArtFont,monospace;font-size:${fontSize}px;dominant-baseline:central;text-anchor:middle}
          </style>
        </defs>
        <rect width="100%" height="100%" fill="${getBgColor()}"/>`;
  
      const imgCopy = window.img.get();
      imgCopy.loadPixels();
  
      for (let y = 0; y < height; y++) {
        let rowContent = "";
        for (let x = 0; x < width; x++) {
          const imgX = Math.floor(x * (imgCopy.width / width));
          const imgY = Math.floor(y * (imgCopy.height / height));
          const w = Math.ceil(imgCopy.width / width);
          const h = Math.ceil(imgCopy.height / height);
  
          const avg = getAverageGrayscale(imgCopy, imgX, imgY, w, h);
          const adjustedAvg = adjustBrightnessContrast(avg, window.cF, window.mP);
          const charIndex = Math.floor(
            p.map(adjustedAvg, 0, 255, window.density.length - 1, 0)
          );
          const c = window.density.charAt(charIndex);
  
          let colorClass;
          if (window.useImageColors && gridCellColors) {
            const color = gridCellColors[y * width + x];
            colorClass = `c${color[0]}_${color[1]}_${color[2]}`;
          } else if (isSingleColor) {
            colorClass = "";
          } else {
            colorClass = `c${c}`;
          }
  
          const xPos = (x + 0.5) * cellSize;
          const yPos = (y + 0.5) * cellSize;
          rowContent += `<tspan x="${xPos}" y="${yPos}" class="${colorClass}">${c}</tspan>`;
        }
        svgContent += `<text>${rowContent}</text>`;
      }
  
      svgContent += "</svg>";
  
      const blob = new Blob([svgContent], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ascii-art.svg";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  
      console.log("SVG download completed");
    } catch (error) {
      console.error("Error creating SVG:", error);
    } finally {
      isDownloading = false;
      if (downloadButton) {
        downloadButton.disabled = false;
      }
    }
  };
  
  colorExtractionWorker.onmessage = function(e) {
    const msg = e.data || {};

    if (msg.type === "palette") {
      if (typeof window.applyExtractedPalette === "function") {
        window.applyExtractedPalette(msg.colors, msg.requestId);
      }
      return;
    }

    const layerIndex = msg.layerIndex ?? 0;
    cellColorCache.set(layerIndex, {
      columns: msg.gridColumns,
      rows: msg.gridRows,
      colors: msg.colors,
    });
    cellColorPending.delete(layerIndex);
    window.isExtractingColors = cellColorPending.size > 0;
    window.updateSketch();
  };
}

p5Instance = new p5(createSketch);
window.p5Instance = p5Instance;

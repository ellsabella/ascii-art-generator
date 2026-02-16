import p5 from "p5";
import "./styles.css";
import { initializeControls, loadNewImage } from "./controls.js";
import { loadFont, getSubsetFont, fontToBase64 } from "./fontsubset.js";
import { updateColorMap, kMeansColorClustering, hslToRgb, rgbToHsl } from "./colorUtils.js";
import { applyHslOffsetToRgb, clamp } from "./colorUtils.js";
import { initFrames, updateActiveThumbnail, getFrames, getActiveFrameIndex, saveActiveFrame, applyState, propagateToSubsequent, isVideoMode } from "./frameManager.js";
import { extractGridColors } from "./extractGridColors.js";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

let p5Instance;
let animationFrameId = null;
let colorExtractionWorker = new Worker(new URL('./color-extraction-worker.js', import.meta.url));
let gridCellColors = null;

// Accessors for frameManager to swap per-frame colors (video mode)
window._getGridCellColors = () => gridCellColors;
window._setGridCellColors = (c) => { gridCellColors = c; };

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
    
    if (window.useImageColors) {
      gridCellColors = null;
    }
    
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
        p.textSize(gw * 0.9);
        
        if (window.useImageColors && !gridCellColors) {
          if (!window.isExtractingColors) {
            console.log("Using image colors. Extracting colors with updated grid dimensions.");
            window.isExtractingColors = true;
            window.extractColors();
          }
          // Show loading state
          p.background(220);
          p.fill(0);
          p.textSize(20);
          p.textAlign(p.CENTER, p.CENTER);
          p.text("Extracting colors...", p.width / 2, p.height / 2);
          return;
        }
        
        if (!window.useImageColors) {
          console.log("Updating color map");
          colorMap = updateColorMap(p, window);
        } else {
          console.log("Using image colors");
        }
        
        // const bgColor = getBgColor();
        // p.background(bgColor);
        
        if (typeof drawAsciiArt === "function") {
          drawAsciiArt();
        } else {
          console.log("drawAsciiArt function not found");
        }

        p.redraw();

        // propagate current settings to subsequent frames (if enabled)
        propagateToSubsequent();

        // capture thumbnail for the active frame (debounced)
        if (window._thumbTimeout) clearTimeout(window._thumbTimeout);
        window._thumbTimeout = setTimeout(() => {
          if (typeof window.generateThumbnail === 'function') {
            const thumb = window.generateThumbnail(140);
            if (thumb) updateActiveThumbnail(thumb);
          }
        }, 300);
      } catch (error) {
        console.error("Error in updateSketch:", error);
      }
    });
  };
  
  window.extractColors = function() {
    if (!window.img) return;
  
    const imgData = window.img.canvas.getContext('2d').getImageData(0, 0, window.img.width, window.img.height);
    colorExtractionWorker.postMessage({
      imageData: imgData,
      gridColumns: window.gridColumns,
      gridRows: gridRows
    });
  };

  p.preload = function () {
    const defaultFontPath = import.meta.env.VITE_DEFAULT_FONT;
    const defaultImagePath = import.meta.env.VITE_DEFAULT_IMAGE || "/img/sun.png";

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
    initFrames();
  }

  p.windowResized = function () {
    setCanvasSize();
    if (isVideoMode()) {
      // resize all per-frame images in video mode
      const allFrames = getFrames();
      for (let i = 0; i < allFrames.length; i++) {
        if (allFrames[i].image) {
          allFrames[i].image.resize(p.width, 0);
          allFrames[i].gridCellColors = null; // invalidate cached colors
        }
      }
      window.img = allFrames[getActiveFrameIndex()]?.image || window.img;
    } else if (window.img) {
      window.img.resize(p.width, 0);
    }
    gridCellColors = null; // force re-extraction at new size
    gridRows = p.floor(window.gridColumns * (p.height / p.width));
    gw = p.width / window.gridColumns;
    createOffscreenBuffer();
    window.updateSketch();
  };

  function setCanvasSize() {
    const w = p.windowWidth - 420;
    const timelineHeight = document.getElementById('frame-timeline')?.offsetHeight || 100;
    const h = p.windowHeight - timelineHeight;
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

function drawAsciiArt(graphics = null) {
  // console.log("Drawing ASCII art, graphics null?", graphics === null);

  const isOffscreen = graphics !== null;
  const canvas = isOffscreen ? graphics : p;
  const imgToUse = isOffscreen ? highResImg : window.img;

  // ---- Flat background (ALWAYS) uses bgColorRGB + bgAlpha
  const [br, bg, bb] = window.bgColorRGB || [0, 0, 0];
  const bgA = Math.round((window.bgAlpha ?? 1) * 255);
  canvas.background(br, bg, bb, bgA);
  canvas.textFont(font);

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
    canvas.fill(fillCol);
    canvas.text(ch, xCenter + dxPx, yCenter + dyPx);
  };

  const drawShadows = shadowMode === "single" || shadowMode === "double";

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
      if (window.useImageColors && gridCellColors) {
        const colorIndex = y * scaledGridColumns + x;

        let r = 255, g = 255, b = 255;
        if (colorIndex < gridCellColors.length) {
          const arr = gridCellColors[colorIndex];
          if (Array.isArray(arr) && arr.length === 3) {
            r = arr[0]; g = arr[1]; b = arr[2];
          }
        }

        // Apply image-glyph HSL offsets (global)
        const hOff = typeof window.imageGlyphHueOffset === "number" ? window.imageGlyphHueOffset : 0;
        const sOff = typeof window.imageGlyphSatOffset === "number" ? window.imageGlyphSatOffset : 0;
        const lOff = typeof window.imageGlyphLightOffset === "number" ? window.imageGlyphLightOffset : 0;

        const outRgb = applyHslOffsetToRgb([r, g, b], hOff, sOff, lOff) || [r, g, b];

        // Apply global glyph alpha (0..1)
        const a01 = typeof window.imageGlyphAlpha === "number" ? clamp(window.imageGlyphAlpha, 0, 1) : 1;
        const a255 = Math.round(a01 * 255);

        charColor = p.color(outRgb[0], outRgb[1], outRgb[2], a255);
      } else if (colorMap) {
        charColor = colorMap.get(c);
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

      switch (advancedBgMode) {
        case "hslOffset": {
          const rgb = applyHslOffsetToRgb(
            baseRgbForHslOffset,
            window.hOffset || 0,
            window.sOffset || 0,
            window.lOffset || 0
          );
          if (rgb) bgRectColor = p.color(rgb[0], rgb[1], rgb[2], bgA);
          break;
        }

        case "colorPicker": {
          const [pr, pg, pb] = window.bgColorRGB || [120, 170, 255];
          const [hh, ss] = rgbToHsl(pr, pg, pb);
          const ll = Math.round((adjustedAvg / 255) * 100);
          const [r, g, b] = hslToRgb(hh, ss, ll);
          bgRectColor = p.color(r, g, b, bgA);
          break;
        }

        case "off":
        default:
          break;
      }

      if (bgRectColor) {
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
      canvas.fill(baseChar);
      canvas.text(c, xPos, yPos);
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

  // Helper: export a canvas element as a blob download
  function downloadCanvasAsFile(canvasEl, filename, format, quality) {
    const mimeType = format === 'webp' ? 'image/webp' : 'image/png';
    const qualityArg = format === 'webp' ? quality : undefined;

    canvasEl.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, mimeType, qualityArg);
  }

  window.downloadImage = function () {
    if (isDownloading) {
      console.log("Download already in progress");
      return;
    }

    isDownloading = true;
    const downloadButton = document.getElementById("download-image");
    if (downloadButton) downloadButton.disabled = true;

    const format = window.exportFormat || 'png';
    const quality = window.webpQuality || 0.8;
    const ext = format === 'webp' ? 'webp' : 'png';

    console.log(`Downloading ${ext.toUpperCase()}...`);

    const imgWidth = parseInt(document.getElementById("export-width").value, 10);
    if (isNaN(imgWidth) || imgWidth <= 0) {
      isDownloading = false;
      if (downloadButton) downloadButton.disabled = false;
      return;
    }
    const imgHeight = Math.round(imgWidth / (p.width / p.height));
    const offscreenBuffer = p.createGraphics(imgWidth, imgHeight);

    drawAsciiArt(offscreenBuffer);
    const safeName = window.density.replace(/\s+/g, "_").slice(0, 50);
    downloadCanvasAsFile(offscreenBuffer.elt, `${safeName}.${ext}`, format, quality);
    offscreenBuffer.remove();

    setTimeout(() => {
      isDownloading = false;
      if (downloadButton) downloadButton.disabled = false;
      console.log("Download process completed");
    }, 1000);
  };

  window.generateThumbnail = function (width = 140) {
    if (!window.img) return null;
    const height = Math.round(width * (p.height / p.width));
    const thumbBuffer = p.createGraphics(width, height);
    drawAsciiArt(thumbBuffer);
    const dataURL = thumbBuffer.elt.toDataURL('image/png');
    thumbBuffer.remove();
    return dataURL;
  };

  // Pre-extract grid colors for all video frames that are missing them (sync, for export)
  function preExtractAllColors() {
    if (!isVideoMode() || !window.useImageColors) return;
    const allFrames = getFrames();
    for (let i = 0; i < allFrames.length; i++) {
      if (allFrames[i].image && !allFrames[i].gridCellColors) {
        const imgCanvas = allFrames[i].image.canvas || allFrames[i].image.elt;
        const ctx = imgCanvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, imgCanvas.width, imgCanvas.height);
        const gr = p.floor(window.gridColumns * (imgCanvas.height / imgCanvas.width));
        allFrames[i].gridCellColors = extractGridColors(imgData, window.gridColumns, gr);
      }
    }
  }

  window.downloadAllFrames = async function () {
    if (isDownloading) return;
    isDownloading = true;

    const downloadBtn = document.getElementById('download-all-frames');
    if (downloadBtn) downloadBtn.disabled = true;

    try {
      const allFrames = getFrames();
      const originalIndex = getActiveFrameIndex();
      saveActiveFrame();
      const savedImg = window.img;
      const savedColors = gridCellColors;

      preExtractAllColors();

      const format = window.exportFormat || 'png';
      const quality = window.webpQuality || 0.8;
      const ext = format === 'webp' ? 'webp' : 'png';
      const mimeType = format === 'webp' ? 'image/webp' : 'image/png';

      const imgWidth = parseInt(document.getElementById('export-width').value, 10) || 900;
      const imgHeight = Math.round(imgWidth / (p.width / p.height));

      const zip = new JSZip();

      for (let i = 0; i < allFrames.length; i++) {
        applyState(allFrames[i].state);

        // swap per-frame image/colors for video mode
        if (allFrames[i].image) window.img = allFrames[i].image;
        if (allFrames[i].gridCellColors) gridCellColors = allFrames[i].gridCellColors;

        // recompute derived density field
        window.density = window.baseDensity
          + '0'.repeat(Math.max(0, window.zeroCount))
          + ' '.repeat(Math.max(0, window.spaceCount));

        // update color map for non-image-color modes
        if (!window.useImageColors) {
          colorMap = updateColorMap(p, window);
        }

        const buffer = p.createGraphics(imgWidth, imgHeight);
        drawAsciiArt(buffer);

        // Use toBlob with format + quality, then convert to base64 for JSZip
        const blob = await new Promise((resolve) => {
          buffer.elt.toBlob(resolve, mimeType, format === 'webp' ? quality : undefined);
        });
        const arrayBuffer = await blob.arrayBuffer();
        zip.file(`frame_${i + 1}.${ext}`, arrayBuffer);
        buffer.remove();
      }

      // restore original frame
      window.img = savedImg;
      gridCellColors = savedColors;
      applyState(allFrames[originalIndex].state);
      window.density = window.baseDensity
        + '0'.repeat(Math.max(0, window.zeroCount))
        + ' '.repeat(Math.max(0, window.spaceCount));
      if (!window.useImageColors) {
        colorMap = updateColorMap(p, window);
      }
      window.updateSketch();

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ascii-frames.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('All frames downloaded as ZIP');
    } catch (error) {
      console.error('Error downloading frames:', error);
    } finally {
      isDownloading = false;
      if (downloadBtn) downloadBtn.disabled = false;
    }
  };

  window.downloadGIF = async function () {
    if (isDownloading) return;
    isDownloading = true;

    const downloadBtn = document.getElementById('download-gif');
    if (downloadBtn) downloadBtn.disabled = true;

    try {
      const allFrames = getFrames();
      if (allFrames.length < 2) {
        console.warn('Need at least 2 frames to create a GIF');
        return;
      }

      const originalIndex = getActiveFrameIndex();
      saveActiveFrame();
      const savedImg = window.img;
      const savedColors = gridCellColors;

      preExtractAllColors();

      const imgWidth = parseInt(document.getElementById('export-width').value, 10) || 900;
      const imgHeight = Math.round(imgWidth / (p.width / p.height));
      const delay = parseInt(document.getElementById('gif-delay-value').value, 10) || 200;

      const gif = GIFEncoder();

      for (let i = 0; i < allFrames.length; i++) {
        applyState(allFrames[i].state);

        // swap per-frame image/colors for video mode
        if (allFrames[i].image) window.img = allFrames[i].image;
        if (allFrames[i].gridCellColors) gridCellColors = allFrames[i].gridCellColors;

        // recompute derived density field
        window.density = window.baseDensity
          + '0'.repeat(Math.max(0, window.zeroCount))
          + ' '.repeat(Math.max(0, window.spaceCount));

        if (!window.useImageColors) {
          colorMap = updateColorMap(p, window);
        }

        const buffer = p.createGraphics(imgWidth, imgHeight);
        drawAsciiArt(buffer);

        // get RGBA pixel data from the canvas
        const ctx = buffer.elt.getContext('2d');
        const imageData = ctx.getImageData(0, 0, imgWidth, imgHeight);
        const rgba = imageData.data;

        // quantize to 256-color palette and create indexed bitmap
        const palette = quantize(rgba, 256, { format: 'rgb444' });
        const indexed = applyPalette(rgba, palette, 'rgb444');

        gif.writeFrame(indexed, imgWidth, imgHeight, {
          palette,
          delay,
          repeat: 0, // loop forever
        });

        buffer.remove();
      }

      gif.finish();

      // restore original frame
      window.img = savedImg;
      gridCellColors = savedColors;
      applyState(allFrames[originalIndex].state);
      window.density = window.baseDensity
        + '0'.repeat(Math.max(0, window.zeroCount))
        + ' '.repeat(Math.max(0, window.spaceCount));
      if (!window.useImageColors) {
        colorMap = updateColorMap(p, window);
      }
      window.updateSketch();

      // download the GIF
      const output = gif.bytes();
      const blob = new Blob([output], { type: 'image/gif' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ascii-animation.gif';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('GIF downloaded');
    } catch (error) {
      console.error('Error creating GIF:', error);
    } finally {
      isDownloading = false;
      if (downloadBtn) downloadBtn.disabled = false;
    }
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
            gridCellColors = e.data;
            console.log("Color extraction completed. Total colors:", gridCellColors.length);
            resolve();
          };
        });
      }
  
      const uniqueChars = [...new Set(window.density)].join("");
      if (!window.loadedFont) {
        const defaultFontPath = import.meta.env.VITE_DEFAULT_FONT;
        window.loadedFont = await loadFont(defaultFontPath);
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
    gridCellColors = e.data;
    window.useImageColors = true;
    window.isExtractingColors = false;

    // cache on the active frame when in video mode
    if (isVideoMode()) {
      const frames = getFrames();
      const idx = getActiveFrameIndex();
      if (frames[idx]?.image) {
        frames[idx].gridCellColors = gridCellColors;
      }
    }

    window.updateSketch();
  };
}

p5Instance = new p5(createSketch);
window.p5Instance = p5Instance;

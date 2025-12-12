import p5 from "p5";
import "./styles.css";
import { initializeControls, loadNewImage } from "./controls.js";
import { loadFont, getSubsetFont, fontToBase64 } from "./fontsubset.js";
import { updateColorMap, kMeansColorClustering, hslToRgb, rgbToHsl } from "./colorUtils.js";

let p5Instance;
let animationFrameId = null;
let colorExtractionWorker = new Worker(new URL('./color-extraction-worker.js', import.meta.url));
let gridCellColors = null;

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
  window.bgColorOption = "black";
  window.customBgColor = [0, 0, 0, 1];   // HSLA
  window.advancedBgMode = window.advancedBgMode || "off";
  window.advancedBgColor = window.advancedBgColor || [210, 80, 50, 1];
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
        
        const bgColor = getBgColor();
        p.background(bgColor);
        
        if (typeof drawAsciiArt === "function") {
          drawAsciiArt();
        } else {
          console.log("drawAsciiArt function not found");
        }
        
        p.redraw();
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
    const defaultImagePath = import.meta.env.VITE_DEFAULT_IMAGE;

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
    updateColorMap(p, window);

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

function drawAsciiArt(graphics = null) {
  console.log("Drawing ASCII art, graphics null?", graphics === null);

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
    // When using image colors, keep the original grid so indices line up
    scaledGridColumns = window.gridColumns;
    scaledGridRows = gridRows;
  } else {
    // Scale grid to the render target (e.g. offscreen PNG buffer)
    const scaleX = canvas.width / p.width;
    const scaleY = canvas.height / p.height;
    scaledGridColumns = Math.floor(window.gridColumns * scaleX);
    scaledGridRows = Math.floor(gridRows * scaleY);
  }

  const cellWidth = canvas.width / scaledGridColumns;
  const cellHeight = canvas.height / scaledGridRows;

  const fontSize = Math.min(cellWidth, cellHeight) * 0.9;
  canvas.textSize(fontSize);
  canvas.textAlign(p.CENTER, p.CENTER);

  imgToUse.loadPixels();

  const advancedBgMode = window.advancedBgMode || "off";

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
        if (colorIndex < gridCellColors.length) {
          const colorArray = gridCellColors[colorIndex];
          if (Array.isArray(colorArray) && colorArray.length === 3) {
            charColor = p.color(colorArray[0], colorArray[1], colorArray[2]);
          } else {
            console.warn("Invalid color data at index", colorIndex, colorArray);
            charColor = p.color(255);
          }
        } else {
          charColor = p.color(255);
        }
      } else if (colorMap) {
        charColor = colorMap.get(c);
      }

      // ---- Pixel background per cell (optional)
      let bgRectColor = null;

      // Base RGB for HSL offset mode
      let baseRgbForHslOffset = null;

      if (charColor) {
        // Prefer the character color as base
        const [cr, cg, cb] = charColor.levels;
        baseRgbForHslOffset = [cr, cg, cb];
      } else if (window.useImageColors && gridCellColors) {
        // If no charColor (e.g. space) but image colors exist, use the image cell color
        const cellIndex = y * scaledGridColumns + x;
        if (cellIndex < gridCellColors.length) {
          const colorArray = gridCellColors[cellIndex];
          if (Array.isArray(colorArray) && colorArray.length === 3) {
            baseRgbForHslOffset = [colorArray[0], colorArray[1], colorArray[2]];
          }
        }
      }

      if (!baseRgbForHslOffset) {
        // Fallback: build a neutral grey from brightness when no color is available
        const lGrey = Math.max(0, Math.min(100, (adjustedAvg / 255) * 100));
        const [gr, gg, gb] = hslToRgb(0, 0, lGrey);
        baseRgbForHslOffset = [gr, gg, gb];
      }

      switch (advancedBgMode) {
        case "hslOffset": {
          const bg = getHslOffsetBgColor(baseRgbForHslOffset, adjustedAvg);
          if (bg) {
            // Force pixel alpha to match bgAlpha slider
            bg.setAlpha(bgA);
            bgRectColor = bg;
          }
          break;
        }

        case "colorPicker": {
          // Pixel base colour is RGB from the pixel picker
          const [pr, pg, pb] = window.pixelColorRGB || [120, 170, 255];

          // Use brightness as lightness (convert base to HSL, replace L)
          const [h, s] = rgbToHsl(pr, pg, pb);
          const l = Math.round((adjustedAvg / 255) * 100);
          const [r, g, b] = hslToRgb(h, s, l);

          bgRectColor = p.color(r, g, b, bgA);
          break;
        }

        case "off":
        default:
          // no pixel rects
          break;
      }

      if (bgRectColor) {
        canvas.noStroke();
        canvas.fill(bgRectColor);
        canvas.rect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
      }

      // Draw the character on top
      if (charColor) {
        canvas.fill(charColor);
      } else {
        canvas.fill(255);
      }

      const xPos = (x + 0.5) * cellWidth;
      const yPos = (y + 0.5) * cellHeight;
      canvas.text(c, xPos, yPos);
    }
  }
}

  function getCellBgGray(adjustedAvg) {
    const normalized = adjustedAvg / 255;
    return Math.round(normalized * 255);
  }

  function getBgColor() {
    const rgb = window.bgColorRGB || [0, 0, 0];
    const a = typeof window.bgAlpha === "number" ? window.bgAlpha : 1;
    const [r, g, b] = rgb;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  } 

  function getHslOffsetBgColor(baseRgb, adjustedAvg) {
    if (!baseRgb || baseRgb.length < 3) return null;

    let [r, g, b] = baseRgb;
    let [h, s, l] = rgbToHsl(r, g, b); // h:0-360, s/l:0-100

    // Apply offsets from UI
    const hOffset = window.hOffset || 0;
    const sOffset = window.sOffset || 0;
    const lOffset = window.lOffset || 0;

    h = (h + hOffset + 360) % 360;
    s = Math.max(0, Math.min(100, s + sOffset));
    l = Math.max(0, Math.min(100, l + lOffset));

    const [rr, gg, bb] = hslToRgb(h, s, l);
    return p.color(rr, gg, bb);
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
    p.saveCanvas(offscreenBuffer, window.density, "png");
    offscreenBuffer.remove();

    setTimeout(() => {
      isDownloading = false;
      if (downloadButton) {
        downloadButton.disabled = false;
      }
      console.log("Download process completed");
    }, 1000);
  };

  window.loadNewImage = function (imageName, pInstance, isDefault = false, resolve) {
    p.loadImage(
      `img/${imageName}`,
      (newImg) => {
        window.img = newImg;
        window.img.resize(p.width, p.height);
        
        if (p.isLooping()) {
          p.redraw();
        } else {
          p.loop();
          p.noLoop();
        }
        if (resolve) resolve();
      },
      (error) => {
        console.error("Error loading image:", error);
        if (resolve) resolve();
      }
    );
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
    window.updateSketch();
  };
}

p5Instance = new p5(createSketch);
window.p5Instance = p5Instance;

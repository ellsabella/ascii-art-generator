import p5 from "p5";
import "./styles.css";
import { initializeControls, loadNewImage } from "./controls.js";
import { loadFont, getSubsetFont, fontToBase64 } from "./fontsubset.js";

let p5Instance;
let animationFrameId = null;

function createSketch(p) {
  let font;
  let gridRows, gw, ar, windowAR, offscreen, highResImg;

  window.baseDensity = "RRBZ21";
  window.zeroCount = 4;
  window.spaceCount = 0;
  window.density = window.baseDensity + "0".repeat(window.zeroCount) + " ".repeat(window.spaceCount);
  window.colorCount = 2;
  window.invert = true;
  window.gridColumns = 150;
  window.printRes = 900;
  window.cF = 0.55;
  window.mP = 141;
  window.LERP = true;
  window.startColor = [255, 255, 0];
  window.middleColor = [255, 205, 0];
  window.endColor = [255, 0, 255];
  window.bgColorOption = "black";
  window.customBgColor = [0, 0, 0];

  let colorMap;
  let isDownloading = false;

  window.updateSketch = async function () {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(() => {
      try {
        if (!window.img || typeof window.img.height === "undefined" || typeof window.img.width === "undefined") {
          return;
        }
        if (!p || typeof p.floor !== "function" || typeof p.width === "undefined") {
          return;
        }
        gridRows = p.floor(window.gridColumns * (window.img.height / window.img.width));
        gw = p.width / window.gridColumns;
        p.textSize(gw * 0.9);
        if (typeof updateColorMap === "function") {
          updateColorMap();
        }
        if (typeof drawAsciiArt === "function") {
          drawAsciiArt();
        }
        p.redraw();
      } catch (error) {
        console.error("Error in updateSketch:", error);
      }
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
        console.log("Default image loaded, initializing sketch");
        initializeSketch();
      })
      .catch((error) => {
        console.error("Error loading default image:", error);
      });
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
    updateColorMap();

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

  function updateColorMap() {
    colorMap = new Map();

    const densityWithoutSpaces = window.density.replace(/\s/g, '');
    const totalChars = densityWithoutSpaces.length;

    for (let i = 0; i < totalChars; i++) {
      const char = window.density.charAt(i);
      let col;
      if (window.colorCount === 1) {
        col = p.color(...window.startColor);
      } else if (window.colorCount === 2) {
        if (window.LERP) {
          const t = i / (totalChars - 1);
          col = p.lerpColor(p.color(...window.startColor), p.color(...window.endColor), t);
        } else {
          col = i < totalChars / 2 ? p.color(...window.startColor) : p.color(...window.endColor);
        }
      } else {
        const firstThird = Math.floor(totalChars / 3);
        const secondThird = Math.floor((2 * totalChars) / 3);
        if (i < firstThird) {
          col = p.color(...window.startColor);
        } else if (i < secondThird) {
          col = p.color(...window.middleColor);
        } else {
          col = p.color(...window.endColor);
        }
      }
      colorMap.set(char, col);
    }
  }

  function drawAsciiArt(graphics = null) {
    const isOffscreen = graphics !== null;
    const canvas = isOffscreen ? graphics : p;
    const imgToUse = isOffscreen ? highResImg : window.img;
    const bgColor = getBgColor();
    canvas.background(bgColor);
    canvas.textFont(font);

    const scaleX = canvas.width / p.width;
    const scaleY = canvas.height / p.height;

    const scaledGridColumns = Math.floor(window.gridColumns * scaleX);
    const scaledGridRows = Math.floor(gridRows * scaleY);
    const cellWidth = canvas.width / scaledGridColumns;
    const cellHeight = canvas.height / scaledGridRows;

    const fontSize = Math.min(cellWidth, cellHeight) * 0.9;
    canvas.textSize(fontSize);
    canvas.textAlign(p.CENTER, p.CENTER);
    imgToUse.loadPixels();

    for (let y = 0; y < scaledGridRows; y++) {
      for (let x = 0; x < scaledGridColumns; x++) {
        const imgX = Math.floor((x / scaledGridColumns) * imgToUse.width);
        const imgY = Math.floor((y / scaledGridRows) * imgToUse.height);
        const w = Math.ceil(imgToUse.width / scaledGridColumns);
        const h = Math.ceil(imgToUse.height / scaledGridRows);

        const avg = getAverageGrayscale(imgToUse, imgX, imgY, w, h);
        const adjustedAvg = adjustBrightnessContrast(avg, window.cF, window.mP);
        const charIndex = window.invert
          ? Math.floor(p.map(adjustedAvg, 0, 255, window.density.length - 1, 0))
          : Math.floor(p.map(adjustedAvg, 0, 255, 0, window.density.length - 1));
        const c = window.density.charAt(charIndex);

        const charColor = colorMap.get(c);

        if (charColor) {
          canvas.fill(charColor.levels[0], charColor.levels[1], charColor.levels[2]);
        } else {
          canvas.fill(255);
        }

        const xPos = (x + 0.5) * cellWidth;
        const yPos = (y + 0.5) * cellHeight;
        canvas.text(c, xPos, yPos);
      }
    }
  }

  function getBgColor() {
    switch (window.bgColorOption) {
      case "black":
        return "black";
      case "white":
        return "white";
      case "transparent":
        return "transparent";
      case "custom":
        if (Array.isArray(window.customBgColor)) {
          return `rgb(${window.customBgColor.join(",")})`;
        } else {
          console.error("customBgColor is not properly initialized");
          return "black";
        }
      default:
        return "black";
    }
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
    try {
      const width = window.gridColumns;
      const height = Math.floor(window.gridColumns * (p.height / p.width));
  
      const uniqueChars = [...new Set(window.density)].join("");
      if (!window.loadedFont) {
        const defaultFontPath = import.meta.env.VITE_DEFAULT_FONT;
        window.loadedFont = await loadFont(defaultFontPath);
      }
      const subsetFontData = await getSubsetFont(window.loadedFont, uniqueChars);
      const fontBase64 = fontToBase64(subsetFontData);
  
      const isSingleColor = window.colorCount === 1;
      let colorStyle = "";
      let singleColor = "";
  
      if (isSingleColor) {
        singleColor = `rgb(${window.startColor.join(',')})`;
        colorStyle = `text{fill:${singleColor}}`;
      } else {
        colorStyle = Array.from(colorMap).map(([char, color]) => 
          `.c${char}{fill:rgb(${color.levels[0]},${color.levels[1]},${color.levels[2]})}`)
          .join('');
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
  
        if (isSingleColor) {
          let rowChars = "";
          let xPositions = [];
          for (let x = 0; x < width; x++) {
            const imgX = Math.floor(x * (imgCopy.width / width));
            const imgY = Math.floor(y * (imgCopy.height / height));
            const w = Math.ceil(imgCopy.width / width);
            const h = Math.ceil(imgCopy.height / height);
  
            const avg = getAverageGrayscale(imgCopy, imgX, imgY, w, h);
            const adjustedAvg = adjustBrightnessContrast(avg, window.cF, window.mP);
            const charIndex = window.invert
              ? Math.floor(p.map(adjustedAvg, 0, 255, window.density.length - 1, 0))
              : Math.floor(p.map(adjustedAvg, 0, 255, 0, window.density.length - 1));
            const char = window.density.charAt(charIndex);
            
            if (char !== ' ') {
              rowChars += char;
              xPositions.push((x + 0.5) * cellSize);
            }
          }
          rowContent = `<tspan x="${xPositions.join(',')}">${rowChars}</tspan>`;
        } else {
          let currentChar = "";
          let charPositions = [];
  
          for (let x = 0; x < width; x++) {
            const imgX = Math.floor(x * (imgCopy.width / width));
            const imgY = Math.floor(y * (imgCopy.height / height));
            const w = Math.ceil(imgCopy.width / width);
            const h = Math.ceil(imgCopy.height / height);
  
            const avg = getAverageGrayscale(imgCopy, imgX, imgY, w, h);
            const adjustedAvg = adjustBrightnessContrast(avg, window.cF, window.mP);
            const charIndex = window.invert
              ? Math.floor(p.map(adjustedAvg, 0, 255, window.density.length - 1, 0))
              : Math.floor(p.map(adjustedAvg, 0, 255, 0, window.density.length - 1));
            const c = window.density.charAt(charIndex);
  
            if (c !== currentChar || x === width - 1) {
              if (currentChar && charPositions.length > 0 && currentChar !== ' ') {
                const xPositions = charPositions.map((pos) => (pos + 0.5) * cellSize).join(",");
                rowContent += `<tspan x="${xPositions}" class="c${currentChar}">${currentChar.repeat(
                  charPositions.length
                )}</tspan>`;
              }
              currentChar = c;
              charPositions = [x];
            } else {
              charPositions.push(x);
            }
  
            if (x === width - 1 && c === currentChar && c !== ' ') {
              const xPositions = charPositions.map((pos) => (pos + 0.5) * cellSize).join(",");
              rowContent += `<tspan x="${xPositions}" class="c${currentChar}">${currentChar.repeat(
                charPositions.length
              )}</tspan>`;
            }
          }
        }
  
        const yPos = (y + 0.5) * cellSize;
        svgContent += `<text y="${yPos}">${rowContent}</text>`;
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
    } catch (error) {
      console.error("Error creating SVG:", error);
    }
  };
}

p5Instance = new p5(createSketch);
window.p5Instance = p5Instance;
import p5 from "p5";
import "./styles.css";
import { initializeControls, loadNewImage } from "./controls.js";
import { loadFont, getSubsetFont, fontToBase64 } from "./fontsubset.js";

let p5Instance;
p5Instance = new p5(createSketch);
window.p5Instance = p5Instance;

function createSketch(p) {
  let font, gridRows, gw, ar, windowAR, offscreen, highResImg;
  window.baseDensity = "RRBZ21";
  window.zeroCount = 4;
  window.density = window.baseDensity + "0".repeat(window.zeroCount);
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
  let originalFont;

  p.preload = function () {
    const defaultFontPath = import.meta.env.VITE_DEFAULT_FONT;
    const defaultImagePath = import.meta.env.VITE_DEFAULT_IMAGE;
    loadFont(defaultFontPath)
      .then((loadedFont) => {
        originalFont = loadedFont;
        fontLoaded = true;
        if (p.setup && typeof p.setup === "function") {
          p.setup();
        }
      })
      .catch((error) => {
        console.error("Error loading font:", error);
      });
    font = p.loadFont(defaultFontPath);
    window.defaultImageLoaded = new Promise((resolve) => {
      loadNewImage(defaultImagePath, p, true, resolve);
    });
  };

  p.setup = function () {
    let canvas = p.createCanvas(100, 100);
    canvas.parent("canvas-container");

    p.frameRate(60);
    p.pixelDensity(1);
    p.textFont(font);

    window.p5Instance = p;
    window.defaultImageLoaded.then(() => {
      console.log("Default image loaded, initializing sketch");
      initializeSketch();
    });
  };

  function initializeSketch() {
    console.log(
      `Image loaded. Dimensions: ${window.img.width}x${window.img.height}`
    );
    setCanvasSize();
    console.log(`Canvas size after setCanvasSize: ${p.width}x${p.height}`);
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
    drawAsciiArt();
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
      p.resizeCanvas(h * ar, h);
    } else {
      p.resizeCanvas(w, w / ar);
    }
  }

  function createOffscreenBuffer() {
    const scaleFactor = window.printRes / Math.max(p.width, p.height);
    const offscreenWidth = Math.floor(p.width * scaleFactor);
    const offscreenHeight = Math.floor(p.height * scaleFactor);
    offscreen = p.createGraphics(offscreenWidth, offscreenHeight);
    if (window.img) {
      highResImg = window.img.get();
      highResImg.resize(offscreenWidth, offscreenHeight);
    }
  }

  function updateColorMap() {
    colorMap = new Map();
    const totalChars = window.density.length;
    for (let i = 0; i < totalChars; i++) {
      const char = window.density.charAt(i);
      let col;
      if (window.colorCount === 1) {
        col = p.color(...window.startColor);
      } else if (window.colorCount === 2) {
        if (window.LERP) {
          const t = i / (totalChars - 1);
          col = p.lerpColor(
            p.color(...window.startColor),
            p.color(...window.endColor),
            t
          );
        } else {
          col =
            i < totalChars / 2
              ? p.color(...window.startColor)
              : p.color(...window.endColor);
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
    const imgToUse = isOffscreen ? highResImg : img;
    const bgColor = getBgColor();
    canvas.background(bgColor);
    canvas.textFont(font);

    const scaleX = canvas.width / p.width;
    const scaleY = canvas.height / p.height;

    const scaledGridColumns = Math.floor(gridColumns * scaleX);
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

        const avg = getAverageGrayscale(
          imgToUse,
          imgX,
          imgY,
          imgToUse.width / scaledGridColumns,
          imgToUse.height / scaledGridRows
        );
        const adjustedAvg = adjustBrightnessContrast(avg, window.cF, window.mP);
        const charIndex = window.invert
          ? Math.floor(p.map(adjustedAvg, 0, 255, window.density.length - 1, 0))
          : Math.floor(
              p.map(adjustedAvg, 0, 255, 0, window.density.length - 1)
            );
        const c = window.density.charAt(charIndex);

        const charColor = colorMap.get(c);

        if (charColor) {
          canvas.fill(
            charColor.levels[0],
            charColor.levels[1],
            charColor.levels[2]
          );
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
        return "none";
      case "custom":
        return `rgb(${window.customBgColor.join(",")})`;
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
        total +=
          (imgPixels.pixels[idx] +
            imgPixels.pixels[idx + 1] +
            imgPixels.pixels[idx + 2]) /
          3;
      }
    }
    return total / ((endX - x) * (endY - y));
  }

  function adjustBrightnessContrast(value, contrastFactor, midpoint) {
    return (value - midpoint) * contrastFactor + midpoint;
  }
  window.updateColorMap = updateColorMap;
  window.drawAsciiArt = drawAsciiArt;
  window.createOffscreenBuffer = createOffscreenBuffer;
  window.initializeSketch = initializeSketch;

  window.updateDensity = function () {
    window.baseDensity = document.getElementById("density-input").value;
    window.zeroCount = parseInt(document.getElementById("zero-slider").value);
    window.density = window.baseDensity + "0".repeat(window.zeroCount);
    window.updateSketch();
  };

  window.updateSketch = function () {
    console.log("Current values:", {
      LERP: window.LERP,
      mP: window.mP,
      cF: window.cF,
      density: window.density,
      gridColumns: window.gridColumns,
      startColor: window.startColor,
      middleColor: window.middleColor,
      endColor: window.endColor,
    });
    gridRows = p.floor(window.gridColumns * (img.height / img.width));
    gw = p.width / window.gridColumns;
    p.textSize(gw * 0.9);
    updateColorMap();
    drawAsciiArt();
    p.redraw();
  };

  window.downloadPNG = function () {
    if (isDownloading) {
      console.log("Download already in progress");
      return;
    }

    isDownloading = true;
    console.log("downloadPNG function called");

    const downloadButton = document.getElementById("download-png");
    if (downloadButton) {
      downloadButton.disabled = true;
    }

    console.log("Downloading PNG...");

    const pngWidth = parseInt(document.getElementById("png-width").value);
    if (isNaN(pngWidth) || pngWidth <= 0) {
      console.error("Invalid PNG width");
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

    setTimeout(() => {
      isDownloading = false;
      if (downloadButton) {
        downloadButton.disabled = false;
      }
      console.log("Download process completed");
    }, 1000);
  };

  window.loadNewImage = function (imageName) {
    p.loadImage(
      `img/${imageName}`,
      (newImg) => {
        img = newImg;
        img.resize(p.width, p.height);
        if (p.isLooping()) {
          p.redraw();
        } else {
          p.loop();
          p.noLoop();
        }
      },
      (error) => console.error("Error loading image:", error)
    );
  };
  window.createAndDownloadSVG = async function () {
    try {
      const width = window.gridColumns;
      const height = Math.floor(window.gridColumns * (p.height / p.width));
      
      const uniqueChars = [...new Set(window.density)].join('');
      if (!window.loadedFont) {
        const defaultFontPath = import.meta.env.VITE_DEFAULT_FONT;
        window.loadedFont = await loadFont(defaultFontPath);
      }
      const subsetFontData = await getSubsetFont(window.loadedFont, uniqueChars);
      const fontBase64 = fontToBase64(subsetFontData);
      
      let colorClasses = "";
      colorMap.forEach((color, char) => {
        colorClasses += `.c${char}{fill:rgb(${color.levels[0]},${color.levels[1]},${color.levels[2]})}`;
      });
  
      const cellSize = 10; // Standard cell size
      const fontSize = 9; // 90% of cell size
  
      let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width * cellSize} ${height * cellSize}">
  <defs>
  <style>
  @font-face{font-family:AsciiArtFont;src:url(${fontBase64}) format('truetype')}
  ${colorClasses}
  text{font-family:AsciiArtFont,monospace;font-size:${fontSize}px;dominant-baseline:central}
  </style>
  </defs>
  <rect width="100%" height="100%" fill="${getBgColor()}"/>
  `;
  
      const imgCopy = window.img.get();
      imgCopy.loadPixels();
  
      for (let y = 0; y < height; y++) {
        let rowContent = "";
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
            if (currentChar) {
              const xPositions = charPositions.map(pos => pos * cellSize).join(',');
              rowContent += `<tspan x="${xPositions}" class="c${currentChar}">${currentChar.repeat(charPositions.length)}</tspan>`;
            }
            currentChar = c;
            charPositions = [x];
          } else {
            charPositions.push(x);
          }
  
          if (x === width - 1 && c === currentChar) {
            const xPositions = charPositions.map(pos => pos * cellSize).join(',');
            rowContent += `<tspan x="${xPositions}" class="c${currentChar}">${currentChar.repeat(charPositions.length)}</tspan>`;
          }
        }
  
        svgContent += `<text y="${(y + 0.5) * cellSize}">${rowContent}</text>`;
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

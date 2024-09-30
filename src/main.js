import p5 from "p5";
import "./styles.css";
import { initializeControls, loadNewImage } from "./controls.js";
import { loadFont, getSubsetFont, fontToBase64 } from "./fontsubset.js";
import { updateColorMap, kMeansColorClustering, hslToRgb } from "./colorUtils.js";

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
  window.invert = true;
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
    const bgColor = getBgColor();
    canvas.background(bgColor);
    canvas.textFont(font);
  
    const useOriginalGrid = window.useImageColors && gridCellColors;
    
    let scaledGridColumns, scaledGridRows;
    if (useOriginalGrid) {
      scaledGridColumns = window.gridColumns;
      scaledGridRows = gridRows;
    } else {
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
            // console.warn("Color index out of bounds:", colorIndex, "Max index:", gridCellColors.length - 1);
            charColor = p.color(255);
          }
        } else {
          charColor = colorMap.get(c);
        }
  
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

  function getBgColor() {
    switch (window.bgColorOption) {
      case "black":
        return "rgb(0, 0, 0)";
      case "white":
        return "rgb(255, 255, 255)";
      case "transparent":
        return "rgba(0, 0, 0, 0)";
      case "custom":
        if (Array.isArray(window.customBgColor) && window.customBgColor.length >= 3) {
          const [h, s, l, a = 1] = window.customBgColor;
          const [r, g, b] = hslToRgb(h, s, l);
          return `rgba(${r}, ${g}, ${b}, ${a})`;
        } else {
          console.error("customBgColor is not properly initialized");
          return "rgb(0, 0, 0)";
        }
      default:
        return "rgb(0, 0, 0)";
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
          const charIndex = window.invert
            ? Math.floor(p.map(adjustedAvg, 0, 255, window.density.length - 1, 0))
            : Math.floor(p.map(adjustedAvg, 0, 255, 0, window.density.length - 1));
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

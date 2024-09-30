// import { extractDominantColors, assignColorsAndBackground, rgbToHsl, isGrayscale } from "./colorUtils.js";
import p5 from "p5";

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

export function initializeControls(p5Instance) {
  window.customBgColor = window.customBgColor || [0, 0, 100, 1]; // HSLA
  
  // File upload
  setupFileUpload(p5Instance);

  // Reset image
  setupResetImage(p5Instance);

  // Reset settings button
  setupResetSettings();

  // Debounced MP slider and input
  setupMPSlider();

  // CF slider and input with debouncing
  setupCFSlider();

  // Density characters input
  setupDensityInput();

  // Zero slider input
  setupZeroSlider();

  // Space slider input
  setupSpaceSlider();

  // Invert radio buttons
  setupInvertRadios();

  // Columns input with debounce
  setupColumnsInput();

  // Download PNG button
  setupDownloadPNG();

  // Color extraction toggle
  setupColorExtractionToggle();

  // Color controls
  setupColorControls();

  // Background color radio buttons and custom BG sliders
  setupBackgroundColorControls();

  // Initial setup
  toggleColorControls();

  if (window.sketchReady) {
    updateColorControls();
  } else {
    window.addEventListener("sketchReady", updateColorControls);
  }
}

function setupFileUpload(p5Instance) {
  const imageUpload = document.getElementById("image-upload");
  if (imageUpload) {
    imageUpload.addEventListener(
      "change",
      function (event) {
        const file = event.target.files[0];
        if (file) {
          loadNewImage(file, p5Instance);
        }
      },
      { passive: true }
    );
  }
}

function setupResetImage(p5Instance) {
  const resetButton = document.getElementById("reset-image");
  if (resetButton) {
    resetButton.addEventListener("click", function () {
      const defaultImage = import.meta.env.VITE_DEFAULT_IMAGE || "/img/sleep.png";
      loadNewImage(defaultImage, p5Instance, true);
    });
  }
}

function setupResetSettings() {
  const resetSettingsButton = document.getElementById("reset-settings");
  if (resetSettingsButton) {
    resetSettingsButton.addEventListener("click", resetAllSettings);
  }
}

function setupMPSlider() {
  const mpSlider = document.getElementById("mp");
  const mpValue = document.getElementById("mp-value");
  if (mpSlider && mpValue) {
    const updateMP = debounce(() => {
      window.mP = parseInt(mpSlider.value, 10);
      mpValue.value = window.mP;
      window.updateSketch();
    }, 200);

    mpSlider.addEventListener("input", updateMP);
    mpValue.addEventListener("change", updateMP);
  }
}

function setupCFSlider() {
  const cfSlider = document.getElementById("cf");
  const cfValue = document.getElementById("cf-value");
  if (cfSlider && cfValue) {
    const updateCF = debounce(() => {
      window.cF = parseFloat(cfSlider.value) / 100;
      cfValue.value = (window.cF * 100).toFixed(0);
      window.updateSketch();
    }, 200);

    cfSlider.addEventListener("input", updateCF);
    cfValue.addEventListener("change", updateCF);
  }
}

function setupDensityInput() {
  const densityInput = document.getElementById("density-input");
  if (densityInput) {
    densityInput.addEventListener("change", window.updateDensity);
  }
}

function setupZeroSlider() {
  const zeroSlider = document.getElementById("zero-slider");
  const zeroValue = document.getElementById("zero-value");
  if (zeroSlider && zeroValue) {
    zeroSlider.addEventListener(
      "input",
      debounce(function () {
        zeroValue.textContent = zeroSlider.value;
        window.updateDensity();
      }, 200)
    );
  }
}

function setupSpaceSlider() {
  const spaceSlider = document.getElementById("space-slider");
  const spaceValue = document.getElementById("space-value");
  if (spaceSlider && spaceValue) {
    spaceSlider.addEventListener(
      "input",
      debounce(function () {
        spaceValue.textContent = spaceSlider.value;
        window.updateDensity();
      }, 200)
    );
  }
}

function setupInvertRadios() {
  const invertRadios = document.querySelectorAll('input[name="invert"]');
  if (invertRadios.length > 0) {
    invertRadios.forEach((elem) => {
      elem.addEventListener("change", function (event) {
        window.invert = event.target.value === "true";
        window.updateSketch();
      });
    });
  }
}

function setupColumnsInput() {
  const columnsInput = document.getElementById("columns");
  const columnsValue = document.getElementById("columns-value");
  if (columnsInput && columnsValue) {
    const debouncedUpdateColumns = debounce((value) => {
      // Clamp the value between 10 and 300
      value = Math.min(300, Math.max(10, value));
      columnsInput.value = value;
      columnsValue.value = value;
      
      // Delegate to the main sketch's updateColumns function
      if (typeof window.updateColumns === "function") {
        window.updateColumns(value);
      } else {
        console.error("window.updateColumns is not defined");
      }
    }, 200);

    columnsInput.addEventListener("input", function (event) {
      const value = parseInt(event.target.value, 10);
      if (!isNaN(value)) {
        debouncedUpdateColumns(value);
      }
    });

    columnsValue.addEventListener("change", function (event) {
      const value = parseInt(event.target.value, 10);
      if (!isNaN(value)) {
        debouncedUpdateColumns(value);
      }
    });

    debouncedUpdateColumns(150);
  }
}

function setupDownloadPNG() {
  const downloadPngButton = document.getElementById("download-png");
  if (downloadPngButton) {
    downloadPngButton.addEventListener("click", function (event) {
      event.preventDefault();
      if (typeof window.downloadPNG === "function") {
        window.downloadPNG();
      } else {
        console.error("downloadPNG function not found");
      }
    });
  }
}

function setupColorExtractionToggle() {
  const colorExtractionToggle = document.getElementById("color-extraction-toggle");
  if (colorExtractionToggle) {
    colorExtractionToggle.addEventListener("change", function(event) {
      window.useImageColors = event.target.checked;
      toggleColorControls();
      
      if (window.useImageColors) {
        // Switch background to black
        window.bgColorOption = "black";
        const blackBgRadio = document.getElementById("bg-black");
        if (blackBgRadio) {
          blackBgRadio.checked = true;
        }
        
        // Hide custom background color controls
        const customBgColorDiv = document.getElementById("custom-bg-color");
        if (customBgColorDiv) {
          customBgColorDiv.style.display = "none";
        }
        
        window.extractColors();
      } else {
        updateColorControlsVisibility();
      }
      
      window.updateSketch();
    });
  }
}

function setupColorControls() {
  const colorControls = [
    { id: "start-color", element: null, listeners: [] },
    { id: "middle-color", element: null, listeners: [] },
    { id: "end-color", element: null, listeners: [] },
    { id: "color-count", element: null, listeners: [] },
    { id: "lerp-control", element: null, listeners: [] }
  ];

  const colorCountRadios = document.querySelectorAll('input[name="color-count"]');
  colorCountRadios.forEach(radio => {
    radio.addEventListener('change', function(event) {
      window.colorCount = parseInt(event.target.value, 10);
      updateColorControlsVisibility();
      window.updateSketch();
    });
  });

  colorControls.forEach(control => {
    control.element = document.getElementById(control.id);
    if (control.element) {
      const inputs = control.element.querySelectorAll('input, .color-slider-container');
      inputs.forEach(input => {
        const listener = createColorControlListener(input);
        control.listeners.push({ input, listener });
        
        if (input.classList.contains('color-slider-container')) {
          setupColorSlider(input);
        } else {
          input.addEventListener('change', listener);
        }
      });
    }
  });

  // SVG download button
  const downloadSvgButton = document.getElementById("download-svg");
  if (downloadSvgButton) {
    downloadSvgButton.addEventListener("click", window.createAndDownloadSVG);
  }

  window.colorControls = colorControls;  // Make colorControls accessible globally
}

function setupColorSlider(container) {
  const slider = container.querySelector(".color-slider");
  const valueInput = container.querySelector(".color-value-input");
  
  if (slider && valueInput) {
    const updateColor = debounce((value) => {
      slider.value = value;
      valueInput.value = value;
      const color = slider.dataset.color;
      const channel = slider.dataset.channel;
      const index = ["h", "s", "l", "a"].indexOf(channel);
      
      if (color === "bg-color") {
        window.customBgColor[index] = channel === "a" ? parseFloat(value) : parseInt(value, 10);
      } else {
        window[color + "Color"][index] = channel === "a" ? parseFloat(value) : parseInt(value, 10);
      }
      window.updateSketch();
    }, 200);

    slider.addEventListener("input", (event) => {
      updateColor(event.target.value);
    });

    valueInput.addEventListener("change", (event) => {
      let value = parseFloat(event.target.value);
      const max = parseFloat(slider.max);
      const min = parseFloat(slider.min);
      value = Math.min(max, Math.max(min, value));
      updateColor(value);
    });
  }
}

function setupBackgroundColorControls() {
  const bgColorRadios = document.querySelectorAll('input[name="bg-color"]');
  const customBgColorDiv = document.getElementById("custom-bg-color");
  if (bgColorRadios.length > 0) {
    bgColorRadios.forEach((elem) => {
      elem.addEventListener("change", function (event) {
        window.bgColorOption = event.target.value;
        if (event.target.value === "custom") {
          customBgColorDiv.style.display = "block";
          initializeCustomBgColorSliders();
        } else {
          customBgColorDiv.style.display = "none";
        }
        window.updateSketch();
      });
    });
  }

  // Set up custom background color sliders
  const bgColorSliders = document.querySelectorAll('#custom-bg-color .color-slider');
  bgColorSliders.forEach(slider => {
    slider.addEventListener('input', updateCustomBgColor);
  });

  const bgColorInputs = document.querySelectorAll('#custom-bg-color .color-value-input');
  bgColorInputs.forEach(input => {
    input.addEventListener('change', updateCustomBgColor);
  });
}

function createColorControlListener(input) {
  return function(event) {
    const inputType = input.type;
    const inputName = input.name;
    const inputValue = event.target.value;

    switch (inputType) {
      case 'radio':
        if (inputName === 'color-count') {
          window.colorCount = parseInt(inputValue, 10);
          updateColorControlsVisibility();
        } else if (inputName === 'lerp') {
          window.LERP = inputValue === 'true';
        }
        break;
      
      case 'range':
      case 'number':
        const colorType = input.closest('.color-slider-container').dataset.color;
        const channel = input.dataset.channel;
        const index = ['h', 's', 'l', 'a'].indexOf(channel);
        
        if (colorType === 'bg-color') {
          updateCustomBgColor(event);
          return; // We've handled the custom background color, so we can return early
        } else {
          const colorProperty = colorType + 'Color';
          if (!window[colorProperty]) {
            window[colorProperty] = [0, 0, 0, 1]; // Default HSLA values
          }
          window[colorProperty][index] = channel === 'a' ? parseFloat(inputValue) : parseInt(inputValue, 10);
        }
        break;
      
      default:
        console.warn('Unhandled input type:', inputType);
    }

    window.updateSketch();
  };
}

function updateColorControlsVisibility() {
  const colorCount = window.colorCount;
  const middleColor = document.getElementById('middle-color');
  const endColor = document.getElementById('end-color');
  const lerpControl = document.getElementById('lerp-control');

  if (middleColor && endColor && lerpControl) {
    switch (colorCount) {
      case 1:
        middleColor.style.display = 'none';
        endColor.style.display = 'none';
        lerpControl.style.display = 'none';
        break;
      case 2:
        middleColor.style.display = 'none';
        endColor.style.display = 'block';
        lerpControl.style.display = 'block';
        break;
      case 3:
        middleColor.style.display = 'block';
        endColor.style.display = 'block';
        lerpControl.style.display = 'none';
        break;
      default:
        console.warn('Unexpected color count:', colorCount);
    }
  }
}

function toggleColorControls() {
  const useImageColors = window.useImageColors;
  const colorControlIds = ['start-color', 'middle-color', 'end-color'];
  
  colorControlIds.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = useImageColors ? 'none' : 'block';
    }
  });

  const colorCountRadios = document.querySelector('.control-group:has([name="color-count"])');
  if (colorCountRadios) {
    colorCountRadios.style.display = useImageColors ? 'none' : 'block';
  }

  const lerpControl = document.getElementById('lerp-control');
  if (lerpControl) {
    lerpControl.style.display = useImageColors ? 'none' : 'block';
  }

  if (!useImageColors) {
    updateColorControlsVisibility();
  }

  // Show/hide color extraction message
  const colorExtractionMessage = document.getElementById("color-extraction-message");
  if (colorExtractionMessage) {
    colorExtractionMessage.style.display = useImageColors ? 'block' : 'none';
  }

  // Always show custom background color controls if custom background is selected
  const customBgColorDiv = document.getElementById("custom-bg-color");
  if (customBgColorDiv) {
    customBgColorDiv.style.display = window.bgColorOption === "custom" ? "block" : "none";
  }
}

export function loadNewImage(source, p5Instance, isDefault = false, callback = null) {
  const loadImagePromise = new Promise((resolve, reject) => {
    if (isDefault || typeof source === "string") {
      p5Instance.loadImage(isDefault ? source : `img/${source}`, resolve, reject);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        p5Instance.loadImage(e.target.result, resolve, reject);
      };
      reader.onerror = reject;
      reader.readAsDataURL(source);
    }
  });

  loadImagePromise
    .then((newImg) => {
      window.img = newImg;
      if (callback) callback();

      if (typeof window.initializeSketch === "function") {
        window.initializeSketch();
      } else {
        console.warn("initializeSketch function not found. Sketch may not update correctly.");
      }

      if (window.useImageColors) {
        window.isExtractingColors = true;
        window.updateSketch(); 
        window.extractColors();
      } else {
        window.updateSketch();
      }
    })
    .catch((error) => console.error("Error loading image:", error));
}

function updateColorControls() {
  if (window.useImageColors) return;

  const colorCountRadio = document.querySelector('input[name="color-count"]:checked');
  if (!colorCountRadio) return;

  const colorCount = parseInt(colorCountRadio.value, 10);
  const middleColor = document.getElementById("middle-color");
  const endColor = document.getElementById("end-color");

  window.colorCount = colorCount;

  if (middleColor && endColor) {
    if (colorCount === 1) {
      middleColor.style.display = "none";
      endColor.style.display = "none";
    } else if (colorCount === 2) {
      middleColor.style.display = "none";
      endColor.style.display = "block";
    } else {
      middleColor.style.display = "block";
      endColor.style.display = "block";
    }
  }

  if (window.sketchReady) {
    window.updateSketch();
  } else {
    console.log("Sketch not ready, skipping updateSketch");
  }
}

function initializeCustomBgColorSliders() {
  if (!Array.isArray(window.customBgColor) || window.customBgColor.length !== 4) {
    window.customBgColor = [0, 0, 0, 1];  // HSLA
  }

  const bgColorControls = document.querySelectorAll("#custom-bg-color .color-slider-container");

  if (bgColorControls.length > 0) {
    bgColorControls.forEach((container) => {
      const slider = container.querySelector(".color-slider");
      const input = container.querySelector(".color-value-input");

      if (slider && input) {
        const channelIndex = ["h", "s", "l", "a"].indexOf(slider.dataset.channel);
        const value = window.customBgColor[channelIndex];
        slider.value = value;
        input.value = value;
      }
    });
  }
}

function updateCustomBgColor(event) {
  const channel = event.target.dataset.channel;
  const value = parseFloat(event.target.value);
  const index = ['h', 's', 'l', 'a'].indexOf(channel);

  if (!window.customBgColor) {
    window.customBgColor = [0, 0, 0, 1]; // Default HSLA values
  }

  window.customBgColor[index] = channel === 'a' ? value : Math.round(value);

  // Update the corresponding slider or input
  const sliderId = `bg-color-color-${channel}`;
  const inputId = `${sliderId}-value`;
  const slider = document.getElementById(sliderId);
  const input = document.getElementById(inputId);

  if (event.target.type === 'range') {
    input.value = value;
  } else {
    slider.value = value;
  }

  window.updateSketch();
}

function updateColorSliders(colorName, colorValues) {
  const channels = ['h', 's', 'l', 'a'];
  channels.forEach((channel, index) => {
    const slider = document.getElementById(`${colorName}-color-${channel}`);
    const input = document.getElementById(`${colorName}-color-${channel}-value`);
    if (slider && input) {
      slider.value = colorValues[index];
      input.value = colorValues[index];
    }
  });
}

function resetAllSettings() {
  // Reset global variables
  window.mP = 141;
  window.cF = 0.55;
  window.baseDensity = "RRBZ21";
  window.zeroCount = 4;
  window.spaceCount = 0;
  window.density = window.baseDensity + "0".repeat(window.zeroCount) + " ".repeat(window.spaceCount);
  window.colorCount = 2;
  window.invert = true;
  window.LERP = true;
  window.startColor = [30, 100, 100, 1];  // HSLA
  window.middleColor = [45, 100, 50, 1]; // HSLA
  window.endColor = [0, 0, 33, 1];   // HSLA
  window.bgColorOption = "black";
  window.customBgColor = [0, 0, 100, 1];   // HSLA
  window.useImageColors = false;

  // Update UI elements
  const updateElement = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
      if (element.type === 'checkbox' || element.type === 'radio') {
        element.checked = value;
      } else if (element.tagName === 'INPUT' || element.tagName === 'SELECT') {
        element.value = value;
      } else {
        element.textContent = value;
      }
    }
  };

  updateElement("mp", window.mP);
  updateElement("mp-value", window.mP);
  updateElement("cf", window.cF * 100);
  updateElement("cf-value", window.cF * 100);
  updateElement("density-input", window.baseDensity);
  updateElement("zero-slider", window.zeroCount);
  updateElement("zero-value", window.zeroCount);
  updateElement("space-slider", window.spaceCount);
  updateElement("space-value", window.spaceCount);
  updateElement("invert-true", true);
  updateElement("color-count-2", true);
  updateElement("lerp-true", true);
  updateElement("bg-black", true);

  // Update color extraction toggle
  const colorExtractionToggle = document.getElementById("color-extraction-toggle");
  if (colorExtractionToggle) {
    colorExtractionToggle.checked = false;
  }

  // Update color sliders
  const updateColorSliders = (colorName, colorValues) => {
    ['h', 's', 'l', 'a'].forEach((channel, index) => {
      updateElement(`${colorName}-color-${channel}`, colorValues[index]);
      updateElement(`${colorName}-color-${channel}-value`, colorValues[index]);
    });
  };

  updateColorSliders("start", window.startColor);
  updateColorSliders("middle", window.middleColor);
  updateColorSliders("end", window.endColor);
  updateColorSliders("bg-color", window.customBgColor);

  // Hide custom background color controls
  const customBgColorDiv = document.getElementById("custom-bg-color");
  if (customBgColorDiv) {
    customBgColorDiv.style.display = "none";
  }

  // Reset columns safely
  if (typeof window.updateColumns === "function") {
    window.updateColumns(150);
  } else {
    console.warn("window.updateColumns is not a function. Falling back to direct assignment.");
    window.gridColumns = 150;
    updateElement("columns", 150);
    updateElement("columns-value", 150);
  }

  // Update density and trigger sketch update
  if (typeof window.updateDensity === "function") {
    window.updateDensity();
  } else {
    console.warn("window.updateDensity is not a function.");
  }

  if (typeof window.updateSketch === "function") {
    window.updateSketch();
  } else {
    console.warn("window.updateSketch is not a function.");
  }

  console.log("All settings have been reset to default values.");
}

document.addEventListener("DOMContentLoaded", () => initializeControls(window.p5Instance));
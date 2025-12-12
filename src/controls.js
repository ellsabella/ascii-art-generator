// import { extractDominantColors, assignColorsAndBackground, rgbToHsl, isGrayscale } from "./colorUtils.js";
import p5 from "p5";
import { hexToRgb, rgbToHex, hslToRgb, rgbToHsl } from "./colorUtils.js";

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

export function initializeControls(p5Instance) {

  // Background defaults (flat black, fully opaque)
  if (!window.bgColorRGB) window.bgColorRGB = [0, 0, 0];
  if (typeof window.bgAlpha !== "number") window.bgAlpha = 1;

  // Background style (reusing existing variable)
  if (!window.advancedBgMode) window.advancedBgMode = "off";

  // Base HSLA for colour-picker mode (example default)
  if (!window.advancedBgColor) {
    window.advancedBgColor = [210, 80, 50, 1]; // [h, s, l, a]
  }

  // HSL offsets for HSL offset mode
  if (typeof window.hOffset !== "number") window.hOffset = 0;
  if (typeof window.sOffset !== "number") window.sOffset = 0;
  if (typeof window.lOffset !== "number") window.lOffset = 0;

  // File upload
  setupFileUpload(p5Instance);

  // Reset image
  setupResetImage(p5Instance);

  // Reset settings button
  setupResetSettings();

  // Background controls
  setupBackgroundControls();

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

  // Columns input with debounce
  setupColumnsInput();

  // Download PNG button
  setupDownloadPNG();

  // Color extraction toggle
  setupColorExtractionToggle();

  // Character color pickers
  setupCharColorPickers()

  // Color count radios
  setupColorCountRadios(); 

  if (window.sketchReady) {
    updateColorControls();
  } else {
    window.addEventListener("sketchReady", updateColorControls);
  }

  // Initial setup
  toggleColorControls();
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

function setupBackgroundControls() {
  // ---- Elements
  const bgColorInput = document.getElementById("bg-color-input");
  const bgAlphaSlider = document.getElementById("bg-alpha");
  const bgAlphaValue = document.getElementById("bg-alpha-value");

  const bgModeRadios = document.querySelectorAll('input[name="advanced-bg-mode"]');

  const hslOffsetControls = document.getElementById("advanced-bg-hsl-offset-controls");
  const pixelPickerControls = document.getElementById("advanced-bg-color-picker-controls");
  const pixelColorInput = document.getElementById("advanced-bg-color-input");

  // ---- Defaults (source of truth)
  if (!Array.isArray(window.bgColorRGB)) window.bgColorRGB = [0, 0, 0];
  if (typeof window.bgAlpha !== "number") window.bgAlpha = 1;

  if (!window.advancedBgMode) window.advancedBgMode = "off";

  // Pixel colour used only in colorPicker pixel mode
  if (!Array.isArray(window.pixelColorRGB)) window.pixelColorRGB = [120, 170, 255]; // sensible default

  if (typeof window.hOffset !== "number") window.hOffset = 0;
  if (typeof window.sOffset !== "number") window.sOffset = 0;
  if (typeof window.lOffset !== "number") window.lOffset = 0;

  // ---- Helpers
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const syncFlatBgPickerUI = () => {
    if (!bgColorInput) return;
    const [r, g, b] = window.bgColorRGB;
    bgColorInput.value = rgbToHex(r, g, b);
  };

  const syncPixelPickerUI = () => {
    if (!pixelColorInput) return;
    const [r, g, b] = window.pixelColorRGB;
    pixelColorInput.value = rgbToHex(r, g, b);
  };

  const syncAlphaUI = () => {
    const pct = Math.round(clamp(window.bgAlpha, 0, 1) * 100);
    if (bgAlphaSlider) bgAlphaSlider.value = pct;
    if (bgAlphaValue) bgAlphaValue.value = pct;
  };

  const setStyleUI = (mode) => {
    // Sync radios
    if (bgModeRadios && bgModeRadios.length) {
      bgModeRadios.forEach((r) => (r.checked = r.value === mode));
    }

    // Show/hide subcontrols
    if (hslOffsetControls) hslOffsetControls.style.display = mode === "hslOffset" ? "block" : "none";
    if (pixelPickerControls) pixelPickerControls.style.display = mode === "colorPicker" ? "block" : "none";
  };

  // ---- Init UI values
  syncFlatBgPickerUI();
  syncPixelPickerUI();
  syncAlphaUI();
  setStyleUI(window.advancedBgMode);

  // ---- Wire: flat background colour picker
  if (bgColorInput) {
    bgColorInput.addEventListener("input", (e) => {
      const rgb = hexToRgb(e.target.value);
      if (!rgb) return;
      window.bgColorRGB = [rgb.r, rgb.g, rgb.b];
      window.updateSketch?.();
    });
  }

  // ---- Wire: pixel colour picker (used only for colorPicker pixel mode)
  if (pixelColorInput) {
    pixelColorInput.addEventListener("input", (e) => {
      const rgb = hexToRgb(e.target.value);
      if (!rgb) return;
      window.pixelColorRGB = [rgb.r, rgb.g, rgb.b];
      window.updateSketch?.();
    });
  }

  // ---- Wire: alpha (applies to BOTH flat background and pixel backgrounds)
  const applyAlphaPct = (pct) => {
    const v = clamp(Number(pct), 0, 100);
    window.bgAlpha = v / 100;
    if (bgAlphaSlider) bgAlphaSlider.value = v;
    if (bgAlphaValue) bgAlphaValue.value = v;
    window.updateSketch?.();
  };

  if (bgAlphaSlider) bgAlphaSlider.addEventListener("input", (e) => applyAlphaPct(e.target.value));
  if (bgAlphaValue) bgAlphaValue.addEventListener("change", (e) => applyAlphaPct(e.target.value));

  // ---- Wire: mode radios
  if (bgModeRadios && bgModeRadios.length) {
    bgModeRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        window.advancedBgMode = e.target.value; // off | hslOffset | colorPicker
        setStyleUI(window.advancedBgMode);
        window.updateSketch?.();
      });
    });
  }

  // ---- Wire HSL offset sliders
  setupHslOffsetControls();

  // Final visibility sync
  setStyleUI(window.advancedBgMode);
}


function setupHslOffsetControls() {
  const pairs = [
    { sliderId: "h-offset", inputId: "h-offset-value", prop: "hOffset", min: -180, max: 180 },
    { sliderId: "s-offset", inputId: "s-offset-value", prop: "sOffset", min: -100, max: 100 },
    { sliderId: "l-offset", inputId: "l-offset-value", prop: "lOffset", min: -100, max: 100 },
  ];

  pairs.forEach(({ sliderId, inputId, prop, min, max }) => {
    const slider = document.getElementById(sliderId);
    const input = document.getElementById(inputId);
    if (!slider || !input) return;

    // Initialise from window.*
    const current = typeof window[prop] === "number" ? window[prop] : 0;
    slider.value = current;
    input.value = current;

    const apply = (val) => {
      let v = parseFloat(val);
      if (isNaN(v)) v = 0;
      v = Math.max(min, Math.min(max, v));
      window[prop] = v;
      slider.value = v;
      input.value = v;

      if (typeof window.updateSketch === "function") {
        window.updateSketch();
      }
    };

    slider.addEventListener("input", (e) => apply(e.target.value));
    input.addEventListener("change", (e) => apply(e.target.value));
  });
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

          // Set flat background to black (optional)
          window.bgColorRGB = [0, 0, 0];
          window.bgAlpha = 1;

          const bgColorInput = document.getElementById("bg-color-input");
          if (bgColorInput) bgColorInput.value = "#000000";

          const bgAlpha = document.getElementById("bg-alpha");
          const bgAlphaValue = document.getElementById("bg-alpha-value");
          if (bgAlpha) bgAlpha.value = 100;
          if (bgAlphaValue) bgAlphaValue.value = 100;

          window.extractColors();
        } else {
          updateColorControlsVisibility();
        }
      
      window.updateSketch();
    });
  }
}

function updateColorControlsVisibility() {
  updateCharPickerVisibility();
}

function toggleColorControls() {
  const useImageColors = !!window.useImageColors;

  const pickerWrap = document.getElementById("char-color-pickers");
  if (pickerWrap) pickerWrap.style.display = useImageColors ? "none" : "block";

  const colorCountGroup = document.getElementById("color-count-group");
  if (colorCountGroup) colorCountGroup.style.display = useImageColors ? "none" : "block";

  const lerpControl = document.getElementById("lerp-control");
  if (lerpControl) lerpControl.style.display = useImageColors ? "none" : (Number(window.colorCount ?? 2) === 2 ? "block" : "none");

  const msg = document.getElementById("color-extraction-message");
  if (msg) msg.style.display = useImageColors ? "block" : "none";

  if (!useImageColors) {
    updateCharPickerVisibility(); // <-- critical
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


function setupCharColorPickers() {
  const bindPicker = (key) => {
    const prop = key + "Color"; // startColor/middleColor/endColor

    const colorInput = document.getElementById(`${key}-color-input`);
    const alphaSlider = document.getElementById(`${key}-alpha`);
    const alphaValue = document.getElementById(`${key}-alpha-value`);

    if (!Array.isArray(window[prop])) {
      // Sensible defaults if missing
      window[prop] = key === "start" ? [30, 100, 100, 1]
                : key === "middle" ? [45, 100, 50, 1]
                : [0, 0, 33, 1];
    }

    // Init UI from HSLA
    const [h, s, l, a = 1] = window[prop];
    const [r, g, b] = hslToRgb(h, s, l);

    if (colorInput) colorInput.value = rgbToHex(r, g, b);

    const aPct = Math.round(a * 100);
    if (alphaSlider) alphaSlider.value = aPct;
    if (alphaValue) alphaValue.value = aPct;

    // Color picker -> update HSLA (preserve alpha)
    if (colorInput) {
      colorInput.addEventListener("input", (e) => {
        const rgb = hexToRgb(e.target.value);
        if (!rgb) return;

        const [hh, ss, ll] = rgbToHsl(rgb.r, rgb.g, rgb.b);
        const currentA = window[prop]?.[3] ?? 1;
        window[prop] = [hh, ss, ll, currentA];
        window.updateSketch?.();
      });
    }

    // Alpha controls -> update only A
    const applyAlpha = (pct) => {
      const v = Math.max(0, Math.min(100, Number(pct)));
      if (alphaSlider) alphaSlider.value = v;
      if (alphaValue) alphaValue.value = v;

      const [hh, ss, ll] = window[prop];
      window[prop] = [hh, ss, ll, v / 100];
      window.updateSketch?.();
    };

    if (alphaSlider) alphaSlider.addEventListener("input", (e) => applyAlpha(e.target.value));
    if (alphaValue) alphaValue.addEventListener("change", (e) => applyAlpha(e.target.value));
  };

  bindPicker("start");
  bindPicker("middle");
  bindPicker("end");

  // Ensure middle/end pickers are shown/hidden correctly on load
  updateCharPickerVisibility();
}

function updateCharPickerVisibility() {
  const c = Number(window.colorCount ?? 2);

  const start = document.getElementById("char-start-picker");
  const mid = document.getElementById("char-middle-picker");
  const end = document.getElementById("char-end-picker");
  const lerpControl = document.getElementById("lerp-control");

  // If we can't find the new UI, fail silently
  if (!start || !mid || !end) return;

  // Start is always relevant (when not using image colours)
  start.style.display = "block";

  if (c === 1) {
    mid.style.display = "none";
    end.style.display = "none";
    if (lerpControl) lerpControl.style.display = "none";
  } else if (c === 2) {
    mid.style.display = "none";
    end.style.display = "block";
    if (lerpControl) lerpControl.style.display = "block";
  } else if (c === 3) {
    mid.style.display = "block";
    end.style.display = "block";
    if (lerpControl) lerpControl.style.display = "none";
  } else {
    // Fallback: treat unknown as 2
    mid.style.display = "none";
    end.style.display = "block";
    if (lerpControl) lerpControl.style.display = "block";
  }
}

function setupColorCountRadios() {
  const radios = document.querySelectorAll('input[name="color-count"]');
  if (!radios.length) return;

  // Initialise from whichever is checked in the DOM (or default to 2)
  const checked = document.querySelector('input[name="color-count"]:checked');
  window.colorCount = checked ? Number(checked.value) : Number(window.colorCount ?? 2);

  // Sync UI immediately
  updateCharPickerVisibility();

  // Listen for changes
  radios.forEach((r) => {
    r.addEventListener("change", (e) => {
      window.colorCount = Number(e.target.value);

      // Only apply picker visibility when not using image colours
      if (!window.useImageColors) {
        updateCharPickerVisibility();
      }

      window.updateSketch?.();
    });
  });
}

function updateColorControls() {
  if (window.useImageColors) return;

  const colorCountRadio = document.querySelector('input[name="color-count"]:checked');
  if (!colorCountRadio) return;

  window.colorCount = parseInt(colorCountRadio.value, 10);

  updateCharPickerVisibility();

  if (window.sketchReady) window.updateSketch?.();
}

function resetAllSettings() {
  // ---- Reset global variables (source of truth)
  window.mP = 141;
  window.cF = 0.55;

  window.baseDensity = "RRBZ21";
  window.zeroCount = 4;
  window.spaceCount = 0;
  window.density =
    window.baseDensity + "0".repeat(window.zeroCount) + " ".repeat(window.spaceCount);

  window.colorCount = 2;
  window.LERP = true;

  // ASCII character colours (HSLA)
  window.startColor = [30, 100, 100, 1];
  window.middleColor = [45, 100, 50, 1];
  window.endColor = [0, 0, 33, 1];

  // Use image colours
  window.useImageColors = false;

  // Pixel background modes
  window.advancedBgMode = "off"; // off | colorPicker | hslOffset
  window.hOffset = 0;
  window.sOffset = 0;
  window.lOffset = 0;

  // Flat background
  window.bgColorRGB = [0, 0, 0];
  window.bgAlpha = 1;

  // Gradient pixel base colour (keep a sensible default)
  // If you want this to reset to a specific colour, set it explicitly here.
  if (!window.advancedBgColor) window.advancedBgColor = [210, 80, 50, 1];

  // ---- Helper for simple UI syncing
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
  };

  const setChecked = (id, checked) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = !!checked;
  };

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
  };

  // ---- Core sliders/inputs
  setValue("mp", window.mP);
  setValue("mp-value", window.mP);

  setValue("cf", Math.round(window.cF * 100));
  setValue("cf-value", Math.round(window.cF * 100));

  setValue("density-input", window.baseDensity);

  setValue("zero-slider", window.zeroCount);
  setText("zero-value", String(window.zeroCount));

  setValue("space-slider", window.spaceCount);
  setText("space-value", String(window.spaceCount));

  // ---- Colour count + LERP radios
  setChecked("color-count-2", true);
  setChecked("lerp-true", true);

  // ---- Use Image Colors toggle + message
  setChecked("color-extraction-toggle", false);

  // Ensure extraction message is hidden
  const msg = document.getElementById("color-extraction-message");
  if (msg) msg.style.display = "none";

  // ---- Background: flat colour + alpha
  setValue("bg-color-input", "#000000");
  setValue("bg-alpha", 100);
  setValue("bg-alpha-value", 100);

  // ---- Background style radios
  setChecked("bg-style-off", true);
  setChecked("bg-style-color-picker", false);
  setChecked("bg-style-hsl-offset", false);

  // ---- Pixel mode subcontrols: hide both
  const hslPanel = document.getElementById("advanced-bg-hsl-offset-controls");
  const pickPanel = document.getElementById("advanced-bg-color-picker-controls");
  if (hslPanel) hslPanel.style.display = "none";
  if (pickPanel) pickPanel.style.display = "none";

  // ---- Reset HSL offset controls
  setValue("h-offset", 0);
  setValue("h-offset-value", 0);
  setValue("s-offset", 0);
  setValue("s-offset-value", 0);
  setValue("l-offset", 0);
  setValue("l-offset-value", 0);

  // ---- Sync ASCII colour pickers UI (NO rebinding)
  syncCharColorPickersUI();

  // ---- Reset columns safely
  if (typeof window.updateColumns === "function") {
    window.updateColumns(150);
  } else {
    window.gridColumns = 150;
    setValue("columns", 150);
    setValue("columns-value", 150);
  }

  // ---- Ensure correct visibility of pickers vs image colours
  if (typeof toggleColorControls === "function") {
    toggleColorControls();
  }

  if (typeof updateCharPickerVisibility === "function") {
    updateCharPickerVisibility();
  }

  // ---- Recompute density (this calls updateSketch internally in your architecture)
  if (typeof window.updateDensity === "function") {
    window.updateDensity();
  } else if (typeof window.updateSketch === "function") {
    window.updateSketch();
  }

  console.log("All settings have been reset to default values.");
}


// document.addEventListener("DOMContentLoaded", () => initializeControls(window.p5Instance));
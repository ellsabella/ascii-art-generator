// import { extractDominantColors, assignColorsAndBackground, rgbToHsl, isGrayscale } from "./colorUtils.js";
import { hexToRgb, rgbToHex, hslToRgb, rgbToHsl } from "./colorUtils.js";

const DEFAULTS = {
  // image/colors
  useImageColors: true,
  colorCount: 2,
  LERP: false,

  // density
  baseDensity: "RBGHZ",
  zeroCount: 2,
  spaceCount: 2,

  // contrast
  cF: 0.6,
  mP: 141,

  // canvas/grid
  gridColumns: 150,
  printRes: 1200,

  // character colours (HSLA)
  startColor: [30, 100, 100, 1],
  middleColor: [45, 100, 50, 1],
  endColor: [0, 0, 33, 1],

  // flat background
  bgColorRGB: [0, 0, 0],
  bgAlpha: 1,

  // pixel background mode
  advancedBgMode: "hslOffset", // "off" | "colorPicker" | "hslOffset"
  pixelColorRGB: [120, 170, 255],

  // offset mode
  hOffset: -11,
  sOffset: 29,
  lOffset: -10,
};

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

export function initializeControls(p5Instance) {
  // ---------------------------------------------------------------------------
  // 1) Wire UI listeners FIRST (so syncUIFromState doesn't get overwritten later)
  // ---------------------------------------------------------------------------
  setupFileUpload(p5Instance);
  setupResetImage(p5Instance);
  setupResetSettings();

  setupBackgroundControls();
  setupMPSlider();
  setupCFSlider();

  setupDensityInput();
  setupZeroSlider();
  setupSpaceSlider();

  setupColumnsInput();
  setupDownloadPNG();

  setupColorExtractionToggle();

  // ASCII character colour pickers + radios
  setupCharColorPickers();
  setupColorCountRadios();

  // Optional: if you have LERP radios, make sure they are wired somewhere.
  // If you already wire LERP elsewhere, ignore this.
  const lerpRadios = document.querySelectorAll('input[name="lerp"]');
  if (lerpRadios && lerpRadios.length) {
    lerpRadios.forEach((r) => {
      r.addEventListener("change", (e) => {
        window.LERP = e.target.value === "true";
        window.updateSketch?.();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 2) Apply defaults to state + UI (single source of truth)
  // ---------------------------------------------------------------------------
  applyDefaultsToState();
  syncUIFromState();

  // Ensure correct show/hide after defaults are applied
  if (typeof toggleColorControls === "function") toggleColorControls();
  if (typeof updateCharPickerVisibility === "function") updateCharPickerVisibility();

  // ---------------------------------------------------------------------------
  // 3) Kick sketch update when ready
  // ---------------------------------------------------------------------------
  const runInitialRender = () => {
    // If your architecture prefers updateDensity() (because it rebuilds window.density), call it.
    if (typeof window.updateDensity === "function") window.updateDensity();
    else window.updateSketch?.();
  };

  if (window.sketchReady) {
    runInitialRender();
  } else {
    // Run once when sketch is ready
    window.addEventListener("sketchReady", runInitialRender, { once: true });
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

function setupBackgroundControls() {
  // ---- Elements
  const bgColorInput = document.getElementById("bg-color-input");
  const bgAlphaSlider = document.getElementById("bg-alpha");
  const bgAlphaValue = document.getElementById("bg-alpha-value");

  const bgModeRadios = document.querySelectorAll('input[name="advanced-bg-mode"]');
  const hslOffsetControls = document.getElementById("advanced-bg-hsl-offset-controls");

  // ---- Defaults (source of truth)
  if (!Array.isArray(window.bgColorRGB)) window.bgColorRGB = [0, 0, 0];
  if (typeof window.bgAlpha !== "number") window.bgAlpha = 1;
  if (!window.advancedBgMode) window.advancedBgMode = "off"; // off | colorPicker | hslOffset

  if (typeof window.hOffset !== "number") window.hOffset = 0;
  if (typeof window.sOffset !== "number") window.sOffset = 0;
  if (typeof window.lOffset !== "number") window.lOffset = 0;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const syncFlatBgPickerUI = () => {
    if (!bgColorInput) return;
    const [r, g, b] = window.bgColorRGB;
    bgColorInput.value = rgbToHex(r, g, b);
  };

  const syncAlphaUI = () => {
    const pct = Math.round(clamp(window.bgAlpha, 0, 1) * 100);
    if (bgAlphaSlider) bgAlphaSlider.value = pct;
    if (bgAlphaValue) bgAlphaValue.value = pct;
  };

  const setStyleUI = (mode) => {
    // sync radios
    if (bgModeRadios && bgModeRadios.length) {
      bgModeRadios.forEach((r) => (r.checked = r.value === mode));
    }

    // show/hide HSL offset sliders
    if (hslOffsetControls) {
      hslOffsetControls.style.display = mode === "hslOffset" ? "block" : "none";
    }

    // SINGLE colour picker rules:
    // - show for Flat (off) and Gradient Pixels (colorPicker)
    // - hide for Offset Pixels (hslOffset)
    if (bgColorInput) {
      bgColorInput.style.display = mode === "hslOffset" ? "none" : "inline-block";
    }
    // hide/show the label too (best effort)
    const bgColorLabel = document.querySelector('label[for="bg-color-input"]');
    if (bgColorLabel) {
      bgColorLabel.style.display = mode === "hslOffset" ? "none" : "block";
    }
  };

  // ---- Init UI
  syncFlatBgPickerUI();
  syncAlphaUI();
  setStyleUI(window.advancedBgMode);

  // ---- Wire: shared colour picker (Flat + Gradient Pixels)
  if (bgColorInput) {
    bgColorInput.addEventListener("input", (e) => {
      const rgb = hexToRgb(e.target.value);
      if (!rgb) return;
      window.bgColorRGB = [rgb.r, rgb.g, rgb.b];
      window.updateSketch?.();
    });
  }

  // ---- Wire: alpha (always applies)
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
        window.advancedBgMode = e.target.value; // off | colorPicker | hslOffset
        setStyleUI(window.advancedBgMode);
        window.updateSketch?.();
      });
    });
  }

  // ---- Wire HSL offset sliders
  setupHslOffsetControls();

  // Final sync
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
        } 
      toggleColorControls();
      updateCharPickerVisibility();
      window.updateSketch();
    });
  }
}

function toggleColorControls() {
  const useImageColors = !!window.useImageColors;

  const pickerWrap = document.getElementById("char-color-pickers");
  if (pickerWrap) pickerWrap.style.display = useImageColors ? "none" : "block";

  const colorCountGroup = document.getElementById("color-count-group");
  if (colorCountGroup) colorCountGroup.style.display = useImageColors ? "none" : "block";

  const lerpControl = document.getElementById("lerp-control");
  if (lerpControl) lerpControl.style.display = useImageColors ? "none" : "block";

  const msg = document.getElementById("color-extraction-message");
  if (msg) msg.style.display = useImageColors ? "block" : "none";

  // restore correct 1/2/3 visibility only when NOT using image colours
  if (!useImageColors) updateCharPickerVisibility();
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
  const useImageColors = !!window.useImageColors;

  const start = document.getElementById("char-start-picker");
  const mid = document.getElementById("char-middle-picker");
  const end = document.getElementById("char-end-picker");
  const lerpControl = document.getElementById("lerp-control");

  if (!start || !mid || !end) return;

  // If using image colours, hide ALL char colour UI + LERP
  if (useImageColors) {
    start.style.display = "none";
    mid.style.display = "none";
    end.style.display = "none";
    if (lerpControl) lerpControl.style.display = "none";
    return;
  }

  // Otherwise: normal behaviour
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
    // Fallback → treat as 2
    mid.style.display = "none";
    end.style.display = "block";
    if (lerpControl) lerpControl.style.display = "block";
  }
}

function setupColorCountRadios() {
  const radios = document.querySelectorAll('input[name="color-count"]');
  if (!radios.length) return;

  // Initialize state from DOM
  const checked = document.querySelector('input[name="color-count"]:checked');
  window.colorCount = checked ? Number(checked.value) : Number(window.colorCount ?? 2);

  // Apply visibility now
  updateCharPickerVisibility();

  // Listen
  radios.forEach((r) => {
    r.addEventListener("change", (e) => {
      window.colorCount = Number(e.target.value);
      updateCharPickerVisibility();
      window.updateSketch?.();
    });
  });
}

function syncCharColorPickersUI() {
  const syncOne = (key) => {
    const prop = key + "Color"; // startColor/middleColor/endColor
    const colorInput = document.getElementById(`${key}-color-input`);
    const alphaSlider = document.getElementById(`${key}-alpha`);
    const alphaValue = document.getElementById(`${key}-alpha-value`);

    if (!Array.isArray(window[prop])) return;

    const [h, s, l, a = 1] = window[prop];
    const [r, g, b] = hslToRgb(h, s, l);

    if (colorInput) colorInput.value = rgbToHex(r, g, b);

    const pct = Math.round(a * 100);
    if (alphaSlider) alphaSlider.value = pct;
    if (alphaValue) alphaValue.value = pct;
  };

  syncOne("start");
  syncOne("middle");
  syncOne("end");
}

// function updateColorControls() {
//   if (window.useImageColors) return;

//   const colorCountRadio = document.querySelector('input[name="color-count"]:checked');
//   if (!colorCountRadio) return;

//   window.colorCount = parseInt(colorCountRadio.value, 10);

//   updateCharPickerVisibility();

//   if (window.sketchReady) window.updateSketch?.();
// }

function applyDefaultsToState() {
  window.useImageColors = DEFAULTS.useImageColors;
  window.colorCount = DEFAULTS.colorCount;
  window.LERP = DEFAULTS.LERP;

  window.baseDensity = DEFAULTS.baseDensity;
  window.zeroCount = DEFAULTS.zeroCount;
  window.spaceCount = DEFAULTS.spaceCount;
  window.density =
    window.baseDensity + "0".repeat(window.zeroCount) + " ".repeat(window.spaceCount);

  window.cF = DEFAULTS.cF;
  window.mP = DEFAULTS.mP;

  window.gridColumns = DEFAULTS.gridColumns;
  window.printRes = DEFAULTS.printRes;

  window.startColor = [...DEFAULTS.startColor];
  window.middleColor = [...DEFAULTS.middleColor];
  window.endColor = [...DEFAULTS.endColor];

  window.bgColorRGB = [...DEFAULTS.bgColorRGB];
  window.bgAlpha = DEFAULTS.bgAlpha;

  window.advancedBgMode = DEFAULTS.advancedBgMode;
  window.pixelColorRGB = [...DEFAULTS.pixelColorRGB];

  window.hOffset = DEFAULTS.hOffset;
  window.sOffset = DEFAULTS.sOffset;
  window.lOffset = DEFAULTS.lOffset;
}

function resetAllSettings() {
  // 1) Reset state to defaults
  applyDefaultsToState();

  // 2) Sync the UI to match the state (no rebinding)
  syncUIFromState();

  // 3) Ensure correct visibility (depends on useImageColors + colorCount)
  if (typeof toggleColorControls === "function") toggleColorControls();
  if (typeof updateCharPickerVisibility === "function") updateCharPickerVisibility();

  // 4) Reset columns through the canonical path so grid + image-colors stay consistent
  if (typeof window.updateColumns === "function") {
    window.updateColumns(DEFAULTS.gridColumns);
  } else {
    window.gridColumns = DEFAULTS.gridColumns;
    const columnsInput = document.getElementById("columns");
    const columnsValue = document.getElementById("columns-value");
    if (columnsInput) columnsInput.value = DEFAULTS.gridColumns;
    if (columnsValue) columnsValue.value = DEFAULTS.gridColumns;
  }

  // 5) If your "use image colors" pipeline has a worker state, clear it
  window.isExtractingColors = false;
  // If you store extracted colours on window, clear them too (optional, safe)
  // window.gridCellColors = null; // only if you actually use this global

  // 6) Trigger recalculation + redraw
  if (typeof window.updateDensity === "function") {
    window.updateDensity(); // typically calls updateSketch internally
  } else if (typeof window.updateSketch === "function") {
    window.updateSketch();
  }

  console.log("All settings have been reset to default values.");
}

function syncUIFromState() {
  // -------------------------
  // helpers
  // -------------------------
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
  };

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = String(text);
  };

  const setChecked = (id, checked) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = !!checked;
  };

  const checkRadioByNameValue = (name, value) => {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    if (!radios || !radios.length) return;
    radios.forEach((r) => (r.checked = r.value === String(value)));
  };

  // -------------------------
  // Use Image Colors
  // -------------------------
  setChecked("color-extraction-toggle", !!window.useImageColors);

  // -------------------------
  // Density + append
  // -------------------------
  if (typeof window.baseDensity === "string") setValue("density-input", window.baseDensity);

  if (typeof window.zeroCount === "number") {
    setValue("zero-slider", window.zeroCount);
    setText("zero-value", window.zeroCount);
  }

  if (typeof window.spaceCount === "number") {
    setValue("space-slider", window.spaceCount);
    setText("space-value", window.spaceCount);
  }

  // -------------------------
  // Contrast / midpoint
  // -------------------------
  if (typeof window.cF === "number") {
    const cfPct = Math.round(clamp(window.cF, 0, 1.5) * 100); // your UI is 0–150
    setValue("cf", cfPct);
    setValue("cf-value", cfPct);
  }

  if (typeof window.mP === "number") {
    const mp = Math.round(clamp(window.mP, 0, 255));
    setValue("mp", mp);
    setValue("mp-value", mp);
  }

  // -------------------------
  // Columns / print res
  // -------------------------
  if (typeof window.gridColumns === "number") {
    const cols = Math.round(clamp(window.gridColumns, 10, 300));
    setValue("columns", cols);
    setValue("columns-value", cols);
  }

  // If you have a PNG width input (not printRes) this stays separate.
  // printRes is used internally; leave png-width alone unless you want to bind it.

  // -------------------------
  // Color count radios
  // -------------------------
  if (typeof window.colorCount === "number") {
    checkRadioByNameValue("color-count", window.colorCount);
  }

  // -------------------------
  // LERP radios
  // -------------------------
  if (typeof window.LERP === "boolean") {
    checkRadioByNameValue("lerp", window.LERP ? "true" : "false");
  }

  // -------------------------
  // Character color pickers (start/middle/end)
  // Uses your existing sync helper if present
  // -------------------------
  if (typeof syncCharColorPickersUI === "function") {
    syncCharColorPickersUI();
  } else {
    // Fallback: do best effort directly from HSLA
    const syncOne = (key) => {
      const prop = key + "Color";
      if (!Array.isArray(window[prop])) return;

      const colorInput = document.getElementById(`${key}-color-input`);
      const alphaSlider = document.getElementById(`${key}-alpha`);
      const alphaValue = document.getElementById(`${key}-alpha-value`);

      const [h, s, l, a = 1] = window[prop];
      const [r, g, b] = hslToRgb(h, s, l);

      if (colorInput) colorInput.value = rgbToHex(r, g, b);

      const aPct = Math.round(clamp(a, 0, 1) * 100);
      if (alphaSlider) alphaSlider.value = aPct;
      if (alphaValue) alphaValue.value = aPct;
    };

    syncOne("start");
    syncOne("middle");
    syncOne("end");
  }

  // -------------------------
  // Background: one picker + alpha + mode radios + offsets
  // -------------------------
  if (Array.isArray(window.bgColorRGB)) {
    const [r, g, b] = window.bgColorRGB;
    setValue("bg-color-input", rgbToHex(r, g, b));
  }

  if (typeof window.bgAlpha === "number") {
    const aPct = Math.round(clamp(window.bgAlpha, 0, 1) * 100);
    setValue("bg-alpha", aPct);
    setValue("bg-alpha-value", aPct);
  }

  if (typeof window.advancedBgMode === "string") {
    checkRadioByNameValue("advanced-bg-mode", window.advancedBgMode);
  }

  if (typeof window.hOffset === "number") {
    setValue("h-offset", window.hOffset);
    setValue("h-offset-value", window.hOffset);
  }
  if (typeof window.sOffset === "number") {
    setValue("s-offset", window.sOffset);
    setValue("s-offset-value", window.sOffset);
  }
  if (typeof window.lOffset === "number") {
    setValue("l-offset", window.lOffset);
    setValue("l-offset-value", window.lOffset);
  }

  // -------------------------
  // Final: visibility based on state
  // (do NOT call updateSketch here)
  // -------------------------
  if (typeof toggleColorControls === "function") toggleColorControls();
  if (typeof updateCharPickerVisibility === "function") updateCharPickerVisibility();

  // Background controls visibility is handled inside setupBackgroundControls()
  // via radio change listeners; but on reset/load we should force a UI sync:
  const hslPanel = document.getElementById("advanced-bg-hsl-offset-controls");
  if (hslPanel) hslPanel.style.display = window.advancedBgMode === "hslOffset" ? "block" : "none";

  // Rule you wanted: single picker shown for off + colorPicker, hidden for hslOffset
  const bgColorInput = document.getElementById("bg-color-input");
  const bgColorLabel = document.querySelector('label[for="bg-color-input"]');
  const showBgPicker = window.advancedBgMode !== "hslOffset";
  if (bgColorInput) bgColorInput.style.display = showBgPicker ? "inline-block" : "none";
  if (bgColorLabel) bgColorLabel.style.display = showBgPicker ? "block" : "none";
}


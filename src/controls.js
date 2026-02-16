
import { hexToRgb, rgbToHex, hslToRgb, rgbToHsl } from "./colorUtils.js";
import { addFrame, initFrames, setPropagateEnabled, addMirrorFrames, removeMirrorFrames, isMirrored } from "./frameManager.js";

export const DEFAULTS = {
  // image/colors
  useImageColors: true,
  colorCount: 2,
  LERP: true,

  // image glyph adjustments
  imageGlyphHueOffset: 0,     // degrees -180..180
  imageGlyphSatOffset: 0,     // -100..100
  imageGlyphLightOffset: 0,   // -100..100
  imageGlyphAlpha: 1,          // 0..1

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

    // shadow
  shadowMode: "off",          // "off" | "single" | "double"
  shadowColorMode: "offset",  // "manual" | "offset"

  // geometry (cell fractions, not pixels)
  shadowDx: 0.15,
  shadowDy: 0.10,
  shadowDx2: -0.15,
  shadowDy2: -0.10,
  shadowSymmetric: true,      // for double mode

  // alpha multiplier (applies to shadow layers, 0..1)
  shadowAlphaMult: 0.6,

  // offset-from-main colour controls (HSL offsets)
  shadowHueOffset: 20,        // degrees
  shadowSatOffset: 10,        // -100..100
  shadowLightOffset: -10,     // -100..100

  // manual colours (RGB + A, so they’re cheap to apply)
  shadow1RGB: [255, 0, 80],
  shadow1A: 0.6,
  shadow2RGB: [0, 200, 255],
  shadow2A: 0.6
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
  setupExportControls();

  setupColorExtractionToggle();

  setupCharColorPickers();
  setupColorCountRadios();
  setupShadowControls();
  setupImageGlyphControls();
  setupFrameControls();

  window.syncUIFromState = syncUIFromState;

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
    if (typeof window.updateDensity === "function") window.updateDensity();
    else window.updateSketch?.();
  };

  if (window.sketchReady) {
    runInitialRender();
  } else {
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
      const defaultImage = import.meta.env.VITE_DEFAULT_IMAGE || "/img/sun.png";
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

function setupExportControls() {
  // Format radios — show/hide WEBP quality slider
  const formatRadios = document.querySelectorAll('input[name="export-format"]');
  const webpQualityGroup = document.getElementById('webp-quality-group');

  window.exportFormat = 'png';
  window.webpQuality = 0.8;

  formatRadios.forEach((r) => {
    r.addEventListener('change', (e) => {
      window.exportFormat = e.target.value;
      if (webpQualityGroup) {
        webpQualityGroup.style.display = e.target.value === 'webp' ? 'block' : 'none';
      }
    });
  });

  // WEBP quality slider + number sync
  const qualitySlider = document.getElementById('webp-quality');
  const qualityNumber = document.getElementById('webp-quality-value');
  if (qualitySlider && qualityNumber) {
    const updateQuality = (val) => {
      const clamped = Math.max(1, Math.min(100, parseInt(val, 10) || 80));
      window.webpQuality = clamped / 100;
      qualitySlider.value = clamped;
      qualityNumber.value = clamped;
    };
    qualitySlider.addEventListener('input', (e) => updateQuality(e.target.value));
    qualityNumber.addEventListener('change', (e) => updateQuality(e.target.value));
  }

  // Download single image button
  const downloadBtn = document.getElementById('download-image');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof window.downloadImage === 'function') {
        window.downloadImage();
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

function setupImageGlyphControls() {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const syncSliderPair = (sliderId, numberId, onChange, opts = {}) => {
    const slider = document.getElementById(sliderId);
    const number = document.getElementById(numberId);
    if (!slider || !number) return;

    const min = slider.min !== "" ? Number(slider.min) : (opts.min ?? -Infinity);
    const max = slider.max !== "" ? Number(slider.max) : (opts.max ?? Infinity);

    const apply = (raw) => {
      let v = Number(raw);
      if (Number.isNaN(v)) v = 0;
      v = clamp(v, min, max);

      slider.value = v;
      number.value = v;
      onChange(v);
      window.updateSketch?.();
    };

    slider.addEventListener("input", (e) => apply(e.target.value));
    number.addEventListener("change", (e) => apply(e.target.value));
  };

  // defaults
  if (typeof window.imageGlyphHueOffset !== "number") window.imageGlyphHueOffset = 0;
  if (typeof window.imageGlyphSatOffset !== "number") window.imageGlyphSatOffset = 0;
  if (typeof window.imageGlyphLightOffset !== "number") window.imageGlyphLightOffset = 0;
  if (typeof window.imageGlyphAlpha !== "number") window.imageGlyphAlpha = 1;

  // alpha 0..1
  syncSliderPair("image-glyph-alpha", "image-glyph-alpha-value", (v) => {
    window.imageGlyphAlpha = clamp(v, 0, 1);
  }, { min: 0, max: 1 });

  // H/S/L
  syncSliderPair("image-glyph-h", "image-glyph-h-value", (v) => {
    window.imageGlyphHueOffset = v;
  }, { min: -180, max: 180 });

  syncSliderPair("image-glyph-s", "image-glyph-s-value", (v) => {
    window.imageGlyphSatOffset = v;
  }, { min: -100, max: 100 });

  syncSliderPair("image-glyph-l", "image-glyph-l-value", (v) => {
    window.imageGlyphLightOffset = v;
  }, { min: -100, max: 100 });
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

  const imageGlyphControls = document.getElementById("image-glyph-controls");
  if (imageGlyphControls) imageGlyphControls.style.display = useImageColors ? "block" : "none";

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

function applyDefaultsToState() {
  // ---- Core toggles
  window.useImageColors = !!DEFAULTS.useImageColors;
  window.colorCount = Number(DEFAULTS.colorCount ?? 2);
  window.LERP = !!DEFAULTS.LERP;

  // ---- Image glyph adjustments
  window.imageGlyphHueOffset = Number(DEFAULTS.imageGlyphHueOffset ?? 0);
  window.imageGlyphSatOffset = Number(DEFAULTS.imageGlyphSatOffset ?? 0);
  window.imageGlyphLightOffset = Number(DEFAULTS.imageGlyphLightOffset ?? 0);
  window.imageGlyphAlpha = Number(DEFAULTS.imageGlyphAlpha ?? 1);

  // ---- Density
  window.baseDensity = String(DEFAULTS.baseDensity ?? "");
  window.zeroCount = Number(DEFAULTS.zeroCount ?? 0);
  window.spaceCount = Number(DEFAULTS.spaceCount ?? 0);
  window.density =
    window.baseDensity +
    "0".repeat(Math.max(0, window.zeroCount)) +
    " ".repeat(Math.max(0, window.spaceCount));

  // ---- Contrast
  window.cF = Number(DEFAULTS.cF ?? 0.55);
  window.mP = Number(DEFAULTS.mP ?? 141);

  // ---- Grid / render
  window.gridColumns = Number(DEFAULTS.gridColumns ?? 150);
  window.printRes = Number(DEFAULTS.printRes ?? 900);

  // ---- Char colours (HSLA)
  window.startColor = Array.isArray(DEFAULTS.startColor) ? [...DEFAULTS.startColor] : [30, 100, 100, 1];
  window.middleColor = Array.isArray(DEFAULTS.middleColor) ? [...DEFAULTS.middleColor] : [45, 100, 50, 1];
  window.endColor = Array.isArray(DEFAULTS.endColor) ? [...DEFAULTS.endColor] : [0, 0, 33, 1];

  // ---- Flat background
  window.bgColorRGB = Array.isArray(DEFAULTS.bgColorRGB) ? [...DEFAULTS.bgColorRGB] : [0, 0, 0];
  window.bgAlpha = Number(DEFAULTS.bgAlpha ?? 1);

  // ---- Pixel background mode
  window.advancedBgMode = String(DEFAULTS.advancedBgMode ?? "off");
  window.pixelColorRGB = Array.isArray(DEFAULTS.pixelColorRGB) ? [...DEFAULTS.pixelColorRGB] : [120, 170, 255];

  // ---- Offset pixels
  window.hOffset = Number(DEFAULTS.hOffset ?? 0);
  window.sOffset = Number(DEFAULTS.sOffset ?? 0);
  window.lOffset = Number(DEFAULTS.lOffset ?? 0);

  // ---- Shadows
  window.shadowMode = String(DEFAULTS.shadowMode ?? "off");                 // off|single|double
  window.shadowColorMode = String(DEFAULTS.shadowColorMode ?? "offset");    // offset|manual

  window.shadowDx = Number(DEFAULTS.shadowDx ?? 0.15);
  window.shadowDy = Number(DEFAULTS.shadowDy ?? 0.10);
  window.shadowDx2 = Number(DEFAULTS.shadowDx2 ?? -0.15);
  window.shadowDy2 = Number(DEFAULTS.shadowDy2 ?? -0.10);
  window.shadowSymmetric = !!DEFAULTS.shadowSymmetric;

  window.shadowAlphaMult = Number(DEFAULTS.shadowAlphaMult ?? 0.6);

  // Shadow 1 colour offsets
  window.shadowHueOffset = Number(DEFAULTS.shadowHueOffset ?? 20);
  window.shadowSatOffset = Number(DEFAULTS.shadowSatOffset ?? 10);
  window.shadowLightOffset = Number(DEFAULTS.shadowLightOffset ?? -10);

  // Shadow 2 colour offsets (NEW; used when double + not symmetric in offset mode)
  window.shadowHueOffset2 = Number(DEFAULTS.shadowHueOffset2 ?? -20);
  window.shadowSatOffset2 = Number(DEFAULTS.shadowSatOffset2 ?? 10);
  window.shadowLightOffset2 = Number(DEFAULTS.shadowLightOffset2 ?? -10);

  window.shadow1RGB = Array.isArray(DEFAULTS.shadow1RGB) ? [...DEFAULTS.shadow1RGB] : [255, 0, 80];
  window.shadow1A = Number(DEFAULTS.shadow1A ?? 0.6);
  window.shadow2RGB = Array.isArray(DEFAULTS.shadow2RGB) ? [...DEFAULTS.shadow2RGB] : [0, 200, 255];
  window.shadow2A = Number(DEFAULTS.shadow2A ?? 0.6);
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

function setupShadowControls() {
  const modeRadios = document.querySelectorAll('input[name="shadow-mode"]');
  const colorModeRadios = document.querySelectorAll('input[name="shadow-color-mode"]');

  const shadowControls = document.getElementById("shadow-controls");
  const offsetControls = document.getElementById("shadow-offset-controls");
  const manualControls = document.getElementById("shadow-manual-controls");
  const shadow2Row = document.getElementById("shadow2-manual-row");

  const symCheckbox = document.getElementById("shadow-symmetric");
  const symCheckboxGroup = document.getElementById("shadow-symmetric-group");
  const offset2Panel = document.getElementById("shadow-offset-2-panel");

  // NEW: shadow2 colour-offset panel (inside #shadow-offset-controls)
  const offset2ColorPanel = document.getElementById("shadow-offset-2-color-panel");

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const syncSliderPair = (sliderId, numberId, onChange, opts = {}) => {
    const slider = document.getElementById(sliderId);
    const number = document.getElementById(numberId);
    if (!slider || !number) return;

    const min = slider.min !== "" ? Number(slider.min) : (opts.min ?? -Infinity);
    const max = slider.max !== "" ? Number(slider.max) : (opts.max ?? Infinity);

    const apply = (raw) => {
      let v = Number(raw);
      if (Number.isNaN(v)) v = 0;
      v = clamp(v, min, max);

      slider.value = v;
      number.value = v;
      onChange(v);
      window.updateSketch?.();
    };

    slider.addEventListener("input", (e) => apply(e.target.value));
    number.addEventListener("change", (e) => apply(e.target.value));
  };

  // ---- defaults (state)
  if (!window.shadowMode) window.shadowMode = "off";
  if (!window.shadowColorMode) window.shadowColorMode = "offset";
  if (typeof window.shadowDx !== "number") window.shadowDx = 0.15;
  if (typeof window.shadowDy !== "number") window.shadowDy = 0.10;
  if (typeof window.shadowDx2 !== "number") window.shadowDx2 = -window.shadowDx;
  if (typeof window.shadowDy2 !== "number") window.shadowDy2 = -window.shadowDy;
  if (typeof window.shadowSymmetric !== "boolean") window.shadowSymmetric = true;

  if (typeof window.shadowHueOffset !== "number") window.shadowHueOffset = 20;
  if (typeof window.shadowSatOffset !== "number") window.shadowSatOffset = 10;
  if (typeof window.shadowLightOffset !== "number") window.shadowLightOffset = -10;

  // NEW defaults for layer2 HSL offsets
  if (typeof window.shadowHueOffset2 !== "number") window.shadowHueOffset2 = -20;
  if (typeof window.shadowSatOffset2 !== "number") window.shadowSatOffset2 = 10;
  if (typeof window.shadowLightOffset2 !== "number") window.shadowLightOffset2 = -10;

  const refreshShadowVisibility = () => {
    const mode = window.shadowMode || "off";             // off|single|double
    const cMode = window.shadowColorMode || "offset";    // offset|manual
    const isOff = mode === "off";
    const isDouble = mode === "double";
    const isSym = window.shadowSymmetric !== false;

    if (shadowControls) shadowControls.style.display = isOff ? "none" : "block";

    if (offsetControls) offsetControls.style.display = !isOff && cMode === "offset" ? "block" : "none";
    if (manualControls) manualControls.style.display = !isOff && cMode === "manual" ? "block" : "none";

    // manual shadow2 only in double+manual
    if (shadow2Row) shadow2Row.style.display = isDouble && cMode === "manual" ? "block" : "none";

    // symmetry checkbox only matters in double mode
    if (symCheckboxGroup) symCheckboxGroup.style.display = isDouble ? "block" : "none";

    // second geometry offsets only when double AND NOT symmetric
    const showSecond = isDouble && !isSym;

    if (offset2Panel) offset2Panel.style.display = (isDouble && !isSym) ? "block" : "none";

    // NEW: second colour-offset panel only when offset mode AND (double & not symmetric)
    if (offset2ColorPanel) {
      offset2ColorPanel.style.display = (!isOff && cMode === "offset" && showSecond) ? "block" : "none";
    }
    const shadow2Group = document.getElementById("shadow2-group");
    if (shadow2Group) shadow2Group.style.display = (mode === "double") ? "block" : "none";
  };

  // ---- mode radios
  modeRadios.forEach((r) => {
    r.addEventListener("change", (e) => {
      window.shadowMode = e.target.value; // off|single|double
      refreshShadowVisibility();
      window.updateSketch?.();
    });
  });

  // ---- color mode radios
  colorModeRadios.forEach((r) => {
    r.addEventListener("change", (e) => {
      window.shadowColorMode = e.target.value; // offset|manual
      refreshShadowVisibility();
      window.updateSketch?.();
    });
  });

  // ---- main offsets
  syncSliderPair("shadow-dx", "shadow-dx-value", (v) => {
    window.shadowDx = v;

    // if symmetric, mirror into dx2
    if (window.shadowSymmetric !== false) {
      window.shadowDx2 = -window.shadowDx;
      const dx2 = document.getElementById("shadow-dx2");
      const dx2v = document.getElementById("shadow-dx2-value");
      if (dx2) dx2.value = window.shadowDx2;
      if (dx2v) dx2v.value = window.shadowDx2;
    }
  }, { min: -1, max: 1 });

  syncSliderPair("shadow-dy", "shadow-dy-value", (v) => {
    window.shadowDy = v;

    if (window.shadowSymmetric !== false) {
      window.shadowDy2 = -window.shadowDy;
      const dy2 = document.getElementById("shadow-dy2");
      const dy2v = document.getElementById("shadow-dy2-value");
      if (dy2) dy2.value = window.shadowDy2;
      if (dy2v) dy2v.value = window.shadowDy2;
    }
  }, { min: -1, max: 1 });

  // ---- second geometry offsets
  syncSliderPair("shadow-dx2", "shadow-dx2-value", (v) => { window.shadowDx2 = v; }, { min: -1, max: 1 });
  syncSliderPair("shadow-dy2", "shadow-dy2-value", (v) => { window.shadowDy2 = v; }, { min: -1, max: 1 });

  // ---- alpha mult
  syncSliderPair("shadow-alpha-mult", "shadow-alpha-mult-value", (v) => {
    window.shadowAlphaMult = clamp(v, 0, 1);
  }, { min: 0, max: 1 });

  // ---- symmetric checkbox
  if (symCheckbox) {
    symCheckbox.addEventListener("change", (e) => {
      window.shadowSymmetric = !!e.target.checked;

      // when turning symmetry ON, immediately mirror offsets
      if (window.shadowSymmetric) {
        window.shadowDx2 = -window.shadowDx;
        window.shadowDy2 = -window.shadowDy;
        const dx2 = document.getElementById("shadow-dx2");
        const dx2v = document.getElementById("shadow-dx2-value");
        const dy2 = document.getElementById("shadow-dy2");
        const dy2v = document.getElementById("shadow-dy2-value");
        if (dx2) dx2.value = window.shadowDx2;
        if (dx2v) dx2v.value = window.shadowDx2;
        if (dy2) dy2.value = window.shadowDy2;
        if (dy2v) dy2v.value = window.shadowDy2;
      }

      refreshShadowVisibility();
      window.updateSketch?.();
    });
  }

  // ---- offset H/S/L (Shadow 1)
  syncSliderPair("shadow-h", "shadow-h-value", (v) => { window.shadowHueOffset = v; }, { min: -180, max: 180 });
  syncSliderPair("shadow-s", "shadow-s-value", (v) => { window.shadowSatOffset = v; }, { min: -100, max: 100 });
  syncSliderPair("shadow-l", "shadow-l-value", (v) => { window.shadowLightOffset = v; }, { min: -100, max: 100 });

  // ---- NEW: offset H/S/L (Shadow 2)
  syncSliderPair("shadow-h2", "shadow-h2-value", (v) => { window.shadowHueOffset2 = v; }, { min: -180, max: 180 });
  syncSliderPair("shadow-s2", "shadow-s2-value", (v) => { window.shadowSatOffset2 = v; }, { min: -100, max: 100 });
  syncSliderPair("shadow-l2", "shadow-l2-value", (v) => { window.shadowLightOffset2 = v; }, { min: -100, max: 100 });

  // ---- manual controls
  const bindManual = (idx) => {
    const colorEl = document.getElementById(`shadow${idx}-color`);
    const aSlider = document.getElementById(`shadow${idx}-alpha`);
    const aValue = document.getElementById(`shadow${idx}-alpha-value`);

    if (colorEl) {
      colorEl.addEventListener("input", (e) => {
        const rgb = hexToRgb(e.target.value);
        if (!rgb) return;
        window[`shadow${idx}RGB`] = [rgb.r, rgb.g, rgb.b];
        window.updateSketch?.();
      });
    }

    const applyA = (pct) => {
      const v = clamp(Number(pct), 0, 100);
      if (aSlider) aSlider.value = v;
      if (aValue) aValue.value = v;
      window[`shadow${idx}A`] = v / 100;
      window.updateSketch?.();
    };

    if (aSlider) aSlider.addEventListener("input", (e) => applyA(e.target.value));
    if (aValue) aValue.addEventListener("change", (e) => applyA(e.target.value));
  };

  bindManual(1);
  bindManual(2);

  refreshShadowVisibility();
}

let frameControlsBound = false;
function setupFrameControls() {
  if (frameControlsBound) return;
  frameControlsBound = true;

  const addFrameBtn = document.getElementById('add-frame-btn');
  if (addFrameBtn) {
    addFrameBtn.addEventListener('click', () => addFrame());
  }

  const downloadAllBtn = document.getElementById('download-all-frames');
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof window.downloadAllFrames === 'function') {
        window.downloadAllFrames();
      }
    });
  }

  // GIF delay slider sync
  const gifDelaySlider = document.getElementById('gif-delay');
  const gifDelayNumber = document.getElementById('gif-delay-value');
  if (gifDelaySlider && gifDelayNumber) {
    gifDelaySlider.addEventListener('input', (e) => { gifDelayNumber.value = e.target.value; });
    gifDelayNumber.addEventListener('change', (e) => { gifDelaySlider.value = e.target.value; });
  }

  // Download GIF button
  const downloadGifBtn = document.getElementById('download-gif');
  if (downloadGifBtn) {
    downloadGifBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof window.downloadGIF === 'function') {
        window.downloadGIF();
      }
    });
  }

  // Propagate checkbox
  const propagateToggle = document.getElementById('propagate-toggle');
  if (propagateToggle) {
    propagateToggle.addEventListener('change', (e) => {
      setPropagateEnabled(e.target.checked);
    });
  }

  // Mirror frames button (toggle: add / remove)
  const mirrorBtn = document.getElementById('mirror-frames-btn');
  if (mirrorBtn) {
    mirrorBtn.addEventListener('click', () => {
      if (isMirrored()) {
        removeMirrorFrames();
        mirrorBtn.textContent = 'Mirror Loop';
        mirrorBtn.style.background = '';
      } else {
        const result = addMirrorFrames();
        if (result === 'need_3_frames') {
          mirrorBtn.textContent = 'Need 3+ frames';
          mirrorBtn.style.background = '#999';
          setTimeout(() => {
            mirrorBtn.textContent = 'Mirror Loop';
            mirrorBtn.style.background = '';
          }, 1500);
        } else if (isMirrored()) {
          mirrorBtn.textContent = 'Remove Mirrors';
          mirrorBtn.style.background = '#f44336';
        }
      }
    });
  }
}

function resetAllSettings() {
  // 1) Reset state
  applyDefaultsToState();

  // 2) Clear any in-flight extraction state (safe)
  window.isExtractingColors = false;

  // 3) Sync UI (no rebinding)
  syncUIFromState();

  // 4) Reset columns through canonical path
  if (typeof window.updateColumns === "function") {
    window.updateColumns(DEFAULTS.gridColumns);
  } else {
    window.gridColumns = DEFAULTS.gridColumns;
    const columnsInput = document.getElementById("columns");
    const columnsValue = document.getElementById("columns-value");
    if (columnsInput) columnsInput.value = DEFAULTS.gridColumns;
    if (columnsValue) columnsValue.value = DEFAULTS.gridColumns;
  }

  // 5) Trigger redraw via your normal pipeline
  if (typeof window.updateDensity === "function") {
    window.updateDensity(); // typically calls updateSketch
  } else {
    window.updateSketch?.();
  }

  // 6) Reset frames to a single frame with default settings
  initFrames();

  console.log("All settings have been reset to default values.");
}

export function syncUIFromState() {
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

  const syncPair = (sliderId, numberId, value) => {
    const s = document.getElementById(sliderId);
    const n = document.getElementById(numberId);
    if (s) s.value = value;
    if (n) n.value = value;
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
    const cfPct = Math.round(clamp(window.cF, 0, 1.5) * 100); // UI 0–150
    setValue("cf", cfPct);
    setValue("cf-value", cfPct);
  }

  if (typeof window.mP === "number") {
    const mp = Math.round(clamp(window.mP, 0, 255));
    setValue("mp", mp);
    setValue("mp-value", mp);
  }

  // -------------------------
  // Columns
  // -------------------------
  if (typeof window.gridColumns === "number") {
    const cols = Math.round(clamp(window.gridColumns, 10, 300));
    setValue("columns", cols);
    setValue("columns-value", cols);
  }

  // -------------------------
  // IMAGE GLYPH (useImageColors=true): alpha + HSL offsets
  // -------------------------
  const imageGlyphControls = document.getElementById("image-glyph-controls");
  if (imageGlyphControls) imageGlyphControls.style.display = !!window.useImageColors ? "block" : "none";

  if (typeof window.imageGlyphAlpha === "number") {
    const v = clamp(window.imageGlyphAlpha, 0, 1);
    syncPair("image-glyph-alpha", "image-glyph-alpha-value", v);
  }

  if (typeof window.imageGlyphHueOffset === "number") {
    syncPair("image-glyph-h", "image-glyph-h-value", window.imageGlyphHueOffset);
  }
  if (typeof window.imageGlyphSatOffset === "number") {
    syncPair("image-glyph-s", "image-glyph-s-value", window.imageGlyphSatOffset);
  }
  if (typeof window.imageGlyphLightOffset === "number") {
    syncPair("image-glyph-l", "image-glyph-l-value", window.imageGlyphLightOffset);
  }

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
  // -------------------------
  if (typeof syncCharColorPickersUI === "function") {
    syncCharColorPickersUI();
  }

  // -------------------------
  // Background: picker + alpha + mode + offsets
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

  // Background visibility rules
  const hslPanel = document.getElementById("advanced-bg-hsl-offset-controls");
  if (hslPanel) hslPanel.style.display = window.advancedBgMode === "hslOffset" ? "block" : "none";

  const bgColorInput = document.getElementById("bg-color-input");
  const bgColorLabel = document.querySelector('label[for="bg-color-input"]');
  const showBgPicker = window.advancedBgMode !== "hslOffset";
  if (bgColorInput) bgColorInput.style.display = showBgPicker ? "inline-block" : "none";
  if (bgColorLabel) bgColorLabel.style.display = showBgPicker ? "block" : "none";

  // -------------------------
  // SHADOWS: radios + values
  // -------------------------
  if (typeof window.shadowMode === "string") {
    checkRadioByNameValue("shadow-mode", window.shadowMode);
  }
  if (typeof window.shadowColorMode === "string") {
    checkRadioByNameValue("shadow-color-mode", window.shadowColorMode);
  }

  if (typeof window.shadowDx === "number") syncPair("shadow-dx", "shadow-dx-value", window.shadowDx);
  if (typeof window.shadowDy === "number") syncPair("shadow-dy", "shadow-dy-value", window.shadowDy);

  if (typeof window.shadowAlphaMult === "number") {
    syncPair("shadow-alpha-mult", "shadow-alpha-mult-value", clamp(window.shadowAlphaMult, 0, 1));
  }

  // Symmetric checkbox (NOT radios)
  setChecked("shadow-symmetric", window.shadowSymmetric !== false);

  if (typeof window.shadowHueOffset === "number") syncPair("shadow-h", "shadow-h-value", window.shadowHueOffset);
  if (typeof window.shadowSatOffset === "number") syncPair("shadow-s", "shadow-s-value", window.shadowSatOffset);
  if (typeof window.shadowLightOffset === "number") syncPair("shadow-l", "shadow-l-value", window.shadowLightOffset);
    // Shadow 2 colour offsets (NEW)
  if (typeof window.shadowHueOffset2 === "number") syncPair("shadow-h2", "shadow-h2-value", window.shadowHueOffset2);
  if (typeof window.shadowSatOffset2 === "number") syncPair("shadow-s2", "shadow-s2-value", window.shadowSatOffset2);
  if (typeof window.shadowLightOffset2 === "number") syncPair("shadow-l2", "shadow-l2-value", window.shadowLightOffset2);


  // Manual shadow colours
  if (Array.isArray(window.shadow1RGB)) {
    const [r, g, b] = window.shadow1RGB;
    setValue("shadow1-color", rgbToHex(r, g, b));
  }
  if (typeof window.shadow1A === "number") {
    const aPct = Math.round(clamp(window.shadow1A, 0, 1) * 100);
    setValue("shadow1-alpha", aPct);
    setValue("shadow1-alpha-value", aPct);
  }

  if (Array.isArray(window.shadow2RGB)) {
    const [r, g, b] = window.shadow2RGB;
    setValue("shadow2-color", rgbToHex(r, g, b));
  }
  if (typeof window.shadow2A === "number") {
    const aPct = Math.round(clamp(window.shadow2A, 0, 1) * 100);
    setValue("shadow2-alpha", aPct);
    setValue("shadow2-alpha-value", aPct);
  }

  // Shadow offset #2 (independent)
  if (typeof window.shadowDx2 === "number") syncPair("shadow-dx2", "shadow-dx2-value", window.shadowDx2);
  if (typeof window.shadowDy2 === "number") syncPair("shadow-dy2", "shadow-dy2-value", window.shadowDy2);

  // -------------------------
  // SHADOWS: show/hide panels
  // -------------------------
  const mode = String(window.shadowMode ?? "off");          // off|single|double
  const cMode = String(window.shadowColorMode ?? "offset"); // offset|manual
  const isOff = mode === "off";
  const isDouble = mode === "double";
  const isSym = window.shadowSymmetric !== false;
  const showSecond = isDouble && !isSym;

  const shadowControls = document.getElementById("shadow-controls");
  const offsetControls = document.getElementById("shadow-offset-controls");
  const manualControls = document.getElementById("shadow-manual-controls");
  const shadow2Row = document.getElementById("shadow2-manual-row");
  const symGroup = document.getElementById("shadow-symmetric-group");
  const offset2Panel = document.getElementById("shadow-offset-2-panel");
  const offset2ColorPanel = document.getElementById("shadow-offset-2-color-panel"); // NEW

  if (shadowControls) shadowControls.style.display = isOff ? "none" : "block";
  if (offsetControls) offsetControls.style.display = !isOff && cMode === "offset" ? "block" : "none";
  if (manualControls) manualControls.style.display = !isOff && cMode === "manual" ? "block" : "none";

  if (symGroup) symGroup.style.display = isDouble ? "block" : "none";
  if (shadow2Row) shadow2Row.style.display = isDouble && cMode === "manual" ? "block" : "none";

  // if (offset2Panel) offset2Panel.style.display = showSecond ? "block" : "none";
  if (offset2Panel) offset2Panel.style.display = (isDouble && !isSym) ? "block" : "none";
  if (offset2ColorPanel) offset2ColorPanel.style.display = (!isOff && cMode === "offset" && showSecond) ? "block" : "none";

  // -------------------------
  // Final: visibility based on state
  // -------------------------
  if (typeof toggleColorControls === "function") toggleColorControls();
  if (typeof updateCharPickerVisibility === "function") updateCharPickerVisibility();
}




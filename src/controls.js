export function initializeControls(p5Instance) {

  window.customBgColor = window.customBgColor || [0, 0, 0];

  // File upload
  const imageUpload = document.getElementById("image-upload");
  if (imageUpload) {
    imageUpload.addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (file) {
        loadNewImage(file, p5Instance);
      }
    });
  }
  const resetButton = document.getElementById("reset-image");
  if (resetButton) {
    resetButton.addEventListener("click", function () {
      const defaultImage = import.meta.env.VITE_DEFAULT_IMAGE || '/img/sleep.png';
      loadNewImage(defaultImage, p5Instance, true);
    });
  }

  const resetSettingsButton = document.getElementById("reset-settings");
  if (resetSettingsButton) {
    resetSettingsButton.addEventListener("click", function () {
      resetAllSettings();
    });
  }

  // MP slider and input
  const mpSlider = document.getElementById("mp");
  const mpValue = document.getElementById("mp-value");
  if (mpSlider && mpValue) {
    mpSlider.addEventListener("input", function (event) {
      window.mP = parseInt(event.target.value);
      mpValue.value = window.mP;
      window.updateSketch();
    });

    mpValue.addEventListener("change", function (event) {
      window.mP = parseInt(event.target.value);
      mpSlider.value = window.mP;
      window.updateSketch();
    });
  }

  // CF slider and input
  const cfSlider = document.getElementById("cf");
  const cfValue = document.getElementById("cf-value");
  if (cfSlider && cfValue) {
    cfSlider.addEventListener("input", function (event) {
      window.cF = parseFloat(event.target.value) / 100;
      cfValue.value = (window.cF * 100).toFixed(0);
      window.updateSketch();
    });

    cfValue.addEventListener("change", function (event) {
      window.cF = parseInt(event.target.value) / 100;
      cfSlider.value = (window.cF * 100).toFixed(0);
      window.updateSketch();
    });
  }

  // Density characters
  const densityInput = document.getElementById("density-input");
  if (densityInput) {
    densityInput.addEventListener("change", function (event) {
      window.updateDensity();
    });
  }

  // Zero slider
  const zeroSlider = document.getElementById("zero-slider");
  const zeroValue = document.getElementById("zero-value");
  if (zeroSlider && zeroValue) {
    zeroSlider.addEventListener("input", function () {
      zeroValue.textContent = this.value;
      window.updateDensity();
    });
  }

  // Invert radio buttons
  const invertRadios = document.querySelectorAll('input[name="invert"]');
  if (invertRadios.length > 0) {
    invertRadios.forEach((elem) => {
      elem.addEventListener("change", function (event) {
        window.invert = event.target.value === "true";
        window.updateSketch();
      });
    });
  }

  // Number of columns
  const columnsInput = document.getElementById("columns");
  const columnsValue = document.getElementById("columns-value");
  if (columnsInput && columnsValue) {
    const updateColumns = (value) => {
      value = Math.min(300, Math.max(10, value));
      columnsInput.value = value;
      columnsValue.value = value;
      window.gridColumns = value;
      window.updateSketch();
    };

    columnsInput.addEventListener("input", function (event) {
      updateColumns(parseInt(event.target.value));
    });

    columnsValue.addEventListener("change", function (event) {
      updateColumns(parseInt(event.target.value));
    });

    updateColumns(150);
  }

  const downloadPngButton = document.getElementById("download-png");
  if (downloadPngButton) {
    downloadPngButton.removeEventListener("click", window.downloadPNG);

    downloadPngButton.addEventListener("click", function (event) {
      event.preventDefault();
      if (typeof window.downloadPNG === "function") {
        window.downloadPNG();
      } else {
        console.error("downloadPNG function not found");
      }
    });
  }

  const colorCountRadios = document.querySelectorAll(
    'input[name="color-count"]'
  );
  if (colorCountRadios.length > 0) {
    colorCountRadios.forEach((elem) => {
      elem.addEventListener("change", updateColorControls);
    });
  }

  const lerpRadios = document.querySelectorAll('input[name="lerp"]');
  if (lerpRadios.length > 0) {
    lerpRadios.forEach((elem) => {
      elem.addEventListener("change", function (event) {
        window.LERP = event.target.value === "true";
        window.updateSketch();
      });
    });
  }

  // SVG download button
  const downloadSvgButton = document.getElementById("download-svg");
  if (downloadSvgButton) {
    downloadSvgButton.addEventListener("click", window.createAndDownloadSVG);
  }

  const colorControls = document.querySelectorAll(".color-slider-container");
  if (colorControls.length > 0) {
    colorControls.forEach((container) => {
      const slider = container.querySelector(".color-slider");
      const input = container.querySelector(".color-value-input");

      if (slider && input) {
        const updateColor = (value) => {
          slider.value = value;
          input.value = value;
          const color = slider.dataset.color;
          const channel = slider.dataset.channel;
          if (color === "customBg") {
            window.customBgColor[["r", "g", "b"].indexOf(channel)] = parseInt(value);
          } else {
            window[color + "Color"][["r", "g", "b"].indexOf(channel)] = parseInt(value);
          }
          window.updateSketch();
        };

        slider.addEventListener("input", (event) => {
          updateColor(event.target.value);
        });

        input.addEventListener("change", (event) => {
          let value = parseInt(event.target.value);
          value = Math.min(255, Math.max(0, value));
          updateColor(value);
        });
        window.updateColorControl = updateColor;
      }
    });
  }

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
  if (!window.customBgColor) {
    window.customBgColor = [0, 0, 0];
  }

  if (window.sketchReady) {
    updateColorControls();
  } else {
    window.addEventListener("sketchReady", updateColorControls);
  }
}



export function loadNewImage(
  source,
  p5Instance,
  isDefault = false,
  callback = null
) {

  const loadImagePromise = new Promise((resolve, reject) => {
    if (isDefault || typeof source === "string") {
      p5Instance.loadImage(
        isDefault ? source : `img/${source}`,
        (img) => resolve(img),
        (error) => reject(error)
      );
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        p5Instance.loadImage(
          e.target.result,
          (img) => resolve(img),
          (error) => reject(error)
        );
      };
      reader.onerror = (error) => reject(error);
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
        console.warn(
          "initializeSketch function not found. Sketch may not update correctly."
        );
      }
    })
    .catch((error) => console.error("Error loading image:", error));
}

function updateColorControls() {
  const colorCountRadio = document.querySelector(
    'input[name="color-count"]:checked'
  );
  if (!colorCountRadio) return;

  const colorCount = parseInt(colorCountRadio.value);
  const lerpControl = document.getElementById("lerp-control");
  const middleColor = document.getElementById("middle-color");
  const endColor = document.getElementById("end-color");

  window.colorCount = colorCount;

  if (lerpControl && middleColor && endColor) {
    if (colorCount === 1) {
      lerpControl.style.display = "none";
      middleColor.style.display = "none";
      endColor.style.display = "none";
    } else if (colorCount === 2) {
      lerpControl.style.display = "block";
      middleColor.style.display = "none";
      endColor.style.display = "block";
    } else {
      lerpControl.style.display = "none";
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
  if (!Array.isArray(window.customBgColor)) {
    window.customBgColor = [0, 0, 0];
  }

  const bgColorControls = document.querySelectorAll("#custom-bg-color .color-slider-container");

  if (bgColorControls.length > 0) {
    bgColorControls.forEach((container) => {
      const slider = container.querySelector(".color-slider");
      const input = container.querySelector(".color-value-input");

      if (slider && input) {
        const channelIndex = ["r", "g", "b"].indexOf(slider.dataset.channel);
        const value = window.customBgColor[channelIndex];
        slider.value = value;
        input.value = value;
      }
    });
  }
}

function resetAllSettings() {
  window.mP = 141;
  window.cF = 0.55;
  window.baseDensity = "RRBZ21";
  window.zeroCount = 4;
  window.density = window.baseDensity + "0".repeat(window.zeroCount);
  window.colorCount = 2;
  window.invert = true;
  window.gridColumns = 150;
  window.LERP = true;
  window.startColor = [255, 255, 0];
  window.middleColor = [255, 205, 0];
  window.endColor = [255, 0, 255];
  window.bgColorOption = "black";
  window.customBgColor = [0, 0, 0];

  document.getElementById("mp").value = window.mP;
  document.getElementById("mp-value").value = window.mP;
  document.getElementById("cf").value = window.cF * 100;
  document.getElementById("cf-value").value = window.cF * 100;
  document.getElementById("density-input").value = window.baseDensity;
  document.getElementById("zero-slider").value = window.zeroCount;
  document.getElementById("zero-value").textContent = window.zeroCount;
  document.getElementById("columns").value = window.gridColumns;
  document.getElementById("columns-value").value = window.gridColumns;
  
  document.getElementById("invert-true").checked = true;
  document.getElementById("color-count-2").checked = true;
  document.getElementById("lerp-true").checked = true;
  document.getElementById("bg-black").checked = true;

  updateColorControls("start", window.startColor);
  updateColorControls("middle", window.middleColor);
  updateColorControls("end", window.endColor);
  updateColorControls("bg", window.customBgColor);

  document.getElementById("custom-bg-color").style.display = "none";
  window.updateDensity();
  window.updateSketch();
}

document.addEventListener("DOMContentLoaded", () =>
  initializeControls(window.p5Instance)
);

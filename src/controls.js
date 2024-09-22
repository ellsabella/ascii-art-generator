export function initializeControls(p5Instance) {
  console.log("Initializing controls");

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

  // Reset to default image
  const resetButton = document.getElementById("reset-image");
  if (resetButton) {
    resetButton.addEventListener("click", function () {
      loadNewImage(VITE_DEFAULT_IMAGE, p5Instance, true);
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
    columnsInput.addEventListener("input", function (event) {
      const value = parseInt(event.target.value);
      window.gridColumns = value;
      columnsValue.textContent = value;
      window.updateSketch();
    });
  }

  const downloadPngButton = document.getElementById("download-png");
  if (downloadPngButton) {
    // Remove any existing event listeners
    downloadPngButton.removeEventListener("click", window.downloadPNG);

    // Add the new event listener
    downloadPngButton.addEventListener("click", function (event) {
      event.preventDefault();
      console.log("Download button clicked");
      if (typeof window.downloadPNG === "function") {
        window.downloadPNG();
      } else {
        console.error("downloadPNG function not found");
      }
    });
  }

  // SVG download button
  const downloadSvgButton = document.getElementById("download-svg");
  if (downloadSvgButton) {
    downloadSvgButton.addEventListener("click", window.createAndDownloadSVG);
  }

  // Color count radio buttons
  const colorCountRadios = document.querySelectorAll(
    'input[name="color-count"]'
  );
  if (colorCountRadios.length > 0) {
    colorCountRadios.forEach((elem) => {
      elem.addEventListener("change", updateColorControls);
    });
  }

  const lerpRadios = document.querySelectorAll('input[name="lerp"]');
  const svgDownloadContainer = document.getElementById(
    "svg-download-container"
  );
  if (lerpRadios.length > 0) {
    lerpRadios.forEach((elem) => {
      elem.addEventListener("change", function (event) {
        window.LERP = event.target.value === "true";
        if (svgDownloadContainer) {
          svgDownloadContainer.style.display = window.LERP ? "none" : "block";
        }
        window.updateSketch();
      });
    });
  }

  // Color sliders
  const colorSliders = document.querySelectorAll(".color-slider");
  if (colorSliders.length > 0) {
    colorSliders.forEach((elem) => {
      elem.addEventListener("input", function (event) {
        let color = event.target.dataset.color;
        let channel = event.target.dataset.channel;
        let value = parseInt(event.target.value);

        window[color + "Color"][["r", "g", "b"].indexOf(channel)] = value;
        window.updateSketch();
      });
    });
  }

  // Background color radio buttons
  const bgColorRadios = document.querySelectorAll('input[name="bg-color"]');
  const customBgColorDiv = document.getElementById("custom-bg-color");
  if (bgColorRadios.length > 0) {
    bgColorRadios.forEach((elem) => {
      elem.addEventListener("change", function (event) {
        window.bgColorOption = event.target.value;
        customBgColorDiv.style.display =
          event.target.value === "custom" ? "block" : "none";
        window.updateSketch();
      });
    });
  }

  // Custom background color sliders
  const bgColorSliders = document.querySelectorAll(
    "#custom-bg-color .color-slider"
  );
  if (bgColorSliders.length > 0) {
    bgColorSliders.forEach((elem) => {
      elem.addEventListener("input", function (event) {
        let channel = event.target.dataset.channel;
        let value = parseInt(event.target.value);
        window.customBgColor[["r", "g", "b"].indexOf(channel)] = value;
        window.updateSketch();
      });
    });
  }

  if (window.sketchReady) {
    updateColorControls();
  } else {
    console.log("Sketch not ready, deferring initial update");
    window.addEventListener("sketchReady", updateColorControls);
  }
}

export function loadNewImage(
  source,
  p5Instance,
  isDefault = false,
  callback = null
) {
  console.log(
    `loadNewImage called with source: ${source}, isDefault: ${isDefault}`
  );

  const loadImagePromise = new Promise((resolve, reject) => {
    if (isDefault || typeof source === "string") {
      console.log(
        `Loading image from path: ${isDefault ? source : `img/${source}`}`
      );
      p5Instance.loadImage(
        isDefault ? source : `img/${source}`,
        (img) => resolve(img),
        (error) => reject(error)
      );
    } else {
      console.log("Loading image from file upload");
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
      console.log(
        `Image loaded. Original dimensions: ${newImg.width}x${newImg.height}`
      );
      window.img = newImg;
      console.log(
        `Image set to window.img: ${window.img.width}x${window.img.height}`
      );
      if (callback) callback();

      // Reinitialize the sketch
      if (typeof window.initializeSketch === "function") {
        console.log("Reinitializing sketch with new image");
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

document.addEventListener("DOMContentLoaded", () =>
  initializeControls(window.p5Instance)
);

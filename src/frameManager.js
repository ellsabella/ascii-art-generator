// frameManager.js — Multi-frame state management and timeline UI

const MAX_FRAMES = 10;
const MAX_FRAMES_WITH_MIRRORS = 19; // 10 base + 9 mirror = 19 (but pattern is N + N-2, so 10+8=18 max)
let propagateEnabled = true;
let mirrorBaseCount = 0; // >0 when mirror frames are active (stores original frame count)

// All per-frame window.* keys (everything that affects rendering except
// gridColumns, printRes, useImageColors, and the image itself which are global)
const FRAME_STATE_KEYS = [
  // density
  'baseDensity', 'zeroCount', 'spaceCount', 'density',
  // contrast / mapping
  'cF', 'mP',
  // character colours
  'colorCount', 'LERP',
  'startColor', 'middleColor', 'endColor',
  // image glyph adjustments
  'imageGlyphHueOffset', 'imageGlyphSatOffset', 'imageGlyphLightOffset', 'imageGlyphAlpha',
  // flat background
  'bgColorRGB', 'bgAlpha',
  // pixel background
  'advancedBgMode', 'pixelColorRGB',
  'hOffset', 'sOffset', 'lOffset',
  // shadow system
  'shadowMode', 'shadowColorMode',
  'shadowDx', 'shadowDy', 'shadowDx2', 'shadowDy2', 'shadowSymmetric',
  'shadowAlphaMult',
  'shadowHueOffset', 'shadowSatOffset', 'shadowLightOffset',
  'shadowHueOffset2', 'shadowSatOffset2', 'shadowLightOffset2',
  'shadow1RGB', 'shadow1A', 'shadow2RGB', 'shadow2A',
];

let frames = [];
let activeFrameIndex = 0;
let nextFrameId = 1;

// ---------------------------------------------------------------------------
// State snapshot helpers
// ---------------------------------------------------------------------------

function captureCurrentState() {
  const state = {};
  for (const key of FRAME_STATE_KEYS) {
    const val = window[key];
    state[key] = Array.isArray(val) ? [...val] : val;
  }
  return state;
}

function applyState(state) {
  for (const key of FRAME_STATE_KEYS) {
    if (key in state) {
      const val = state[key];
      window[key] = Array.isArray(val) ? [...val] : val;
    }
  }
}

// ---------------------------------------------------------------------------
// Frame operations
// ---------------------------------------------------------------------------

function saveActiveFrame() {
  if (frames[activeFrameIndex]) {
    frames[activeFrameIndex].state = captureCurrentState();
  }
}

function switchToFrame(index) {
  if (index < 0 || index >= frames.length || index === activeFrameIndex) return;

  // persist outgoing frame
  saveActiveFrame();

  // load incoming frame
  activeFrameIndex = index;
  applyState(frames[index].state);

  // sync UI and trigger render
  if (typeof window.syncUIFromState === 'function') window.syncUIFromState();
  if (typeof window.updateDensity === 'function') window.updateDensity();
  else if (typeof window.updateSketch === 'function') window.updateSketch();

  renderTimeline();
}

function addFrame() {
  if (frames.length >= MAX_FRAMES) return;

  // persist current frame before cloning
  saveActiveFrame();

  frames.push({
    id: nextFrameId++,
    state: captureCurrentState(),
    thumbnailDataURL: null,
    locked: false,
  });

  activeFrameIndex = frames.length - 1;
  renderTimeline();

  // generate thumbnail for the new frame after a short delay
  requestAnimationFrame(() => {
    if (typeof window.generateThumbnail === 'function') {
      const thumb = window.generateThumbnail(140);
      if (thumb) {
        frames[activeFrameIndex].thumbnailDataURL = thumb;
        renderTimeline();
      }
    }
  });
}

function deleteFrame(index) {
  if (frames.length <= 1) return;

  frames.splice(index, 1);

  if (activeFrameIndex >= frames.length) {
    activeFrameIndex = frames.length - 1;
  } else if (index < activeFrameIndex) {
    activeFrameIndex--;
  }

  // load the now-active frame
  applyState(frames[activeFrameIndex].state);
  if (typeof window.syncUIFromState === 'function') window.syncUIFromState();
  if (typeof window.updateDensity === 'function') window.updateDensity();
  else if (typeof window.updateSketch === 'function') window.updateSketch();

  renderTimeline();
}

function initFrames() {
  frames = [{
    id: nextFrameId++,
    state: captureCurrentState(),
    thumbnailDataURL: null,
    locked: false,
  }];
  activeFrameIndex = 0;
  mirrorBaseCount = 0;
  renderTimeline();
}

// ---------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------

function updateActiveThumbnail(dataURL) {
  if (frames[activeFrameIndex]) {
    frames[activeFrameIndex].thumbnailDataURL = dataURL;
    renderTimeline();
  }
}

function updateAllThumbnails() {
  if (frames.length <= 1) {
    // single frame — just use current canvas
    if (typeof window.generateThumbnail === 'function') {
      const thumb = window.generateThumbnail(140);
      if (thumb && frames[0]) {
        frames[0].thumbnailDataURL = thumb;
        renderTimeline();
      }
    }
    return;
  }

  const originalIndex = activeFrameIndex;

  for (let i = 0; i < frames.length; i++) {
    applyState(frames[i].state);

    // recompute density (derived field)
    window.density = window.baseDensity
      + '0'.repeat(Math.max(0, window.zeroCount))
      + ' '.repeat(Math.max(0, window.spaceCount));

    if (typeof window.generateThumbnail === 'function') {
      const thumb = window.generateThumbnail(140);
      if (thumb) frames[i].thumbnailDataURL = thumb;
    }
  }

  // restore original frame
  applyState(frames[originalIndex].state);
  window.density = window.baseDensity
    + '0'.repeat(Math.max(0, window.zeroCount))
    + ' '.repeat(Math.max(0, window.spaceCount));

  if (typeof window.syncUIFromState === 'function') window.syncUIFromState();
  if (typeof window.updateSketch === 'function') window.updateSketch();

  renderTimeline();
}

// ---------------------------------------------------------------------------
// Timeline DOM rendering
// ---------------------------------------------------------------------------

function renderTimeline() {
  const container = document.getElementById('frame-thumbnails');
  const addBtn = document.getElementById('add-frame-btn');
  if (!container) return;

  container.innerHTML = '';

  frames.forEach((frame, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'frame-thumb' + (index === activeFrameIndex ? ' active' : '');
    thumb.addEventListener('click', (e) => {
      if (e.target.classList.contains('frame-delete')) return;
      switchToFrame(index);
    });

    // thumbnail image
    const img = document.createElement('img');
    if (frame.thumbnailDataURL) {
      img.src = frame.thumbnailDataURL;
    }
    img.alt = `Frame ${index + 1}`;
    thumb.appendChild(img);

    // label
    const label = document.createElement('div');
    label.className = 'frame-label';
    label.textContent = `Frame ${index + 1}`;
    if (frame.locked) label.textContent += ' \ud83d\udd12';
    thumb.appendChild(label);

    // lock button
    const lockBtn = document.createElement('button');
    lockBtn.className = 'frame-lock' + (frame.locked ? ' locked' : '');
    lockBtn.textContent = frame.locked ? '\ud83d\udd12' : '\ud83d\udd13';
    lockBtn.title = frame.locked ? 'Unlock frame' : 'Lock frame (protect from propagation)';
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFrameLock(index);
    });
    thumb.appendChild(lockBtn);

    // delete button (only if more than 1 frame)
    if (frames.length > 1) {
      const delBtn = document.createElement('button');
      delBtn.className = 'frame-delete';
      delBtn.textContent = '\u00d7';
      delBtn.title = 'Delete frame';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteFrame(index);
      });
      thumb.appendChild(delBtn);
    }

    container.appendChild(thumb);
  });

  // disable add button at max
  if (addBtn) {
    addBtn.disabled = frames.length >= MAX_FRAMES;
  }

  // sync mirror button label with state
  const mirrorBtn = document.getElementById('mirror-frames-btn');
  if (mirrorBtn) {
    if (mirrorBaseCount > 0) {
      mirrorBtn.textContent = 'Remove Mirrors';
      mirrorBtn.style.background = '#f44336';
    } else {
      mirrorBtn.textContent = 'Mirror Loop';
      mirrorBtn.style.background = '';
    }
  }
}

// ---------------------------------------------------------------------------
// Propagate changes to subsequent frames
// ---------------------------------------------------------------------------

function setPropagateEnabled(enabled) {
  propagateEnabled = !!enabled;
}

function isPropagateEnabled() {
  return propagateEnabled;
}

function propagateToSubsequent() {
  if (!propagateEnabled) return;
  if (activeFrameIndex >= frames.length - 1) return; // nothing after

  const currentState = captureCurrentState();

  for (let i = activeFrameIndex + 1; i < frames.length; i++) {
    // skip locked frames
    if (frames[i].locked) continue;

    // deep-copy current state into each subsequent frame
    const cloned = {};
    for (const key of FRAME_STATE_KEYS) {
      const val = currentState[key];
      cloned[key] = Array.isArray(val) ? [...val] : val;
    }
    frames[i].state = cloned;
    frames[i].thumbnailDataURL = null; // mark stale
  }
}

// ---------------------------------------------------------------------------
// Mirror frames for seamless loop
// ---------------------------------------------------------------------------

function addMirrorFrames() {
  // Guard: don't mirror twice
  if (mirrorBaseCount > 0) return 'already_mirrored';

  // Pattern: for frames [1,2,3,4,5] we append [4,3,2]
  // i.e. frames at indices (N-2) down to 1
  const baseCount = frames.length;
  if (baseCount < 3) return 'need_3_frames'; // need at least 3 frames to mirror

  const mirrorCount = baseCount - 2;
  const totalAfter = baseCount + mirrorCount;

  if (totalAfter > MAX_FRAMES_WITH_MIRRORS) return 'too_many';

  // save current frame first
  saveActiveFrame();

  mirrorBaseCount = baseCount; // remember how many originals we had

  for (let i = baseCount - 2; i >= 1; i--) {
    const sourceState = frames[i].state;
    const cloned = {};
    for (const key of FRAME_STATE_KEYS) {
      const val = sourceState[key];
      cloned[key] = Array.isArray(val) ? [...val] : val;
    }

    frames.push({
      id: nextFrameId++,
      state: cloned,
      thumbnailDataURL: frames[i].thumbnailDataURL, // reuse thumbnail
      locked: false,
    });
  }

  renderTimeline();
  return frames.length;
}

function removeMirrorFrames(originalCount) {
  // Remove frames beyond the original count
  const count = originalCount || mirrorBaseCount;
  mirrorBaseCount = 0;
  if (count && frames.length > count) {
    frames.length = count;
    if (activeFrameIndex >= frames.length) {
      activeFrameIndex = frames.length - 1;
      applyState(frames[activeFrameIndex].state);
      if (typeof window.syncUIFromState === 'function') window.syncUIFromState();
      if (typeof window.updateDensity === 'function') window.updateDensity();
      else if (typeof window.updateSketch === 'function') window.updateSketch();
    }
    renderTimeline();
  }
}

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

function getFrames() { return frames; }
function getActiveFrameIndex() { return activeFrameIndex; }
function getFrameCount() { return frames.length; }
function isMirrored() { return mirrorBaseCount > 0; }

function toggleFrameLock(index) {
  if (index < 0 || index >= frames.length) return;
  frames[index].locked = !frames[index].locked;
  renderTimeline();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  FRAME_STATE_KEYS,
  captureCurrentState,
  applyState,
  saveActiveFrame,
  switchToFrame,
  addFrame,
  deleteFrame,
  initFrames,
  updateActiveThumbnail,
  updateAllThumbnails,
  renderTimeline,
  getFrames,
  getActiveFrameIndex,
  getFrameCount,
  MAX_FRAMES,
  setPropagateEnabled,
  isPropagateEnabled,
  propagateToSubsequent,
  addMirrorFrames,
  removeMirrorFrames,
  isMirrored,
  toggleFrameLock,
};

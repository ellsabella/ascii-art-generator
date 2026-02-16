// frameManager.js — Multi-frame state management and timeline UI

let maxFrames = 10;

function getMaxFrames() { return maxFrames; }
function setMaxFrames(n) { maxFrames = n; }
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
// Per-frame image swap (video mode)
// ---------------------------------------------------------------------------

function swapPerFrameImage(index) {
  const frame = frames[index];
  if (!frame) return;
  if (frame.image) {
    window.img = frame.image;
  }
  if (typeof window._setGridCellColors === 'function') {
    window._setGridCellColors(frame.gridCellColors || null);
  }
}

// ---------------------------------------------------------------------------
// Frame operations
// ---------------------------------------------------------------------------

function saveActiveFrame() {
  if (frames[activeFrameIndex]) {
    frames[activeFrameIndex].state = captureCurrentState();
    // persist gridCellColors for video frames (per-frame image)
    if (frames[activeFrameIndex].image && typeof window._getGridCellColors === 'function') {
      frames[activeFrameIndex].gridCellColors = window._getGridCellColors();
    }
  }
}

function switchToFrame(index) {
  if (index < 0 || index >= frames.length || index === activeFrameIndex) return;

  // manual frame switch stops playback
  if (isPlaying) stopPlayback();

  // persist outgoing frame
  saveActiveFrame();

  // load incoming frame
  activeFrameIndex = index;
  applyState(frames[index].state);
  swapPerFrameImage(index);

  // sync UI and trigger render
  if (typeof window.syncUIFromState === 'function') window.syncUIFromState();
  if (typeof window.updateDensity === 'function') window.updateDensity();
  else if (typeof window.updateSketch === 'function') window.updateSketch();

  renderTimeline();
}

function addFrame() {
  if (frames.length >= maxFrames) return;

  // persist current frame before cloning
  saveActiveFrame();

  const currentFrame = frames[activeFrameIndex];
  frames.push({
    id: nextFrameId++,
    state: captureCurrentState(),
    thumbnailDataURL: null,
    locked: false,
    image: currentFrame?.image || null,
    gridCellColors: currentFrame?.gridCellColors || null,
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
  swapPerFrameImage(activeFrameIndex);
  if (typeof window.syncUIFromState === 'function') window.syncUIFromState();
  if (typeof window.updateDensity === 'function') window.updateDensity();
  else if (typeof window.updateSketch === 'function') window.updateSketch();

  renderTimeline();
}

function initFrames() {
  maxFrames = 10;
  frames = [{
    id: nextFrameId++,
    state: captureCurrentState(),
    thumbnailDataURL: null,
    locked: false,
    image: null,
    gridCellColors: null,
  }];
  activeFrameIndex = 0;
  mirrorBaseCount = 0;
  renderTimeline();
}

function initVideoFrames(frameImages, fps) {
  maxFrames = 54;
  frames = [];
  activeFrameIndex = 0;
  mirrorBaseCount = 0;

  const baseState = captureCurrentState();

  for (let i = 0; i < frameImages.length; i++) {
    const clonedState = {};
    for (const key of FRAME_STATE_KEYS) {
      const val = baseState[key];
      clonedState[key] = Array.isArray(val) ? [...val] : val;
    }
    frames.push({
      id: nextFrameId++,
      state: clonedState,
      thumbnailDataURL: null,
      locked: false,
      image: frameImages[i],
      gridCellColors: null, // lazy extraction
    });
  }

  if (frames[0]?.image) {
    window.img = frames[0].image;
  }

  renderTimeline();
  return Math.round(1000 / fps);
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
    swapPerFrameImage(i);

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
  swapPerFrameImage(originalIndex);
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
    addBtn.disabled = frames.length >= maxFrames;
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

  // show/hide LERP button based on locked frame conditions
  const lerpBtn = document.getElementById('lerp-locked-btn');
  if (lerpBtn) {
    lerpBtn.style.display = canLerpBetweenLocked() ? 'inline-block' : 'none';
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
    if (frames[i].image) frames[i].gridCellColors = null; // invalidate for video
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

  const maxWithMirrors = maxFrames + maxFrames - 2;
  if (totalAfter > maxWithMirrors) return 'too_many';

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
      image: frames[i].image || null,
      gridCellColors: frames[i].gridCellColors || null,
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
// LERP between locked frames
// ---------------------------------------------------------------------------

// Keys that are strings or booleans — switch at midpoint instead of lerping
const DISCRETE_KEYS = new Set([
  'baseDensity', 'density', 'advancedBgMode',
  'shadowMode', 'shadowColorMode',
  'LERP', 'shadowSymmetric',
]);

// Keys that must be rounded to integers after lerp
const INTEGER_KEYS = new Set([
  'colorCount', 'zeroCount', 'spaceCount',
]);

function canLerpBetweenLocked() {
  const lockedIndices = [];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].locked) lockedIndices.push(i);
  }
  if (lockedIndices.length < 2) return false;
  for (let k = 0; k < lockedIndices.length - 1; k++) {
    if (lockedIndices[k + 1] - lockedIndices[k] > 1) return true;
  }
  return false;
}

function lerpBetweenLocked() {
  saveActiveFrame();

  const lockedIndices = [];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].locked) lockedIndices.push(i);
  }
  if (lockedIndices.length < 2) return;

  for (let k = 0; k < lockedIndices.length - 1; k++) {
    const idxA = lockedIndices[k];
    const idxB = lockedIndices[k + 1];
    const stateA = frames[idxA].state;
    const stateB = frames[idxB].state;
    const span = idxB - idxA;

    for (let i = idxA + 1; i < idxB; i++) {
      if (frames[i].locked) continue;

      const t = (i - idxA) / span;
      const interpolated = {};

      for (const key of FRAME_STATE_KEYS) {
        if (key === 'density') continue; // derived, recompute below

        const valA = stateA[key];
        const valB = stateB[key];

        if (DISCRETE_KEYS.has(key)) {
          interpolated[key] = t < 0.5 ? valA : valB;
        } else if (Array.isArray(valA) && Array.isArray(valB)) {
          interpolated[key] = valA.map((a, idx) => {
            const b = valB[idx] ?? a;
            return a + (b - a) * t;
          });
        } else if (typeof valA === 'number' && typeof valB === 'number') {
          let v = valA + (valB - valA) * t;
          if (INTEGER_KEYS.has(key)) v = Math.round(v);
          interpolated[key] = v;
        } else {
          interpolated[key] = Array.isArray(valA) ? [...valA] : valA;
        }
      }

      // recompute derived density
      interpolated.density = (interpolated.baseDensity || '')
        + '0'.repeat(Math.max(0, interpolated.zeroCount || 0))
        + ' '.repeat(Math.max(0, interpolated.spaceCount || 0));

      frames[i].state = interpolated;
      frames[i].thumbnailDataURL = null;
      if (frames[i].image) frames[i].gridCellColors = null; // invalidate for video
    }
  }

  // re-apply active frame (it may have been interpolated)
  applyState(frames[activeFrameIndex].state);
  if (typeof window.syncUIFromState === 'function') window.syncUIFromState();
  if (typeof window.updateDensity === 'function') window.updateDensity();
  else if (typeof window.updateSketch === 'function') window.updateSketch();

  renderTimeline();
}

// ---------------------------------------------------------------------------
// Playback (play / pause)
// ---------------------------------------------------------------------------

let playbackInterval = null;
let isPlaying = false;

function getPlaybackDelay() {
  const el = document.getElementById('gif-delay');
  return el ? Math.max(10, parseInt(el.value, 10) || 200) : 200;
}

function startPlayback() {
  if (frames.length <= 1) return;
  if (isPlaying) return;

  isPlaying = true;
  saveActiveFrame();
  updatePlayPauseButton();

  const tick = () => {
    const next = (activeFrameIndex + 1) % frames.length;
    // lightweight switch — skip propagation
    activeFrameIndex = next;
    applyState(frames[next].state);
    swapPerFrameImage(next);
    if (typeof window.syncUIFromState === 'function') window.syncUIFromState();
    if (typeof window.updateSketch === 'function') window.updateSketch();
    renderTimeline();
  };

  tick(); // advance immediately on first press
  playbackInterval = setInterval(tick, getPlaybackDelay());
}

function stopPlayback() {
  if (!isPlaying) return;
  isPlaying = false;
  clearInterval(playbackInterval);
  playbackInterval = null;
  updatePlayPauseButton();
}

function togglePlayback() {
  if (isPlaying) stopPlayback();
  else startPlayback();
}

function isPlaybackActive() {
  return isPlaying;
}

function updatePlayPauseButton() {
  const btn = document.getElementById('play-pause-btn');
  if (!btn) return;
  btn.textContent = isPlaying ? '\u23F8' : '\u25B6';
  btn.title = isPlaying ? 'Pause' : 'Play animation preview';
}

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

function getFrames() { return frames; }
function getActiveFrameIndex() { return activeFrameIndex; }
function getFrameCount() { return frames.length; }
function isMirrored() { return mirrorBaseCount > 0; }
function isVideoMode() { return frames.length > 0 && frames[0].image != null; }

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
  initVideoFrames,
  updateActiveThumbnail,
  updateAllThumbnails,
  renderTimeline,
  getFrames,
  getActiveFrameIndex,
  getFrameCount,
  getMaxFrames,
  setMaxFrames,
  isVideoMode,
  setPropagateEnabled,
  isPropagateEnabled,
  propagateToSubsequent,
  addMirrorFrames,
  removeMirrorFrames,
  isMirrored,
  toggleFrameLock,
  canLerpBetweenLocked,
  lerpBetweenLocked,
  togglePlayback,
  stopPlayback,
  isPlaybackActive,
};

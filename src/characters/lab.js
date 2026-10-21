import "./lab.css";
import { PARAMS, SPECIES, SPECIES_KEYS } from "./schema.js";
import {
  generateCharacter, rollParams, mixParams, completeParams, compositeLayers,
  LAYER_ORDER, PALETTE_NAMES,
} from "./generator.js";
import { hashString } from "./rng.js";
import { rgbArrToHex, hexToRgbArr } from "../paletteUtils.js";

const VARIANT_COUNT = 12;
const PREVIEW_PX = 480;
const VARIANT_PX = 120;
const HISTORY_MAX = 50;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  species: "any",       // which preset new rolls come from
  seed: 1,
  size: 24,
  strength: 100,        // % : how far variations stray from the current character
  outline: true,
  bgMode: "auto",       // auto | transparent | custom
  bgCustom: "#22222a",
  params: null,
  hidden: [],           // layer names switched off in the preview
};

const history = [];
let current = null;      // last generated character
let variants = [];       // [{ seed, params }]

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Persistence (URL hash, so a refresh or a shared link restores the character)
// ---------------------------------------------------------------------------

function saveHash() {
  try {
    const json = JSON.stringify(state);
    window.history.replaceState(null, "", "#" + encodeURIComponent(json));
  } catch { /* non-fatal */ }
}

function loadHash() {
  if (location.hash.length < 2) return false;
  try {
    const saved = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    if (!saved || typeof saved !== "object" || !saved.params) return false;
    state.species = saved.species === "any" || SPECIES[saved.species] ? saved.species : "any";
    state.seed = Number.isFinite(+saved.seed) ? Math.floor(+saved.seed) : 1;
    state.size = clampInt(saved.size, 16, 64, 24);
    state.strength = clampInt(saved.strength, 5, 100, 100);
    state.outline = saved.outline !== false;
    state.bgMode = ["auto", "transparent", "custom"].includes(saved.bgMode) ? saved.bgMode : "auto";
    state.bgCustom = /^#[0-9a-f]{6}$/i.test(saved.bgCustom) ? saved.bgCustom : state.bgCustom;
    state.hidden = Array.isArray(saved.hidden) ? saved.hidden.filter((n) => LAYER_ORDER.includes(n)) : [];
    state.params = completeParams(saved.params);
    return true;
  } catch {
    return false;
  }
}

function clampInt(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

const scratch = document.createElement("canvas");

function backgroundOf(char) {
  if (state.bgMode === "transparent") return null;
  if (state.bgMode === "custom") return hexToRgbArr(state.bgCustom);
  return char.background;
}

/** Draw a character into a canvas at an integer scale. bg: [r,g,b] or null. */
function paint(canvas, char, { targetPx, scale, bg, hidden }) {
  const N = char.size;
  const pixels = hidden && hidden.size ? compositeLayers(char.layers, N, hidden) : char.pixels;

  scratch.width = N;
  scratch.height = N;
  const sctx = scratch.getContext("2d");
  const img = sctx.createImageData(N, N);
  for (let i = 0; i < pixels.length; i++) {
    const idx = pixels[i];
    const c = idx ? char.palette[idx] : bg;
    if (!c) continue; // leave transparent
    img.data[i * 4] = c[0];
    img.data[i * 4 + 1] = c[1];
    img.data[i * 4 + 2] = c[2];
    img.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);

  const k = scale || Math.max(1, Math.floor(targetPx / N));
  canvas.width = N * k;
  canvas.height = N * k;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  current = generateCharacter(state.params, { size: state.size, seed: state.seed, outline: state.outline });
  paint($("preview"), current, { targetPx: PREVIEW_PX, bg: backgroundOf(current), hidden: new Set(state.hidden) });

  const label = SPECIES[state.params.species]?.label ?? state.params.species;
  $("meta").innerHTML =
    `<b>${label}</b><br>seed ${state.seed}<br>${current.size} &times; ${current.size} px`;

  renderPalette();
  renderVariants();
  saveHash();
}

function renderPalette() {
  const strip = $("palette-strip");
  strip.innerHTML = "";
  const used = new Set(current.pixels);
  current.palette.forEach((rgb, idx) => {
    if (idx === 0 || !used.has(idx)) return;
    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = rgbArrToHex(rgb);
    sw.title = `${PALETTE_NAMES[idx]}  ${rgbArrToHex(rgb)}`;
    strip.appendChild(sw);
  });
}

function buildVariants() {
  const t = state.strength / 100;
  variants = [];
  for (let i = 0; i < VARIANT_COUNT; i++) {
    const seed = hashString(`variant:${state.seed}:${i}`) % 1000000;
    const fresh = rollParams(state.species, seed);
    const params = t >= 1 ? fresh : mixParams(state.params, fresh, t, seed);
    variants.push({ seed, params });
  }
}

function renderVariants() {
  buildVariants();
  const wrap = $("variants");
  wrap.innerHTML = "";
  variants.forEach((v) => {
    const cell = document.createElement("div");
    cell.className = "variant";
    const canvas = document.createElement("canvas");
    const char = generateCharacter(v.params, { size: state.size, seed: v.seed, outline: state.outline });
    paint(canvas, char, { targetPx: VARIANT_PX, bg: backgroundOf(char) });
    const tag = document.createElement("span");
    tag.textContent = SPECIES[v.params.species]?.label ?? v.params.species;
    cell.title = `seed ${v.seed}`;
    cell.append(canvas, tag);
    cell.addEventListener("click", () => adopt(v));
    wrap.appendChild(cell);
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function pushHistory() {
  history.push({ seed: state.seed, params: { ...state.params } });
  if (history.length > HISTORY_MAX) history.shift();
  $("back").disabled = false;
}

function adopt(v) {
  pushHistory();
  state.seed = v.seed;
  state.params = { ...v.params };
  syncControls();
  render();
}

function randomise() {
  pushHistory();
  state.seed = Math.floor(Math.random() * 1000000);
  state.params = rollParams(state.species, state.seed);
  syncControls();
  render();
}

function goBack() {
  const prev = history.pop();
  if (!prev) return;
  state.seed = prev.seed;
  state.params = prev.params;
  $("back").disabled = history.length === 0;
  syncControls();
  render();
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fileStem() {
  return `alien-${state.params.species}-${state.seed}-${current.size}px`;
}

function exportPng() {
  const scale = clampInt($("export-scale").value, 1, 64, 16);
  const canvas = document.createElement("canvas");
  paint(canvas, current, { scale, bg: backgroundOf(current), hidden: new Set(state.hidden) });
  canvas.toBlob((blob) => blob && download(`${fileStem()}-${scale}x.png`, blob), "image/png");
}

/** Layers as rows of base-36 palette indices ('.' = empty): easy to read and to re-import. */
function exportJson() {
  const N = current.size;
  const rows = (L) => {
    const out = [];
    for (let y = 0; y < N; y++) {
      let s = "";
      for (let x = 0; x < N; x++) { const v = L[y * N + x]; s += v ? v.toString(36) : "."; }
      out.push(s);
    }
    return out;
  };
  const doc = {
    version: 1,
    species: state.params.species,
    seed: state.seed,
    size: N,
    params: state.params,
    palette: current.palette.map((rgb, i) => ({ index: i, name: PALETTE_NAMES[i], hex: i === 0 ? null : rgbArrToHex(rgb) })),
    background: rgbArrToHex(current.background),
    layerOrder: LAYER_ORDER,
    layers: Object.fromEntries(LAYER_ORDER.map((name) => [name, rows(current.layers[name])])),
  };
  download(`${fileStem()}.json`, new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const paramInputs = {}; // key -> { slider, number } | { select }

function buildParamControls() {
  const host = $("param-controls");
  host.innerHTML = "";
  let section = null, group = null;

  for (const def of PARAMS) {
    if (def.group !== group) {
      group = def.group;
      section = document.createElement("section");
      const h = document.createElement("h2");
      h.textContent = group;
      section.appendChild(h);
      host.appendChild(section);
    }

    const label = document.createElement("label");
    label.textContent = def.label;
    label.htmlFor = `p-${def.key}`;
    section.appendChild(label);

    if (def.type === "choice") {
      const select = document.createElement("select");
      select.id = `p-${def.key}`;
      def.options.forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        select.appendChild(opt);
      });
      select.addEventListener("change", () => {
        state.params[def.key] = select.value;
        render();
      });
      section.appendChild(select);
      paramInputs[def.key] = { select };
    } else {
      const row = document.createElement("div");
      row.className = "param-row";
      const slider = document.createElement("input");
      slider.type = "range";
      slider.id = `p-${def.key}`;
      const number = document.createElement("input");
      number.type = "number";
      for (const el of [slider, number]) { el.min = def.min; el.max = def.max; el.step = def.step; }

      const apply = (raw) => {
        let v = Number(raw);
        if (!Number.isFinite(v)) return;
        v = Math.max(def.min, Math.min(def.max, v));
        state.params[def.key] = v;
        slider.value = v;
        number.value = v;
        render();
      };
      slider.addEventListener("input", (e) => apply(e.target.value));
      number.addEventListener("change", (e) => apply(e.target.value));

      row.append(slider, number);
      section.appendChild(row);
      paramInputs[def.key] = { slider, number };
    }
  }
}

function buildStaticControls() {
  // species
  const species = $("species");
  const any = document.createElement("option");
  any.value = "any";
  any.textContent = "Any (mix species)";
  species.appendChild(any);
  SPECIES_KEYS.forEach((k) => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = SPECIES[k].label;
    species.appendChild(opt);
  });
  species.addEventListener("change", () => {
    pushHistory();
    state.species = species.value;
    state.params = rollParams(state.species, state.seed);
    syncControls();
    render();
  });

  $("seed").addEventListener("change", (e) => {
    const n = Math.floor(Number(e.target.value));
    if (!Number.isFinite(n) || n < 0) { e.target.value = state.seed; return; }
    pushHistory();
    state.seed = n;
    state.params = rollParams(state.species, state.seed);
    syncControls();
    render();
  });

  $("size").addEventListener("input", (e) => {
    state.size = clampInt(e.target.value, 16, 64, 24);
    $("size-label").textContent = `${state.size} px`;
    render();
  });

  $("strength").addEventListener("input", (e) => {
    state.strength = clampInt(e.target.value, 5, 100, 100);
    $("strength-label").textContent = `${state.strength}%`;
    renderVariants();
    saveHash();
  });

  $("outline").addEventListener("change", (e) => { state.outline = e.target.checked; render(); });

  $("bg-mode").addEventListener("change", (e) => {
    state.bgMode = e.target.value;
    $("bg-custom").style.display = state.bgMode === "custom" ? "" : "none";
    render();
  });
  $("bg-custom").addEventListener("input", (e) => { state.bgCustom = e.target.value; render(); });

  $("randomise").addEventListener("click", randomise);
  $("back").addEventListener("click", goBack);
  $("export-png").addEventListener("click", exportPng);
  $("export-json").addEventListener("click", exportJson);

  // layer visibility
  const toggles = $("layer-toggles");
  LAYER_ORDER.slice().reverse().forEach((name) => {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.layer = name;
    box.addEventListener("change", () => {
      state.hidden = LAYER_ORDER.filter((n) => !toggles.querySelector(`[data-layer="${n}"]`).checked);
      render();
    });
    label.append(box, document.createTextNode(name));
    toggles.appendChild(label);
  });

  // keyboard: R / Space = randomise, Z = back (ignored while typing in a field)
  window.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return;
    if (e.key === "r" || e.key === "R" || e.key === " ") { e.preventDefault(); randomise(); }
    else if (e.key === "z" || e.key === "Z") { e.preventDefault(); goBack(); }
  });
}

/** Push state into every control. */
function syncControls() {
  $("species").value = state.species;
  $("seed").value = state.seed;
  $("size").value = state.size;
  $("size-label").textContent = `${state.size} px`;
  $("strength").value = state.strength;
  $("strength-label").textContent = `${state.strength}%`;
  $("outline").checked = state.outline;
  $("bg-mode").value = state.bgMode;
  $("bg-custom").value = state.bgCustom;
  $("bg-custom").style.display = state.bgMode === "custom" ? "" : "none";
  $("back").disabled = history.length === 0;

  document.querySelectorAll("#layer-toggles input").forEach((box) => {
    box.checked = !state.hidden.includes(box.dataset.layer);
  });

  for (const def of PARAMS) {
    const input = paramInputs[def.key];
    const v = state.params[def.key];
    if (input.select) input.select.value = v;
    else { input.slider.value = v; input.number.value = v; }
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

buildStaticControls();
buildParamControls();

if (!loadHash()) {
  state.seed = Math.floor(Math.random() * 1000000);
  state.params = rollParams(state.species, state.seed);
}

syncControls();
render();

// Handy for poking at things from the console while iterating
window.characterLab = { state, generateCharacter, rollParams, get current() { return current; } };

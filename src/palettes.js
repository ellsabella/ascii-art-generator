// Curated preset palettes. The special key "image" means "extract from the
// current image with k-means" and is handled by the controls, not listed here.

export const PALETTE_PRESETS = [
  { key: "mono",      name: "Mono",        colors: ["#000000", "#ffffff"] },
  { key: "gameboy",   name: "Game Boy",    colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"] },
  { key: "cga",       name: "CGA",         colors: ["#000000", "#55ffff", "#ff55ff", "#ffffff"] },
  { key: "pico8",     name: "PICO-8",      colors: [
    "#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
    "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa",
  ] },
  { key: "pastel",    name: "Pastel",      colors: ["#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#a0c4ff", "#bdb2ff", "#ffc6ff"] },
  { key: "sunset",    name: "Sunset",      colors: ["#03071e", "#370617", "#6a040f", "#9d0208", "#d00000", "#dc2f02", "#e85d04", "#f48c06", "#faa307", "#ffba08"] },
  { key: "ocean",     name: "Ocean",       colors: ["#03045e", "#023e8a", "#0077b6", "#0096c7", "#00b4d8", "#48cae4", "#90e0ef", "#ade8f4", "#caf0f8"] },
  { key: "earth",     name: "Earth",       colors: ["#333d29", "#414833", "#656d4a", "#a4ac86", "#c2c5aa", "#b6ad90", "#a68a64", "#936639", "#7f4f24", "#582f0e"] },
  { key: "neon",      name: "Neon",        colors: ["#ff00ff", "#00ffff", "#ffff00", "#ff0080", "#00ff80"] },
  { key: "vaporwave", name: "Vaporwave",   colors: ["#ff71ce", "#01cdfe", "#05ffa1", "#b967ff", "#fffb96"] },
  { key: "cyberpunk", name: "Cyberpunk",   colors: ["#01012b", "#005678", "#05d9e8", "#d1f7ff", "#ff2a6d"] },
];

export function getPreset(key) {
  return PALETTE_PRESETS.find((p) => p.key === key) || null;
}

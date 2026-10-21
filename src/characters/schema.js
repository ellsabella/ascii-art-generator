// Parameter schema and species presets for the alien generator.
//
// Every character is described by the same flat set of parameters (PARAMS).
// A species is nothing more than a set of ranges / weights over those
// parameters, so adding a new base type is just adding an entry to SPECIES,
// and any two characters can be blended parameter by parameter.
//
// All geometry is in normalised canvas units (0..1), so it is independent of
// the pixel size the character is rendered at.

export const PARAMS = [
  // ---- Head
  { key: "headW", label: "Head width", group: "Head", type: "number", min: 0.14, max: 0.48, step: 0.005 },
  { key: "headH", label: "Head height", group: "Head", type: "number", min: 0.12, max: 0.44, step: 0.005 },
  { key: "headY", label: "Head position", group: "Head", type: "number", min: 0.28, max: 0.66, step: 0.005 },
  { key: "headShape", label: "Roundness (1 diamond, 2 round, 6 boxy)", group: "Head", type: "number", min: 1, max: 6, step: 0.05 },
  { key: "chinTaper", label: "Chin taper", group: "Head", type: "number", min: -0.5, max: 0.92, step: 0.01 },
  { key: "crownTaper", label: "Crown taper", group: "Head", type: "number", min: -0.4, max: 0.75, step: 0.01 },

  // ---- Body
  { key: "body", label: "Body", group: "Body", type: "choice", options: ["shoulders", "robe", "tiny", "blob", "none"] },
  { key: "neckW", label: "Neck width", group: "Body", type: "number", min: 0.02, max: 0.22, step: 0.005 },
  { key: "shoulderW", label: "Shoulder width", group: "Body", type: "number", min: 0.12, max: 0.5, step: 0.005 },
  { key: "shoulderY", label: "Shoulder height", group: "Body", type: "number", min: 0.7, max: 0.97, step: 0.005 },
  { key: "shoulderSlope", label: "Shoulder slope", group: "Body", type: "number", min: 0, max: 0.9, step: 0.01 },

  // ---- Eyes
  { key: "eyeLayout", label: "Eye layout", group: "Eyes", type: "choice", options: ["one", "two", "three", "four", "many"] },
  { key: "eyeStyle", label: "Eye style", group: "Eyes", type: "choice", options: ["almond", "round", "slit", "glow", "compound"] },
  { key: "eyeSize", label: "Eye size", group: "Eyes", type: "number", min: 0.025, max: 0.18, step: 0.005 },
  { key: "eyeAspect", label: "Eye height ratio", group: "Eyes", type: "number", min: 0.35, max: 1.9, step: 0.05 },
  { key: "eyeY", label: "Eye height on head", group: "Eyes", type: "number", min: -0.7, max: 0.5, step: 0.01 },
  { key: "eyeSpacing", label: "Eye spacing", group: "Eyes", type: "number", min: 0.04, max: 0.34, step: 0.005 },
  { key: "eyeSlant", label: "Eye slant", group: "Eyes", type: "number", min: -0.9, max: 0.9, step: 0.02 },

  // ---- Mouth
  { key: "mouth", label: "Mouth", group: "Mouth", type: "choice", options: ["none", "slit", "smile", "frown", "teeth", "o", "tentacles", "mandibles"] },
  { key: "mouthW", label: "Mouth width", group: "Mouth", type: "number", min: 0.02, max: 0.28, step: 0.005 },
  { key: "mouthY", label: "Mouth position", group: "Mouth", type: "number", min: 0.1, max: 0.92, step: 0.01 },

  // ---- Appendages
  { key: "top", label: "Top", group: "Appendages", type: "choice", options: ["none", "antennae", "horns", "crest", "stalks"] },
  { key: "sides", label: "Sides", group: "Appendages", type: "choice", options: ["none", "ears", "fins", "tendrils"] },
  { key: "appLen", label: "Appendage length", group: "Appendages", type: "number", min: 0.03, max: 0.34, step: 0.005 },
  { key: "appSpread", label: "Appendage spread", group: "Appendages", type: "number", min: 0.05, max: 1, step: 0.01 },

  // ---- Markings
  { key: "markings", label: "Markings", group: "Markings", type: "choice", options: ["none", "spots", "stripes", "gem", "freckles"] },
  { key: "markDensity", label: "Marking density", group: "Markings", type: "number", min: 0, max: 1, step: 0.05 },

  // ---- Colour
  { key: "skinHue", label: "Skin hue", group: "Colour", type: "number", min: 0, max: 360, step: 1 },
  { key: "skinSat", label: "Skin saturation", group: "Colour", type: "number", min: 0, max: 100, step: 1 },
  { key: "skinLight", label: "Skin lightness", group: "Colour", type: "number", min: 20, max: 85, step: 1 },
  { key: "accentShift", label: "Accent hue shift", group: "Colour", type: "number", min: 0, max: 360, step: 1 },
  { key: "eyeHue", label: "Eye hue", group: "Colour", type: "number", min: 0, max: 360, step: 1 },
  { key: "clothHue", label: "Clothing hue", group: "Colour", type: "number", min: 0, max: 360, step: 1 },
];

// Sensible "generic alien" ranges. Species override only what makes them distinct.
export const DEFAULT_RANGES = {
  headW: [0.26, 0.38], headH: [0.24, 0.32], headY: [0.42, 0.5], headShape: [1.8, 2.6],
  chinTaper: [0, 0.4], crownTaper: [0, 0.15],

  body: { shoulders: 3, robe: 1, tiny: 1, blob: 0.5 },
  neckW: [0.06, 0.11], shoulderW: [0.3, 0.42], shoulderY: [0.84, 0.9], shoulderSlope: [0.2, 0.6],

  eyeLayout: { two: 5, one: 1, three: 1, four: 0.5, many: 0.3 },
  eyeStyle: { round: 3, almond: 2, slit: 1, glow: 1, compound: 0.5 },
  eyeSize: [0.05, 0.1], eyeAspect: [0.7, 1.2], eyeY: [-0.25, 0.05], eyeSpacing: [0.11, 0.2], eyeSlant: [-0.2, 0.3],

  mouth: { slit: 3, smile: 2, frown: 1, teeth: 1, o: 1, none: 1, tentacles: 0.3, mandibles: 0.3 },
  mouthW: [0.06, 0.16], mouthY: [0.45, 0.7],

  top: { none: 3, antennae: 2, horns: 1, crest: 1, stalks: 0.4 },
  sides: { none: 4, ears: 1.5, fins: 1, tendrils: 0.7 },
  appLen: [0.08, 0.2], appSpread: [0.3, 0.8],

  markings: { none: 3, spots: 1.5, stripes: 1, gem: 0.7, freckles: 1 },
  markDensity: [0.2, 0.8],

  skinHue: [0, 360], skinSat: [35, 75], skinLight: [40, 65],
  accentShift: [30, 330], eyeHue: [0, 360], clothHue: [0, 360],
};

export const SPECIES = {
  grey: {
    label: "Grey",
    headW: [0.3, 0.38], headH: [0.27, 0.33], headY: [0.4, 0.46], headShape: [1.9, 2.4],
    chinTaper: [0.55, 0.85], crownTaper: [-0.25, 0],
    body: { tiny: 3, shoulders: 1, robe: 1 }, neckW: [0.04, 0.07], shoulderW: [0.22, 0.32],
    eyeLayout: { two: 1 }, eyeStyle: { almond: 6, glow: 1 },
    eyeSize: [0.085, 0.13], eyeAspect: [0.55, 0.8], eyeY: [-0.05, 0.15], eyeSpacing: [0.12, 0.17], eyeSlant: [0.25, 0.6],
    mouth: { slit: 3, none: 2, o: 0.5 }, mouthW: [0.03, 0.07], mouthY: [0.6, 0.75],
    top: { none: 6, antennae: 1 }, sides: { none: 1 },
    markings: { none: 4, freckles: 1, gem: 0.5 },
    skinHue: [70, 200], skinSat: [8, 35], skinLight: [50, 70],
  },

  blob: {
    label: "Blob",
    headW: [0.34, 0.44], headH: [0.24, 0.32], headY: [0.46, 0.54], headShape: [2.2, 3.4],
    chinTaper: [-0.35, -0.05], crownTaper: [0.1, 0.45],
    body: { blob: 1 }, shoulderW: [0.38, 0.48],
    eyeLayout: { one: 4, three: 2, two: 1, many: 1 }, eyeStyle: { round: 5, slit: 1, glow: 1 },
    eyeSize: [0.07, 0.12], eyeAspect: [0.9, 1.2], eyeY: [-0.3, 0],
    mouth: { smile: 3, teeth: 3, o: 1, frown: 1 }, mouthW: [0.1, 0.22], mouthY: [0.45, 0.65],
    top: { antennae: 3, none: 2, stalks: 1 }, sides: { none: 3, tendrils: 1 },
    markings: { spots: 4, none: 1, freckles: 1 },
    skinSat: [55, 90], skinLight: [45, 62],
  },

  cephalopod: {
    label: "Cephalopod",
    headW: [0.27, 0.35], headH: [0.3, 0.38], headY: [0.36, 0.42], headShape: [2, 2.8],
    chinTaper: [0.1, 0.35], crownTaper: [-0.3, -0.05],
    body: { robe: 2, shoulders: 1, tiny: 1 },
    eyeLayout: { two: 1 }, eyeStyle: { slit: 3, round: 2, glow: 1 },
    eyeSize: [0.05, 0.08], eyeY: [0.15, 0.35], eyeSpacing: [0.16, 0.24],
    mouth: { tentacles: 1 }, mouthW: [0.1, 0.18], mouthY: [0.6, 0.75],
    top: { none: 3, crest: 1 }, sides: { none: 2, fins: 2, tendrils: 1 }, appLen: [0.14, 0.26],
    markings: { spots: 3, none: 1, stripes: 1 },
  },

  insectoid: {
    label: "Insectoid",
    headW: [0.3, 0.4], headH: [0.24, 0.3], headY: [0.44, 0.5], headShape: [1.15, 1.6],
    chinTaper: [0.4, 0.8], crownTaper: [0, 0.2],
    body: { shoulders: 2, tiny: 2 }, neckW: [0.04, 0.07],
    eyeLayout: { two: 1 }, eyeStyle: { compound: 5, almond: 1, glow: 1 },
    eyeSize: [0.09, 0.14], eyeAspect: [0.8, 1.2], eyeY: [-0.2, 0.05], eyeSpacing: [0.18, 0.27], eyeSlant: [0.1, 0.5],
    mouth: { mandibles: 1 }, mouthW: [0.06, 0.12], mouthY: [0.55, 0.75],
    top: { antennae: 1 }, appLen: [0.16, 0.28], appSpread: [0.3, 0.7], sides: { none: 1 },
    markings: { stripes: 3, none: 2 },
    skinHue: [20, 150], skinSat: [40, 80],
  },

  stalker: {
    label: "Stalker",
    headW: [0.24, 0.32], headH: [0.17, 0.23], headY: [0.54, 0.6], headShape: [2.4, 4],
    chinTaper: [-0.1, 0.3],
    body: { shoulders: 2, robe: 1 }, shoulderW: [0.34, 0.46], shoulderY: [0.86, 0.9],
    eyeLayout: { two: 3, three: 2, one: 1, four: 1 }, eyeStyle: { round: 4, slit: 1, glow: 1 },
    eyeSize: [0.05, 0.08],
    mouth: { teeth: 4, smile: 1, frown: 1 }, mouthW: [0.12, 0.2], mouthY: [0.2, 0.5],
    top: { stalks: 1 }, appLen: [0.18, 0.3], appSpread: [0.4, 0.9],
    sides: { ears: 2, fins: 1, none: 2 },
    markings: { none: 2, spots: 1, freckles: 1 },
  },

  crystalline: {
    label: "Crystalline",
    headW: [0.26, 0.36], headH: [0.26, 0.34], headY: [0.4, 0.46], headShape: [1, 1.4],
    chinTaper: [0, 0.5], crownTaper: [0, 0.4],
    body: { robe: 3, shoulders: 1 },
    eyeLayout: { two: 3, one: 2, three: 1 }, eyeStyle: { glow: 4, slit: 2 },
    eyeSize: [0.04, 0.08], eyeAspect: [0.4, 0.8], eyeSlant: [-0.3, 0.5],
    mouth: { none: 3, slit: 2 },
    top: { horns: 3, crest: 2, none: 1 }, sides: { fins: 2, none: 2 },
    markings: { gem: 3, stripes: 2, none: 1 },
    skinHue: [160, 320], skinSat: [35, 80], skinLight: [55, 75],
  },
};

export const SPECIES_KEYS = Object.keys(SPECIES);

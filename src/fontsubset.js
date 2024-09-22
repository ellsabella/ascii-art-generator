import opentype from "opentype.js";

const fontCache = new Map();

export async function loadFont(path) {
  return new Promise((resolve, reject) => {
    opentype.load(path, (err, font) => {
      if (err) {
        reject(err);
      } else {
        resolve(font);
      }
    });
  });
}

export async function getSubsetFont(font, text, maxRetries = 3) {
  if (!font) {
    throw new Error("Font is undefined in getSubsetFont");
  }
  if (!text) {
    throw new Error("Text is undefined in getSubsetFont");
  }

  const cacheKey = text;
  if (fontCache.has(cacheKey)) {
    return fontCache.get(cacheKey);
  }

  let retries = 0;
  while (retries < maxRetries) {
    try {
      const subsetFont = await createSubsetFont(font, text);
      fontCache.set(cacheKey, subsetFont);
      return subsetFont;
    } catch (error) {
      console.warn(`Attempt ${retries + 1} failed: ${error.message}`);
      retries++;
      if (retries >= maxRetries) {
        throw new Error(`Failed to subset font after ${maxRetries} attempts: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

function createSubsetFont(font, text) {
  console.log("Creating subset font with text:", text);
  
  if (!font) {
    throw new Error("Font is undefined in createSubsetFont");
  }
  if (!text) {
    throw new Error("Text is undefined in createSubsetFont");
  }

  const uniqueChars = [...new Set(text)].sort();
  console.log("Unique characters:", uniqueChars);

  const glyphIndices = new Map();
  uniqueChars.forEach(char => {
    if (!font.charToGlyph) {
      throw new Error("font.charToGlyph is not a function");
    }
    const glyph = font.charToGlyph(char);
    if (glyph && glyph.index !== undefined) {
      glyphIndices.set(char, glyph.index);
    } else {
      console.warn(`No glyph found for character: ${char}`);
    }
  });

  if (!font.glyphs || typeof font.glyphs.get !== 'function') {
    throw new Error("font.glyphs is undefined or not a valid object");
  }

  const glyphs = Array.from(glyphIndices.values()).map(index => {
    const glyph = font.glyphs.get(index);
    if (!glyph) {
      throw new Error(`No glyph found for index: ${index}`);
    }
    return glyph;
  });

  if (!glyphs.some(glyph => glyph.index === 0)) {
    const notdefGlyph = font.glyphs.get(0);
    if (!notdefGlyph) {
      throw new Error("No .notdef glyph found in the font");
    }
    glyphs.unshift(notdefGlyph);
  }

  if (!font.names || !font.names.fontFamily || !font.names.fontFamily.en) {
    throw new Error("Font name information is missing");
  }

  const subsetFont = new opentype.Font({
    familyName: font.names.fontFamily.en,
    styleName: font.names.fontSubfamily ? font.names.fontSubfamily.en : 'Regular',
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    glyphs: glyphs
  });

  const validation = subsetFont.validate();
  if (validation && validation.length > 0) {
    console.warn('Font validation warnings:', validation);
  }

  return subsetFont;
}

export function fontToBase64(subsetFont) {
  if (!subsetFont) {
    throw new Error("Subset font is undefined in fontToBase64");
  }

  try {
    const arrayBuffer = subsetFont.toArrayBuffer();
    const base64String = btoa(String.fromCharCode.apply(null, new Uint8Array(arrayBuffer)));
    return `data:font/ttf;base64,${base64String}`;
  } catch (error) {
    console.error('Error converting font to Base64:', error);
    throw error;
  }
}
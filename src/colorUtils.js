import p5 from "p5";

export function updateColorMap(p, window) {
    const colorMap = new Map();
    const densityWithoutSpaces = window.density.replace(/\s/g, '');
    const totalChars = densityWithoutSpaces.length;
  
    let visibleCharIndex = 0;
    for (let i = 0; i < window.density.length; i++) {
      const char = window.density.charAt(i);
      if (char === ' ') continue;
  
      let col;
      if (window.colorCount === 1) {
        col = p.color(...hslToRgb(...window.startColor.slice(0, 3)), window.startColor[3] * 255);
      } else if (window.colorCount === 2) {
        if (window.LERP) {
          const t = visibleCharIndex / (totalChars - 1);
          const lerpedColor = lerpHSLA(window.startColor, window.endColor, t);
          col = p.color(...hslToRgb(...lerpedColor.slice(0, 3)), lerpedColor[3] * 255);
        } else {
          const sourceColor = visibleCharIndex < totalChars / 2 ? window.startColor : window.endColor;
          col = p.color(...hslToRgb(...sourceColor.slice(0, 3)), sourceColor[3] * 255);
        }
      } else {
        const firstThird = Math.floor(totalChars / 3);
        const secondThird = Math.floor((2 * totalChars) / 3);
        let sourceColor;
        if (visibleCharIndex < firstThird) {
          sourceColor = window.startColor;
        } else if (visibleCharIndex < secondThird) {
          sourceColor = window.middleColor;
        } else {
          sourceColor = window.endColor;
        }
        col = p.color(...hslToRgb(...sourceColor.slice(0, 3)), sourceColor[3] * 255);
      }
      colorMap.set(char, col);
      visibleCharIndex++;
    }
  
    return colorMap;
}

export function kMeansColorClustering(pixels, k = 3, maxIterations = 10) {
    let centroids = Array(k).fill().map(() => {
        const h = Math.random() * 360;
        const s = 70 + Math.random() * 30; // Higher initial saturation
        const l = 30 + Math.random() * 40; // Avoid very light or dark colors
        return hslToRgb(h, s, l);
    });

    for (let iteration = 0; iteration < maxIterations; iteration++) {
        // Assign pixels to clusters
        const clusters = Array(k).fill().map(() => []);
        pixels.forEach(pixel => {
            let nearestCentroidIndex = 0;
            let minDistance = Infinity;
            
            centroids.forEach((centroid, index) => {
                const distance = euclideanDistance(pixel, centroid);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestCentroidIndex = index;
                }
            });
            
            clusters[nearestCentroidIndex].push(pixel);
        });

        // Update centroids
        const newCentroids = clusters.map(cluster => {
            if (cluster.length === 0) return [0, 0, 0];
            return cluster.reduce((acc, pixel) => [
                acc[0] + pixel[0],
                acc[1] + pixel[1],
                acc[2] + pixel[2]
            ]).map(sum => sum / cluster.length);
        });

        // Check for convergence
        if (centroids.every((centroid, i) => 
            euclideanDistance(centroid, newCentroids[i]) < 1)) {
            break;
        }

        centroids = newCentroids;
    }

    return centroids;
}

export function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
  
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
  
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}
  
export function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
  
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
  
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function lerpHSLA(color1, color2, t) {
    return color1.map((v, i) => {
      if (i === 0) { // Hue
        const d = color2[i] - v;
        return (v + (d > 180 || d < -180 ? d - 360 * Math.sign(d) : d) * t + 360) % 360;
      }
      return v + (color2[i] - v) * t; // Linear interpolation for S, L, A
    });
}

function euclideanDistance(a, b) {
    return Math.sqrt(
        Math.pow(a[0] - b[0], 2) +
        Math.pow(a[1] - b[1], 2) +
        Math.pow(a[2] - b[2], 2)
    );
}

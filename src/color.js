// BT.601 YCbCr, all components 0..1. The fragment shader in renderer.js and
// the smart-eraser filter in mask.js use the same formulas; keep them in sync.
export function ycbcr(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255;
  const y = 0.299 * R + 0.587 * G + 0.114 * B;
  return [y, 0.5 + (B - y) * 0.564, 0.5 + (R - y) * 0.713];
}

export const LUMA_WEIGHT = 0.25;

export function distance(a, b) {
  return Math.hypot(a[1] - b[1], a[2] - b[2]) + LUMA_WEIGHT * Math.abs(a[0] - b[0]);
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const lerp = (a, b, t) => a + (b - a) * t;

// Median [Y, Cb, Cr] of a grid of samples from the central 80% of the quad.
// `image` is { data, width, height } (ImageData). Null when no sample is inside.
export function wallReference(image, corners, grid = 32) {
  const [tl, tr, br, bl] = corners;
  const ys = [], cbs = [], crs = [];
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const u = 0.1 + (0.8 * (i + 0.5)) / grid;
      const v = 0.1 + (0.8 * (j + 0.5)) / grid;
      const x = lerp(lerp(tl[0], tr[0], u), lerp(bl[0], br[0], u), v);
      const y = lerp(lerp(tl[1], tr[1], u), lerp(bl[1], br[1], u), v);
      if (x < 0 || x >= 1 || y < 0 || y >= 1) continue;
      const index = (Math.floor(y * image.height) * image.width + Math.floor(x * image.width)) * 4;
      const c = ycbcr(image.data[index], image.data[index + 1], image.data[index + 2]);
      ys.push(c[0]); cbs.push(c[1]); crs.push(c[2]);
    }
  }
  if (ys.length === 0) return null;
  return [median(ys), median(cbs), median(crs)];
}

// Sensitivity 0..1 -> distance threshold of the automatic mask.
// 0 turns the mask off (threshold above any possible distance).
export function threshold(sensitivity) {
  if (sensitivity <= 0) return 10;
  const t = Math.min(1, Math.max(0, (sensitivity - 0.01) / 0.99));
  return 0.30 + (0.03 - 0.30) * t;
}

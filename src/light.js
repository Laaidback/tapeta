// Smoothed wall luminance for walls that already have a pattern (old
// wallpaper). Shading from the raw photo would print the old pattern through
// the new wallpaper; a heavy blur keeps only the large light and shadow.
import { percentile } from './color.js';

export const GRID = 96;       // cells along the longer side of the photo
export const RADIUS = 4;      // box blur radius in cells
export const PASSES = 3;
const ERASED_BELOW = 64;      // mask value under which a pixel counts as erased

// Mean luminance (0..1) per cell. `image` is { data, width, height } (ImageData).
export function lightGrid(image, size = GRID) {
  const scale = Math.min(1, size / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const sum = new Float32Array(width * height);
  const count = new Uint32Array(width * height);
  for (let y = 0; y < image.height; y++) {
    const row = Math.min(height - 1, Math.floor((y * height) / image.height)) * width;
    for (let x = 0; x < image.width; x++) {
      const cell = row + Math.min(width - 1, Math.floor((x * width) / image.width));
      const i = (y * image.width + x) * 4;
      sum[cell] += 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
      count[cell]++;
    }
  }
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = count[i] ? sum[i] / count[i] / 255 : 0;
  return { data, width, height };
}

// True when (x, y) lies inside the convex quad, for either winding.
export function insideQuad(corners, x, y) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % 4];
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

// 1 for cells that show the wall, 0 for cells outside the quad or erased in
// the mask (furniture), so that neither darkens the wall next to it.
// `mask` is { data, width, height } with one byte per pixel, or null.
export function wallWeights(grid, corners, mask) {
  const weights = new Float32Array(grid.width * grid.height);
  for (let j = 0; j < grid.height; j++) {
    for (let i = 0; i < grid.width; i++) {
      const u = (i + 0.5) / grid.width;
      const v = (j + 0.5) / grid.height;
      if (!insideQuad(corners, u, v)) continue;
      if (mask) {
        const x = Math.min(mask.width - 1, Math.floor(u * mask.width));
        const y = Math.min(mask.height - 1, Math.floor(v * mask.height));
        if (mask.data[y * mask.width + x] < ERASED_BELOW) continue;
      }
      weights[j * grid.width + i] = 1;
    }
  }
  return weights;
}

function boxBlur(source, width, height, radius) {
  const pass = (input, output, horizontal) => {
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        let total = 0;
        for (let k = -radius; k <= radius; k++) {
          const x = horizontal ? i + k : i;
          const y = horizontal ? j : j + k;
          if (x >= 0 && x < width && y >= 0 && y < height) total += input[y * width + x];
        }
        output[j * width + i] = total;
      }
    }
  };
  const temporary = new Float32Array(source.length);
  const result = new Float32Array(source.length);
  pass(source, temporary, true);
  pass(temporary, result, false);
  return result;
}

// Weighted blur of the grid: cells with weight 0 do not contribute.
// Returns { data: Uint8Array (luminance 0..255), width, height, light }, where
// `light` (0..1) is the luminance of the lit wall, the 90th percentile.
export function smoothLight(grid, weights, radius = RADIUS, passes = PASSES) {
  const { width, height } = grid;
  let top = Float32Array.from(grid.data, (value, i) => value * weights[i]);
  let bottom = Float32Array.from(weights);
  for (let pass = 0; pass < passes; pass++) {
    top = boxBlur(top, width, height, radius);
    bottom = boxBlur(bottom, width, height, radius);
  }
  const wall = [];
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] > 0) wall.push(top[i] / bottom[i]);
  }
  const light = wall.length ? percentile(wall, 0.9) : 0.5;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const value = bottom[i] > 1e-6 ? top[i] / bottom[i] : light;
    data[i] = Math.round(Math.min(1, Math.max(0, value)) * 255);
  }
  return { data, width, height, light };
}

// Pure helpers for the "Obiekt" tool. A selection is one byte per pixel,
// 1 = selected.
import { LUMA_WEIGHT, patchColor } from './color.js';

// Magic wand: the connected region around photo pixel (cx, cy) whose color is
// within `limit` of the typical color at that point (color.patchColor,
// color.distance). `image` is { data, width, height } (ImageData).
// Returns { data, share }, where `share` is the selected fraction of the image.
export function colorRegion(image, cx, cy, limit) {
  const { data: pixels, width, height } = image;
  const [refY, refCb, refCr] = patchColor(image, cx, cy);
  const x = Math.min(width - 1, Math.max(0, Math.round(cx)));
  const y = Math.min(height - 1, Math.max(0, Math.round(cy)));
  const data = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let top = 0;
  let count = 0;
  const similar = (index) => {
    const R = pixels[index * 4] / 255, G = pixels[index * 4 + 1] / 255, B = pixels[index * 4 + 2] / 255;
    const luma = 0.299 * R + 0.587 * G + 0.114 * B;
    const cb = 0.5 + (B - luma) * 0.564;
    const cr = 0.5 + (R - luma) * 0.713;
    return Math.hypot(cb - refCb, cr - refCr) + LUMA_WEIGHT * Math.abs(luma - refY) < limit;
  };
  const visit = (index) => {
    if (data[index] || !similar(index)) return;
    data[index] = 1;
    stack[top++] = index;
  };
  data[y * width + x] = 1; // the touched pixel is always selected
  stack[top++] = y * width + x;
  while (top) {
    const index = stack[--top];
    count++;
    const column = index % width;
    if (column > 0) visit(index - 1);
    if (column < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index < data.length - width) visit(index + width);
  }
  return { data, share: count / data.length };
}

// Union of two selections of the same size; `a` may be null.
export function mergeSelection(a, b) {
  if (!a) return b;
  const out = new Uint8Array(b.length);
  for (let i = 0; i < out.length; i++) out[i] = a[i] | b[i];
  return out;
}

// Grows the selection by `radius` pixels so a cut covers the object's soft
// edge. Separable square dilation.
export function growSelection(data, width, height, radius) {
  if (radius <= 0) return data;
  const pass = (input, horizontal) => {
    const output = new Uint8Array(input.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let hit = 0;
        for (let k = -radius; k <= radius && !hit; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          if (xx >= 0 && xx < width && yy >= 0 && yy < height) hit = input[yy * width + xx];
        }
        output[y * width + x] = hit;
      }
    }
    return output;
  };
  return pass(pass(data, true), false);
}

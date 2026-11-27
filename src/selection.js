// Pure helpers for the "Obiekt" tool: turning a segmentation result into a
// selection (one byte per pixel, 1 = selected).

// The connected region around the touched point (u, v: 0..1) in which
// `category` (a category mask, one byte per pixel) keeps the same value.
// Stray patches of the same category elsewhere are left out.
// Returns { data, share }, where `share` is the selected fraction of the image.
export function objectAt(category, width, height, u, v) {
  const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
  const wanted = category[y * width + x];
  const data = new Uint8Array(width * height);
  const stack = [y * width + x];
  data[stack[0]] = 1;
  let count = 0;
  while (stack.length) {
    const index = stack.pop();
    count++;
    const column = index % width;
    const visit = (next) => {
      if (data[next] || category[next] !== wanted) return;
      data[next] = 1;
      stack.push(next);
    };
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

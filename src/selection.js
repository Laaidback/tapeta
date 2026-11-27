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

// Splits the inside of the wall quads into wall and not-wall from the model's
// answers. `runs` is one entry per wall: { category, u, v, corners } — the
// category mask for the seed point (u, v) inside that wall's quad `corners`
// (normalized). `inside(corners, x, y)` tests a point against a quad.
// Returns { wall, other, share }: two selections and the wall's share of the
// quads' area. `other` is grown by `grow` pixels so the wallpaper keeps off
// the edges of furniture.
export function wallSelection(runs, width, height, inside, grow = 0) {
  const wall = new Uint8Array(width * height);
  const quads = new Uint8Array(width * height);
  runs.forEach(({ category, u, v, corners }) => {
    const sx = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
    const sy = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
    const wanted = category[sy * width + sx];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!inside(corners, (x + 0.5) / width, (y + 0.5) / height)) continue;
        const index = y * width + x;
        quads[index] = 1;
        if (category[index] === wanted) wall[index] = 1;
      }
    }
  });
  let other = new Uint8Array(width * height);
  let area = 0;
  for (let i = 0; i < other.length; i++) {
    if (!quads[i]) continue;
    area++;
    if (!wall[i]) other[i] = 1;
  }
  other = growSelection(other, width, height, grow);
  let count = 0;
  for (let i = 0; i < wall.length; i++) {
    if (other[i]) wall[i] = 0;
    count += wall[i];
  }
  return { wall, other, share: area ? count / area : 0 };
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

// Corners order everywhere: top-left, top-right, bottom-right, bottom-left.
export const UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]];

// Gaussian elimination with partial pivoting. Returns null when singular.
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let k = row + 1; k < n; k++) sum -= M[row][k] * x[k];
    x[row] = sum / M[row][row];
  }
  return x;
}

// 3x3 matrix (row-major, 9 numbers) mapping each src[i] to dst[i], or null.
export function homography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return h ? [...h, 1] : null;
}

export function apply(m, [x, y]) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

export function isConvex(points) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % 4];
    const [cx, cy] = points[(i + 2) % 4];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-9) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

// Estimated wall width / height from the quad, measured in image pixels.
export function wallAspect(corners, width, height) {
  const length = (a, b) => Math.hypot((a[0] - b[0]) * width, (a[1] - b[1]) * height);
  const [tl, tr, br, bl] = corners;
  const w = (length(tl, tr) + length(bl, br)) / 2;
  const h = (length(tl, bl) + length(tr, br)) / 2;
  return w / Math.max(h, 1e-6);
}

// Row-major 3x3 -> column-major array for gl.uniformMatrix3fv.
export function toGL(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

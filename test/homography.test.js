import test from 'node:test';
import assert from 'node:assert/strict';
import { UNIT, homography, apply, isConvex, wallAspect, toGL } from '../src/homography.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const QUAD = [[0.1, 0.08], [0.9, 0.12], [0.9, 0.72], [0.1, 0.76]];

test('homography maps the quad corners onto the unit square', () => {
  const m = homography(QUAD, UNIT);
  QUAD.forEach((corner, i) => {
    const [u, v] = apply(m, corner);
    near(u, UNIT[i][0]);
    near(v, UNIT[i][1]);
  });
});

test('homography of the unit square onto itself is the identity', () => {
  const m = homography(UNIT, UNIT);
  [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((value, i) => near(m[i], value));
});

test('homography returns null for a degenerate quad', () => {
  const point = [0.5, 0.5];
  assert.equal(homography([point, point, point, point], UNIT), null);
});

test('isConvex accepts a convex quad and rejects bow-tie and concave ones', () => {
  assert.equal(isConvex(QUAD), true);
  assert.equal(isConvex([[0, 0], [1, 0], [0, 1], [1, 1]]), false);
  assert.equal(isConvex([[0, 0], [1, 0], [0.2, 0.2], [0, 1]]), false);
});

test('wallAspect measures edges in pixels, not in normalized units', () => {
  const corners = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]];
  near(wallAspect(corners, 2000, 1000), 2);
});

test('toGL transposes to column-major order', () => {
  assert.deepEqual(toGL([1, 2, 3, 4, 5, 6, 7, 8, 9]), [1, 4, 7, 2, 5, 8, 3, 6, 9]);
});

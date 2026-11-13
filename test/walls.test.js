import test from 'node:test';
import assert from 'node:assert/strict';
import { addSecondWall, handlePoints, moveHandle, wallSpan } from '../src/walls.js';
import { isConvex } from '../src/homography.js';

const WALL = [[0.1, 0.1], [0.5, 0.2], [0.5, 0.8], [0.1, 0.9]];

test('addSecondWall: extends to the right and shares the corner edge', () => {
  const { corners, corners2 } = addSecondWall(WALL);
  assert.deepEqual(corners, WALL);
  assert.deepEqual(corners2[0], WALL[1]);
  assert.deepEqual(corners2[3], WALL[2]);
  assert.ok(corners2[1][0] > 0.6 && corners2[2][0] > 0.6);
  assert.ok(isConvex(corners2));
});

test('addSecondWall: splits the wall when there is no room on the right', () => {
  const full = [[0.05, 0.1], [0.97, 0.1], [0.97, 0.9], [0.05, 0.9]];
  const { corners, corners2 } = addSecondWall(full);
  assert.deepEqual(corners[0], full[0]);
  assert.deepEqual(corners2[1], full[1]);
  assert.deepEqual(corners[1], corners2[0]);
  assert.deepEqual(corners[2], corners2[3]);
  assert.ok(Math.abs(corners[1][0] - 0.51) < 1e-9);
});

test('handlePoints: four points for one wall, six for two', () => {
  assert.equal(handlePoints(WALL, null).length, 4);
  const { corners, corners2 } = addSecondWall(WALL);
  const points = handlePoints(corners, corners2);
  assert.equal(points.length, 6);
  assert.deepEqual(points[4], corners2[1]);
  assert.deepEqual(points[5], corners2[2]);
});

test('moveHandle: a shared corner moves in both walls', () => {
  const start = addSecondWall(WALL);
  const moved = moveHandle(start.corners, start.corners2, 1, [0.45, 0.25]);
  assert.deepEqual(moved.corners[1], [0.45, 0.25]);
  assert.deepEqual(moved.corners2[0], [0.45, 0.25]);
  const outer = moveHandle(start.corners, start.corners2, 4, [0.9, 0.15]);
  assert.deepEqual(outer.corners2[1], [0.9, 0.15]);
  assert.deepEqual(outer.corners, start.corners);
});

test('moveHandle: rejects a move that folds either wall', () => {
  const start = addSecondWall(WALL);
  assert.equal(moveHandle(start.corners, start.corners2, 4, [0.2, 0.5]), null);
  assert.equal(moveHandle(WALL, null, 0, [0.6, 0.5]), null);
  assert.ok(moveHandle(WALL, null, 0, [0.12, 0.12]));
});

test('wallSpan: widths add up and split is the first wall share', () => {
  const first = [[0, 0], [0.25, 0], [0.25, 1], [0, 1]];
  const second = [[0.25, 0], [1, 0], [1, 1], [0.25, 1]];
  assert.deepEqual(wallSpan(first, null, 400, 100), { aspect: 1, split: 1 });
  const both = wallSpan(first, second, 400, 100);
  assert.ok(Math.abs(both.aspect - 4) < 1e-9);
  assert.ok(Math.abs(both.split - 0.25) < 1e-9);
  const wider = wallSpan(first, second, 400, 100, 2);
  assert.ok(Math.abs(wider.aspect - 7) < 1e-9);
  assert.ok(Math.abs(wider.split - 1 / 7) < 1e-9);
});

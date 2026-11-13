import test from 'node:test';
import assert from 'node:assert/strict';
import { lightGrid, insideQuad, wallWeights, smoothLight } from '../src/light.js';

const FULL = [[0, 0], [1, 0], [1, 1], [0, 1]];

function grayImage(width, height, value) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = value(i % width, Math.floor(i / width));
    data.set([v, v, v, 255], i * 4);
  }
  return { data, width, height };
}

test('lightGrid: keeps the aspect ratio and averages each cell', () => {
  const grid = lightGrid(grayImage(200, 100, (x) => (x % 2 ? 255 : 0)), 20);
  assert.equal(grid.width, 20);
  assert.equal(grid.height, 10);
  grid.data.forEach((value) => assert.ok(Math.abs(value - 0.5) < 0.01));
});

test('insideQuad: works for both windings', () => {
  const quad = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]];
  assert.ok(insideQuad(quad, 0.5, 0.5));
  assert.ok(insideQuad([...quad].reverse(), 0.5, 0.5));
  assert.ok(!insideQuad(quad, 0.1, 0.5));
  assert.ok(!insideQuad(quad, 0.5, 0.9));
});

test('wallWeights: zero outside the quad and where the mask is erased', () => {
  const grid = { data: new Float32Array(100), width: 10, height: 10 };
  const mask = { data: new Uint8Array(100).fill(128), width: 10, height: 10 };
  mask.data[5 * 10 + 5] = 0;
  const weights = wallWeights(grid, [[0, 0], [0.5, 0], [0.5, 1], [0, 1]], mask);
  assert.equal(weights[2 * 10 + 2], 1);
  assert.equal(weights[2 * 10 + 7], 0);
  const all = wallWeights(grid, FULL, mask);
  assert.equal(all[5 * 10 + 5], 0);
  assert.equal(all[5 * 10 + 4], 1);
});

test('smoothLight: a fine pattern becomes an even surface', () => {
  const grid = lightGrid(grayImage(96, 96, (x, y) => ((Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? 230 : 120)), 96);
  const smooth = smoothLight(grid, wallWeights(grid, FULL, null));
  const inner = [];
  for (let j = 20; j < 76; j++) for (let i = 20; i < 76; i++) inner.push(smooth.data[j * 96 + i]);
  assert.ok(Math.max(...inner) - Math.min(...inner) <= 6, 'pattern is gone');
  assert.ok(Math.abs(smooth.light - 175 / 255) < 0.03);
});

test('smoothLight: a large shadow survives', () => {
  const grid = lightGrid(grayImage(96, 96, (x) => (x < 48 ? 200 : 100)), 96);
  const smooth = smoothLight(grid, wallWeights(grid, FULL, null));
  assert.ok(smooth.data[48 * 96 + 10] > 190);
  assert.ok(smooth.data[48 * 96 + 86] < 110);
});

test('smoothLight: erased furniture does not darken the wall around it', () => {
  const dark = (x, y) => x >= 40 && x < 60 && y >= 40 && y < 60;
  const grid = lightGrid(grayImage(96, 96, (x, y) => (dark(x, y) ? 20 : 200)), 96);
  const mask = { data: new Uint8Array(96 * 96).fill(128), width: 96, height: 96 };
  for (let y = 40; y < 60; y++) for (let x = 40; x < 60; x++) mask.data[y * 96 + x] = 0;
  const kept = smoothLight(grid, wallWeights(grid, FULL, null));
  const erased = smoothLight(grid, wallWeights(grid, FULL, mask));
  assert.ok(kept.data[50 * 96 + 37] < 180, 'halo before erasing');
  assert.ok(erased.data[50 * 96 + 37] >= 198, 'no halo after erasing');
});

test('smoothLight: no wall cells gives a neutral map', () => {
  const grid = { data: new Float32Array(16).fill(0.3), width: 4, height: 4 };
  const smooth = smoothLight(grid, new Float32Array(16));
  assert.equal(smooth.light, 0.5);
  smooth.data.forEach((value) => assert.equal(value, 128));
});

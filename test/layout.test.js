import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fitSize, powerOfTwo, fitView, zoomView, tileRepeat, coverScale, exportName,
} from '../src/layout.js';

test('fitSize shrinks the longer side to 2000 and keeps small images', () => {
  assert.deepEqual(fitSize(4000, 3000), { width: 2000, height: 1500 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
});

test('powerOfTwo rounds to the nearest power of two, capped', () => {
  assert.equal(powerOfTwo(1000), 1024);
  assert.equal(powerOfTwo(700), 512);
  assert.equal(powerOfTwo(3000), 2048);
});

test('fitView centers the image inside the stage', () => {
  assert.deepEqual(fitView(400, 800, 2000, 1000), { x: 0, y: 300, w: 400, h: 200 });
});

test('zoomView zooms around a point, never below fit, never above max', () => {
  const fit = { x: 0, y: 300, w: 400, h: 200 };
  assert.deepEqual(zoomView(fit, fit, 200, 400, 2), { x: -200, y: 200, w: 800, h: 400 });
  assert.deepEqual(zoomView(fit, fit, 10, 10, 0.5), fit);
  assert.equal(zoomView(fit, fit, 200, 400, 100).w, 400 * 8);
});

test('tileRepeat keeps the tile undistorted', () => {
  // wall twice as wide as tall, square tile, 4 across -> 2 down
  assert.deepEqual(tileRepeat(4, 2, 1), [4, 2]);
});

test('coverScale crops the mural like object-fit: cover', () => {
  assert.deepEqual(coverScale(2, 1), [1, 0.5]);
  assert.deepEqual(coverScale(1, 2), [0.5, 1]);
});

test('exportName formats local date and time', () => {
  assert.equal(exportName(new Date(2026, 10, 11, 9, 5)), 'tapeta-2026-11-11-0905.jpg');
});

test('shrinkView: scales around the center', async () => {
  const { shrinkView } = await import('../src/layout.js');
  assert.deepEqual(shrinkView({ x: 10, y: 20, w: 100, h: 50 }, 0.5), { x: 35, y: 32.5, w: 50, h: 25 });
});

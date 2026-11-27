import test from 'node:test';
import assert from 'node:assert/strict';
import { Mask, NEUTRAL, ERASE, RESTORE, UNDO_LIMIT, union, similarFilter } from '../src/mask.js';
import { ycbcr, distance } from '../src/color.js';

test('a new mask is neutral everywhere', () => {
  const mask = new Mask(8, 8);
  assert.ok(mask.data.every((v) => v === NEUTRAL));
});

test('dab writes the value at the center and leaves pixels outside the radius', () => {
  const mask = new Mask(40, 40);
  mask.begin();
  const rect = mask.dab(20, 20, 6, ERASE);
  assert.equal(mask.data[20 * 40 + 20], ERASE);
  assert.equal(mask.data[20 * 40 + 30], NEUTRAL);
  assert.deepEqual(rect, { x0: 14, y0: 14, x1: 26, y1: 26 });
});

test('dab clips to the mask and returns null when fully outside', () => {
  const mask = new Mask(10, 10);
  mask.begin();
  assert.deepEqual(mask.dab(0, 0, 3, RESTORE), { x0: 0, y0: 0, x1: 3, y1: 3 });
  assert.equal(mask.dab(-50, -50, 3, RESTORE), null);
});

test('dab respects the filter', () => {
  const mask = new Mask(20, 20);
  mask.begin();
  mask.dab(10, 10, 5, ERASE, (index) => index % 20 >= 10);
  assert.equal(mask.data[10 * 20 + 10], ERASE);
  assert.equal(mask.data[10 * 20 + 8], NEUTRAL);
});

test('cancel restores the mask to the state before the stroke', () => {
  const mask = new Mask(20, 20);
  mask.begin();
  mask.dab(10, 10, 5, ERASE);
  const rect = mask.cancel();
  assert.ok(mask.data.every((v) => v === NEUTRAL));
  assert.deepEqual(rect, { x0: 5, y0: 5, x1: 15, y1: 15 });
  assert.equal(mask.undoStack.length, 0);
});

test('undo reverts strokes one by one', () => {
  const mask = new Mask(30, 30);
  mask.begin(); mask.dab(5, 5, 3, ERASE); mask.end();
  mask.begin(); mask.dab(20, 20, 3, RESTORE); mask.end();
  assert.deepEqual(mask.undo(), { x0: 17, y0: 17, x1: 23, y1: 23 });
  assert.equal(mask.data[20 * 30 + 20], NEUTRAL);
  assert.equal(mask.data[5 * 30 + 5], ERASE);
  mask.undo();
  assert.ok(mask.data.every((v) => v === NEUTRAL));
  assert.equal(mask.undo(), null);
});

test('the undo stack keeps at most UNDO_LIMIT strokes', () => {
  const mask = new Mask(10, 10);
  for (let i = 0; i < UNDO_LIMIT + 5; i++) {
    mask.begin(); mask.dab(5, 5, 2, ERASE); mask.end();
  }
  assert.equal(mask.undoStack.length, UNDO_LIMIT);
});

test('a stroke with no dabs adds nothing to the undo stack', () => {
  const mask = new Mask(10, 10);
  mask.begin();
  assert.equal(mask.end(), null);
  assert.equal(mask.undoStack.length, 0);
});

test('patch copies a rectangle row by row', () => {
  const mask = new Mask(4, 4);
  mask.data.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual([...mask.patch({ x0: 1, y0: 1, x1: 2, y1: 2 })], [6, 7, 10, 11]);
});

test('union grows a rectangle and tolerates null', () => {
  const a = { x0: 1, y0: 2, x1: 3, y1: 4 };
  assert.equal(union(null, a), a);
  assert.equal(union(a, null), a);
  assert.deepEqual(union(a, { x0: 0, y0: 3, x1: 9, y1: 3 }), { x0: 0, y0: 2, x1: 9, y1: 4 });
});

test('similarFilter agrees with color.distance', () => {
  const width = 4, height = 1;
  const pixels = [[200, 190, 170], [190, 181, 162], [90, 200, 240], [60, 57, 51]];
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((p, i) => data.set([...p, 255], i * 4));
  const filter = similarFilter({ data, width, height }, 0, 0, 0.08);
  const ref = ycbcr(...pixels[0]);
  pixels.forEach((p, i) => {
    assert.equal(filter(i), distance(ycbcr(...p), ref) < 0.08, `pixel ${i}`);
  });
});

test('fill: a rectangle polygon sets exactly its pixels and can be undone', () => {
  const mask = new Mask(10, 10);
  mask.begin();
  const rect = mask.fill([[2, 3], [6, 3], [6, 7], [2, 7]], ERASE);
  mask.end();
  assert.deepEqual(rect, { x0: 2, y0: 3, x1: 5, y1: 6 });
  assert.equal(mask.data.filter((value) => value === ERASE).length, 16);
  assert.equal(mask.data[3 * 10 + 2], ERASE);
  assert.equal(mask.data[3 * 10 + 6], NEUTRAL);
  mask.undo();
  assert.ok(mask.data.every((value) => value === NEUTRAL));
});

test('fill: a concave shape leaves its notch untouched', () => {
  const mask = new Mask(12, 12);
  mask.begin();
  // "U" shape: the notch between x 4..8 above y 6 stays neutral.
  mask.fill([[0, 0], [4, 0], [4, 6], [8, 6], [8, 0], [12, 0], [12, 12], [0, 12]], ERASE);
  mask.end();
  assert.equal(mask.data[2 * 12 + 6], NEUTRAL);
  assert.equal(mask.data[2 * 12 + 2], ERASE);
  assert.equal(mask.data[2 * 12 + 10], ERASE);
  assert.equal(mask.data[9 * 12 + 6], ERASE);
});

test('fill: clips to the mask and returns null when fully outside', () => {
  const mask = new Mask(8, 8);
  mask.begin();
  assert.deepEqual(mask.fill([[-5, -5], [3, -5], [3, 3], [-5, 3]], ERASE), { x0: 0, y0: 0, x1: 2, y1: 2 });
  assert.equal(mask.fill([[20, 20], [30, 20], [30, 30]], ERASE), null);
  mask.end();
});

test('stamp: sets pixels under a lower-resolution selection and can be undone', () => {
  const mask = new Mask(8, 8);
  const selection = new Uint8Array([0, 0, 0, 1]); // 2x2: bottom-right quarter
  mask.begin();
  const rect = mask.stamp(selection, 2, 2, ERASE);
  mask.end();
  assert.deepEqual(rect, { x0: 4, y0: 4, x1: 7, y1: 7 });
  assert.equal(mask.data.filter((value) => value === ERASE).length, 16);
  assert.equal(mask.stamp(new Uint8Array(4), 2, 2, ERASE), null);
  mask.undo();
  assert.ok(mask.data.every((value) => value === NEUTRAL));
});

test('similarFilter: a noisy start pixel still erases the object around it', () => {
  const data = new Uint8ClampedArray(20 * 20 * 4);
  for (let i = 0; i < 400; i++) data.set([40, 60, 140, 255], i * 4);
  data.set([250, 250, 250, 255], (10 * 20 + 10) * 4); // highlight under the finger
  const filter = similarFilter({ data, width: 20, height: 20 }, 10, 10);
  assert.ok(filter(5 * 20 + 5));
});

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

import test from 'node:test';
import assert from 'node:assert/strict';
import { objectAt, mergeSelection, growSelection } from '../src/selection.js';

test('objectAt: selects the category under the touched point', () => {
  const category = new Uint8Array([
    0, 0, 7, 7,
    0, 0, 7, 7,
  ]);
  const left = objectAt(category, 4, 2, 0.1, 0.5);
  assert.deepEqual([...left.data], [1, 1, 0, 0, 1, 1, 0, 0]);
  assert.equal(left.share, 0.5);
  const right = objectAt(category, 4, 2, 0.9, 0.9);
  assert.deepEqual([...right.data], [0, 0, 1, 1, 0, 0, 1, 1]);
  assert.equal(objectAt(category, 4, 2, 1, 1).data[7], 1); // edge clamps
});

test('objectAt: leaves out separate patches of the same category', () => {
  const category = new Uint8Array([
    5, 0, 0, 5,
    5, 0, 0, 5,
  ]);
  const left = objectAt(category, 4, 2, 0.1, 0.1);
  assert.deepEqual([...left.data], [1, 0, 0, 0, 1, 0, 0, 0]);
  assert.equal(left.share, 0.25);
});

test('mergeSelection: union, null on the left', () => {
  const a = new Uint8Array([1, 0, 0]);
  const b = new Uint8Array([0, 0, 1]);
  assert.equal(mergeSelection(null, b), b);
  assert.deepEqual([...mergeSelection(a, b)], [1, 0, 1]);
});

test('growSelection: grows by the radius in every direction', () => {
  const data = new Uint8Array(25);
  data[12] = 1; // center of 5x5
  const grown = growSelection(data, 5, 5, 1);
  assert.equal(grown.filter((value) => value).length, 9);
  assert.equal(grown[0], 0);
  assert.equal(grown[6], 1);
  assert.equal(growSelection(data, 5, 5, 0), data);
});

test('wallSelection: wall and not-wall inside the quad only', async () => {
  const { wallSelection } = await import('../src/selection.js');
  // 4x2: left half is the quad; category 3 under the seed, 9 is furniture.
  const category = new Uint8Array([
    3, 9, 3, 3,
    3, 3, 9, 9,
  ]);
  const inside = (corners, x) => x < corners;
  const found = wallSelection([{ category, u: 0.1, v: 0.1, corners: 0.5 }], 4, 2, inside);
  assert.deepEqual([...found.wall], [1, 0, 0, 0, 1, 1, 0, 0]);
  assert.deepEqual([...found.other], [0, 1, 0, 0, 0, 0, 0, 0]);
  assert.equal(found.share, 0.75);
});

test('wallSelection: growing the furniture takes wall away', async () => {
  const { wallSelection } = await import('../src/selection.js');
  const category = new Uint8Array(25).fill(1);
  category[12] = 2;
  const found = wallSelection([{ category, u: 0, v: 0, corners: null }], 5, 5, () => true, 1);
  assert.equal(found.other.filter((value) => value).length, 9);
  assert.equal(found.wall.filter((value) => value).length, 16);
});

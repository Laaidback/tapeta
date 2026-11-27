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

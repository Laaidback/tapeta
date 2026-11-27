import test from 'node:test';
import assert from 'node:assert/strict';
import { colorRegion, mergeSelection, growSelection } from '../src/selection.js';

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

function image(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...color(i % width, Math.floor(i / width)), 255], i * 4);
  return { data, width, height };
}

test('colorRegion: selects the touched object, not the wall or a separate twin', () => {
  // Two blue blocks on a beige wall; only the touched one is selected.
  const blue = (x, y) => y >= 5 && y < 15 && ((x >= 2 && x < 8) || (x >= 12 && x < 18));
  const room = image(20, 20, (x, y) => (blue(x, y) ? [40, 60, 140] : [200, 190, 170]));
  const region = colorRegion(room, 4, 10, 0.08);
  assert.equal(region.data.filter((value) => value).length, 60);
  assert.equal(region.data[10 * 20 + 4], 1);
  assert.equal(region.data[10 * 20 + 14], 0);
  assert.equal(region.data[2 * 20 + 4], 0);
  assert.equal(region.share, 60 / 400);
});

test('colorRegion: a higher limit takes in a similar shade', () => {
  const room = image(20, 1, (x) => (x < 10 ? [100, 100, 100] : [130, 130, 130]));
  assert.equal(colorRegion(room, 2, 0, 0.02).data.filter((value) => value).length, 10);
  assert.equal(colorRegion(room, 2, 0, 0.05).data.filter((value) => value).length, 20);
});

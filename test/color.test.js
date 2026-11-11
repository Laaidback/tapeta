import test from 'node:test';
import assert from 'node:assert/strict';
import { ycbcr, distance, median, wallReference, threshold } from '../src/color.js';

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

function solidImage(width, height, [r, g, b]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([r, g, b, 255], i * 4);
  return { data, width, height };
}

test('ycbcr: white and gray have neutral chroma', () => {
  const white = ycbcr(255, 255, 255);
  near(white[0], 1); near(white[1], 0.5); near(white[2], 0.5);
  const gray = ycbcr(100, 100, 100);
  near(gray[1], 0.5); near(gray[2], 0.5);
});

test('distance: a brightness-only change counts a quarter', () => {
  near(distance(ycbcr(200, 200, 200), ycbcr(100, 100, 100)), 0.25 * (100 / 255));
});

test('distance: a hue change at equal brightness counts more than a shadow', () => {
  const wall = ycbcr(200, 190, 170);
  const shadow = ycbcr(140, 133, 119);
  const sofa = ycbcr(90, 200, 240);
  assert.ok(distance(wall, sofa) > 2 * distance(wall, shadow));
});

test('median returns the middle value', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 3);
});

test('wallReference ignores furniture covering less than half of the wall', () => {
  const image = solidImage(40, 40, [200, 190, 170]);
  for (let y = 25; y < 40; y++) {
    for (let x = 0; x < 40; x++) image.data.set([40, 60, 200, 255], (y * 40 + x) * 4);
  }
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const expected = ycbcr(200, 190, 170);
  wallReference(image, corners).forEach((value, i) => near(value, expected[i]));
});

test('wallReference skips samples outside the photo and returns null with none', () => {
  const image = solidImage(10, 10, [200, 190, 170]);
  const outside = [[-0.2, -0.2], [-0.1, -0.2], [-0.1, -0.1], [-0.2, -0.1]];
  assert.equal(wallReference(image, outside), null);
});

test('threshold: 0 disables, higher sensitivity gives a lower threshold', () => {
  assert.ok(threshold(0) > 5);
  near(threshold(0.01), 0.30);
  near(threshold(1), 0.03);
  assert.ok(threshold(0.8) < threshold(0.2));
});

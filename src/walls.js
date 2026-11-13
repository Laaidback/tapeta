// Two walls that meet in a room corner. The first wall is the left one
// (`corners`), the second (`corners2`) shares its left edge with the right
// edge of the first: corners2[0] is corners[1] and corners2[3] is corners[2].
import { isConvex, wallAspect } from './homography.js';

const clamp = (value) => Math.min(0.98, Math.max(0.02, value));

// Returns { corners, corners2 } for a new second wall. It extends the first
// wall to the right; when there is no room there, the first wall is split in half.
export function addSecondWall(corners) {
  const [tl, tr, br, bl] = corners;
  const reach = 0.6;
  const top = [clamp(tr[0] + (tr[0] - tl[0]) * reach), clamp(tr[1] + (tr[1] - tl[1]) * reach)];
  const bottom = [clamp(br[0] + (br[0] - bl[0]) * reach), clamp(br[1] + (br[1] - bl[1]) * reach)];
  const extended = [tr, top, bottom, br];
  const wideEnough = Math.min(top[0] - tr[0], bottom[0] - br[0]) > 0.08;
  if (wideEnough && isConvex(extended)) return { corners, corners2: extended };
  const middleTop = [(tl[0] + tr[0]) / 2, (tl[1] + tr[1]) / 2];
  const middleBottom = [(bl[0] + br[0]) / 2, (bl[1] + br[1]) / 2];
  return {
    corners: [tl, middleTop, middleBottom, bl],
    corners2: [middleTop, tr, br, middleBottom],
  };
}

// The six handle points: first wall's four corners, then the second wall's
// top-right and bottom-right.
export function handlePoints(corners, corners2) {
  return corners2 ? [...corners, corners2[1], corners2[2]] : corners;
}

// Moves handle `index` to `point`. Returns { corners, corners2 }, or null when
// the move would fold a wall.
export function moveHandle(corners, corners2, index, point) {
  const first = corners.map((corner, i) => (i === index ? point : corner));
  if (!isConvex(first)) return null;
  if (!corners2) return { corners: first, corners2: null };
  const second = [first[1], index === 4 ? point : corners2[1], index === 5 ? point : corners2[2], first[2]];
  if (!isConvex(second)) return null;
  return { corners: first, corners2: second };
}

// Both walls as one surface: `aspect` is the total width / height and `split`
// the first wall's share of the width (1 for a single wall). `secondWidth`
// corrects the estimated width of the second wall.
export function wallSpan(corners, corners2, width, height, secondWidth = 1) {
  const first = wallAspect(corners, width, height);
  if (!corners2) return { aspect: first, split: 1 };
  const second = wallAspect(corners2, width, height) * secondWidth;
  return { aspect: first + second, split: first / (first + second) };
}

export const MAX_SIDE = 2000;

// Size of an image scaled so its longer side is at most `max`.
export function fitSize(width, height, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function powerOfTwo(n, max = 2048) {
  return Math.min(max, 2 ** Math.round(Math.log2(Math.max(1, n))));
}

// Rectangle (stage pixels) of the image shown "contain" inside the stage.
export function fitView(stageW, stageH, imageW, imageH, pad = 0) {
  const scale = Math.min((stageW - 2 * pad) / imageW, (stageH - 2 * pad) / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  return { x: (stageW - w) / 2, y: (stageH - h) / 2, w, h };
}

// `view` scaled by `scale` around its center.
export function shrinkView(view, scale) {
  const w = view.w * scale;
  const h = view.h * scale;
  return { x: view.x + (view.w - w) / 2, y: view.y + (view.h - h) / 2, w, h };
}

// Zoom `view` by `factor` around stage point (cx, cy). Returns `fit` at zoom <= 1.
export function zoomView(view, fit, cx, cy, factor, maxZoom = 8) {
  const current = view.w / fit.w;
  const next = Math.min(maxZoom, current * factor);
  if (next <= 1) return { ...fit };
  const f = next / current;
  return {
    x: cx - (cx - view.x) * f,
    y: cy - (cy - view.y) * f,
    w: view.w * f,
    h: view.h * f,
  };
}

// Texture repeats [across, down] for `repeats` tiles across the wall.
// Aspects are width / height.
export function tileRepeat(repeats, wallAspect, paperAspect) {
  return [repeats, (repeats * paperAspect) / wallAspect];
}

// Fraction [x, y] of the mural that is visible when it covers the wall.
export function coverScale(wallAspect, paperAspect) {
  return paperAspect > wallAspect
    ? [wallAspect / paperAspect, 1]
    : [1, paperAspect / wallAspect];
}

export function exportName(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `tapeta-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.jpg`;
}

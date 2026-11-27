import { LUMA_WEIGHT } from './color.js';

export const NEUTRAL = 128; // automatic mask decides
export const ERASE = 0;     // wallpaper removed
export const RESTORE = 255; // wallpaper forced
export const UNDO_LIMIT = 20;
export const SMART_LIMIT = 0.08;

// Rectangles are inclusive: { x0, y0, x1, y1 }.
export function union(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
  };
}

function copyRect(data, width, rect) {
  const w = rect.x1 - rect.x0 + 1;
  const h = rect.y1 - rect.y0 + 1;
  const out = new Uint8Array(w * h);
  for (let row = 0; row < h; row++) {
    const start = (rect.y0 + row) * width + rect.x0;
    out.set(data.subarray(start, start + w), row * w);
  }
  return out;
}

export class Mask {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height).fill(NEUTRAL);
    this.undoStack = [];
    this.snapshot = null;
    this.dirty = null;
  }

  begin() {
    this.snapshot = this.data.slice();
    this.dirty = null;
  }

  // Soft round dab. `filter(index)` may veto single pixels.
  // Returns the touched rectangle, or null when the dab misses the mask.
  dab(cx, cy, radius, value, filter) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius));
    if (x0 > x1 || y0 > y1) return null;
    const soft = Math.max(1, radius * 0.3);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > radius) continue;
        const index = y * this.width + x;
        if (filter && !filter(index)) continue;
        const strength = Math.min(1, (radius - dist) / soft);
        this.data[index] = Math.round(this.data[index] + (value - this.data[index]) * strength);
      }
    }
    const rect = { x0, y0, x1, y1 };
    this.dirty = union(this.dirty, rect);
    return rect;
  }

  // Fills a polygon (points in mask pixels, even-odd rule) with `value`.
  // Returns the touched rectangle, or null when nothing was filled.
  fill(points, value) {
    let top = Infinity, bottom = -Infinity;
    points.forEach(([, y]) => { top = Math.min(top, y); bottom = Math.max(bottom, y); });
    const y0 = Math.max(0, Math.ceil(top - 0.5));
    const y1 = Math.min(this.height - 1, Math.floor(bottom - 0.5));
    let rect = null;
    for (let y = y0; y <= y1; y++) {
      const center = y + 0.5;
      const crossings = [];
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        if ((ay <= center) === (by <= center)) continue;
        crossings.push(ax + ((center - ay) / (by - ay)) * (bx - ax));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const x0 = Math.max(0, Math.ceil(crossings[i] - 0.5));
        const x1 = Math.min(this.width - 1, Math.floor(crossings[i + 1] - 0.5));
        if (x0 > x1) continue;
        this.data.fill(value, y * this.width + x0, y * this.width + x1 + 1);
        rect = union(rect, { x0, y0: y, x1, y1: y });
      }
    }
    this.dirty = union(this.dirty, rect);
    return rect;
  }

  // Sets `value` wherever `selection` (one byte per pixel, any size, sampled
  // nearest) is non-zero. Returns the touched rectangle, or null.
  stamp(selection, width, height, value) {
    let rect = null;
    for (let y = 0; y < this.height; y++) {
      const row = Math.min(height - 1, Math.floor(((y + 0.5) * height) / this.height)) * width;
      for (let x = 0; x < this.width; x++) {
        if (!selection[row + Math.min(width - 1, Math.floor(((x + 0.5) * width) / this.width))]) continue;
        this.data[y * this.width + x] = value;
        rect = union(rect, { x0: x, y0: y, x1: x, y1: y });
      }
    }
    this.dirty = union(this.dirty, rect);
    return rect;
  }

  // Finishes the stroke. Returns its rectangle, or null when nothing was drawn.
  end() {
    const rect = this.dirty;
    if (rect && this.snapshot) {
      this.undoStack.push({ rect, pixels: copyRect(this.snapshot, this.width, rect) });
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    }
    this.snapshot = null;
    this.dirty = null;
    return rect;
  }

  // Drops the stroke in progress. Returns the rectangle that changed back.
  cancel() {
    const rect = this.dirty;
    if (this.snapshot) this.data = this.snapshot;
    this.snapshot = null;
    this.dirty = null;
    return rect;
  }

  // Reverts the last finished stroke. Returns its rectangle, or null.
  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    const { rect, pixels } = entry;
    const w = rect.x1 - rect.x0 + 1;
    for (let row = 0; row <= rect.y1 - rect.y0; row++) {
      this.data.set(pixels.subarray(row * w, (row + 1) * w), (rect.y0 + row) * this.width + rect.x0);
    }
    return rect;
  }

  patch(rect) {
    return copyRect(this.data, this.width, rect);
  }
}

// Filter for the smart eraser: true for pixels whose color is close to the
// pixel at (cx, cy). Same math as color.ycbcr + color.distance, inlined so the
// hot loop allocates nothing.
export function similarFilter(image, cx, cy, limit = SMART_LIMIT) {
  const { data, width, height } = image;
  const px = Math.min(width - 1, Math.max(0, Math.round(cx)));
  const py = Math.min(height - 1, Math.max(0, Math.round(cy)));
  const at = (index) => {
    const R = data[index * 4] / 255, G = data[index * 4 + 1] / 255, B = data[index * 4 + 2] / 255;
    const y = 0.299 * R + 0.587 * G + 0.114 * B;
    return [y, (B - y) * 0.564, (R - y) * 0.713];
  };
  const [refY, refCb, refCr] = at(py * width + px);
  return (index) => {
    const R = data[index * 4] / 255, G = data[index * 4 + 1] / 255, B = data[index * 4 + 2] / 255;
    const y = 0.299 * R + 0.587 * G + 0.114 * B;
    const cb = (B - y) * 0.564;
    const cr = (R - y) * 0.713;
    return Math.hypot(cb - refCb, cr - refCr) + LUMA_WEIGHT * Math.abs(y - refY) < limit;
  };
}

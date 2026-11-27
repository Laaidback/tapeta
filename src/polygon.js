// Polygon tool of the "Popraw" step: tap the corners of a piece of furniture,
// then cut the shape out of the wallpaper. The wallpaper is hidden while the
// shape is drawn (see `params` in app.js) so the furniture is visible.
import { ERASE, RESTORE } from './mask.js';

const $ = (id) => document.getElementById(id);
const GRAB = 22;     // CSS pixels around a point that grab it
const TAP_SLOP = 8;  // CSS pixels a finger may move and still count as a tap
const SVG = 'http://www.w3.org/2000/svg';

// `done(rect)` runs after a cut with the changed mask rectangle.
export function setupPolygon(ctx, done) {
  const { state, stage } = ctx;
  const shape = $('shape');
  const fill = $('shapeFill');
  const dots = $('shapeDots');
  let press = null;   // { x, y, index, moved }: index of the grabbed point or -1
  let cursor = null;  // image point under the mouse, for the rubber band

  const on = () => state.step === 4 && state.tool === 'polygon' && !!state.room;

  function stagePoint(event) {
    const box = stage.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  }

  function pointAt(x, y) {
    return state.polygon.findIndex((point) => {
      const [px, py] = ctx.toStage(...point);
      return Math.hypot(px - x, py - y) <= GRAB;
    });
  }

  function place() {
    const show = on();
    shape.toggleAttribute('hidden', !show);
    if (!show) return;
    const points = state.polygon.map((point) => ctx.toStage(...point));
    const line = cursor && points.length ? [...points, ctx.toStage(...cursor)] : points;
    fill.setAttribute('points', line.map((point) => point.join(',')).join(' '));
    while (dots.children.length > points.length) dots.lastChild.remove();
    while (dots.children.length < points.length) dots.append(document.createElementNS(SVG, 'circle'));
    points.forEach(([x, y], index) => {
      const dot = dots.children[index];
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', index === 0 ? 11 : 8);
      dot.classList.toggle('first', index === 0);
    });
  }

  function showUi() {
    $('cut').disabled = state.polygon.length < 3;
    $('addShape').disabled = state.polygon.length < 3;
    $('clearShape').disabled = state.polygon.length === 0;
  }

  function reset() {
    state.polygon = [];
    press = null;
    cursor = null;
    showUi();
    ctx.requestDraw();
  }

  function cut(value = ERASE) {
    if (state.polygon.length < 3) return;
    const points = state.polygon.map(([u, v]) => [u * state.room.width, v * state.room.height]);
    state.mask.begin();
    const rect = state.mask.fill(points, value);
    state.mask.end();
    state.polygonDone = true; // show the result until the next shape is started
    reset();
    done(rect);
  }

  $('cut').addEventListener('click', () => cut(ERASE));
  $('addShape').addEventListener('click', () => cut(RESTORE));
  $('clearShape').addEventListener('click', reset);
  ctx.onDraw(place);
  ctx.onStep(reset);
  showUi();

  return {
    reset,
    showUi,
    down(event) {
      state.polygonDone = false;
      const [x, y] = stagePoint(event);
      press = { x, y, index: pointAt(x, y), moved: false };
      ctx.requestDraw();
    },
    move(event) {
      if (!press) return;
      const [x, y] = stagePoint(event);
      if (Math.hypot(x - press.x, y - press.y) > TAP_SLOP) press.moved = true;
      if (press.index >= 0 && press.moved) {
        const point = ctx.toImage(event.clientX, event.clientY);
        state.polygon = state.polygon.map((other, i) => (i === press.index ? point : other));
        ctx.requestDraw();
      }
    },
    up(event) {
      if (!press) return;
      const { index, moved } = press;
      press = null;
      if (moved) return;
      if (index === 0 && state.polygon.length >= 3) {
        cut(); // a tap on the first point closes the shape
      } else if (index < 0) {
        state.polygon = [...state.polygon, ctx.toImage(event.clientX, event.clientY)];
        showUi();
        ctx.requestDraw();
      }
    },
    cancel() { press = null; },
    hover(event) {
      cursor = event ? ctx.toImage(event.clientX, event.clientY) : null;
      if (state.polygon.length) ctx.requestDraw();
    },
  };
}

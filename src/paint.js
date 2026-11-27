import { ERASE, RESTORE, similarFilter, union } from './mask.js';
import { zoomView } from './layout.js';
import { ycbcr } from './color.js';
import { setupPolygon } from './polygon.js';

const ERASE_TINT = [0.9, 0.2, 0.2];
const RESTORE_TINT = [0.2, 0.7, 0.4];

const $ = (id) => document.getElementById(id);

export function setupPaint(ctx) {
  const { state, stage } = ctx;
  const pointers = new Map(); // pointerId -> { x, y } in stage pixels
  let stroke = null;          // { last, value, filter }
  let pinch = null;           // { cx, cy, d }
  let mouse = null;           // last hover position { clientX, clientY }

  const active = () => state.step === 4 && !!state.mask;

  function stagePoint(event) {
    const box = stage.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function photoPoint(event) {
    const [u, v] = ctx.toImage(event.clientX, event.clientY);
    return [u * state.room.width, v * state.room.height];
  }

  function upload(rect) {
    if (!rect) return;
    ctx.renderer.updateMask(state.mask, rect);
    ctx.requestDraw();
  }

  // Brush radius in photo pixels. Constant size on screen: zooming in gives a
  // finer brush.
  function brushRadius() {
    const zoom = state.view.w / state.fit.w;
    return (state.brush * Math.max(state.room.width, state.room.height)) / zoom;
  }

  // Preview under the mouse of what a press would change. Touch has no hover.
  function showHover() {
    const visible = active() && mouse && !stroke && pointers.size === 0 && state.tool !== 'polygon';
    if (!visible) {
      if (state.hover) { state.hover = null; ctx.requestDraw(); }
      return;
    }
    const [u, v] = ctx.toImage(mouse.clientX, mouse.clientY);
    const x = Math.min(state.room.width - 1, Math.max(0, Math.round(u * state.room.width)));
    const y = Math.min(state.room.height - 1, Math.max(0, Math.round(v * state.room.height)));
    const index = (y * state.room.width + x) * 4;
    const { data } = state.roomData;
    state.hover = {
      u, v,
      radius: brushRadius(),
      pixel: state.room.width / state.view.w,
      smart: state.smart,
      ref: ycbcr(data[index], data[index + 1], data[index + 2]),
      color: state.tool === 'erase' ? ERASE_TINT : RESTORE_TINT,
    };
    ctx.requestDraw();
  }

  function dabLine(from, to) {
    const radius = brushRadius();
    const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / (radius / 3)));
    let rect = null;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      rect = union(rect, state.mask.dab(
        from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t,
        radius, stroke.value, stroke.filter,
      ));
    }
    upload(rect);
  }

  function pinchState() {
    const [a, b] = [...pointers.values()];
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  }

  function showUndo() {
    $('undo').disabled = !state.mask || state.mask.undoStack.length === 0;
  }

  stage.addEventListener('pointerdown', (event) => {
    if (!active()) return;
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, stagePoint(event));
    if (pointers.size === 1 && state.tool === 'polygon') {
      polygon.down(event);
    } else if (pointers.size === 1) {
      const point = photoPoint(event);
      state.mask.begin();
      stroke = {
        last: point,
        value: state.tool === 'erase' ? ERASE : RESTORE,
        filter: state.smart ? similarFilter(state.roomData, point[0], point[1]) : null,
      };
      dabLine(point, point);
      showHover();
    } else {
      polygon.cancel();
      if (stroke) { // a second finger turns the gesture into pan/zoom
        upload(state.mask.cancel());
        stroke = null;
      }
      pinch = pointers.size === 2 ? pinchState() : null;
    }
  });

  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) {
      if (event.pointerType === 'touch' || !active()) return;
      mouse = { clientX: event.clientX, clientY: event.clientY };
      if (state.tool === 'polygon') polygon.hover(event);
      showHover();
      return;
    }
    pointers.set(event.pointerId, stagePoint(event));
    if (pointers.size === 1 && state.tool === 'polygon') {
      polygon.move(event);
    } else if (stroke && pointers.size === 1) {
      const point = photoPoint(event);
      dabLine(stroke.last, point);
      stroke.last = point;
    } else if (pinch && pointers.size === 2) {
      const now = pinchState();
      const view = zoomView(state.view, state.fit, now.cx, now.cy, now.d / pinch.d);
      if (view.w > state.fit.w) {
        view.x += now.cx - pinch.cx;
        view.y += now.cy - pinch.cy;
      }
      state.view = view;
      pinch = now;
      ctx.requestDraw();
    }
  });

  function release(event) {
    if (!pointers.delete(event.pointerId)) return;
    if (stroke) {
      state.mask.end();
      stroke = null;
      ctx.updateLight();
      ctx.requestDraw();
      showUndo();
    }
    if (pointers.size === 0 && state.tool === 'polygon' && event.type === 'pointerup') polygon.up(event);
    else polygon.cancel();
    if (event.pointerType !== 'touch') mouse = { clientX: event.clientX, clientY: event.clientY };
    showHover();
    pinch = pointers.size === 2 ? pinchState() : null; // third finger lifted: restart from the two left
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('pointerleave', () => {
    mouse = null;
    polygon.hover(null);
    showHover();
  });

  stage.addEventListener('wheel', (event) => {
    if (!active()) return;
    event.preventDefault();
    const { x, y } = stagePoint(event);
    state.view = zoomView(state.view, state.fit, x, y, event.deltaY < 0 ? 1.15 : 1 / 1.15);
    showHover();
    ctx.requestDraw();
  }, { passive: false });

  const toolButtons = [...document.querySelectorAll('#tool button[data-tool]')];
  toolButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.tool = button.dataset.tool;
      toolButtons.forEach((other) => other.classList.toggle('on', other === button));
      state.polygonDone = false;
      polygon.reset();
    });
  });
  $('coverage').addEventListener('change', (event) => {
    state.coverage = event.target.checked;
    ctx.requestDraw();
  });
  $('smart').addEventListener('change', (event) => { state.smart = event.target.checked; });
  $('brush').addEventListener('input', (event) => { state.brush = Number(event.target.value) / 100; });
  $('undo').addEventListener('click', () => {
    upload(state.mask.undo());
    ctx.updateLight();
    ctx.requestDraw();
    showUndo();
  });

  const polygon = setupPolygon(ctx, (rect) => {
    upload(rect);
    ctx.updateLight();
    ctx.requestDraw();
    showUndo();
  });

  ctx.onStep(() => {
    mouse = null;
    showHover();
    showUndo();
  });
}

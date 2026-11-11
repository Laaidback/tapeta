import { ERASE, RESTORE, similarFilter, union } from './mask.js';
import { zoomView } from './layout.js';

const $ = (id) => document.getElementById(id);

export function setupPaint(ctx) {
  const { state, stage } = ctx;
  const pointers = new Map(); // pointerId -> { x, y } in stage pixels
  let stroke = null;          // { last, value, filter }
  let pinch = null;           // { cx, cy, d }

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

  function dabLine(from, to) {
    // Constant size on screen: zooming in gives a finer brush.
    const zoom = state.view.w / state.fit.w;
    const radius = (state.brush * Math.max(state.room.width, state.room.height)) / zoom;
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
    if (pointers.size === 1) {
      const point = photoPoint(event);
      state.mask.begin();
      stroke = {
        last: point,
        value: state.tool === 'erase' ? ERASE : RESTORE,
        filter: state.smart ? similarFilter(state.roomData, point[0], point[1]) : null,
      };
      dabLine(point, point);
    } else {
      if (stroke) { // a second finger turns the gesture into pan/zoom
        upload(state.mask.cancel());
        stroke = null;
      }
      pinch = pointers.size === 2 ? pinchState() : null;
    }
  });

  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, stagePoint(event));
    if (stroke && pointers.size === 1) {
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
      showUndo();
    }
    pinch = pointers.size === 2 ? pinchState() : null; // third finger lifted: restart from the two left
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  stage.addEventListener('wheel', (event) => {
    if (!active()) return;
    event.preventDefault();
    const { x, y } = stagePoint(event);
    state.view = zoomView(state.view, state.fit, x, y, event.deltaY < 0 ? 1.15 : 1 / 1.15);
    ctx.requestDraw();
  }, { passive: false });

  const toolButtons = [...document.querySelectorAll('#tool button[data-tool]')];
  toolButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.tool = button.dataset.tool;
      toolButtons.forEach((other) => other.classList.toggle('on', other === button));
    });
  });
  $('smart').addEventListener('change', (event) => { state.smart = event.target.checked; });
  $('brush').addEventListener('input', (event) => { state.brush = Number(event.target.value) / 100; });
  $('undo').addEventListener('click', () => {
    upload(state.mask.undo());
    showUndo();
  });

  ctx.onStep(showUndo);
}

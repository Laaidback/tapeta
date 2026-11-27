import { addSecondWall, handlePoints, moveHandle } from './walls.js';

const LOUPE = 120;      // CSS pixels
const MAGNIFY = 3;
const INSET = 22;       // half of the handle, CSS pixels
const clamp = (value) => Math.min(2, Math.max(-1, value)); // corners may lie outside the photo

export function setupCorners(ctx) {
  const { state } = ctx;
  const handles = [...document.querySelectorAll('.handle')];
  const outline = document.getElementById('outline');
  const quad = document.getElementById('quad');
  const seam = document.getElementById('seam');
  const toggle = document.getElementById('secondWall');
  const loupe = document.getElementById('loupe');
  const glass = loupe.getContext('2d');

  function place() {
    const show = state.step === 2 && !!state.room;
    outline.toggleAttribute('hidden', !show); // <svg> has no `hidden` property
    const points = handlePoints(state.corners, state.corners2);
    handles.forEach((handle, index) => {
      handle.hidden = !show || index >= points.length;
      if (handle.hidden) return;
      const [x, y] = ctx.toStage(...points[index]);
      handle.style.transform = `translate(${x}px, ${y}px)`;
    });
    seam.toggleAttribute('hidden', !state.corners2);
    if (!show) return;
    const [tl, tr, br, bl] = state.corners;
    const border = state.corners2 ? [tl, tr, state.corners2[1], state.corners2[2], br, bl] : state.corners;
    quad.setAttribute('points', border.map((c) => ctx.toStage(...c).join(',')).join(' '));
    if (state.corners2) {
      const [x1, y1] = ctx.toStage(...tr);
      const [x2, y2] = ctx.toStage(...br);
      seam.setAttribute('x1', x1); seam.setAttribute('y1', y1);
      seam.setAttribute('x2', x2); seam.setAttribute('y2', y2);
    }
  }

  // Magnified view of the photo around image point (u, v), shown above the finger.
  function showLoupe(u, v) {
    const source = (LOUPE / MAGNIFY) * (state.room.width / state.view.w); // photo pixels
    glass.fillStyle = '#2a2826';
    glass.fillRect(0, 0, loupe.width, loupe.height);
    glass.drawImage(
      state.room,
      u * state.room.width - source / 2, v * state.room.height - source / 2, source, source,
      0, 0, loupe.width, loupe.height,
    );
    glass.strokeStyle = '#fff';
    glass.lineWidth = 2;
    glass.beginPath();
    glass.moveTo(loupe.width / 2, loupe.height / 2 - 24);
    glass.lineTo(loupe.width / 2, loupe.height / 2 + 24);
    glass.moveTo(loupe.width / 2 - 24, loupe.height / 2);
    glass.lineTo(loupe.width / 2 + 24, loupe.height / 2);
    glass.stroke();

    const [x, y] = ctx.toStage(u, v);
    const top = y - LOUPE - 40 < 0 ? y + 40 : y - LOUPE - 40;
    loupe.style.transform = `translate(${x - LOUPE / 2}px, ${top}px)`;
    loupe.hidden = false;
  }

  handles.forEach((handle, index) => {
    handle.addEventListener('pointerdown', (event) => {
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener('pointermove', (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      // Keep the handle reachable: never let it leave the stage.
      const box = ctx.stage.getBoundingClientRect();
      const x = Math.min(box.right - INSET, Math.max(box.left + INSET, event.clientX));
      const y = Math.min(box.bottom - INSET, Math.max(box.top + INSET, event.clientY));
      const [u, v] = ctx.toImage(x, y);
      const point = [clamp(u), clamp(v)];
      const next = moveHandle(state.corners, state.corners2, index, point);
      if (!next) return; // ignore moves that would fold a wall
      state.corners = next.corners;
      state.corners2 = next.corners2;
      showLoupe(point[0], point[1]);
      ctx.requestDraw();
    });
    const release = () => {
      loupe.hidden = true;
      ctx.updateReference();
      ctx.requestDraw();
    };
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
  });

  toggle.addEventListener('click', () => {
    if (state.corners2) {
      state.corners2 = null;
    } else {
      const next = addSecondWall(state.corners);
      state.corners = next.corners;
      state.corners2 = next.corners2;
    }
    ctx.updateReference();
    ctx.updateUi();
    ctx.requestDraw();
  });

  ctx.onDraw(place);
}

import { isConvex } from './homography.js';

const LOUPE = 120;      // CSS pixels
const MAGNIFY = 3;
const INSET = 22;       // half of the handle, CSS pixels
const clamp = (value) => Math.min(1.2, Math.max(-0.2, value));

export function setupCorners(ctx) {
  const { state } = ctx;
  const handles = [...document.querySelectorAll('.handle')];
  const outline = document.getElementById('outline');
  const quad = document.getElementById('quad');
  const loupe = document.getElementById('loupe');
  const glass = loupe.getContext('2d');

  function place() {
    const show = state.step === 2 && !!state.room;
    outline.toggleAttribute('hidden', !show); // <svg> has no `hidden` property
    handles.forEach((handle, index) => {
      handle.hidden = !show;
      if (!show) return;
      const [x, y] = ctx.toStage(...state.corners[index]);
      handle.style.transform = `translate(${x}px, ${y}px)`;
    });
    if (show) {
      quad.setAttribute('points', state.corners.map((c) => ctx.toStage(...c).join(',')).join(' '));
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
      const next = state.corners.map((corner, i) => (i === index ? point : corner));
      if (!isConvex(next)) return; // ignore moves that would fold the quad
      state.corners = next;
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

  ctx.onDraw(place);
}

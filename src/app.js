import { loadImage } from './images.js';
import { createRenderer } from './renderer.js';
import { fitView } from './layout.js';
import { wallReference } from './color.js';
import { Mask } from './mask.js';
import { setupCorners } from './corners.js';
import { setupControls } from './controls.js';
import { setupPaint } from './paint.js';
import { setupOutput } from './output.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('view');
const LAST_STEP = 4;
const DEFAULT_CORNERS = [[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]];

const state = {
  step: 1,
  room: null,        // 2D canvas with the room photo
  roomData: null,    // ImageData of the room photo
  paper: null,       // 2D canvas with the wallpaper photo
  paperAspect: 1,
  corners: DEFAULT_CORNERS,
  tiled: true,
  repeats: 6,
  aspectFactor: 1,
  sensitivity: 0.5,
  shadow: 0.7,
  brightness: 1,
  ref: [0.5, 0.5, 0.5, 0.5], // wall Y, Cb, Cr and the luminance of the lit wall
  mask: null,
  fit: null,         // image rectangle in stage pixels at zoom 1
  view: null,        // current image rectangle in stage pixels
  showOriginal: false,
  tool: 'erase',
  smart: true,
  brush: 0.04,       // brush radius as a fraction of the photo's longer side
};

const drawHooks = [];
const stepHooks = [];

const renderer = createRenderer(canvas, () => {
  if (state.room) renderer.setRoom(state.room);
  if (state.mask) renderer.setMask(state.mask);
  if (state.paper) renderer.setPaper(state.paper);
  requestDraw();
});
if (!renderer) $('fatal').hidden = false;

function params() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const v = state.view;
  return {
    ...state,
    hasPaper: !!state.paper,
    view: v ? { x: v.x / w, y: v.y / h, w: v.w / w, h: v.h / h } : null,
  };
}

let queued = false;
function requestDraw() {
  if (queued || !renderer) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    renderer.draw(params());
    drawHooks.forEach((hook) => hook());
  });
}

function resize() {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(stage.clientWidth * ratio));
  canvas.height = Math.max(1, Math.round(stage.clientHeight * ratio));
  if (state.room) {
    state.fit = fitView(stage.clientWidth, stage.clientHeight, state.room.width, state.room.height, 16);
    state.view = { ...state.fit };
  }
  requestDraw();
}

let toastTimer = 0;
function toast(text) {
  const element = $('toast');
  element.textContent = text;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 3000);
}

function updateReference() {
  if (!state.roomData) return;
  state.ref = wallReference(state.roomData, state.corners) || [0.5, 0.5, 0.5, 0.5];
}

function canAdvance() {
  if (state.step === 1) return !!state.room;
  if (state.step === 3) return !!state.paper;
  return state.step < LAST_STEP;
}

function updateUi() {
  document.querySelectorAll('#steps li').forEach((item, index) => {
    item.classList.toggle('on', index + 1 === state.step);
    item.classList.toggle('done', index + 1 < state.step);
  });
  document.querySelectorAll('.step').forEach((panel) => {
    panel.hidden = Number(panel.dataset.step) !== state.step;
  });
  $('output').hidden = state.step < 3;
  ['before', 'save', 'share'].forEach((id) => { $(id).disabled = !state.paper; });
  $('back').disabled = state.step === 1;
  $('next').hidden = state.step === LAST_STEP;
  $('next').disabled = !canAdvance();
}

function goTo(step) {
  state.step = step;
  if (state.fit) state.view = { ...state.fit };
  updateUi();
  stepHooks.forEach((hook) => hook());
  requestDraw();
}

function useRoom(image) {
  state.room = image;
  state.roomData = image.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, image.width, image.height);
  state.mask = new Mask(image.width, image.height);
  state.corners = DEFAULT_CORNERS;
  renderer.setRoom(image);
  renderer.setMask(state.mask);
  updateReference();
  resize();
  updateUi();
}

function usePaper(image) {
  state.paper = image;
  state.paperAspect = image.width / image.height;
  renderer.setPaper(image);
  updateUi();
  requestDraw();
}

async function pick(input, use) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    use(await loadImage(file));
  } catch {
    toast('Nie udało się otworzyć zdjęcia. Spróbuj innego.');
  }
}

// Shared with the per-step modules.
const ctx = {
  state,
  stage,
  renderer,
  params,
  requestDraw,
  toast,
  updateReference,
  updateUi,
  goTo,
  useRoom,
  usePaper,
  pick,
  onDraw: (hook) => drawHooks.push(hook),
  onStep: (hook) => stepHooks.push(hook),
  // Client (pointer event) coordinates -> normalized image coordinates.
  toImage(clientX, clientY) {
    const box = stage.getBoundingClientRect();
    return [
      (clientX - box.left - state.view.x) / state.view.w,
      (clientY - box.top - state.view.y) / state.view.h,
    ];
  },
  // Normalized image coordinates -> stage pixels.
  toStage(u, v) {
    return [state.view.x + u * state.view.w, state.view.y + v * state.view.h];
  },
};

if (renderer) {
  $('roomFile').addEventListener('change', (event) => pick(event.target, useRoom));
  $('back').addEventListener('click', () => goTo(state.step - 1));
  $('next').addEventListener('click', () => { if (canAdvance()) goTo(state.step + 1); });
  new ResizeObserver(resize).observe(stage);
  setupCorners(ctx);
  setupControls(ctx);
  setupPaint(ctx);
  setupOutput(ctx);

  updateUi();
  resize();

  if (new URLSearchParams(location.search).has('demo')) {
    import('./demo.js').then((demo) => demo.start(ctx));
  }
}

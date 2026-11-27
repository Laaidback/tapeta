// "Obiekt" tool of the "Popraw" step: tap a piece of furniture and the area of
// similar color around the tap is selected (a magic wand). "Wytnij" removes
// the wallpaper from the selection, "Dodaj tapetę" puts it there.
import { ERASE, RESTORE } from './mask.js';
import { colorRegion, mergeSelection, growSelection } from './selection.js';

const $ = (id) => document.getElementById(id);
const TAP_SLOP = 8;   // CSS pixels a finger may move and still count as a tap
const GROW = 0.002;   // act this fraction of the longer side past the outline
const START = 'Dotknij mebel albo przedmiot. Kolejne dotknięcia dodają do zaznaczenia.';
const UNDO_TIP = ' Dotknij zaznaczone miejsce, żeby je odznaczyć.';

// Slider 1..30 -> color distance limit (see color.distance).
const limitFor = (value) => 0.01 * value;

// `done(rect)` runs after a cut with the changed mask rectangle.
export function setupObject(ctx, done) {
  const { state, stage } = ctx;
  const overlay = $('pick');
  const status = $('objectStatus');
  const tolerance = $('tolerance');
  let taps = [];        // photo pixels [x, y]
  let regions = [];     // selection of each tap, same order
  let selection = null; // Uint8Array at photo resolution
  let press = null;     // { x, y, moved }

  const on = () => state.step === 4 && state.tool === 'object' && !!state.room;

  function place() {
    const show = on() && !!selection;
    overlay.hidden = !show;
    if (!show) return;
    overlay.style.left = `${state.view.x}px`;
    overlay.style.top = `${state.view.y}px`;
    overlay.style.width = `${state.view.w}px`;
    overlay.style.height = `${state.view.h}px`;
  }

  function paint() {
    const { width, height } = state.room;
    overlay.width = width;
    overlay.height = height;
    const image = new ImageData(width, height);
    const pixels = new Uint32Array(image.data.buffer);
    const tint = new Uint32Array(new Uint8Array([230, 60, 60, 150]).buffer)[0];
    for (let i = 0; i < selection.length; i++) {
      if (selection[i]) pixels[i] = tint;
    }
    overlay.getContext('2d').putImageData(image, 0, 0);
  }

  // Selection from all taps at the current tolerance.
  function select() {
    selection = null;
    regions = [];
    let share = 0;
    taps.forEach(([x, y]) => {
      const region = colorRegion(state.roomData, x, y, limitFor(Number(tolerance.value)));
      regions.push(region.data);
      selection = mergeSelection(selection, region.data);
      share = Math.max(share, region.share);
    });
    if (selection) paint();
    status.textContent = !selection ? START
      : share > 0.5 ? `Zaznaczyło się za dużo.${UNDO_TIP} Albo przesuń „Dokładność koloru” w lewo.`
        : `Za mało? Przesuń „Dokładność koloru” w prawo albo dotknij kolejną część.${UNDO_TIP}`;
    ['cutObject', 'addObject', 'clearObject'].forEach((id) => { $(id).disabled = !selection; });
    ctx.requestDraw();
  }

  function reset() {
    taps = [];
    press = null;
    select();
  }

  function apply(value) {
    if (!selection) return;
    const { width, height } = state.room;
    const grown = growSelection(selection, width, height, Math.round(GROW * Math.max(width, height)));
    state.mask.begin();
    const rect = state.mask.stamp(grown, width, height, value);
    state.mask.end();
    state.polygonDone = true; // show the result until the next touch
    reset();
    done(rect);
  }

  $('cutObject').addEventListener('click', () => apply(ERASE));
  $('addObject').addEventListener('click', () => apply(RESTORE));
  $('clearObject').addEventListener('click', reset);
  tolerance.addEventListener('change', select);
  ctx.onDraw(place);
  ctx.onStep(reset);

  return {
    reset,
    down(event) {
      state.polygonDone = false;
      const box = stage.getBoundingClientRect();
      press = { x: event.clientX - box.left, y: event.clientY - box.top, moved: false };
      ctx.requestDraw();
    },
    move(event) {
      if (!press) return;
      const box = stage.getBoundingClientRect();
      if (Math.hypot(event.clientX - box.left - press.x, event.clientY - box.top - press.y) > TAP_SLOP) press.moved = true;
    },
    up(event) {
      if (!press) return;
      const { moved } = press;
      press = null;
      if (moved) return;
      const [u, v] = ctx.toImage(event.clientX, event.clientY);
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return;
      const x = Math.floor(u * state.room.width);
      const y = Math.floor(v * state.room.height);
      const index = y * state.room.width + x;
      // A tap on a selected place takes back the latest tap that selected it.
      const hit = regions.findLastIndex((region) => region[index]);
      if (hit >= 0) taps.splice(hit, 1);
      else taps.push([x, y]);
      select();
    },
    cancel() { press = null; },
    hover() {},
  };
}

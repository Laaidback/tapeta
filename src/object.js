// "Obiekt" tool of the "Popraw" step: tap a piece of furniture, a model finds
// its outline, "Wytnij" removes the wallpaper from it (see segmenter.js).
import { ERASE } from './mask.js';
import { segmentAt } from './segmenter.js';
import { objectAt, mergeSelection, growSelection } from './selection.js';

const $ = (id) => document.getElementById(id);
const TAP_SLOP = 8;     // CSS pixels a finger may move and still count as a tap
const MAX_SHARE = 0.6;  // a "selection" larger than this is the background
const GROW = 0.003;     // cut this fraction of the longer side past the outline

// `done(rect)` runs after a cut with the changed mask rectangle.
export function setupObject(ctx, done) {
  const { state, stage } = ctx;
  const overlay = $('pick');
  const status = $('objectStatus');
  let selection = null; // { data, width, height }
  let press = null;     // { x, y, moved }
  let busy = false;

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
    if (!selection) return;
    overlay.width = selection.width;
    overlay.height = selection.height;
    const image = new ImageData(selection.width, selection.height);
    for (let i = 0; i < selection.data.length; i++) {
      if (!selection.data[i]) continue;
      image.data.set([230, 60, 60, 130], i * 4);
    }
    overlay.getContext('2d').putImageData(image, 0, 0);
  }

  function showUi(text) {
    if (text !== undefined) status.textContent = text;
    $('cutObject').disabled = !selection || busy;
    $('clearObject').disabled = !selection || busy;
  }

  function reset() {
    selection = null;
    press = null;
    showUi('Dotknij mebel albo przedmiot. Kolejne dotknięcia dodają do zaznaczenia.');
    ctx.requestDraw();
  }

  async function pick(u, v) {
    if (busy || u < 0 || u > 1 || v < 0 || v > 1) return;
    busy = true;
    showUi('Szukam obiektu… Pierwszy raz trwa dłużej (pobieranie).');
    try {
      const mask = await segmentAt(state.room, u, v);
      const found = { ...objectAt(mask.data, mask.width, mask.height, u, v), width: mask.width, height: mask.height };
      if (!on()) return;
      if (found.share > MAX_SHARE) {
        showUi('Nie udało się złapać obiektu. Dotknij w innym miejscu albo użyj wielokąta.');
      } else {
        const same = selection && selection.width === found.width && selection.height === found.height;
        selection = { data: mergeSelection(same ? selection.data : null, found.data), width: found.width, height: found.height };
        paint();
        showUi('Zaznaczone. Dotknij kolejną część albo „Wytnij”.');
      }
    } catch {
      showUi('Nie udało się wczytać rozpoznawania obiektów. Sprawdź internet i spróbuj ponownie.');
    } finally {
      busy = false;
      showUi();
      ctx.requestDraw();
    }
  }

  function cut() {
    if (!selection) return;
    const radius = Math.round(GROW * Math.max(selection.width, selection.height));
    const grown = growSelection(selection.data, selection.width, selection.height, radius);
    state.mask.begin();
    const rect = state.mask.stamp(grown, selection.width, selection.height, ERASE);
    state.mask.end();
    state.polygonDone = true; // show the result until the next touch
    reset();
    done(rect);
  }

  $('cutObject').addEventListener('click', cut);
  $('clearObject').addEventListener('click', reset);
  ctx.onDraw(place);
  ctx.onStep(reset);
  reset();

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
      if (!moved) pick(...ctx.toImage(event.clientX, event.clientY));
    },
    cancel() { press = null; },
    hover() {},
  };
}

import { wallSeed } from './color.js';
import { insideQuad } from './light.js';
import { ERASE, RESTORE } from './mask.js';
import { segmentAt } from './segmenter.js';
import { wallSelection } from './selection.js';

const $ = (id) => document.getElementById(id);
const MIN_WALL_SHARE = 0.1; // less of the quad than this: the model missed the wall
const MAX_WALL_SHARE = 0.97; // more than this: the model found nothing but wall
const EDGE = 0.002;         // keep the wallpaper this fraction of the longer side off furniture


export function setupControls(ctx) {
  const { state } = ctx;

  $('paperFile').addEventListener('change', (event) => ctx.pick(event.target, ctx.usePaper));

  const modeButtons = [...document.querySelectorAll('#mode button')];
  function showMode() {
    modeButtons.forEach((button) => {
      button.classList.toggle('on', (button.dataset.tiled === '1') === state.tiled);
    });
    $('patternRow').hidden = !state.tiled;
  }
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.tiled = button.dataset.tiled === '1';
      showMode();
      ctx.requestDraw();
    });
  });

  // [input id, state key, slider value -> state value]
  const sliders = [
    ['pattern', 'repeats', (value) => 21 - value],
    ['sensitivity', 'sensitivity', (value) => value / 100],
    ['shadow', 'shadow', (value) => value / 100],
    ['brightness', 'brightness', (value) => value / 100],
    ['aspect', 'aspectFactor', (value) => value / 100],
    ['secondWidth', 'secondWidth', (value) => value / 100],
  ];
  sliders.forEach(([id, key, convert]) => {
    const input = $(id);
    const apply = () => {
      state[key] = convert(Number(input.value));
      ctx.requestDraw();
    };
    input.addEventListener('input', apply);
    apply();
  });

  const patterned = $('patterned');
  const showPatterned = () => {
    $('sensitivity').disabled = state.patterned;
    $('sensitivityRow').classList.toggle('off', state.patterned);
    $('patternedHint').hidden = !state.patterned;
  };
  patterned.addEventListener('change', () => {
    state.patterned = patterned.checked;
    ctx.updateLight();
    showPatterned();
    ctx.requestDraw();
  });
  state.patterned = patterned.checked;
  showPatterned();

  // Asks the model which part of the marked wall is bare wall and puts the
  // wallpaper only there. One undo step; eraser and brush refine it.
  const find = $('findWall');
  find.addEventListener('click', async () => {
    if (!state.room) return;
    find.disabled = true;
    find.textContent = 'Szukam ściany…';
    try {
      const walls = [[state.corners, state.ref], [state.corners2, state.ref2]].filter(([corners]) => corners);
      const runs = [];
      let size = null;
      for (const [corners, ref] of walls) {
        const seed = wallSeed(state.roomData, corners, ref || state.ref);
        if (!seed) continue;
        const mask = await segmentAt(state.room, seed[0], seed[1]);
        size = mask;
        runs.push({ category: mask.data, u: seed[0], v: seed[1], corners });
      }
      const grow = size ? Math.round(EDGE * Math.max(size.width, size.height)) : 0;
      const found = size ? wallSelection(runs, size.width, size.height, insideQuad, grow) : null;
      if (!found || found.share < MIN_WALL_SHARE) {
        ctx.toast('Nie udało się rozpoznać ściany. Użyj suwaka „Czułość” albo gumki.');
      } else if (found.share > MAX_WALL_SHARE) {
        // Nothing to take the wallpaper off: leave the mask as it is.
        ctx.toast('Nie znalazłem mebli na ścianie. Nic nie zmieniłem.');
      } else {
        state.mask.begin();
        state.mask.stamp(found.other, size.width, size.height, ERASE);
        state.mask.stamp(found.wall, size.width, size.height, RESTORE);
        state.mask.end();
        ctx.renderer.setMask(state.mask);
        ctx.updateLight();
        ctx.toast('Ściana rozpoznana. Popraw gumką i pędzlem w kroku „Popraw”.');
      }
    } catch {
      ctx.toast('Nie udało się wczytać rozpoznawania. Sprawdź internet i spróbuj ponownie.');
    } finally {
      find.disabled = false;
      find.textContent = 'Rozpoznaj ścianę automatycznie';
      ctx.requestDraw();
    }
  });

  showMode();
}

const $ = (id) => document.getElementById(id);

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

  showMode();
}

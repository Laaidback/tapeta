import { exportName } from './layout.js';

const $ = (id) => document.getElementById(id);

export function setupOutput(ctx) {
  document.getElementById('coverage').addEventListener('change', (event) => {
    ctx.state.coverage = event.target.checked;
    ctx.requestDraw();
  });
  const { state } = ctx;
  const before = $('before');
  const share = $('share');

  // Hold to see the original photo.
  const show = (original) => {
    state.showOriginal = original;
    ctx.requestDraw();
  };
  before.addEventListener('pointerdown', () => show(true));
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
    before.addEventListener(type, () => show(false));
  });

  function render() {
    return new Promise((resolve) => {
      ctx.renderer.exportCanvas(ctx.params()).toBlob(resolve, 'image/jpeg', 0.92);
    });
  }

  $('save').addEventListener('click', async () => {
    const url = URL.createObjectURL(await render());
    const link = document.createElement('a');
    link.href = url;
    link.download = exportName(new Date());
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });

  // Hide the button where the browser cannot share files.
  const probe = new File([], 'tapeta.jpg', { type: 'image/jpeg' });
  const canShare = !!navigator.canShare && navigator.canShare({ files: [probe] });
  share.hidden = !canShare;
  share.addEventListener('click', async () => {
    const file = new File([await render()], exportName(new Date()), { type: 'image/jpeg' });
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      if (error.name !== 'AbortError') ctx.toast('Nie udało się udostępnić zdjęcia.');
    }
  });

  // Best effort: mobile browsers do not always ask.
  window.addEventListener('beforeunload', (event) => {
    if (state.room) event.preventDefault();
  });
}

// Development aid: `?demo` loads a synthetic room and wallpaper, `?demo=N`
// also jumps to step N, `&wall=pattern` draws old wallpaper on the wall,
// `&wall=corner` two walls. Lets the page be checked without file pickers.
const WALL = [[0.06, 0.05], [0.94, 0.10], [0.94, 0.70], [0.06, 0.78]];
// `&wall=corner`: a darker wall on the left that meets the lit wall in a corner.
const LEFT = [[0.04, 0.02], [0.34, 0.14], [0.34, 0.70], [0.04, 0.84]];
const RIGHT = [[0.34, 0.14], [0.94, 0.14], [0.94, 0.70], [0.34, 0.70]];

function room(kind) {
  const patterned = kind === 'pattern';
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1200;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const at = ([u, v]) => [u * canvas.width, v * canvas.height];

  g.fillStyle = '#efe9df'; // ceiling and side walls
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#8a6a4a'; // floor
  g.fillRect(0, 840, canvas.width, 360);

  g.beginPath(); // the wall
  WALL.forEach((corner, i) => (i ? g.lineTo(...at(corner)) : g.moveTo(...at(corner))));
  g.closePath();
  g.fillStyle = '#d8cfc0';
  g.fill();
  g.save();
  g.clip();
  const light = g.createLinearGradient(0, 0, canvas.width, 0); // light falls from the left
  light.addColorStop(0, 'rgba(255,255,255,0.25)');
  light.addColorStop(1, 'rgba(0,0,0,0.30)');
  g.fillStyle = light;
  g.fillRect(0, 0, canvas.width, canvas.height);
  if (patterned) { // old wallpaper: dark stripes and dots
    g.fillStyle = '#7a4a3a';
    for (let x = 0; x < canvas.width; x += 90) g.fillRect(x, 0, 30, canvas.height);
    g.fillStyle = '#3f6a5a';
    for (let y = 30; y < canvas.height; y += 90) {
      for (let x = 60; x < canvas.width; x += 90) {
        g.beginPath();
        g.arc(x, y, 16, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.25)'; // sofa shadow on the wall
  g.fillRect(380, 520, 760, 330);
  g.restore();

  if (kind === 'corner') {
    [[LEFT, '#a89f90'], [RIGHT, '#d8cfc0']].forEach(([quad, color]) => {
      g.beginPath();
      quad.forEach((corner, i) => (i ? g.lineTo(...at(corner)) : g.moveTo(...at(corner))));
      g.closePath();
      g.fillStyle = color;
      g.fill();
    });
  }
  g.fillStyle = '#6fb0f0'; // window (sky)
  g.fillRect(1080, 220, 260, 330);
  g.fillStyle = '#2f5f8f'; // sofa
  g.fillRect(420, 600, 680, 320);
  g.fillStyle = '#3f3a36'; // lamp pole
  g.fillRect(246, 420, 12, 480);
  g.fillStyle = '#f2c230'; // lamp shade
  g.beginPath();
  g.arc(252, 400, 80, 0, Math.PI * 2);
  g.fill();
  return canvas;
}

function paper() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f3ead8';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#2f6b4f';
  [[64, 64], [192, 192]].forEach(([x, y]) => {
    g.beginPath();
    g.arc(x, y, 44, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = '#c4553a';
  [[192, 64], [64, 192]].forEach(([x, y]) => g.fillRect(x - 24, y - 24, 48, 48));
  return canvas;
}

export function start(ctx) {
  const query = new URLSearchParams(location.search);
  const kind = query.get('wall');
  ctx.useRoom(room(kind));
  ctx.state.corners = kind === 'corner' ? LEFT : WALL;
  ctx.state.corners2 = kind === 'corner' ? RIGHT : null;
  ctx.updateReference();
  const step = Number(query.get('demo')) || 1;
  if (step >= 3) ctx.usePaper(paper());
  ctx.goTo(Math.min(4, Math.max(1, step)));
}

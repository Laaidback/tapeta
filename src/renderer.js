import { homography, UNIT, toGL, wallAspect } from './homography.js';
import { tileRepeat, coverScale, powerOfTwo } from './layout.js';
import { threshold } from './color.js';

const VERTEX = `
attribute vec2 aPos;
varying vec2 vP;
void main() {
  vP = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); // canvas 0..1, y down
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Color math must match src/color.js (ycbcr, distance).
const FRAGMENT = `
precision highp float;
varying vec2 vP;
uniform sampler2D uRoom;
uniform sampler2D uPaper;
uniform sampler2D uMask;
uniform mat3 uH;          // image (0..1) -> wall (0..1)
uniform vec4 uView;       // image rectangle inside the canvas: x, y, w, h (0..1)
uniform vec2 uRepeat;     // tiled: repeats across, down
uniform vec2 uCover;      // mural: visible fraction x, y
uniform float uTiled;
uniform float uPaperOn;   // 0 hides the wallpaper (no paper yet, or "before")
uniform float uThreshold;
uniform float uShadow;
uniform float uBrightness;
uniform vec3 uRef;        // wall reference Y, Cb, Cr
uniform float uLight;     // luminance of the lit wall
uniform vec3 uBackground;

vec3 ycc(vec3 c) {
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  return vec3(y, 0.5 + (c.b - y) * 0.564, 0.5 + (c.r - y) * 0.713);
}

void main() {
  vec2 uv = (vP - uView.xy) / uView.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(uBackground, 1.0);
    return;
  }
  vec3 room = texture2D(uRoom, uv).rgb;
  vec3 w = uH * vec3(uv, 1.0);
  vec2 wall = w.xy / w.z;
  float edge = 0.002;
  // No test on the sign of w.z: it is negative across the whole quad for
  // strongly foreshortened walls, and the 0..1 range checks are sufficient.
  float inside = smoothstep(0.0, edge, wall.x) * smoothstep(0.0, edge, 1.0 - wall.x)
    * smoothstep(0.0, edge, wall.y) * smoothstep(0.0, edge, 1.0 - wall.y);

  vec3 c = ycc(room);
  float d = length(c.yz - uRef.yz) + 0.25 * abs(c.x - uRef.x);
  float automatic = 1.0 - smoothstep(uThreshold, uThreshold + 0.03, d);
  float m = texture2D(uMask, uv).r; // 0 erase, 0.502 neutral, 1 restore
  float alpha = mix(automatic * clamp(m / 0.502, 0.0, 1.0), 1.0, clamp((m - 0.502) / 0.498, 0.0, 1.0));
  alpha *= inside * uPaperOn;

  vec2 paperUv = uTiled > 0.5
    ? wall * uRepeat
    : clamp((wall - 0.5) * uCover + 0.5, 0.002, 0.998); // REPEAT would bleed the opposite edge
  vec3 paper = texture2D(uPaper, paperUv).rgb;
  float shade = clamp(mix(1.0, c.x / max(uLight, 0.05), uShadow), 0.2, 1.2);
  vec3 covered = clamp(paper * uBrightness * shade, 0.0, 1.0);
  gl_FragColor = vec4(mix(room, covered, alpha), 1.0);
}`;

const UNIFORMS = [
  'uRoom', 'uPaper', 'uMask', 'uH', 'uView', 'uRepeat', 'uCover', 'uTiled',
  'uPaperOn', 'uThreshold', 'uShadow', 'uBrightness', 'uRef', 'uLight', 'uBackground',
];
const BACKGROUND = [0.165, 0.157, 0.149]; // #2a2826, same as --stage

// Returns null when WebGL is unavailable. `onRestored` runs after a lost
// context comes back; the caller must upload its images again.
export function createRenderer(canvas, onRestored) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;

  let uniform = {};
  let textures = {};

  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function init() {
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    uniform = {};
    UNIFORMS.forEach((name) => { uniform[name] = gl.getUniformLocation(program, name); });
    textures = { room: gl.createTexture(), paper: gl.createTexture(), mask: gl.createTexture() };
    gl.uniform1i(uniform.uRoom, 0);
    gl.uniform1i(uniform.uPaper, 1);
    gl.uniform1i(uniform.uMask, 2);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // 1x1 placeholder so drawing without a wallpaper does not sample an unbound texture.
    bind(1, textures.paper);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  }

  function bind(unit, texture) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  function clampLinear() {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  function setRoom(image) {
    bind(0, textures.room);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    clampLinear();
  }

  // WebGL 1 needs power-of-two textures for REPEAT and mipmaps.
  function setPaper(image) {
    const scaled = document.createElement('canvas');
    scaled.width = powerOfTwo(image.width);
    scaled.height = powerOfTwo(image.height);
    scaled.getContext('2d').drawImage(image, 0, 0, scaled.width, scaled.height);
    bind(1, textures.paper);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scaled);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  function setMask(mask) {
    bind(2, textures.mask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, mask.width, mask.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, mask.data);
    clampLinear();
  }

  // Uploads only the changed rectangle ({ x0, y0, x1, y1 }, inclusive).
  function updateMask(mask, rect) {
    bind(2, textures.mask);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, rect.x0, rect.y0, rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, mask.patch(rect),
    );
  }

  // p: { room, corners, view, hasPaper, showOriginal, tiled, repeats,
  //      paperAspect, aspectFactor, sensitivity, shadow, brightness, ref }
  // `view` is the image rectangle as fractions of the canvas.
  function draw(p) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (!p.room || !p.view) {
      gl.clearColor(...BACKGROUND, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    const matrix = homography(p.corners, UNIT) || [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const aspect = wallAspect(p.corners, p.room.width, p.room.height) * p.aspectFactor;
    gl.uniformMatrix3fv(uniform.uH, false, toGL(matrix));
    gl.uniform4f(uniform.uView, p.view.x, p.view.y, p.view.w, p.view.h);
    gl.uniform2fv(uniform.uRepeat, tileRepeat(p.repeats, aspect, p.paperAspect));
    gl.uniform2fv(uniform.uCover, coverScale(aspect, p.paperAspect));
    gl.uniform1f(uniform.uTiled, p.tiled ? 1 : 0);
    gl.uniform1f(uniform.uPaperOn, p.hasPaper && !p.showOriginal ? 1 : 0);
    gl.uniform1f(uniform.uThreshold, threshold(p.sensitivity));
    gl.uniform1f(uniform.uShadow, p.shadow);
    gl.uniform1f(uniform.uBrightness, p.brightness);
    gl.uniform3fv(uniform.uRef, p.ref.slice(0, 3));
    gl.uniform1f(uniform.uLight, p.ref[3]);
    gl.uniform3fv(uniform.uBackground, BACKGROUND);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Renders at the room photo's resolution and returns a 2D canvas copy.
  function exportCanvas(p) {
    const { width, height } = canvas;
    canvas.width = p.room.width;
    canvas.height = p.room.height;
    draw({ ...p, view: { x: 0, y: 0, w: 1, h: 1 }, showOriginal: false });
    const out = document.createElement('canvas');
    out.width = p.room.width;
    out.height = p.room.height;
    out.getContext('2d').drawImage(canvas, 0, 0);
    canvas.width = width;
    canvas.height = height;
    draw(p);
    return out;
  }

  canvas.addEventListener('webglcontextlost', (event) => event.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => { init(); onRestored(); });

  init();
  return { setRoom, setPaper, setMask, updateMask, draw, exportCanvas };
}

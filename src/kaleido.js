// Crystal drawing and the kaleidoscope renderer (T07, T08, T09).
// One function, renderKaleido, draws every kaleidoscope image: reference, player result and (Phase 2)
// the hidden colour-mask images used for matching. Same code path = an exact match is always possible.
import { getArt } from './assets.js';
import { COLORS } from './constants.js';

const SPRITE = 256;
const DEG = Math.PI / 180;

/**
 * Visible footprint of each shape inside its 256 px sprite box, as fractions of the box (width, height).
 * Used for hit tests and selection outlines. Matches the placeholders; final art should keep similar proportions.
 */
export const SHAPE_EXTENT = {
  pebble: [0.72, 0.52],
  stick: [0.88, 0.14],
  cylinder: [0.71, 0.33],
  ring: [0.77, 0.77],
  shard: [0.72, 0.72],
};

// Pure channel colours for mask mode: bit b is drawn in pass floor(b / 3), channel b % 3.
const CHANNEL_FILL = ['#ff0000', '#00ff00', '#0000ff'];

let palette = {};
const tinted = new Map();
const silhouettes = new Map();

/** Set crystal colours from config.colors; clears the tint cache. */
export function setPalette(colors) {
  palette = colors;
  tinted.clear();
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** T07: grey sprite tinted with a palette colour (multiply, then masked back to the sprite's alpha). Cached. */
export function crystalSprite(color, shape) {
  const key = `${color}-${shape}`;
  let c = tinted.get(key);
  if (c) return c;
  const art = getArt(`crystal-${shape}`);
  c = makeCanvas(SPRITE, SPRITE);
  const g = c.getContext('2d');
  if (art) g.drawImage(art.img, 0, 0, SPRITE, SPRITE);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = palette[color] ?? '#ff00ff';
  g.fillRect(0, 0, SPRITE, SPRITE);
  g.globalCompositeOperation = 'destination-in';
  if (art) g.drawImage(art.img, 0, 0, SPRITE, SPRITE);
  tinted.set(key, c);
  return c;
}

/** Opaque silhouette of a shape in one pure channel colour, for mask mode. Cached. */
function channelSilhouette(shape, channel) {
  const key = `${shape}-${channel}`;
  let c = silhouettes.get(key);
  if (c) return c;
  const art = getArt(`crystal-${shape}`);
  c = makeCanvas(SPRITE, SPRITE);
  const g = c.getContext('2d');
  if (art) g.drawImage(art.img, 0, 0, SPRITE, SPRITE);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = CHANNEL_FILL[channel];
  g.fillRect(0, 0, SPRITE, SPRITE);
  silhouettes.set(key, c);
  return c;
}

/** Side of a crystal's square sprite box in px, for a kaleidoscope drawn at radius R px. */
export function crystalBoxSize(c, R, config) {
  return (config.shapes[c.shape] ?? 0.15) * 2 * R * (c.s ?? 1);
}

/**
 * T08: draw one crystal. The context origin must be the kaleidoscope centre.
 * Kaleidoscope space has y up and radius 1; canvas y points down, so (x, y) -> (x * R, -y * R).
 * Rotation r is in degrees, clockwise on screen.
 * @param {'color' | 'mask'} mode  'mask' draws only crystals whose colour belongs to `pass` (0 or 1).
 */
export function drawCrystal(ctx, c, R, config, mode = 'color', pass = 0) {
  let img;
  if (mode === 'mask') {
    const bit = COLORS.indexOf(c.color);
    if (bit < 0 || Math.floor(bit / 3) !== pass) return;
    img = channelSilhouette(c.shape, bit % 3);
  } else {
    img = crystalSprite(c.color, c.shape);
  }
  const size = crystalBoxSize(c, R, config);
  ctx.save();
  ctx.translate(c.x * R, -c.y * R);
  if (c.r) ctx.rotate(c.r * DEG);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

const tiles = new Map();
function tileCanvas(size) {
  let c = tiles.get(size);
  if (!c) {
    c = makeCanvas(size, size);
    tiles.set(size, c);
  }
  return c;
}

/**
 * T09: draw a kaleidoscope image. The context origin must be the circle centre.
 * The chamber's crystals are drawn once into a tile (so overlapping glass blends, or in mask mode adds up
 * channel by channel), then the tile is stamped into each of N segments: rotate by i * 360/N, mirror every
 * odd segment across its centre line, clip to wedge 0. Transforms apply to points in reverse order, so the
 * mirror happens first and the rotation second; neighbouring segments then meet exactly like a mirror.
 * @param {{ mode?: 'color' | 'mask', angle?: number, pass?: number }} [opts] angle in radians (rotation search)
 */
export function renderKaleido(ctx, crystals, N, R, config, { mode = 'color', angle = 0, pass = 0 } = {}) {
  const size = Math.ceil(2 * R);
  const tile = tileCanvas(size);
  const g = tile.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, size, size);
  g.translate(size / 2, size / 2);
  if (mode === 'mask') g.globalCompositeOperation = 'lighter';
  else g.globalAlpha = config.crystalAlpha;
  for (const c of crystals) drawCrystal(g, c, R, config, mode, pass);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;

  const t = (2 * Math.PI) / N;
  const up = -Math.PI / 2;
  // Widen each wedge by about half a pixel in colour mode so antialiased clip edges leave no hairline seams.
  const eps = mode === 'mask' ? 0 : 0.6 / R;
  ctx.save();
  if (angle) ctx.rotate(angle);
  for (let i = 0; i < N; i++) {
    ctx.save();
    ctx.rotate(i * t);
    if (i % 2) ctx.scale(-1, 1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, up - t / 2 - eps, up + t / 2 + eps);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(tile, -size / 2, -size / 2);
    ctx.restore();
  }
  ctx.restore();
}

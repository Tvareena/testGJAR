// Matching (T16, T17, T18). Both layouts are drawn by the same renderer as colour-set masks: each pixel
// holds one bit per palette colour covering it, so overlapping glass scores the way it looks and drawing
// order never matters. The player's mask is then searched over rotations for the best score.
import { renderKaleido } from './kaleido.js';
import { COLORS } from './constants.js';

const DEG = Math.PI / 180;
const COARSE_STEP = 3; // degrees
const FINE_RANGE = 2;  // +-degrees around the best coarse angle, in 1 degree steps

const surfaces = new Map();
function surface(res) {
  let s = surfaces.get(res);
  if (s) return s;
  const c = document.createElement('canvas');
  c.width = res;
  c.height = res;
  const g = c.getContext('2d', { willReadFrequently: true });
  const inside = new Uint8Array(res * res);
  const r = res / 2;
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      inside[y * res + x] = dx * dx + dy * dy <= r * r ? 1 : 0;
    }
  }
  s = { c, g, inside };
  surfaces.set(res, s);
  return s;
}

const passOf = (c) => Math.floor(COLORS.indexOf(c.color) / 3);

/**
 * T16: colour-set mask of a kaleidoscope image. Two additive passes (red/blue/yellow, then
 * green/violet/white) into the R, G, B channels; a channel counts when its premultiplied value >= 128.
 * @returns {Uint8Array} res * res masks, bit b = COLORS[b]
 */
export function renderMask(crystals, N, config, angleDeg = 0, res = config.matchResolution) {
  const { g, inside } = surface(res);
  const out = new Uint8Array(res * res);
  const R = res / 2;
  for (let pass = 0; pass < 2; pass++) {
    if (!crystals.some((c) => passOf(c) === pass)) continue;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, res, res);
    g.translate(R, R);
    renderKaleido(g, crystals, N, R, config, { mode: 'mask', angle: angleDeg * DEG, pass });
    const d = g.getImageData(0, 0, res, res).data;
    const shift = pass * 3;
    for (let p = 0, i = 0; p < out.length; p++, i += 4) {
      if (!inside[p]) continue;
      const a = d[i + 3];
      if (a < 128) continue;
      // 32640 = 128 * 255: premultiplied channel value >= 128
      if (d[i] * a >= 32640) out[p] |= 1 << shift;
      if (d[i + 1] * a >= 32640) out[p] |= 2 << shift;
      if (d[i + 2] * a >= 32640) out[p] |= 4 << shift;
    }
  }
  return out;
}

function popcount(v) {
  v -= (v >> 1) & 0x55;
  v = (v & 0x33) + ((v >> 2) & 0x33);
  return (v + (v >> 4)) & 0x0f;
}

const offsetCache = new Map();
/** Neighbour offsets within radius k, nearest first (so an exact match is found first). */
function offsets(k) {
  let o = offsetCache.get(k);
  if (o) return o;
  o = [];
  for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) if (dx * dx + dy * dy <= k * k) o.push([dx, dy]);
  o.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
  offsetCache.set(k, o);
  return o;
}

/** Tolerance in mask pixels from config.matchTolerance (kaleidoscope-space units, radius = 1). */
export const tolerancePx = (config, res = config.matchResolution) => Math.round((config.matchTolerance ?? 0) * (res / 2));

/**
 * Rotate a mask by `deg` clockwise (same sense as canvas rotate) with nearest-pixel sampling.
 * Rotating in JavaScript avoids a GPU readback (getImageData) per test angle, which dominated the cost.
 */
function rotateMask(mask, res, deg) {
  if (deg === 0) return mask;
  const out = new Uint8Array(res * res);
  const a = deg * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const c = res / 2;
  for (let y = 0; y < res; y++) {
    const dy = y + 0.5 - c;
    for (let x = 0; x < res; x++) {
      const dx = x + 0.5 - c;
      // Inverse rotation: which source pixel lands here.
      const sx = Math.floor(dx * cos + dy * sin + c);
      const sy = Math.floor(-dx * sin + dy * cos + c);
      if (sx >= 0 && sy >= 0 && sx < res && sy < res) out[y * res + x] = mask[sy * res + sx];
    }
  }
  return out;
}

/** Half-resolution copy of a mask (nearest pixel), for the cheap coarse rotation pass. */
function downsample(mask, res) {
  const h = res >> 1;
  const out = new Uint8Array(h * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) out[y * h + x] = mask[(2 * y + 1) * res + 2 * x + 1];
  return out;
}

/**
 * T17: symmetric, tolerance-aware overlap score in 0..1.
 * Every covered pixel of each image looks for a pixel with the SAME colour set in the other image within
 * k pixels. score = matched pixels of both images / covered pixels of both images. Empty-on-both pixels
 * are ignored, so an empty or tiny attempt scores near 0. With partialCredit, a pixel whose best
 * neighbour shares only some colours scores shared / all colours present.
 * @param {(p: number) => void} [onMatched] called with each matched pixel index of B (for the glow mask)
 */
export function scoreMasks(A, B, res, k, partialCredit, onMatched) {
  const offs = offsets(k);
  let matched = 0;
  let total = 0;
  const sweep = (X, Y, report) => {
    for (let p = 0; p < X.length; p++) {
      const v = X[p];
      if (!v) continue;
      total++;
      const x = p % res;
      const y = (p / res) | 0;
      let best = 0;
      for (let j = 0; j < offs.length; j++) {
        const xx = x + offs[j][0];
        const yy = y + offs[j][1];
        if (xx < 0 || yy < 0 || xx >= res || yy >= res) continue;
        const w = Y[yy * res + xx];
        if (w === v) { best = 1; break; }
        if (partialCredit && (w & v)) {
          const f = popcount(w & v) / popcount(w | v);
          if (f > best) best = f;
        }
      }
      matched += best;
      if (report && best === 1) report(p);
    }
  };
  sweep(A, B, null);
  sweep(B, A, onMatched);
  return total ? matched / total : 0;
}

/**
 * The image has N mirror seams = N/2 mirror lines, so it repeats every 720/N degrees.
 * Only angles in [0, 720/N) need testing.
 */
export const rotationPeriod = (N) => 720 / N;

/**
 * T17: best score over rotations of the player's image. Coarse pass in 3 degree steps at half resolution,
 * then full-resolution 1 degree steps within +-2 degrees of the two best coarse angles.
 * @param {number} [baseAngleDeg] extra rotation applied to the player's image (used by the self-test)
 * @returns {{ score: number, angle: number, mask: Uint8Array | null }} angle in degrees, clockwise
 */
export function bestMatch(refMask, crystals, N, config, baseAngleDeg = 0) {
  if (crystals.length === 0) return { score: 0, angle: 0, mask: null };
  const res = config.matchResolution;
  const period = rotationPeriod(N);
  const wrap = (a) => ((a % period) + period) % period;

  // The player's mask is drawn once; every test angle rotates it in memory.
  const base = renderMask(crystals, N, config, baseAngleDeg, res);

  // Coarse pass: half-resolution masks, keep the two best angles.
  const small = res >> 1;
  const refSmall = downsample(refMask, res);
  const baseSmall = downsample(base, res);
  const kSmall = tolerancePx(config, small);
  const coarse = [];
  for (let a = 0; a < period; a += COARSE_STEP) {
    const mask = rotateMask(baseSmall, small, a);
    coarse.push({ angle: a, score: scoreMasks(refSmall, mask, small, kSmall, config.partialCredit) });
  }
  coarse.sort((x, y) => y.score - x.score);

  // Fine pass at full resolution around the best candidates. Symmetric layouts often score the same at
  // several angles; ties go to the smallest turn so the activation animation never spins needlessly.
  const turn = (a) => Math.min(a, period - a);
  const better = (score, a, best) => score > best.score + 1e-9
    || (Math.abs(score - best.score) <= 1e-9 && turn(a) < turn(best.angle));
  const k = tolerancePx(config, res);
  const tried = new Set();
  let best = { angle: 0, score: -1, mask: null };
  const candidates = [coarse[0], coarse[1], coarse.find((c) => c.angle === 0)].filter(Boolean);
  for (const cand of candidates) {
    if (cand !== coarse[0] && cand.score < coarse[0].score - 0.05) continue; // only near-ties besides the best
    for (let d = -FINE_RANGE; d <= FINE_RANGE; d++) {
      const a = wrap(cand.angle + d);
      if (tried.has(a)) continue;
      tried.add(a);
      const mask = rotateMask(base, res, a);
      const score = scoreMasks(refMask, mask, res, k, config.partialCredit);
      if (better(score, a, best)) best = { angle: a, score, mask };
    }
  }
  // Report the turn as -period/2 .. +period/2 (the image repeats every period, so both are equivalent).
  if (best.angle > period / 2) best.angle -= period;
  return best;
}

/** White where the player's pixels match the reference (within tolerance), for the activation glow (T34). */
export function matchMaskCanvas(refMask, playerMask, config) {
  const res = config.matchResolution;
  const c = document.createElement('canvas');
  c.width = res;
  c.height = res;
  if (!playerMask) return c;
  const g = c.getContext('2d');
  const img = g.createImageData(res, res);
  scoreMasks(refMask, playerMask, res, tolerancePx(config), false, (p) => {
    img.data[p * 4] = 255;
    img.data[p * 4 + 1] = 255;
    img.data[p * 4 + 2] = 255;
    img.data[p * 4 + 3] = 255;
  });
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * T18: every spell's solution must solve itself at 0 degrees, at a random whole-degree rotation, and with
 * its crystal list reversed (proves draw order is irrelevant). All three must reach 0.95.
 */
export function runSelfTest(levels, config) {
  const rows = levels.map((lv, i) => {
    const N = lv.segments;
    const ref = renderMask(lv.solution, N, config, 0);
    const rand = 1 + Math.floor(Math.random() * (rotationPeriod(N) - 1));
    const s0 = bestMatch(ref, lv.solution, N, config).score;
    const sRot = bestMatch(ref, lv.solution, N, config, rand).score;
    const sRev = bestMatch(ref, [...lv.solution].reverse(), N, config).score;
    const ok = s0 >= 0.95 && sRot >= 0.95 && sRev >= 0.95;
    return {
      spell: `${i + 1} ${lv.id}`, segments: N, at0: +s0.toFixed(3),
      [`rotated`]: `${+sRot.toFixed(3)} (${rand}°)`, reversed: +sRev.toFixed(3), result: ok ? 'OK' : 'BROKEN',
    };
  });
  console.table(rows);
  const broken = rows.filter((r) => r.result !== 'OK');
  if (broken.length) console.warn(`[selftest] ${broken.length} broken: ${broken.map((r) => r.spell).join(', ')}`);
  else console.info(`[selftest] all ${rows.length} spells OK`);
  return { rows, broken: broken.length };
}

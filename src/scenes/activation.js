// Casting ceremony (T32, T33, T34). The score is already known when this starts; the ceremony is a pure
// animation of that result, driven by a timeline whose beat lengths come from config.activation:
//   Lock -> Focus -> Align -> Overlap -> Score -> Resolve (success) or Fizzle.
// It draws over the puzzle screen: the puzzle's UI fades out, the two circles glide to the centre, the
// player's image turns to its best angle and overlaps the reference, matching areas glow, and a light fills
// the brass ring as the score counts up.
import { createTimeline, ease, lerp } from '../tween.js';
import { drawArt } from '../assets.js';
import { text, INK, INK_QUIET, GOLD } from '../ui.js';
import { play } from '../audio.js';

const DEG = Math.PI / 180;
const RING_WINDOW = 400; // transparent window radius in ring.png (900 px)
const FOCUS_REF = { cx: 640, cy: 480, r: 270 };
const FOCUS_RES = { cx: 1280, cy: 480, r: 270 };
const MERGE = { cx: 960, cy: 480, r: 300 };
const LIGHT_R = 1.17; // score light radius, just outside the brass ring (ring art reaches 1.125 r)

const lerpZone = (a, b, p) => ({ cx: lerp(a.cx, b.cx, p), cy: lerp(a.cy, b.cy, p), r: lerp(a.r, b.r, p) });

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Tint the white match mask with the spell colour (lightened) and make a blurred halo copy. */
function makeGlow(mask, color) {
  const [r, g, b] = hexToRgb(color);
  const light = `rgb(${Math.round(r + (255 - r) * 0.45)},${Math.round(g + (255 - g) * 0.45)},${Math.round(b + (255 - b) * 0.45)})`;
  const core = document.createElement('canvas');
  core.width = mask.width;
  core.height = mask.height;
  const c = core.getContext('2d');
  c.drawImage(mask, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = light;
  c.fillRect(0, 0, core.width, core.height);
  // Halo: shrink then let the upscale smooth it (works everywhere, no ctx.filter needed).
  const halo = document.createElement('canvas');
  halo.width = Math.max(8, mask.width >> 3);
  halo.height = halo.width;
  const h = halo.getContext('2d');
  h.imageSmoothingEnabled = true;
  h.drawImage(core, 0, 0, halo.width, halo.height);
  return { core, halo };
}

/**
 * @param {any} game
 * @param {{ refCanvas: HTMLCanvasElement, resCanvas: HTMLCanvasElement, refZone: any, resZone: any,
 *   result: { score: number, angle: number, pass: boolean, rating: string | null, threshold: number,
 *             mask: HTMLCanvasElement, color: string },
 *   levelId: string, skippable: boolean, calm: boolean, drawUI: (ctx: any, alpha: number) => void,
 *   onFinished: (pass: boolean) => void }} o
 */
export function startCeremony(game, o) {
  const A = game.data.config.activation;
  const t = (k, f) => game.data.t(k, f);
  const res = o.result;
  const glow = makeGlow(res.mask, res.color);

  const v = {
    uiAlpha: 1, bgDim: 0, bgTint: 0,
    ref: { ...o.refZone }, res: { ...o.resZone },
    resAngle: 0, resAlpha: 1, dull: 0, glow: 0,
    shown: 0, ring: 0, scoreAlpha: 0,
    flare: 0, textAlpha: 0, fizzleAlpha: 0,
    waiting: false,
  };
  let finished = false;

  const tFocus = A.lock;
  const tAlign = tFocus + A.focus;
  const tOverlap = tAlign + A.align;
  const tScore = tOverlap + A.overlap;
  const tResolve = tScore + A.score;
  const r0 = { ...o.refZone };
  const s0 = { ...o.resZone };
  const tl = createTimeline();

  // Lock: input is already locked by the puzzle; the UI fades and the room dims.
  tl.add(0, A.lock, (p) => { v.uiAlpha = 1 - p; v.bgDim = 0.5 * p; });
  tl.at(0, () => play('chime', { rate: 0.8 }));

  // Focus: both circles glide toward the centre and grow; the room takes on the spell's colour.
  tl.add(tFocus, A.focus, (p) => {
    v.ref = lerpZone(r0, FOCUS_REF, p);
    v.res = lerpZone(s0, FOCUS_RES, p);
    if (!o.calm) v.bgTint = 0.4 * p;
  }, ease.inOutCubic);
  tl.at(tFocus, () => play('chime', { rate: 0.9 }));

  // Align: the player's image turns to its best-match angle; the ring clicks into place.
  tl.add(tAlign, A.align, (p) => { v.resAngle = res.angle * p; }, ease.inOutCubic);
  tl.at(tAlign, () => play('chime', { rate: 1 }));
  tl.at(tAlign + A.align * 0.95, () => play('clink'));

  // Overlap: the result slides onto the reference at 50% opacity; matches glow, the rest goes dull.
  tl.add(tOverlap, A.overlap, (p) => {
    v.ref = lerpZone(FOCUS_REF, MERGE, p);
    v.res = lerpZone(FOCUS_RES, MERGE, p);
    v.resAlpha = 1 - 0.5 * p;
    v.dull = p;
  }, ease.inOutCubic);
  tl.add(tOverlap + A.overlap * 0.5, A.overlap * 0.5, (p) => { v.glow = p; });
  tl.at(tOverlap, () => play('chime', { rate: 1.1 }));

  // Score: light fills the ring and the % counts up; the chime rises every 20%.
  tl.add(tScore, A.score, (p) => {
    v.shown = res.score * p;
    v.ring = res.score * p;
    v.scoreAlpha = Math.min(1, p * 3);
  }, ease.outQuad);
  for (let k = 1; k <= 5; k++) {
    if (k / 5 > res.score) break;
    // outQuad reaches fraction f of the score at p = 1 - sqrt(1 - f)
    const f = k / 5 / res.score;
    tl.at(tScore + A.score * (1 - Math.sqrt(1 - Math.min(1, f))), () => play('chime', { rate: 1.1 + 0.1 * k }));
  }

  if (res.pass) {
    // Resolve (success): flare, colour flood, name and incantation; then wait for a click.
    tl.add(tResolve, A.resolve, (p) => {
      if (!o.calm) {
        v.flare = p < 0.25 ? p / 0.25 : 1 - 0.7 * ((p - 0.25) / 0.75);
        v.bgTint = lerp(0.4, 1, p);
      }
      v.textAlpha = Math.min(1, p * 2);
    });
    tl.at(tResolve, () => play('success'));
  } else {
    // Fizzle: the glow flickers and drains, the circles drift back, the UI returns.
    tl.add(tResolve, A.fizzle, (p) => {
      v.glow = (1 - p) * (0.55 + 0.45 * Math.sin(p * 38));
      v.ref = lerpZone(MERGE, r0, p);
      v.res = lerpZone(MERGE, s0, p);
      v.resAlpha = lerp(0.5, 1, p);
      v.resAngle = res.angle * (1 - p);
      v.dull = 1 - p;
      v.uiAlpha = p;
      v.bgDim = 0.5 * (1 - p);
      v.bgTint = o.calm ? 0 : 0.4 * (1 - p);
      v.ring = res.score * (1 - p);
      v.scoreAlpha = 1 - p;
      v.fizzleAlpha = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
    }, ease.inOutCubic);
    tl.at(tResolve, () => play('fizzle'));
  }

  function finish(pass) {
    if (finished) return;
    finished = true;
    o.onFinished(pass);
  }

  function drawCircle(ctx, canvas, z, angle, alpha) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(z.cx, z.cy, z.r, 0, Math.PI * 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#090c13';
    ctx.fill();
    ctx.clip();
    ctx.translate(z.cx, z.cy);
    if (angle) ctx.rotate(angle);
    ctx.drawImage(canvas, -z.r, -z.r, z.r * 2, z.r * 2);
    ctx.restore();
  }

  function drawRing(ctx, z) {
    const s = (z.r * 900) / RING_WINDOW;
    drawArt(ctx, 'ring', z.cx, z.cy, s, s);
  }

  return {
    /** Seconds from the start to Resolve (for skip). */
    resolveTime: tResolve,

    update(dt) {
      if (v.waiting || finished) return;
      tl.update(dt);
      if (tl.done) {
        if (res.pass) v.waiting = true;
        else finish(false);
      }
    },

    /** Any click or key: continue after success, or skip to Resolve when allowed. */
    input() {
      if (v.waiting) { finish(true); return; }
      if (o.skippable && tl.time < tResolve) tl.seek(tResolve);
    },

    draw(ctx) {
      // Room: dim, then the spell's colour.
      ctx.fillStyle = `rgba(4,6,10,${v.bgDim})`;
      ctx.fillRect(0, 0, 1920, 1080);
      if (v.bgTint > 0) {
        ctx.save();
        ctx.globalAlpha = 0.32 * v.bgTint;
        ctx.fillStyle = res.color;
        ctx.fillRect(0, 0, 1920, 1080);
        ctx.restore();
      }
      if (v.uiAlpha > 0.01) o.drawUI(ctx, v.uiAlpha);

      drawCircle(ctx, o.refCanvas, v.ref, 0, 1);
      drawCircle(ctx, o.resCanvas, v.res, v.resAngle * DEG, v.resAlpha);

      // Dull the merged image, then let matching areas glow in the spell's colour.
      const z = v.ref;
      if (v.dull > 0 || v.glow > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(z.cx, z.cy, z.r, 0, Math.PI * 2);
        ctx.clip();
        if (v.dull > 0) {
          ctx.fillStyle = `rgba(12,14,20,${0.5 * v.dull})`;
          ctx.fillRect(z.cx - z.r, z.cy - z.r, z.r * 2, z.r * 2);
        }
        if (v.glow > 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.imageSmoothingEnabled = true;
          ctx.globalAlpha = v.glow * 0.7;
          ctx.drawImage(glow.halo, z.cx - z.r, z.cy - z.r, z.r * 2, z.r * 2);
          ctx.globalAlpha = v.glow * 0.9;
          ctx.drawImage(glow.core, z.cx - z.r, z.cy - z.r, z.r * 2, z.r * 2);
        }
        ctx.restore();
      }

      drawRing(ctx, v.ref);
      if (Math.abs(v.res.cx - v.ref.cx) > 1 || Math.abs(v.res.r - v.ref.r) > 1) drawRing(ctx, v.res);

      // Score light around the brass ring, with a notch at the threshold.
      if (v.ring > 0 || v.scoreAlpha > 0) {
        const rr = z.r * LIGHT_R;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(10,12,18,0.6)';
        ctx.lineWidth = z.r * 0.04;
        ctx.globalAlpha = Math.max(v.scoreAlpha, 0.001);
        ctx.beginPath();
        ctx.arc(z.cx, z.cy, rr, 0, Math.PI * 2);
        ctx.stroke();
        if (v.ring > 0) {
          ctx.strokeStyle = res.pass ? GOLD : '#d9d4c7';
          ctx.shadowColor = res.color;
          ctx.shadowBlur = o.calm ? 0 : 18;
          ctx.beginPath();
          ctx.arc(z.cx, z.cy, rr, -Math.PI / 2, -Math.PI / 2 + v.ring * Math.PI * 2);
          ctx.stroke();
        }
        const ta = -Math.PI / 2 + res.threshold * Math.PI * 2;
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(z.cx + Math.cos(ta) * (rr - z.r * 0.05), z.cy + Math.sin(ta) * (rr - z.r * 0.05));
        ctx.lineTo(z.cx + Math.cos(ta) * (rr + z.r * 0.05), z.cy + Math.sin(ta) * (rr + z.r * 0.05));
        ctx.stroke();
        ctx.restore();
      }

      if (v.flare > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(z.cx, z.cy, 0, z.cx, z.cy, z.r * 1.5);
        g.addColorStop(0, `rgba(255,255,255,${0.75 * v.flare})`);
        g.addColorStop(0.5, `rgba(255,255,255,${0.25 * v.flare})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(z.cx - z.r * 1.5, z.cy - z.r * 1.5, z.r * 3, z.r * 3);
        ctx.restore();
      }

      if (v.scoreAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = v.scoreAlpha;
        text(ctx, `${Math.round(v.shown * 100)}%`, MERGE.cx, MERGE.cy + MERGE.r * LIGHT_R + 48, 56, INK, 'center', '600');
        ctx.restore();
      }

      if (res.pass && v.textAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = v.textAlpha;
        text(ctx, t(`spells.${o.levelId}.name`, o.levelId), 960, 52, 52, GOLD, 'center', '600');
        text(ctx, t(`spells.${o.levelId}.incantation`, ''), 960, 100, 28, INK, 'center');
        text(ctx, t(`ui.ratings.${res.rating}`, res.rating), 960, MERGE.cy + MERGE.r * LIGHT_R + 110, 38, GOLD, 'center', '600');
        ctx.restore();
        if (v.waiting) text(ctx, t('ui.continue', 'Click to continue'), 960, 1036, 28, INK_QUIET, 'center');
      }
      if (!res.pass && v.fizzleAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, v.fizzleAlpha);
        text(ctx, t('ui.fizzled', 'The spell fizzles'), 960, 80, 52, INK, 'center', '600');
        ctx.restore();
      }
      if (o.skippable && !v.waiting && tl.time < tResolve) {
        text(ctx, t('ui.skipHint', 'Click to skip'), 1880, 1046, 28, INK_QUIET, 'right');
      }
    },
  };
}

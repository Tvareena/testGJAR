// Puzzle screen (T10, T11, T13-T15, T19-T21). Owns all crystal logic.
// Run draws the result and shows the resonance meter; Activate scores the attempt and plays the casting
// ceremony (activation.js, T32-T34).
import { drawArt } from '../assets.js';
import { renderKaleido, drawCrystal, crystalSprite, crystalBoxSize, SHAPE_EXTENT } from '../kaleido.js';
import { renderMask, bestMatch, matchMaskCanvas } from '../match.js';
import { parseCrystalType, COLORS } from '../constants.js';
import { text, inRect, inBox, drawButton, drawIconButton, INK, INK_QUIET, GOLD } from '../ui.js';
import { play, toggleMute, isMuted } from '../audio.js';
import { createAuthorTools } from './author-tools.js';
import { startCeremony } from './activation.js';

/** T10: screen zones in design px (1920 x 1080). */
export const ZONES = {
  reference: { cx: 330, cy: 430, r: 250 },
  chamber: { x: 660, y: 110, w: 600, h: 700 },
  result: { cx: 1590, cy: 430, r: 250 },
  meter: { cx: 1590, cy: 742 },
  runBtn: { cx: 1480, cy: 806, w: 200, h: 76 },
  activateBtn: { cx: 1700, cy: 806, w: 200, h: 76 },
  tray: { cx: 960, cy: 960, w: 1600, h: 196 },
};

const CACHE = 512;          // offscreen size of each cached kaleidoscope image
const RING_WINDOW = 400;    // radius of the transparent window in ring.png (900 px)
const SLOT = 130;           // tray slot size
const SLOT_GAP = 26;
const SLOT_ART = 116;
// T39: on touch screens the 1920 x 1080 layout is shown at about 0.35 scale on a phone, so touch targets
// grow: bigger selection buttons, larger crystal hit boxes, padded button hit areas, and crystals dragged
// from the tray float above the finger so it never hides them.
// TOUCH_TARGET = 144 design px = 48 CSS px on a 360 px-tall phone in landscape (scale 0.333).
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const TOUCH_TARGET = 144;
const SEL_BTN = TOUCH ? TOUCH_TARGET : 64;  // selection button size
const SEL_SPACING = TOUCH ? 160 : 80;
const CHAMBER_MARGIN = 70;  // room around the wedge for overhanging crystals
const LIMIT = 1.2;          // kaleidoscope-space bound for crystal centres
const MIN_HIT = TOUCH ? TOUCH_TARGET / 2 : 24;  // minimum half-size of a crystal hit box
const LIFT = TOUCH ? 90 : 0;          // design px a new crystal floats above the finger
const BTN_PAD = TOUCH ? 10 : 0;       // extra hit area around buttons (at least TOUCH_TARGET on touch)
const DRAG_THRESHOLD = 6;
const RUN_ANIM = 0.7;       // seconds for the ring turn + bloom on Run
const DEG = Math.PI / 180;
const RESONANCE = ['low', 'medium', 'high'];
const MUTE_BTN = { cx: 1870, cy: 52, w: 56, h: 56 };
const minTouch = TOUCH ? TOUCH_TARGET : 0;
const padded = (b) => ({ ...b, w: Math.max(b.w + 2 * BTN_PAD, minTouch), h: Math.max(b.h + 2 * BTN_PAD, minTouch) });
const TUTORIAL_MIN_MS = 2500;
const TUTORIAL_BOX = { cx: 960, cy: 136, w: 1000, h: 52 }; // under the spell description

function makeCache() {
  const c = document.createElement('canvas');
  c.width = CACHE;
  c.height = CACHE;
  return c;
}

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const pick = (arr) => (Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : '');
const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

export function createPuzzleScene(game) {
  const refCanvas = makeCache();
  const resCanvas = makeCache();
  const s = {
    levelIndex: 0,
    level: null,
    segments: 4,
    tray: [],
    placed: [],
    selectedId: null,
    drag: null,
    hasResult: false,
    resultStale: false,
    nextId: 1,
    view: { S: 1, apexX: 0, apexY: 0, half: 0 },
    refMask: null,
    resonance: null,      // 'low' | 'medium' | 'high' | null (no fresh Run)
    lastRun: null,        // { score, angle } from the last Run
    runAnim: 1,           // 0..1 progress of the Run animation
    fizzles: 0,
    ghost: null,          // solution crystal outlined as a hint
    cast: null,           // casting ceremony in progress (activation.js); input goes to it
    author: false,        // author mode (?author), see author-tools.js
    decoys: [],           // author mode: extra tray crystals
    decoyMode: false,
    toast: null,          // { msg, until } short status message
    tutorial: null,       // { lines, idx, since } tutorial lines for this spell
    debugInfo: null,      // ?debug: { score, angle } of the current layout
  };

  const cfg = () => game.data.config;
  const t = (key, fallback) => game.data.t(key, fallback);
  const dirty = () => { game.dirty = true; };

  function results(id) {
    game.results[id] ??= { runs: 0, activations: 0, fizzles: 0, best: 0, rating: null };
    return game.results[id];
  }

  const passThreshold = () => Math.min(1, Math.max(0, s.level.threshold + cfg().difficultyOffset));

  function rating(score) {
    const b = cfg().ratingBands;
    if (score >= b.perfect) return 'perfect';
    if (score >= b.great) return 'great';
    return 'pass';
  }

  function resonanceOf(score) {
    const b = cfg().resonanceBands;
    if (score >= b.high) return 'high';
    if (score >= b.medium) return 'medium';
    return 'low';
  }

  // ---------- geometry ----------

  /** T11: fit wedge 0 into the chamber zone; narrow wedges (N = 12) get a larger scale. */
  function computeView(N) {
    const z = ZONES.chamber;
    const half = Math.PI / N;
    const wedgeW = 2 * Math.sin(half);
    const S = Math.min((z.w - 2 * CHAMBER_MARGIN) / wedgeW, z.h - 2 * CHAMBER_MARGIN);
    return { S, half, apexX: z.x + z.w / 2, apexY: z.y + z.h / 2 + S / 2 };
  }

  const toK = (p) => ({ x: (p.x - s.view.apexX) / s.view.S, y: (s.view.apexY - p.y) / s.view.S });
  /** Where a crystal dragged from the tray sits: above the finger on touch screens. */
  const lifted = (p) => ({ x: p.x, y: p.y - LIFT });
  const toScreen = (c) => ({ x: s.view.apexX + c.x * s.view.S, y: s.view.apexY - c.y * s.view.S });

  function snapPos(v) {
    const step = s.level.positionSnap ?? cfg().positionSnap;
    const snapped = step > 0 ? Math.round(v / step) * step : v;
    return Math.max(-LIMIT, Math.min(LIMIT, snapped));
  }
  const rotStep = () => s.level.rotationSnap ?? cfg().rotationSnap;

  function halfExtents(c) {
    const box = crystalBoxSize(c, s.view.S, cfg());
    const [ex, ey] = SHAPE_EXTENT[c.shape] ?? [0.7, 0.7];
    return [(ex * box) / 2, (ey * box) / 2];
  }

  /** Hit test on the crystal's rotated box, shrunk by 15%, never smaller than a fingertip. */
  function hitCrystal(p, c) {
    const sc = toScreen(c);
    const [hx, hy] = halfExtents(c);
    const dx = p.x - sc.x;
    const dy = p.y - sc.y;
    const a = c.r * DEG;
    const lx = dx * Math.cos(a) + dy * Math.sin(a);
    const ly = -dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) <= Math.max(MIN_HIT, hx * 0.85) && Math.abs(ly) <= Math.max(MIN_HIT, hy * 0.85);
  }

  const selected = () => s.placed.find((c) => c.id === s.selectedId) ?? null;

  /** T14: rotate left, rotate right, delete, placed above the crystal (below it near the top edge). */
  function selButtons(c) {
    const sc = toScreen(c);
    const [hx, hy] = halfExtents(c);
    const rr = Math.max(hx, hy) + 12;
    const gap = SEL_BTN * 0.72;
    let y = sc.y - rr - gap;
    if (y < ZONES.chamber.y + SEL_BTN / 2) y = sc.y + rr + gap;
    return [
      { id: 'rotL', x: sc.x - SEL_SPACING, y },
      { id: 'rotR', x: sc.x, y },
      { id: 'del', x: sc.x + SEL_SPACING, y },
    ];
  }

  function layoutTray() {
    const n = s.tray.length;
    const total = n * SLOT + (n - 1) * SLOT_GAP;
    const x0 = ZONES.tray.cx - total / 2 + SLOT / 2;
    s.tray.forEach((slot, i) => {
      slot.x = x0 + i * (SLOT + SLOT_GAP);
      slot.y = ZONES.tray.cy;
    });
  }

  // ---------- state changes ----------

  function renderCache(canvas, crystals, N = s.segments) {
    const g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, CACHE, CACHE);
    g.save();
    g.translate(CACHE / 2, CACHE / 2);
    g.beginPath();
    g.arc(0, 0, CACHE / 2, 0, Math.PI * 2);
    g.clip();
    renderKaleido(g, crystals, N, CACHE / 2, cfg());
    g.restore();
  }

  /** T23 (?debug): live score and best angle of the current layout. */
  function updateDebug() {
    s.debugInfo = s.refMask && s.placed.length
      ? bestMatch(s.refMask, s.placed, s.segments, cfg())
      : { score: 0, angle: 0 };
  }

  /** T15: any edit after a Run marks the result as out of date and resets the meter. */
  function markEdit() {
    if (s.author) author.onEdit();
    else if (s.hasResult) s.resultStale = true;
    s.resonance = null;
    tutorialEvent();
    if (game.flags.debug && !s.drag) updateDebug();
    dirty();
  }

  /** T19: draw the result, turn the ring, and show how close it is. */
  function run() {
    play('ring-turn');
    renderCache(resCanvas, s.placed);
    const m = bestMatch(s.refMask, s.placed, s.segments, cfg());
    s.lastRun = { score: m.score, angle: m.angle };
    s.resonance = resonanceOf(m.score);
    s.hasResult = true;
    s.resultStale = false;
    s.runAnim = 0;
    results(s.level.id).runs++;
    tutorialEvent();
    dirty();
  }

  function pickGhost() {
    for (const g of s.level.solution) {
      const near = s.placed.some((c) => c.c === g.c && Math.hypot(c.x - g.x, c.y - g.y) < 0.05 && angleDiff(c.r, g.r) < 8);
      if (!near) return g;
    }
    return null;
  }

  /** The palette colour covering the most pixels of the reference: the spell's colour for the ceremony. */
  function spellColor() {
    const counts = new Array(COLORS.length).fill(0);
    for (const m of s.refMask) {
      if (!m) continue;
      for (let b = 0; b < COLORS.length; b++) if (m & (1 << b)) counts[b]++;
    }
    const best = counts.indexOf(Math.max(...counts));
    return cfg().colors[COLORS[best]] ?? '#e2c48a';
  }

  /**
   * T20/T32: score the attempt, then play the casting ceremony. After a pass the game flow continues
   * (T25); after a fizzle the crystals stay and a fizzle line shows.
   */
  function activate() {
    if (s.placed.length === 0 || s.cast) return;
    tutorialEvent();
    const m = bestMatch(s.refMask, s.placed, s.segments, cfg());
    const r = results(s.level.id);
    r.activations++;
    r.best = Math.max(r.best, m.score);
    const pass = m.score >= passThreshold();
    let rt = null;
    if (pass) {
      rt = rating(m.score);
      const order = ['pass', 'great', 'perfect'];
      if (!r.rating || order.indexOf(rt) > order.indexOf(r.rating)) r.rating = rt;
    } else {
      r.fizzles++;
      s.fizzles++;
      const after = cfg().ghostHintAfter;
      if (after > 0 && s.fizzles >= after) s.ghost = pickGhost();
    }
    // The ceremony shows the current layout even if the player activated without a fresh Run.
    renderCache(resCanvas, s.placed);
    s.hasResult = true;
    s.resultStale = false;
    s.runAnim = 1;
    s.selectedId = null;
    s.drag = null;
    const bark = pick(t(pass ? `barks.${rt}` : 'barks.fizzle', []));
    s.cast = startCeremony(game, {
      refCanvas,
      resCanvas,
      refZone: ZONES.reference,
      resZone: ZONES.result,
      result: {
        score: m.score, angle: m.angle, pass, rating: rt, threshold: passThreshold(),
        mask: matchMaskCanvas(s.refMask, m.mask, cfg()), color: spellColor(),
      },
      levelId: s.level.id,
      skippable: r.activations > 1, // T33: the full ceremony plays on each spell's first activation
      calm: game.flags.calm,
      drawUI: (ctx, alpha) => drawUI(ctx, alpha),
      onFinished: (passed) => {
        s.cast = null;
        dirty();
        if (passed) game.flow.levelPassed(s.levelIndex);
        else if (bark) s.toast = { msg: bark, until: performance.now() + 3500 };
      },
    });
    dirty();
  }

  /**
   * T28: tutorial lines from text.json show one at a time and step forward when the player acts
   * (place, move, rotate, remove, Run, Activate), each staying up at least TUTORIAL_MIN_MS.
   */
  function tutorialEvent() {
    const tut = s.tutorial;
    if (!tut || performance.now() - tut.since < TUTORIAL_MIN_MS) return;
    tut.idx++;
    tut.since = performance.now();
    if (tut.idx >= tut.lines.length) s.tutorial = null;
    dirty();
  }

  function removeCrystal(id) {
    const i = s.placed.findIndex((c) => c.id === id);
    if (i < 0) return;
    const [c] = s.placed.splice(i, 1);
    const slot = s.tray[c.slot];
    if (slot) slot.usedBy = null;
    if (s.selectedId === id) s.selectedId = null;
    markEdit();
  }

  function rotate(c, dir) {
    c.r = (((c.r + dir * rotStep()) % 360) + 360) % 360;
    markEdit();
  }

  function selAction(id) {
    const c = selected();
    if (!c) return;
    if (id === 'rotL') rotate(c, -1);
    else if (id === 'rotR') rotate(c, 1);
    else if (id === 'del') removeCrystal(c.id);
  }

  // ---------- scene interface ----------

  const author = createAuthorTools(game, s, {
    renderCache, computeView, drawCircle, refCanvas, resCanvas, zones: ZONES, dirty,
  });

  const scene = {
    name: 'puzzle',
    /** Exposed for debugging and later phases. */
    state: s,

    enter({ levelIndex = 0, segmentsOverride = null, author: authorMode = false } = {}) {
      s.author = authorMode;
      s.toast = null;
      s.tutorial = null;
      if (authorMode) {
        author.enter(levelIndex);
        if (game.flags.debug) updateDebug();
        return;
      }
      const levels = game.data.levels;
      s.levelIndex = Math.max(0, Math.min(levels.length - 1, levelIndex));
      s.level = levels[s.levelIndex];
      s.segments = segmentsOverride ?? s.level.segments;
      s.tray = s.level.tray.map((c, i) => ({ i, c, ...parseCrystalType(c), usedBy: null, x: 0, y: 0 }));
      layoutTray();
      s.placed = [];
      s.selectedId = null;
      s.drag = null;
      s.hasResult = false;
      s.resultStale = false;
      s.resonance = null;
      s.lastRun = null;
      s.runAnim = 1;
      s.fizzles = 0;
      s.ghost = null;
      s.cast = null;
      s.view = computeView(s.segments);
      renderCache(refCanvas, s.level.solution);
      s.refMask = renderMask(s.level.solution, s.segments, cfg());
      results(s.level.id);
      const tut = t(`tutorial.${s.level.id}`, []);
      s.tutorial = Array.isArray(tut) && tut.length ? { lines: tut, idx: 0, since: performance.now() } : null;
      s.debugInfo = null;
      if (game.flags.debug) updateDebug();
      dirty();
    },

    update(dt) {
      if (s.cast) {
        s.cast.update(dt);
        dirty();
      }
      if (s.runAnim < 1) {
        s.runAnim = Math.min(1, s.runAnim + dt / RUN_ANIM);
        dirty();
      }
      if (s.toast && performance.now() > s.toast.until) {
        s.toast = null;
        dirty();
      }
    },

    pointerDown(p) {
      if (s.cast) { s.cast.input(); return; }
      if (!s.author && inBox(p, padded(MUTE_BTN))) { toggleMute(); dirty(); return; }
      if (s.drag) return;
      const sel = selected();
      if (sel) {
        for (const b of selButtons(sel)) {
          if (Math.hypot(p.x - b.x, p.y - b.y) <= SEL_BTN / 2 + 6) { selAction(b.id); return; }
        }
      }
      if (s.author) {
        if (author.pointerDown(p)) return;
      } else {
        if (inBox(p, padded(ZONES.runBtn))) { run(); return; }
        if (inBox(p, padded(ZONES.activateBtn))) { activate(); return; }
      }

      for (const slot of s.tray) {
        const half = Math.max((slot.size ?? SLOT) / 2, s.author ? 0 : minTouch / 2);
        if (!slot.usedBy && Math.abs(p.x - slot.x) <= half && Math.abs(p.y - slot.y) <= half) {
          const k = toK(lifted(p));
          s.drag = {
            kind: 'new',
            slot,
            crystal: { id: 0, c: slot.c, color: slot.color, shape: slot.shape, x: k.x, y: k.y, r: 0, s: 1 },
          };
          s.selectedId = null;
          dirty();
          return;
        }
      }

      for (let i = s.placed.length - 1; i >= 0; i--) {
        const c = s.placed[i];
        if (hitCrystal(p, c)) {
          s.placed.splice(i, 1);
          s.placed.push(c); // selected crystal draws on top
          s.selectedId = c.id;
          const k = toK(p);
          s.drag = { kind: 'move', crystal: c, offX: c.x - k.x, offY: c.y - k.y, startX: c.x, startY: c.y, from: p, moved: false };
          dirty();
          return;
        }
      }

      if (inRect(p, ZONES.chamber)) { s.selectedId = null; dirty(); }
    },

    pointerMove(p) {
      const d = s.drag;
      if (!d) return;
      const k = toK(p);
      if (d.kind === 'new') {
        const kl = toK(lifted(p));
        d.crystal.x = kl.x;
        d.crystal.y = kl.y;
      } else {
        if (!d.moved && Math.hypot(p.x - d.from.x, p.y - d.from.y) < DRAG_THRESHOLD) return;
        d.moved = true;
        d.crystal.x = k.x + d.offX;
        d.crystal.y = k.y + d.offY;
      }
      dirty();
    },

    pointerUp(p) {
      const d = s.drag;
      if (!d) return;
      s.drag = null;
      if (d.kind === 'new') {
        if (inRect(lifted(p), ZONES.chamber)) {
          const c = d.crystal;
          c.id = s.nextId++;
          c.x = snapPos(c.x);
          c.y = snapPos(c.y);
          // Author mode's palette is unlimited, so its slots are never used up.
          c.slot = s.author ? null : d.slot.i;
          if (!s.author) d.slot.usedBy = c.id;
          s.placed.push(c);
          s.selectedId = c.id;
          play('clink');
          markEdit();
        }
      } else if (d.moved) {
        const c = d.crystal;
        if (inBox(p, ZONES.tray)) removeCrystal(c.id);
        else if (inRect(p, ZONES.chamber)) {
          c.x = snapPos(c.x);
          c.y = snapPos(c.y);
          play('clink', { volume: 0.7 });
          markEdit();
        } else {
          c.x = d.startX;
          c.y = d.startY;
        }
      }
      dirty();
    },

    pointerCancel() {
      const d = s.drag;
      s.drag = null;
      if (d?.kind === 'move') {
        d.crystal.x = d.startX;
        d.crystal.y = d.startY;
      }
      dirty();
    },

    wheel(p, dir) {
      const c = selected();
      if (!s.cast && c && inRect(p, ZONES.chamber)) rotate(c, dir);
    },

    key(k) {
      if (s.cast) {
        s.cast.input();
        return true;
      }
      if (k === 'm' || k === 'M') { toggleMute(); dirty(); return true; }
      const c = selected();
      if ((k === 'q' || k === 'Q') && c) { rotate(c, -1); return true; }
      if ((k === 'e' || k === 'E') && c) { rotate(c, 1); return true; }
      if ((k === 'Delete' || k === 'Backspace') && c) { removeCrystal(c.id); return true; }
      if (k === 'Escape') { s.selectedId = null; dirty(); return true; }
      if (s.author) return false;
      if (k === ' ') { run(); return true; }
      if (k === 'Enter') { activate(); return true; }
      return false;
    },

    draw(ctx) {
      drawArt(ctx, 'bg-workshop', 0, 0, 1920, 1080);
      if (s.author) {
        author.drawTopBar(ctx);
        author.draw(ctx);
        drawChamber(ctx);
        author.drawTray(ctx);
      } else if (s.cast) {
        // The ceremony draws the circles itself and fades the rest of the UI through drawUI.
        s.cast.draw(ctx);
      } else {
        drawCircle(ctx, ZONES.reference, refCanvas, true, false, 0, 1);
        const e = easeOutCubic(s.runAnim);
        drawCircle(ctx, ZONES.result, resCanvas, s.hasResult, s.resultStale, s.runAnim < 1 ? e * Math.PI : 0, s.runAnim < 1 ? e : 1);
        drawUI(ctx, 1);
      }
      if (!s.cast) drawDragged(ctx);
      drawDebug(ctx);
      if (s.toast) {
        ctx.font = `600 28px system-ui, sans-serif`;
        const w = ctx.measureText(s.toast.msg).width + 48;
        ctx.fillStyle = 'rgba(10,14,22,0.92)';
        ctx.fillRect(960 - w / 2, 116, w, 56);
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 2;
        ctx.strokeRect(960 - w / 2, 116, w, 56);
        text(ctx, s.toast.msg, 960, 145, 28, INK, 'center', '600');
      }
    },
  };

  // ---------- drawing ----------

  /** Everything on the puzzle screen except the background and the two circles, at a given opacity. */
  function drawUI(ctx, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    drawTopBar(ctx);
    drawHint(ctx);
    drawChamber(ctx);
    drawMeter(ctx);
    drawButton(ctx, 'btn-run', ZONES.runBtn, t('ui.run', 'Run'), true);
    drawButton(ctx, 'btn-activate', ZONES.activateBtn, t('ui.activate', 'Activate'), s.placed.length > 0);
    drawTray(ctx);
    drawTutorial(ctx);
    ctx.restore();
  }

  function drawMuteButton(ctx) {
    const b = MUTE_BTN;
    drawArt(ctx, 'btn-small', b.cx, b.cy, b.w, b.h);
    const muted = isMuted();
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.fillStyle = '#f0e6d2';
    ctx.strokeStyle = '#f0e6d2';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    // Speaker
    ctx.beginPath();
    ctx.moveTo(-12, -5); ctx.lineTo(-5, -5); ctx.lineTo(3, -12); ctx.lineTo(3, 12); ctx.lineTo(-5, 5); ctx.lineTo(-12, 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    if (muted) {
      ctx.moveTo(8, -6); ctx.lineTo(16, 6);
      ctx.moveTo(16, -6); ctx.lineTo(8, 6);
    } else {
      ctx.arc(4, 0, 9, -0.8, 0.8);
      ctx.moveTo(4 + Math.cos(-0.8) * 15, Math.sin(-0.8) * 15);
      ctx.arc(4, 0, 15, -0.8, 0.8);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawTutorial(ctx) {
    if (!s.tutorial || s.toast) return; // the toast uses the same spot
    const b = TUTORIAL_BOX;
    ctx.fillStyle = 'rgba(12,16,24,0.88)';
    ctx.fillRect(b.cx - b.w / 2, b.cy - b.h / 2, b.w, b.h);
    ctx.strokeStyle = 'rgba(226,196,138,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.cx - b.w / 2, b.cy - b.h / 2, b.w, b.h);
    text(ctx, s.tutorial.lines[s.tutorial.idx], b.cx, b.cy + 1, 28, INK, 'center');
  }

  /** T23 (?debug): live score, best angle and frame rate. */
  function drawDebug(ctx) {
    if (!game.flags.debug) return;
    const d = s.debugInfo;
    const line = `score ${d ? (d.score * 100).toFixed(1) : '—'}%  ·  angle ${d ? d.angle : '—'}°  ·  ${game.fps} fps`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(1440, 4, 470, 30);
    text(ctx, line, 1452, 19, 18, '#7CFC9A');
  }

  function drawTopBar(ctx) {
    const levels = game.data.levels;
    levels.forEach((lv, i) => {
      const x = 60 + i * 44;
      const done = !!game.results[lv.id]?.rating;
      ctx.beginPath();
      ctx.arc(x, 52, 14, 0, Math.PI * 2);
      if (done) { ctx.fillStyle = GOLD; ctx.fill(); }
      else {
        ctx.fillStyle = 'rgba(10,14,22,0.7)';
        ctx.fill();
        ctx.strokeStyle = i === s.levelIndex ? GOLD : 'rgba(232,226,212,0.35)';
        ctx.lineWidth = i === s.levelIndex ? 3 : 2;
        ctx.stroke();
      }
    });
    text(ctx, t(`spells.${s.level.id}.name`, s.level.id), 960, 46, 40, GOLD, 'center', '600');
    text(ctx, t(`spells.${s.level.id}.description`, ''), 960, 88, 28, INK_QUIET, 'center');
    text(ctx, `${s.levelIndex + 1} / ${levels.length}`, MUTE_BTN.cx - 50, 52, 28, INK_QUIET, 'right');
    drawMuteButton(ctx);
    if (game.selftest) {
      const ok = game.selftest.broken === 0;
      text(ctx, ok ? 'selftest: all OK' : `selftest: ${game.selftest.broken} broken (console)`, 60, 96, 20,
        ok ? '#3cbf6a' : '#f2c230');
    }
  }

  function drawCircle(ctx, z, canvas, show, stale, ringAngle, bloom) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(z.cx, z.cy, z.r, 0, Math.PI * 2);
    ctx.fillStyle = '#090c13';
    ctx.fill();
    ctx.clip();
    if (show) {
      ctx.globalAlpha = 0.25 + 0.75 * bloom;
      const k = 0.8 + 0.2 * bloom;
      ctx.drawImage(canvas, z.cx - z.r * k, z.cy - z.r * k, z.r * 2 * k, z.r * 2 * k);
      ctx.globalAlpha = 1;
    }
    if (stale) {
      ctx.fillStyle = 'rgba(14,17,24,0.66)';
      ctx.fillRect(z.cx - z.r, z.cy - z.r, z.r * 2, z.r * 2);
    }
    ctx.restore();
    const ringSize = (z.r * 900) / RING_WINDOW;
    ctx.save();
    ctx.translate(z.cx, z.cy);
    if (ringAngle) ctx.rotate(ringAngle);
    drawArt(ctx, 'ring', 0, 0, ringSize, ringSize);
    ctx.restore();
    if (!show) text(ctx, `${t('ui.run', 'Run')} →`, z.cx, z.cy, 30, INK_QUIET, 'center');
    if (stale) text(ctx, `${t('ui.run', 'Run')} again`, z.cx, z.cy, 30, INK, 'center', '600');
  }

  /** T19: resonance meter, low / medium / high; empty until a fresh Run. */
  function drawMeter(ctx) {
    const z = ZONES.meter;
    const level = s.runAnim < 1 ? null : s.resonance;
    const idx = level ? RESONANCE.indexOf(level) : -1;
    text(ctx, t('ui.resonance.label', 'Resonance'), z.cx - 40, z.cy, 28, INK_QUIET, 'right');
    const colors = ['#e8463c', '#f2c230', '#3cbf6a'];
    for (let i = 0; i < 3; i++) {
      const x = z.cx - 26 + i * 62;
      ctx.beginPath();
      ctx.moveTo(x + 8, z.cy - 8);
      ctx.arcTo(x + 54, z.cy - 8, x + 54, z.cy + 8, 8);
      ctx.arcTo(x + 54, z.cy + 8, x, z.cy + 8, 8);
      ctx.arcTo(x, z.cy + 8, x, z.cy - 8, 8);
      ctx.arcTo(x, z.cy - 8, x + 54, z.cy - 8, 8);
      ctx.closePath();
      ctx.fillStyle = i <= idx ? colors[idx] : 'rgba(10,14,22,0.75)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(232,226,212,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    text(ctx, level ? t(`ui.resonance.${level}`, level) : '—', z.cx + 172, z.cy, 28,
      level ? INK : INK_QUIET, 'left', level ? '600' : 'normal');
  }

  function drawHint(ctx) {
    const z = ZONES.reference;
    if (s.level.hint !== 'none') {
      text(ctx, t(`spells.${s.level.id}.hint.${s.level.hint}`, ''), z.cx, z.cy + z.r + 62, 28, INK, 'center');
    }
    text(ctx, `${t('ui.threshold', 'Needs')} ${Math.round(passThreshold() * 100)}%`,
      z.cx, z.cy + z.r + 104, 28, INK_QUIET, 'center');
  }

  function wedgePath(ctx) {
    const v = s.view;
    const up = -Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(v.apexX, v.apexY);
    ctx.arc(v.apexX, v.apexY, v.S, up - v.half, up + v.half);
    ctx.closePath();
  }

  function drawChamberCrystals(ctx, alpha) {
    ctx.save();
    ctx.translate(s.view.apexX, s.view.apexY);
    ctx.globalAlpha *= alpha;
    for (const c of s.placed) drawCrystal(ctx, c, s.view.S, cfg());
    ctx.restore();
  }

  function drawChamber(ctx) {
    const v = s.view;
    const a = cfg().crystalAlpha;

    // Backing: square chamber texture scaled to cover the wedge's bounding box (no stretching), clipped to the wedge.
    ctx.save();
    wedgePath(ctx);
    ctx.fillStyle = 'rgba(9,12,19,0.92)';
    ctx.fill();
    ctx.clip();
    const cover = Math.max(2 * v.S * Math.sin(v.half), v.S);
    drawArt(ctx, 'chamber', v.apexX, v.apexY - v.S / 2, cover, cover);
    ctx.restore();

    // Ghost hint: one solution crystal outlined after repeated fizzles.
    if (s.ghost) {
      const g = s.ghost;
      const sc = toScreen(g);
      const [hx, hy] = halfExtents(g);
      ctx.save();
      ctx.translate(v.apexX, v.apexY);
      ctx.globalAlpha *= 0.28;
      drawCrystal(ctx, g, v.S, cfg());
      ctx.restore();
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, Math.max(hx, hy) + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Overhang outside the wedge is shown faintly: it will be clipped by the mirrors.
    drawChamberCrystals(ctx, a * 0.35);
    ctx.save();
    wedgePath(ctx);
    ctx.clip();
    drawChamberCrystals(ctx, a);
    ctx.restore();

    // Mirror edges (bright) and the outer arc (faint).
    const up = -Math.PI / 2;
    ctx.strokeStyle = 'rgba(225,236,255,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(v.apexX, v.apexY);
      ctx.lineTo(v.apexX + Math.cos(up + side * v.half) * v.S, v.apexY + Math.sin(up + side * v.half) * v.S);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(225,236,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(v.apexX, v.apexY, v.S, up - v.half, up + v.half);
    ctx.stroke();

    const c = selected();
    if (c && !(s.drag && s.drag.moved)) {
      const sc = toScreen(c);
      const [hx, hy] = halfExtents(c);
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, Math.max(hx, hy) + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      for (const b of selButtons(c)) drawIconButton(ctx, b.x, b.y, SEL_BTN, b.id);
    }
  }

  function drawTray(ctx) {
    const z = ZONES.tray;
    drawArt(ctx, 'tray', z.cx, z.cy, z.w, z.h);
    const a = cfg().crystalAlpha;
    for (const slot of s.tray) {
      if (slot.usedBy || s.drag?.slot === slot) {
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(232,226,212,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, SLOT_ART * 0.36, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha *= a;
        ctx.drawImage(crystalSprite(slot.color, slot.shape), slot.x - SLOT_ART / 2, slot.y - SLOT_ART / 2, SLOT_ART, SLOT_ART);
        ctx.restore();
      }
    }
  }

  function drawDragged(ctx) {
    if (s.drag?.kind !== 'new') return;
    ctx.save();
    ctx.translate(s.view.apexX, s.view.apexY);
    ctx.globalAlpha = cfg().crystalAlpha;
    drawCrystal(ctx, s.drag.crystal, s.view.S, cfg());
    ctx.restore();
  }

  return scene;
}

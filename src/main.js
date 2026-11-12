// Boot, resize and main loop (T02). The full state machine arrives in Phase 4 (T25); for now boot goes
// straight to the puzzle scene (or the boot check with ?bootcheck).
import { VERSION } from './version.js';
import { createLayout, DESIGN_W, DESIGN_H } from './layout.js';
import { loadData } from './data.js';
import { loadAssets, assetStatus } from './assets.js';
import { setPalette } from './kaleido.js';
import { runSelfTest } from './match.js';
import { createInput } from './input.js';
import { SEGMENT_OPTIONS } from './constants.js';
import { text, GOLD, INK } from './ui.js';
import { createBootCheckScene } from './scenes/bootcheck.js';
import { createPuzzleScene } from './scenes/puzzle.js';
import { createAssetsScene } from './scenes/assets.js';
import { createTitleScene } from './scenes/title.js';
import { createStoryScene } from './scenes/story.js';
import { createEndScene } from './scenes/end.js';
import { createFlow } from './flow.js';
import { unlock as unlockAudio } from './audio.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const ctx = canvas.getContext('2d');
const layout = createLayout(canvas);
const params = new URLSearchParams(location.search);

/** The single shared game object passed to every scene. */
const game = {
  version: VERSION,
  layout,
  params,
  loadProgress: 0,
  /** @type {Awaited<ReturnType<typeof loadData>> | null} */
  data: null,
  /** Per-spell results: { [id]: { runs, activations, fizzles, best, rating } } */
  results: {},
  /** Set by ?selftest: { rows, broken } */
  selftest: null,
  /**
   * T23 debug URL parameters. ?debug shows live score, angle and FPS; ?nostory skips story scenes (T27);
   * ?calm (or the OS reduced-motion setting) removes flashes and colour floods (T33).
   */
  flags: {
    debug: params.has('debug'),
    nostory: params.has('nostory'),
    // ?calm forces calm mode; ?calm=0 forces full motion even if the OS asks for reduced motion.
    calm: params.get('calm') === '0'
      ? false
      : params.has('calm') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    author: params.has('author'),
  },
  fps: 0,
  /** @type {any} game flow (T25), see flow.js */
  flow: null,
  /** @type {any} */
  scene: null,
  scenes: {},
  dirty: true,
  lastTime: 0,
  go(name, enterParams) {
    game.scene = game.scenes[name];
    game.scene.enter?.(enterParams);
    game.dirty = true;
  },
};
window.game = game; // for debugging in the browser console

layout.onResize = () => { game.dirty = true; };
// In portrait the game is covered by the rotate overlay (T38), so input is ignored there.
createInput(canvas, layout, () => (layout.isPortrait() ? null : game.scene));
// T37: browsers (iOS especially) only allow audio after a user gesture.
canvas.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
// T38: on phones, the first tap asks for fullscreen and landscape lock where the browser allows it
// (Android Chrome does; iPhone Safari does not, which is fine).
canvas.addEventListener('pointerdown', (e) => {
  const root = document.documentElement;
  if (e.pointerType !== 'touch' || document.fullscreenElement || !root.requestFullscreen) return;
  root.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
    .catch(() => {});
}, { once: true });

/** T38: full-window overlay asking to rotate the device, drawn in screen pixels (not the 16:9 design area). */
function drawRotateOverlay() {
  const { dpr, cssW, cssH } = layout;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, cssW, cssH);
  const cx = cssW / 2;
  const cy = cssH / 2 - 30;
  const s = Math.min(cssW, cssH) * 0.18;
  // Phone outline turned on its side, with a turning arrow.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(3, s * 0.06);
  ctx.strokeRect(-s, -s * 0.55, s * 2, s * 1.1);
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.35, -Math.PI * 0.8, -Math.PI * 0.2);
  ctx.stroke();
  ctx.restore();
  const msg = game.data?.t('ui.rotateDevice', 'Rotate your device') ?? 'Rotate your device';
  text(ctx, msg, cx, cy + s * 1.6, Math.max(18, Math.round(cssW * 0.06)), INK, 'center', '600');
}

let fpsFrames = 0;
let fpsSince = 0;

function frame(time) {
  const dt = Math.min(0.1, (time - (game.lastTime || time)) / 1000);
  game.lastTime = time;
  game.scene?.update?.(dt);
  if (game.flags.debug) {
    // Debug redraws every frame so the FPS counter measures real drawing cost.
    game.dirty = true;
    fpsFrames++;
    if (time - fpsSince >= 500) {
      game.fps = Math.round((fpsFrames * 1000) / (time - fpsSince));
      fpsFrames = 0;
      fpsSince = time;
    }
  }
  if (game.dirty) {
    game.dirty = false;
    if (layout.isPortrait()) {
      drawRotateOverlay();
    } else {
      layout.begin(ctx);
      if (game.scene) game.scene.draw(ctx);
      else drawLoading();
    }
  }
  requestAnimationFrame(frame);
}

function drawLoading() {
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  const w = 800;
  const x = (DESIGN_W - w) / 2;
  const y = DESIGN_H / 2;
  ctx.fillStyle = '#232c3b';
  ctx.fillRect(x, y - 8, w, 16);
  ctx.fillStyle = GOLD;
  ctx.fillRect(x, y - 8, w * game.loadProgress, 16);
  text(ctx, 'Loading', DESIGN_W / 2, y - 48, 32, INK, 'center');
}

async function boot() {
  const [data] = await Promise.all([
    loadData(),
    loadAssets((p) => { game.loadProgress = p; game.dirty = true; }),
  ]);
  game.data = data;
  setPalette(data.config.colors);
  game.flow = createFlow(game);
  game.scenes = {
    bootcheck: createBootCheckScene(game),
    assets: createAssetsScene(game),
    title: createTitleScene(game),
    story: createStoryScene(game),
    puzzle: createPuzzleScene(game),
    end: createEndScene(game),
  };

  const s = assetStatus();
  console.info(`[boot] v${VERSION} ready: ${data.levels.length} spells, ${data.warnings.length} data warnings, `
    + `${s.art.filter((a) => a.final).length}/${s.art.length} final art`);

  if (params.has('selftest')) game.selftest = runSelfTest(data.levels, data.config);

  // ?level=N (1-based) starts at spell N; ?segments=N overrides the mirror count.
  const levelIndex = Math.max(0, (parseInt(params.get('level') ?? '1', 10) || 1) - 1);
  const seg = parseInt(params.get('segments') ?? '', 10);

  if (params.has('assets')) { game.go('assets'); return; }
  if (game.flags.author) { game.go('puzzle', { levelIndex, author: true }); return; }
  if (params.has('bootcheck') || data.levels.length === 0) { game.go('bootcheck'); return; }
  // ?level or ?segments jump straight into a puzzle, skipping title and story (for testing).
  if (params.has('level') || params.has('segments')) {
    game.go('puzzle', { levelIndex, segmentsOverride: SEGMENT_OPTIONS.includes(seg) ? seg : null });
    return;
  }
  game.flow.toTitle();
}

requestAnimationFrame(frame);
boot();

// Title scene (T26). Start begins a new game (and the ambient loop, which needs a user gesture).
import { drawArt } from '../assets.js';
import { text, inBox, drawButton, INK_QUIET } from '../ui.js';
import { startAmbient, toggleMute, isMuted } from '../audio.js';

const START = { cx: 960, cy: 780, w: 320, h: 110 };
const MUTE = { cx: 1870, cy: 52, w: 140, h: 48 };

export function createTitleScene(game) {
  const t = (k, f) => game.data.t(k, f);
  const start = () => {
    startAmbient();
    game.flow.newGame();
  };
  return {
    name: 'title',
    enter() { game.dirty = true; },
    update() {},
    pointerDown(p) {
      if (inBox(p, START)) start();
      else if (inBox(p, { ...MUTE, cx: MUTE.cx - 50 })) { toggleMute(); game.dirty = true; }
    },
    key(k) {
      if (k === 'Enter' || k === ' ') { start(); return true; }
      if (k === 'm' || k === 'M') { toggleMute(); game.dirty = true; return true; }
      return false;
    },
    draw(ctx) {
      drawArt(ctx, 'title', 0, 0, 1920, 1080);
      drawButton(ctx, 'btn-activate', START, t('ui.start', 'Start'), true);
      text(ctx, isMuted() ? t('ui.unmute', 'Sound on') : t('ui.mute', 'Mute'), MUTE.cx - 50, MUTE.cy, 28, INK_QUIET, 'center');
      text(ctx, `v${game.version}`, 1880, 1046, 28, INK_QUIET, 'right');
    },
  };
}

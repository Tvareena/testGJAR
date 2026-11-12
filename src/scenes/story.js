// Story player (T27): minimal visual-novel scene that plays one scene from text.json.
// Each line: { speaker?, portrait?, background?, text }. Background cross-fades when it changes, the
// portrait sits lower left (hidden without a speaker), text types out at 45 characters per second.
// First input completes the line, the next advances. Missing scenes or art are skipped with a warning,
// so the writer can reference scenes before they exist. New optional fields can be added to lines later.
import { drawArt, getArt } from '../assets.js';
import { text, inBox, wrapText, drawTextButton, INK, INK_QUIET, GOLD } from '../ui.js';
import { play } from '../audio.js';

const CHARS_PER_SEC = 45;
const BG_FADE = 0.3;
const BOX = { x: 80, y: 790, w: 1760, h: 250 };
const PORTRAIT = { cx: 270, cy: 800, size: 440 };
const TEXT_X = 520;
const TEXT_W = 1260;
const FONT = 34;
const LINE_H = 48;
const SKIP = { cx: 1790, cy: 56, w: 160, h: 66 };

export function createStoryScene(game) {
  const t = (k, f) => game.data.t(k, f);
  let lines = [];
  let idx = 0;
  let shown = 0;
  let next = null;
  let bg = null;
  let prevBg = null;
  let fade = 1;
  const warned = new Set();

  const line = () => lines[idx] ?? {};
  const fullText = () => String(line().text ?? '');

  function artOrWarn(name) {
    if (!name) return false;
    if (getArt(name)) return true;
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`[story] unknown art "${name}" in scene line; skipped`);
    }
    return false;
  }

  function startLine() {
    shown = 0;
    play('text-blip', { volume: 0.5 });
    const b = line().background;
    if (b && b !== bg && artOrWarn(b)) {
      prevBg = bg;
      bg = b;
      fade = prevBg ? 0 : 1;
    }
    game.dirty = true;
  }

  function finish() {
    const n = next;
    next = null;
    n?.();
  }

  function advance() {
    if (shown < fullText().length) {
      shown = fullText().length;
      game.dirty = true;
      return;
    }
    idx++;
    if (idx >= lines.length) finish();
    else startLine();
  }

  return {
    name: 'story',

    enter({ sceneId, next: then }) {
      next = then;
      const scene = game.data.text.scenes?.[sceneId];
      lines = Array.isArray(scene) ? scene.filter((l) => l && typeof l === 'object') : [];
      if (lines.length === 0) {
        console.warn(`[story] scene "${sceneId}" is missing or empty in text.json; skipped`);
        finish();
        return;
      }
      idx = 0;
      bg = null;
      prevBg = null;
      fade = 1;
      startLine();
    },

    update(dt) {
      const len = fullText().length;
      if (shown < len) {
        shown = Math.min(len, shown + CHARS_PER_SEC * dt);
        game.dirty = true;
      }
      if (fade < 1) {
        fade = Math.min(1, fade + dt / BG_FADE);
        game.dirty = true;
      }
    },

    pointerDown(p) {
      if (inBox(p, SKIP)) finish();
      else advance();
    },

    key(k) {
      if (k === 'Enter' || k === ' ') { advance(); return true; }
      if (k === 'Escape') { finish(); return true; }
      return false;
    },

    draw(ctx) {
      ctx.fillStyle = '#0b0e14';
      ctx.fillRect(0, 0, 1920, 1080);
      if (prevBg && fade < 1) drawArt(ctx, prevBg, 0, 0, 1920, 1080);
      if (bg) {
        ctx.save();
        ctx.globalAlpha = fade;
        drawArt(ctx, bg, 0, 0, 1920, 1080);
        ctx.restore();
      }

      // Text box
      const r = 26;
      ctx.beginPath();
      ctx.moveTo(BOX.x + r, BOX.y);
      ctx.arcTo(BOX.x + BOX.w, BOX.y, BOX.x + BOX.w, BOX.y + BOX.h, r);
      ctx.arcTo(BOX.x + BOX.w, BOX.y + BOX.h, BOX.x, BOX.y + BOX.h, r);
      ctx.arcTo(BOX.x, BOX.y + BOX.h, BOX.x, BOX.y, r);
      ctx.arcTo(BOX.x, BOX.y, BOX.x + BOX.w, BOX.y, r);
      ctx.closePath();
      ctx.fillStyle = 'rgba(12,16,24,0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(176,141,87,0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();

      const l = line();
      if (l.speaker && l.portrait) {
        const name = `portrait-${l.portrait}`;
        if (artOrWarn(name)) drawArt(ctx, name, PORTRAIT.cx, PORTRAIT.cy, PORTRAIT.size, PORTRAIT.size);
      }
      if (l.speaker) {
        text(ctx, t(`characters.${l.speaker}`, l.speaker), TEXT_X, BOX.y + 46, 32, GOLD, 'left', '600');
      }

      // Wrap the whole line first so words never jump between lines while typing.
      const wrapped = wrapText(ctx, fullText(), TEXT_W, FONT).slice(0, 3);
      let budget = Math.floor(shown);
      wrapped.forEach((ln, i) => {
        if (budget <= 0) return;
        const part = ln.slice(0, budget);
        budget -= ln.length + 1;
        text(ctx, part, TEXT_X, BOX.y + 104 + i * LINE_H, FONT, INK);
      });
      if (shown >= fullText().length) text(ctx, '▸', BOX.x + BOX.w - 44, BOX.y + BOX.h - 36, 34, GOLD, 'center');

      drawTextButton(ctx, SKIP, t('ui.skip', 'Skip'));
      text(ctx, `${idx + 1} / ${lines.length}`, SKIP.cx - SKIP.w / 2 - 20, SKIP.cy, 28, INK_QUIET, 'right');
    },
  };
}

// End scene (T26): rating and runs per spell, total runs, restart.
import { drawArt } from '../assets.js';
import { text, inBox, drawButton, INK, INK_QUIET, GOLD } from '../ui.js';

const RESTART = { cx: 960, cy: 960, w: 300, h: 96 };

export function createEndScene(game) {
  const t = (k, f) => game.data.t(k, f);
  return {
    name: 'end',
    enter() { game.dirty = true; },
    update() {},
    pointerDown(p) {
      if (inBox(p, RESTART)) game.flow.toTitle();
    },
    key(k) {
      if (k === 'Enter' || k === ' ') { game.flow.toTitle(); return true; }
      return false;
    },
    draw(ctx) {
      drawArt(ctx, 'bg-final', 0, 0, 1920, 1080);
      ctx.fillStyle = 'rgba(8,10,16,0.55)';
      ctx.fillRect(0, 0, 1920, 1080);
      text(ctx, t('ui.end.title', 'The chain is complete'), 960, 110, 64, GOLD, 'center', '600');

      const levels = game.data.levels;
      const rowH = Math.min(58, 560 / Math.max(1, levels.length));
      const top = 240;
      text(ctx, t('ui.end.spell', 'Spell'), 620, top - 50, 28, INK_QUIET);
      text(ctx, t('ui.end.rating', 'Rating'), 1110, top - 50, 28, INK_QUIET, 'center');
      text(ctx, t('ui.end.runs', 'Runs'), 1300, top - 50, 28, INK_QUIET, 'right');
      let totalRuns = 0;
      levels.forEach((lv, i) => {
        const r = game.results[lv.id] ?? { runs: 0, rating: null };
        totalRuns += r.runs;
        const y = top + i * rowH;
        text(ctx, `${i + 1}.  ${t(`spells.${lv.id}.name`, lv.id)}`, 620, y, 30, INK);
        text(ctx, r.rating ? t(`ui.ratings.${r.rating}`, r.rating) : '—', 1110, y, 30,
          r.rating === 'perfect' ? GOLD : INK, 'center', r.rating === 'perfect' ? '600' : 'normal');
        text(ctx, String(r.runs), 1300, y, 30, INK, 'right');
      });
      const yTotal = top + levels.length * rowH + 20;
      ctx.strokeStyle = 'rgba(226,196,138,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(620, yTotal - 24);
      ctx.lineTo(1300, yTotal - 24);
      ctx.stroke();
      text(ctx, t('ui.end.total', 'Total runs'), 620, yTotal + 8, 28, INK_QUIET);
      text(ctx, String(totalRuns), 1300, yTotal + 8, 28, GOLD, 'right', '600');

      drawButton(ctx, 'btn-activate', RESTART, t('ui.restart', 'Restart'), true);
    },
  };
}

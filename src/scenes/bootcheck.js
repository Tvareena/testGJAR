// Phase 0 check screen: every registered art file with its status, plus a data summary.
// Open with ?bootcheck. Superseded by the ?assets report in Phase 3 (T24).
import { DESIGN_W } from '../layout.js';
import { getArt, drawArt, assetStatus, ART_REGISTRY } from '../assets.js';
import { text, GOLD, INK } from '../ui.js';

export function createBootCheckScene(game) {
  return {
    name: 'bootcheck',
    enter() { game.dirty = true; },
    update() {},
    draw(ctx) {
      drawArt(ctx, 'bg-workshop', 0, 0, DESIGN_W, 1080);
      const status = assetStatus();
      const data = game.data;

      text(ctx, `Boot check · v${game.version}`, 70, 56, 36, GOLD, 'left', 'bold');
      text(ctx, 'Drop final PNGs with the same names into assets/art/ and reload (Ctrl+F5).',
        70, 96, 22, 'rgba(232,226,212,0.75)');

      const cols = 8;
      const cellW = 222;
      const cellH = 196;
      const boxW = 180;
      const boxH = 128;
      ART_REGISTRY.forEach((entry, i) => {
        const cx = 70 + (i % cols) * cellW + boxW / 2;
        const top = 136 + Math.floor(i / cols) * cellH;
        const a = getArt(entry.name);
        const st = status.art[i];

        ctx.fillStyle = 'rgba(8,10,16,0.65)';
        ctx.fillRect(cx - boxW / 2, top, boxW, boxH);
        if (a) {
          const k = Math.min((boxW - 16) / a.w, (boxH - 16) / a.h);
          ctx.drawImage(a.img, cx - (a.w * k) / 2, top + boxH / 2 - (a.h * k) / 2, a.w * k, a.h * k);
        }
        ctx.strokeStyle = st.final ? '#3cbf6a' : 'rgba(255,255,255,0.18)';
        ctx.lineWidth = st.final ? 3 : 1.5;
        ctx.strokeRect(cx - boxW / 2, top, boxW, boxH);

        text(ctx, `${entry.name}.png`, cx, top + boxH + 20, 17, INK, 'center');
        text(ctx, st.final ? 'FINAL' : `placeholder · ${entry.priority}`, cx, top + boxH + 42, 15,
          st.final ? '#3cbf6a' : 'rgba(232,226,212,0.55)', 'center');
      });

      const artFinal = status.art.filter((s) => s.final).length;
      const audioFinal = status.audio.filter((s) => s.final).length;
      const ids = data.levels.map((l) => l.id).join(', ') || 'none';
      text(ctx, `Spells loaded: ${data.levels.length} (${ids})`, 70, 950, 24);
      text(ctx, `Data warnings: ${data.warnings.length}${data.warnings.length ? ' — see browser console' : ''}`,
        70, 988, 24, data.warnings.length ? '#f2c230' : '#3cbf6a');
      text(ctx, `Art: ${artFinal}/${status.art.length} final   ·   Audio: ${audioFinal}/${status.audio.length} final (missing audio is silent)`,
        70, 1026, 24);
    },
  };
}

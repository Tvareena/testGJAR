// Asset status report (T24), opened with ?assets. Lists every registered art and audio file as final or
// placeholder, plus missing text keys and how many writer lines are still placeholders.
import { DESIGN_W } from '../layout.js';
import { assetStatus } from '../assets.js';
import { checkText } from '../data.js';
import { text, GOLD, INK, INK_QUIET } from '../ui.js';

const GREEN = '#3cbf6a';
const AMBER = '#f2c230';
const MAX_TEXT_ROWS = 14;

export function createAssetsScene(game) {
  return {
    name: 'assets',
    enter() {
      const tx = checkText(game.data);
      if (tx.missing.length) console.warn(`[assets] missing text keys:\n${tx.missing.join('\n')}`);
      game.dirty = true;
    },
    update() {},
    draw(ctx) {
      ctx.fillStyle = '#0d1118';
      ctx.fillRect(0, 0, DESIGN_W, 1080);
      const status = assetStatus();
      const tx = checkText(game.data);
      const artFinal = status.art.filter((a) => a.final).length;
      const audioFinal = status.audio.filter((a) => a.final).length;

      text(ctx, `Asset report · v${game.version}`, 60, 50, 36, GOLD, 'left', 'bold');
      text(ctx, `Art ${artFinal}/${status.art.length} final  ·  Audio ${audioFinal}/${status.audio.length}  ·  `
        + `Missing text keys ${tx.missing.length}  ·  Placeholder lines ${tx.placeholders}  ·  Data warnings ${game.data.warnings.length}`,
      60, 92, 22, INK_QUIET);

      // Art column
      text(ctx, 'Art  (assets/art/)', 60, 140, 24, INK, 'left', '600');
      status.art.forEach((a, i) => {
        const y = 172 + i * 29;
        text(ctx, `${a.name}.png`, 60, y, 19, INK);
        text(ctx, a.priority, 330, y, 17, INK_QUIET);
        text(ctx, a.final ? 'FINAL' : 'placeholder', 420, y, 18, a.final ? GREEN : INK_QUIET, 'left', a.final ? '600' : 'normal');
        if (a.note) text(ctx, a.note, 540, y, 15, AMBER);
      });

      // Audio column
      const x2 = 1000;
      text(ctx, 'Audio  (assets/audio/, silent if missing)', x2, 140, 24, INK, 'left', '600');
      status.audio.forEach((a, i) => {
        const y = 172 + i * 29;
        text(ctx, `${a.name}.mp3`, x2, y, 19, INK);
        text(ctx, a.priority, x2 + 230, y, 17, INK_QUIET);
        text(ctx, a.final ? 'FINAL' : 'missing', x2 + 320, y, 18, a.final ? GREEN : INK_QUIET, 'left', a.final ? '600' : 'normal');
      });

      // Text column
      let y = 172 + status.audio.length * 29 + 40;
      text(ctx, 'Text  (data/text.json)', x2, y, 24, INK, 'left', '600');
      y += 34;
      text(ctx, `${tx.placeholders} lines still marked [placeholder]`, x2, y, 19, tx.placeholders ? AMBER : GREEN);
      y += 32;
      if (tx.missing.length === 0) {
        text(ctx, 'No missing text keys', x2, y, 19, GREEN);
      } else {
        text(ctx, `Missing keys (${tx.missing.length}):`, x2, y, 19, AMBER);
        tx.missing.slice(0, MAX_TEXT_ROWS).forEach((k, i) => text(ctx, k, x2 + 20, y + 30 + i * 27, 18, INK));
        if (tx.missing.length > MAX_TEXT_ROWS) {
          text(ctx, `…and ${tx.missing.length - MAX_TEXT_ROWS} more (console)`, x2 + 20, y + 30 + MAX_TEXT_ROWS * 27, 18, INK_QUIET);
        }
      }
    },
  };
}

// Author mode (T22), opened with ?author. Plugs into the puzzle scene and reuses its chamber, dragging,
// rotation and renderer, so authored spells behave exactly like the game.
//   - Full palette tray (every colour x shape, unlimited)
//   - Left circle: live preview of the layout; right circle: the loaded spell's original reference
//   - Mirrors, pass threshold and hint level controls
//   - Load cycles through spells; Paste loads a JSON entry from the clipboard
//   - Save copies a levels.json entry (tray = solution + decoys) to the clipboard and the console
import { COLORS, SHAPES, SEGMENT_OPTIONS, HINT_LEVELS } from '../constants.js';
import { validateLevels } from '../data.js';
import { crystalSprite } from '../kaleido.js';
import { renderMask } from '../match.js';
import { drawArt } from '../assets.js';
import { text, inBox, drawTextButton, INK, INK_QUIET, GOLD } from '../ui.js';

const PAL_SIZE = 84;
const PAL_GAP = 12;
const PAL_COLS = 15;
const PAL_ROWS_Y = [912, 1008];

const BTN = {
  seg: SEGMENT_OPTIONS.map((n, i) => ({ n, cx: 250 + i * 78, cy: 770, w: 66, h: 50 })),
  thrMinus: { cx: 250, cy: 836, w: 50, h: 50 },
  thrPlus: { cx: 400, cy: 836, w: 50, h: 50 },
  hint: { cx: 548, cy: 836, w: 150, h: 50 },
  load: { cx: 1370, cy: 806, w: 100, h: 60 },
  paste: { cx: 1480, cy: 806, w: 100, h: 60 },
  save: { cx: 1590, cy: 806, w: 100, h: 60 },
  decoys: { cx: 1700, cy: 806, w: 100, h: 60 },
  clear: { cx: 1810, cy: 806, w: 100, h: 60 },
};

const round3 = (v) => Math.round(v * 1000) / 1000;

/** Crystals in the tray that are not used by the solution (counting duplicates). */
function decoysOf(lv) {
  const left = [...lv.tray];
  for (const c of lv.solution) {
    const i = left.indexOf(c.c);
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

/** levels.json entry with one crystal per line, ready to paste. */
function formatEntry(e) {
  const keys = Object.keys(e);
  const fmt = (v) => JSON.stringify(v).replace(/","/g, '", "').replace(/,"/g, ', "').replace(/":/g, '": ');
  const lines = keys.map((k, i) => {
    const v = k === 'solution'
      ? `[\n${e.solution.map((c) => `      ${fmt(c)}`).join(',\n')}\n    ]`
      : fmt(e[k]);
    return `    "${k}": ${v}${i === keys.length - 1 ? '' : ','}`;
  });
  return `  {\n${lines.join('\n')}\n  }`;
}

/**
 * @param {any} game
 * @param {any} s puzzle scene state
 * @param {{ renderCache: Function, computeView: Function, drawCircle: Function, refCanvas: HTMLCanvasElement,
 *           resCanvas: HTMLCanvasElement, zones: any, dirty: () => void }} api
 */
export function createAuthorTools(game, s, api) {
  const cfg = () => game.data.config;
  let original = null; // { id, segments, solution } of the loaded spell
  let loadIndex = 0;

  function toast(msg) {
    s.toast = { msg, until: performance.now() + 3500 };
    api.dirty();
  }

  function buildPalette() {
    s.tray = [];
    let i = 0;
    const total = PAL_COLS * PAL_SIZE + (PAL_COLS - 1) * PAL_GAP;
    const x0 = 960 - total / 2 + PAL_SIZE / 2;
    for (const color of COLORS) {
      for (const shape of SHAPES) {
        const row = Math.floor(i / PAL_COLS);
        const col = i % PAL_COLS;
        s.tray.push({
          i, c: `${color}-${shape}`, color, shape, usedBy: null, size: PAL_SIZE,
          x: x0 + col * (PAL_SIZE + PAL_GAP), y: PAL_ROWS_Y[row],
        });
        i++;
      }
    }
  }

  function refresh() {
    s.view = api.computeView(s.segments);
    api.renderCache(api.refCanvas, s.placed, s.segments);
    if (original) api.renderCache(api.resCanvas, original.solution, original.segments);
    // Debug score (?debug) compares against the original layout under the current mirror count.
    s.refMask = original ? renderMask(original.solution, s.segments, cfg()) : null;
    api.dirty();
  }

  function loadEntry(lv) {
    s.level = lv
      ? { ...lv }
      : { id: 'new-spell', segments: 6, threshold: 0.75, hint: 'full', tray: [], solution: [],
          positionSnap: null, rotationSnap: null, sceneBefore: null, sceneAfter: null };
    s.segments = s.level.segments;
    s.decoys = lv ? decoysOf(lv) : [];
    original = lv ? { id: lv.id, segments: lv.segments, solution: lv.solution } : null;
    s.placed = s.level.solution.map((c) => ({ ...c, id: s.nextId++, slot: null }));
    s.selectedId = null;
    s.drag = null;
    s.decoyMode = false;
    s.hasResult = true;
    s.resultStale = false;
    s.feedback = null;
    s.ghost = null;
    s.runAnim = 1;
    buildPalette();
    refresh();
  }

  function save() {
    if (s.placed.length === 0) { toast('Place at least one crystal first'); return; }
    const solution = s.placed.map((c) => {
      const o = { c: c.c, x: round3(c.x), y: round3(c.y), r: c.r };
      if (c.s && c.s !== 1) o.s = c.s;
      return o;
    });
    const entry = {
      id: s.level.id,
      segments: s.segments,
      threshold: s.level.threshold,
      hint: s.level.hint,
      tray: [...solution.map((c) => c.c), ...s.decoys],
      solution,
    };
    for (const k of ['positionSnap', 'rotationSnap', 'sceneBefore', 'sceneAfter']) {
      if (s.level[k] != null) entry[k] = s.level[k];
    }
    const json = formatEntry(entry);
    s.lastSaved = json;
    console.log(`[author] levels.json entry for "${entry.id}":\n${json}`);
    const done = () => toast(`Copied "${entry.id}" — paste it into levels.json, then edit the id if needed`);
    const failed = () => toast('Clipboard blocked — the JSON is in the browser console (F12)');
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(json).then(done, failed);
    else failed();
  }

  async function paste() {
    try {
      const raw = JSON.parse((await navigator.clipboard.readText()).trim().replace(/,\s*$/, ''));
      const warnings = [];
      const [lv] = validateLevels(Array.isArray(raw) ? raw.slice(0, 1) : [raw], (m) => warnings.push(m));
      if (!lv) { toast(`Could not load: ${warnings[0] ?? 'no valid spell'}`); return; }
      loadEntry(lv);
      warnings.forEach((w) => console.warn(`[author] ${w}`));
      toast(`Loaded "${lv.id}" from clipboard${warnings.length ? ` (${warnings.length} warnings, see console)` : ''}`);
    } catch (e) {
      toast(`Paste failed: ${e.message}`);
    }
  }

  function cycleLoad() {
    const levels = game.data.levels;
    loadIndex = (loadIndex + 1) % (levels.length + 1); // last slot = blank new spell
    const lv = levels[loadIndex] ?? null;
    loadEntry(lv);
    toast(lv ? `Loaded spell ${loadIndex + 1}: ${lv.id}` : 'New blank spell');
  }

  function toggleDecoy(slot) {
    const i = s.decoys.indexOf(slot.c);
    if (i >= 0) s.decoys.splice(i, 1);
    else s.decoys.push(slot.c);
    api.dirty();
  }

  return {
    enter(levelIndex) {
      loadIndex = levelIndex;
      loadEntry(game.data.levels[levelIndex] ?? null);
    },

    onEdit() {
      api.renderCache(api.refCanvas, s.placed, s.segments);
    },

    /** @returns {boolean} true when the press was handled here */
    pointerDown(p) {
      for (const b of BTN.seg) {
        if (inBox(p, b)) { s.segments = b.n; refresh(); toast(`${b.n} mirrors`); return true; }
      }
      if (inBox(p, BTN.thrMinus) || inBox(p, BTN.thrPlus)) {
        const d = inBox(p, BTN.thrPlus) ? 0.05 : -0.05;
        s.level.threshold = Math.min(1, Math.max(0.05, Math.round((s.level.threshold + d) * 100) / 100));
        api.dirty();
        return true;
      }
      if (inBox(p, BTN.hint)) {
        s.level.hint = HINT_LEVELS[(HINT_LEVELS.indexOf(s.level.hint) + 1) % HINT_LEVELS.length];
        api.dirty();
        return true;
      }
      if (inBox(p, BTN.load)) { cycleLoad(); return true; }
      if (inBox(p, BTN.paste)) { paste(); return true; }
      if (inBox(p, BTN.save)) { save(); return true; }
      if (inBox(p, BTN.decoys)) {
        s.decoyMode = !s.decoyMode;
        toast(s.decoyMode ? 'Decoy mode: click tray crystals to add or remove decoys' : 'Decoy mode off');
        return true;
      }
      if (inBox(p, BTN.clear)) {
        s.placed = [];
        s.selectedId = null;
        this.onEdit();
        api.dirty();
        return true;
      }
      if (s.decoyMode) {
        const slot = s.tray.find((sl) => Math.abs(p.x - sl.x) <= sl.size / 2 && Math.abs(p.y - sl.y) <= sl.size / 2);
        if (slot) { toggleDecoy(slot); return true; }
      }
      return false;
    },

    draw(ctx) {
      const z = api.zones;
      api.drawCircle(ctx, z.reference, api.refCanvas, s.placed.length > 0, false, 0, 1);
      api.drawCircle(ctx, z.result, api.resCanvas, !!original, false, 0, 1);
      text(ctx, 'Live preview', z.reference.cx, 128, 22, INK_QUIET, 'center');
      text(ctx, original ? `Loaded: ${original.id} (${original.segments} mirrors)` : 'New spell — nothing loaded',
        z.result.cx, 128, 22, INK_QUIET, 'center');

      text(ctx, 'Mirrors', 80, 770, 24, INK);
      for (const b of BTN.seg) drawTextButton(ctx, b, String(b.n), s.segments === b.n);
      text(ctx, 'Pass at', 80, 836, 24, INK);
      drawTextButton(ctx, BTN.thrMinus, '−');
      text(ctx, `${Math.round(s.level.threshold * 100)}%`, 325, 836, 26, GOLD, 'center', '600');
      drawTextButton(ctx, BTN.thrPlus, '+');
      drawTextButton(ctx, BTN.hint, `Hint: ${s.level.hint}`);

      drawTextButton(ctx, BTN.load, 'Load ▸');
      drawTextButton(ctx, BTN.paste, 'Paste');
      drawTextButton(ctx, BTN.save, 'Save', false, true);
      drawTextButton(ctx, BTN.decoys, 'Decoys', s.decoyMode);
      drawTextButton(ctx, BTN.clear, 'Clear');
    },

    drawTopBar(ctx) {
      text(ctx, `Author mode · ${s.level.id}`, 960, 46, 36, GOLD, 'center', '600');
      const sol = s.placed.map((c) => c.c);
      const trayLine = `Tray: ${sol.join(', ') || '(empty)'}${s.decoys.length ? `  +  decoys: ${s.decoys.join(', ')}` : ''}`;
      text(ctx, trayLine, 960, 88, 20, INK_QUIET, 'center');
    },

    drawTray(ctx) {
      const z = api.zones.tray;
      drawArt(ctx, 'tray', z.cx, z.cy, z.w, z.h);
      const a = cfg().crystalAlpha;
      for (const slot of s.tray) {
        const n = s.decoys.filter((d) => d === slot.c).length;
        ctx.save();
        ctx.globalAlpha = a;
        const art = slot.size * 0.92;
        ctx.drawImage(crystalSprite(slot.color, slot.shape), slot.x - art / 2, slot.y - art / 2, art, art);
        ctx.restore();
        if (n) {
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(slot.x, slot.y, slot.size * 0.46, 0, Math.PI * 2);
          ctx.stroke();
          if (n > 1) text(ctx, `×${n}`, slot.x + slot.size * 0.36, slot.y - slot.size * 0.34, 18, GOLD, 'center', '600');
        }
      }
      if (s.decoyMode) {
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(z.cx - z.w / 2 + 6, z.cy - z.h / 2 + 6, z.w - 12, z.h - 12);
        ctx.setLineDash([]);
      }
    },
  };
}

// Loads config.json, levels.json and text.json, fills defaults and turns every bad value into a
// readable warning instead of a crash (T03). Designers edit the JSON files; this file is the safety net.
import { COLORS, SHAPES, SEGMENT_OPTIONS, HINT_LEVELS, parseCrystalType } from './constants.js';
import { VERSION } from './version.js';

export const DEFAULT_CONFIG = {
  colors: {
    red: '#e8463c', blue: '#3c7be8', yellow: '#f2c230',
    green: '#3cbf6a', violet: '#9a5ce6', white: '#eef2f7',
  },
  shapes: { pebble: 0.14, stick: 0.22, cylinder: 0.18, ring: 0.16, shard: 0.17 },
  crystalAlpha: 0.85,
  positionSnap: 0,
  rotationSnap: 15,
  ratingBands: { great: 0.9, perfect: 0.97 },
  resonanceBands: { medium: 0.5, high: 0.75 },
  difficultyOffset: 0,
  ghostHintAfter: 3, // 0 = off
  matchResolution: 128,
  matchTolerance: 0.016, // how far (radius = 1) a pixel may be from its match; 0.016 = 1 px at 128
  partialCredit: false,
  activation: { lock: 0.4, focus: 0.8, align: 1.0, overlap: 1.0, score: 1.0, resolve: 1.3, fizzle: 1.5 },
};

// Allowed numeric ranges by dotted path ("group.*" covers every key in a group).
const RANGES = {
  'shapes.*': [0.02, 0.6],
  crystalAlpha: [0.1, 1],
  positionSnap: [0, 0.25],
  rotationSnap: [1, 90],
  'ratingBands.*': [0, 1],
  'resonanceBands.*': [0, 1],
  difficultyOffset: [-0.5, 0.5],
  ghostHintAfter: [0, 99],
  matchResolution: [32, 256],
  matchTolerance: [0, 0.1],
  'activation.*': [0, 10],
};

export const DEFAULT_TEXT = {
  ui: {
    title: 'Kaleidoscope Spellcasting', start: 'Start', run: 'Run', activate: 'Activate',
    restart: 'Restart', menu: 'Menu', loading: 'Loading', rotateDevice: 'Rotate your device',
  },
  spells: {},
  barks: { fizzle: [], pass: [], great: [], perfect: [] },
  tutorial: {},
  scenes: {},
};

const LEVEL_KEYS = ['id', 'segments', 'threshold', 'hint', 'tray', 'solution',
  'positionSnap', 'rotationSnap', 'sceneBefore', 'sceneAfter'];
const CRYSTAL_KEYS = ['c', 'x', 'y', 'r', 's'];

function rangeFor(path) {
  if (RANGES[path]) return RANGES[path];
  const group = path.split('.')[0];
  return RANGES[`${group}.*`] || null;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Merge `input` over `defaults`, keeping only valid values. Unknown keys (usually typos) are reported.
 * @param {object} defaults
 * @param {unknown} input
 * @param {string} path
 * @param {(msg: string) => void} warn
 */
function mergeValidated(defaults, input, path, warn) {
  const out = {};
  const src = isObj(input) ? input : {};
  if (input !== undefined && !isObj(input)) warn(`${path || 'config'}: expected an object, using defaults`);

  for (const [key, def] of Object.entries(defaults)) {
    const p = path ? `${path}.${key}` : key;
    const val = src[key];
    if (val === undefined) { out[key] = structuredClone(def); continue; }

    if (isObj(def)) { out[key] = mergeValidated(def, val, p, warn); continue; }

    if (typeof def === 'number') {
      if (!isNum(val)) { warn(`${p}: "${val}" is not a number, using ${def}`); out[key] = def; continue; }
      const range = rangeFor(p);
      if (range && (val < range[0] || val > range[1])) {
        warn(`${p}: ${val} is outside ${range[0]}..${range[1]}, using ${def}`);
        out[key] = def; continue;
      }
      out[key] = val; continue;
    }

    if (typeof def === 'boolean') {
      if (typeof val !== 'boolean') { warn(`${p}: expected true or false, using ${def}`); out[key] = def; continue; }
      out[key] = val; continue;
    }

    if (typeof def === 'string') {
      const colourLike = path === 'colors';
      if (typeof val !== 'string' || (colourLike && !/^#[0-9a-f]{6}$/i.test(val))) {
        warn(`${p}: "${val}" is not valid${colourLike ? ' (use #rrggbb)' : ''}, using ${def}`);
        out[key] = def; continue;
      }
      out[key] = val; continue;
    }

    out[key] = val;
  }

  for (const key of Object.keys(src)) {
    if (!(key in defaults)) warn(`${path ? `${path}.` : ''}${key}: unknown setting ignored (typo?)`);
  }
  return out;
}

/** Validate config.json content. Exported so tools and tests can reuse it. */
export function validateConfig(raw, warn) {
  const cfg = mergeValidated(DEFAULT_CONFIG, raw ?? {}, '', warn);
  if (cfg.ratingBands.great > cfg.ratingBands.perfect) {
    warn('ratingBands: great is above perfect, using defaults');
    cfg.ratingBands = { ...DEFAULT_CONFIG.ratingBands };
  }
  if (cfg.resonanceBands.medium > cfg.resonanceBands.high) {
    warn('resonanceBands: medium is above high, using defaults');
    cfg.resonanceBands = { ...DEFAULT_CONFIG.resonanceBands };
  }
  return cfg;
}

function validateCrystal(raw, where, warn) {
  if (!isObj(raw)) { warn(`${where}: crystal is not an object, dropped`); return null; }
  const type = parseCrystalType(raw.c);
  if (!type) {
    warn(`${where}: unknown crystal "${raw.c}" (use colour-shape, e.g. "red-pebble"), dropped`);
    return null;
  }
  if (!isNum(raw.x) || !isNum(raw.y) || Math.abs(raw.x) > 1.2 || Math.abs(raw.y) > 1.2) {
    warn(`${where}: x and y must be numbers between -1.2 and 1.2, dropped`);
    return null;
  }
  let r = 0;
  if (raw.r !== undefined) {
    if (isNum(raw.r)) r = ((raw.r % 360) + 360) % 360;
    else warn(`${where}: r "${raw.r}" is not a number, using 0`);
  }
  let s = 1;
  if (raw.s !== undefined) {
    if (isNum(raw.s) && raw.s >= 0.2 && raw.s <= 3) s = raw.s;
    else warn(`${where}: s must be 0.2..3, using 1`);
  }
  for (const key of Object.keys(raw)) {
    if (!CRYSTAL_KEYS.includes(key)) warn(`${where}: unknown field "${key}" ignored`);
  }
  return { c: raw.c, color: type.color, shape: type.shape, x: raw.x, y: raw.y, r, s };
}

/** Validate levels.json content. Levels that cannot be played are skipped with a warning. */
export function validateLevels(raw, warn) {
  if (!Array.isArray(raw)) {
    warn('levels.json: expected an array of spells; no spells loaded');
    return [];
  }
  const levels = [];
  const seen = new Set();
  raw.forEach((lv, i) => {
    const where = `levels[${i}]${isObj(lv) && typeof lv.id === 'string' ? ` "${lv.id}"` : ''}`;
    if (!isObj(lv)) { warn(`${where}: not an object, skipped`); return; }

    let id = lv.id;
    if (typeof id !== 'string' || !id.trim()) {
      id = `level-${i + 1}`;
      warn(`${where}: missing id, using "${id}"`);
    }
    if (seen.has(id)) warn(`${where}: duplicate id "${id}" (text and scenes will be shared)`);
    seen.add(id);

    let segments = lv.segments;
    if (!SEGMENT_OPTIONS.includes(segments)) {
      warn(`${where}: segments must be one of ${SEGMENT_OPTIONS.join(', ')}, using 6`);
      segments = 6;
    }

    let threshold = lv.threshold;
    if (!isNum(threshold) || threshold < 0 || threshold > 1) {
      warn(`${where}: threshold must be 0..1, using 0.75`);
      threshold = 0.75;
    }

    let hint = lv.hint ?? 'full';
    if (!HINT_LEVELS.includes(hint)) {
      warn(`${where}: hint must be one of ${HINT_LEVELS.join(', ')}, using "full"`);
      hint = 'full';
    }

    const solution = (Array.isArray(lv.solution) ? lv.solution : [])
      .map((c, j) => validateCrystal(c, `${where}.solution[${j}]`, warn))
      .filter(Boolean);
    if (!Array.isArray(lv.solution)) warn(`${where}: solution must be an array`);
    if (solution.length === 0) { warn(`${where}: no valid solution crystals, spell skipped`); return; }

    let tray = (Array.isArray(lv.tray) ? lv.tray : []).filter((t, j) => {
      if (parseCrystalType(t)) return true;
      warn(`${where}.tray[${j}]: unknown crystal "${t}", dropped`);
      return false;
    });
    if (tray.length === 0) {
      tray = solution.map((c) => c.c);
      warn(`${where}: tray empty or missing, using the solution's crystals`);
    }
    // Every solution crystal must be available in the tray, counting duplicates.
    const counts = {};
    for (const t of tray) counts[t] = (counts[t] || 0) + 1;
    for (const c of solution) {
      if (!counts[c.c]) {
        warn(`${where}: solution needs "${c.c}" but the tray does not offer enough; added to tray`);
        tray.push(c.c);
      } else counts[c.c]--;
    }

    const optSnap = (key, range) => {
      if (lv[key] === undefined) return null;
      if (isNum(lv[key]) && lv[key] >= range[0] && lv[key] <= range[1]) return lv[key];
      warn(`${where}: ${key} must be ${range[0]}..${range[1]}, using the global value`);
      return null;
    };
    const optScene = (key) => {
      if (lv[key] === undefined) return null;
      if (typeof lv[key] === 'string') return lv[key];
      warn(`${where}: ${key} must be a scene id string, ignored`);
      return null;
    };

    for (const key of Object.keys(lv)) {
      if (!LEVEL_KEYS.includes(key)) warn(`${where}: unknown field "${key}" ignored (typo?)`);
    }

    levels.push({
      id, segments, threshold, hint, tray, solution,
      positionSnap: optSnap('positionSnap', RANGES.positionSnap),
      rotationSnap: optSnap('rotationSnap', RANGES.rotationSnap),
      sceneBefore: optScene('sceneBefore'),
      sceneAfter: optScene('sceneAfter'),
    });
  });
  if (levels.length === 0) warn('levels.json: no playable spells');
  return levels;
}

function mergeText(defaults, input) {
  const out = structuredClone(defaults);
  if (!isObj(input)) return out;
  for (const [k, v] of Object.entries(input)) {
    out[k] = isObj(v) && isObj(out[k]) ? mergeText(out[k], v) : v;
  }
  return out;
}

/**
 * Text lookup by dotted key. Missing keys return "[key]" so gaps are visible in game, and are recorded
 * once in `missing` for the asset report (T24).
 */
function makeT(text, missing) {
  return function t(key, fallback) {
    let v = text;
    for (const part of key.split('.')) {
      v = isObj(v) ? v[part] : undefined;
      if (v === undefined) break;
    }
    if (typeof v === 'string' || Array.isArray(v)) return v;
    if (fallback !== undefined) return fallback;
    if (!missing.has(key)) {
      missing.add(key);
      console.warn(`[text] missing key: ${key}`);
    }
    return `[${key}]`;
  };
}

const REQUIRED_UI = [
  'title', 'start', 'run', 'activate', 'restart', 'menu', 'mute', 'unmute', 'loading', 'rotateDevice',
  'threshold', 'match', 'fizzled', 'continue',
  'resonance.label', 'resonance.low', 'resonance.medium', 'resonance.high',
  'ratings.pass', 'ratings.great', 'ratings.perfect',
  'end.title', 'end.runs', 'end.spell', 'end.rating',
];

function lookup(obj, key) {
  let v = obj;
  for (const part of key.split('.')) {
    v = isObj(v) ? v[part] : undefined;
    if (v === undefined) return undefined;
  }
  return v;
}

/**
 * T24: every text key the current spells and UI need, checked against text.json.
 * @returns {{ missing: string[], placeholders: number }} placeholders = lines still marked "[placeholder]"
 */
export function checkText(data) {
  const { text, levels } = data;
  const missing = [];
  const need = (key) => {
    const v = lookup(text, key);
    if (typeof v !== 'string' || !v.trim()) missing.push(key);
  };
  REQUIRED_UI.forEach((k) => need(`ui.${k}`));
  for (const b of ['fizzle', 'pass', 'great', 'perfect']) {
    const v = lookup(text, `barks.${b}`);
    if (!Array.isArray(v) || v.length === 0) missing.push(`barks.${b} (list)`);
  }
  for (const lv of levels) {
    need(`spells.${lv.id}.name`);
    need(`spells.${lv.id}.description`);
    need(`spells.${lv.id}.incantation`);
    if (lv.hint !== 'none') need(`spells.${lv.id}.hint.${lv.hint}`);
    for (const sc of [lv.sceneBefore, lv.sceneAfter]) {
      if (!sc) continue;
      const lines = lookup(text, `scenes.${sc}`);
      if (!Array.isArray(lines) || lines.length === 0) missing.push(`scenes.${sc}`);
      else lines.forEach((l, i) => { if (!isObj(l) || typeof l.text !== 'string') missing.push(`scenes.${sc}[${i}].text`); });
    }
  }
  for (const k of data.missingText) if (!missing.includes(k)) missing.push(k);

  let placeholders = 0;
  const walk = (v) => {
    if (typeof v === 'string') { if (v.includes('[placeholder]')) placeholders++; }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (isObj(v)) Object.values(v).forEach(walk);
  };
  walk(text);
  return { missing, placeholders };
}

async function loadJSON(file, warn) {
  // play.html (single-file build) carries the data inside the page, because browsers block fetch()
  // for pages opened straight from disk.
  const embedded = globalThis.KS_EMBED?.data;
  if (embedded) {
    if (file in embedded) return structuredClone(embedded[file]);
    warn(`${file}: not included in this build, using defaults`);
    return undefined;
  }
  try {
    const res = await fetch(`data/${file}?v=${VERSION}`, { cache: 'no-cache' });
    if (!res.ok) { warn(`${file}: could not load (HTTP ${res.status}), using defaults`); return undefined; }
    const body = await res.text();
    try {
      return JSON.parse(body);
    } catch (e) {
      warn(`${file}: invalid JSON (${e.message}), using defaults`);
      return undefined;
    }
  } catch (e) {
    warn(`${file}: could not load (${e.message}), using defaults`);
    return undefined;
  }
}

/** Load and validate all data files. Never throws. */
export async function loadData() {
  const warnings = [];
  const warnFor = (file) => (msg) => {
    const line = `${file}: ${msg}`;
    warnings.push(line);
    console.warn(`[data] ${line}`);
  };
  const plain = (msg) => { warnings.push(msg); console.warn(`[data] ${msg}`); };

  const [rawConfig, rawLevels, rawText] = await Promise.all([
    loadJSON('config.json', plain),
    loadJSON('levels.json', plain),
    loadJSON('text.json', plain),
  ]);

  const config = validateConfig(rawConfig, warnFor('config.json'));
  const levels = validateLevels(rawLevels ?? [], warnFor('levels.json'));
  const text = mergeText(DEFAULT_TEXT, rawText);
  const missingText = new Set();
  const t = makeT(text, missingText);

  return { config, levels, text, t, warnings, missingText };
}

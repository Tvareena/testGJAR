// Asset registry + loader (T05). The game always asks for the FINAL file name first and only draws a
// code-made placeholder while that file is missing, so final art replaces placeholders just by dropping
// a PNG with the same name into assets/art/ and reloading. No code change is ever needed for a swap.
import { VERSION } from './version.js';
import { SHAPES } from './constants.js';
import { makePlaceholder } from './placeholders.js';

/**
 * @typedef {{ name: string, w: number, h: number, anchor: 'center' | 'topleft',
 *             kind: string, priority: 'Must' | 'Should' | 'Could', label?: string, shape?: string }} ArtEntry
 */

/** Single source of truth for expected art files (matches the task list's file registry). */
/** @type {ArtEntry[]} */
export const ART_REGISTRY = [
  ...SHAPES.map((shape) => ({
    name: `crystal-${shape}`, w: 256, h: 256, anchor: 'center', kind: 'crystal', shape, priority: 'Must',
  })),
  { name: 'ring', w: 900, h: 900, anchor: 'center', kind: 'ring', priority: 'Must' },
  // Square frosted-glass texture; the game crops it to the chamber wedge for every mirror count.
  { name: 'chamber', w: 600, h: 600, anchor: 'center', kind: 'chamber', priority: 'Must' },
  { name: 'bg-workshop', w: 1920, h: 1080, anchor: 'topleft', kind: 'bg', label: 'workshop', priority: 'Must' },
  { name: 'btn-run', w: 320, h: 120, anchor: 'center', kind: 'button', label: 'Run', priority: 'Must' },
  { name: 'btn-activate', w: 320, h: 120, anchor: 'center', kind: 'button', label: 'Activate', priority: 'Must' },
  { name: 'btn-small', w: 96, h: 96, anchor: 'center', kind: 'roundbtn', priority: 'Must' },
  { name: 'tray', w: 1600, h: 200, anchor: 'center', kind: 'panel', priority: 'Must' },
  { name: 'title', w: 1920, h: 1080, anchor: 'topleft', kind: 'title', priority: 'Must' },
  { name: 'portrait-neutral', w: 512, h: 512, anchor: 'center', kind: 'portrait', label: 'neutral', priority: 'Should' },
  { name: 'portrait-happy', w: 512, h: 512, anchor: 'center', kind: 'portrait', label: 'happy', priority: 'Should' },
  { name: 'portrait-worried', w: 512, h: 512, anchor: 'center', kind: 'portrait', label: 'worried', priority: 'Should' },
  { name: 'bg-street', w: 1920, h: 1080, anchor: 'topleft', kind: 'bg', label: 'street', priority: 'Should' },
  { name: 'bg-final', w: 1920, h: 1080, anchor: 'topleft', kind: 'bg', label: 'final', priority: 'Should' },
  ...Array.from({ length: 9 }, (_, i) => ({
    name: `icon-${String(i + 1).padStart(2, '0')}`, w: 128, h: 128, anchor: 'center',
    kind: 'bead', label: String(i + 1), priority: 'Could',
  })),
  { name: 'fx-sparkle', w: 256, h: 256, anchor: 'center', kind: 'sparkle', priority: 'Could' },
  { name: 'char-mentor', w: 600, h: 1000, anchor: 'center', kind: 'figure', label: 'mentor', priority: 'Could' },
];

/** Expected audio files in assets/audio/ (.mp3). Missing audio = silence. */
export const AUDIO_REGISTRY = [
  { name: 'clink', priority: 'Must' },
  { name: 'ring-turn', priority: 'Must' },
  { name: 'chime', priority: 'Must' },
  { name: 'success', priority: 'Must' },
  { name: 'fizzle', priority: 'Must' },
  { name: 'text-blip', priority: 'Should' },
  { name: 'ambient', priority: 'Could' },
];

const ASPECT_TOLERANCE = 0.02;

/** @type {Map<string, ArtEntry & { img: CanvasImageSource, final: boolean, note?: string }>} */
const art = new Map();
/** @type {Map<string, { name: string, priority: string, url: string | null, final: boolean }>} */
const audio = new Map();
const warnedUnknown = new Set();

export const artUrl = (name) => `assets/art/${name}.png?v=${VERSION}`;
export const audioUrl = (name) => `assets/audio/${name}.mp3?v=${VERSION}`;

function loadImage(entry) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let note;
      const expected = entry.w / entry.h;
      const actual = img.naturalWidth / img.naturalHeight;
      if (Math.abs(actual - expected) / expected > ASPECT_TOLERANCE) {
        note = `aspect ratio ${img.naturalWidth}x${img.naturalHeight} differs from ${entry.w}x${entry.h}; it will be stretched`;
        console.warn(`[assets] ${entry.name}.png: ${note}`);
      }
      resolve({ ...entry, img, final: true, note });
    };
    img.onerror = () => {
      console.warn(`[assets] art missing, using placeholder: assets/art/${entry.name}.png`);
      resolve({ ...entry, img: makePlaceholder(entry), final: false });
    };
    img.src = artUrl(entry.name);
  });
}

async function loadAudio(entry) {
  try {
    const res = await fetch(audioUrl(entry.name));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return { ...entry, url: URL.createObjectURL(blob), final: true };
  } catch {
    console.warn(`[assets] audio missing, will be silent: assets/audio/${entry.name}.mp3`);
    return { ...entry, url: null, final: false };
  }
}

/**
 * Load every registered asset. Never rejects; missing files fall back to placeholders or silence.
 * @param {(progress: number) => void} [onProgress] 0..1
 */
export async function loadAssets(onProgress) {
  const total = ART_REGISTRY.length + AUDIO_REGISTRY.length;
  let done = 0;
  const tick = () => onProgress?.(++done / total);
  await Promise.all([
    ...ART_REGISTRY.map((e) => loadImage(e).then((r) => { art.set(e.name, r); tick(); })),
    ...AUDIO_REGISTRY.map((e) => loadAudio(e).then((r) => { audio.set(e.name, r); tick(); })),
  ]);
}

/** @param {string} name */
export function getArt(name) {
  const a = art.get(name);
  if (!a && !warnedUnknown.has(name)) {
    warnedUnknown.add(name);
    console.warn(`[assets] "${name}" is not in ART_REGISTRY`);
  }
  return a ?? null;
}

/**
 * Draw an art file at its design size (or a given size), honouring its anchor.
 * Final art of any resolution fits because the drawn size never depends on the image's pixel size.
 */
export function drawArt(ctx, name, x, y, w, h) {
  const a = getArt(name);
  if (!a) return;
  const dw = w ?? a.w;
  const dh = h ?? a.h;
  const dx = a.anchor === 'center' ? x - dw / 2 : x;
  const dy = a.anchor === 'center' ? y - dh / 2 : y;
  ctx.drawImage(a.img, dx, dy, dw, dh);
}

export function getAudioUrl(name) {
  return audio.get(name)?.url ?? null;
}

/** Status of every registered asset, for the ?assets report (T24) and the boot check screen. */
export function assetStatus() {
  return {
    art: ART_REGISTRY.map((e) => {
      const a = art.get(e.name);
      return { name: e.name, priority: e.priority, final: !!a?.final, note: a?.note };
    }),
    audio: AUDIO_REGISTRY.map((e) => ({ name: e.name, priority: e.priority, final: !!audio.get(e.name)?.final })),
  };
}

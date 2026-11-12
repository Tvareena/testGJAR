// Audio (T37): play(name) for sound effects from assets/audio/, mute toggle, iOS unlock, ambient loop.
// Missing files are simply silent, so the game works before any sound is added.
import { getAudioUrl, AUDIO_REGISTRY } from './assets.js';

const POOL_SIZE = 4;
const pools = new Map();
let muted = false;
let unlocked = false;
let ambient = null;

try {
  muted = localStorage.getItem('ks-muted') === '1';
} catch {
  // Storage can be blocked (private mode); mute just won't be remembered.
}

function element(name) {
  const url = getAudioUrl(name);
  if (!url) return null;
  let pool = pools.get(name);
  if (!pool) {
    pool = [];
    pools.set(name, pool);
  }
  let a = pool.find((x) => x.paused || x.ended);
  if (!a && pool.length < POOL_SIZE) {
    a = new Audio(url);
    a.preload = 'auto';
    pool.push(a);
  }
  return a ?? null;
}

/**
 * Play a sound effect. `rate` changes pitch (used for the rising activation chime).
 * @param {string} name registry name, e.g. 'chime'
 */
export function play(name, { rate = 1, volume = 1 } = {}) {
  if (muted) return;
  const a = element(name);
  if (!a) return;
  try {
    a.currentTime = 0;
    a.preservesPitch = false;
    a.playbackRate = rate;
    a.volume = volume;
    a.play()?.catch(() => {});
  } catch {
    // Playback can fail before the first user gesture; ignore.
  }
}

/** iOS and some browsers only allow audio after a user gesture: prime every sound once, muted. */
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  for (const { name } of AUDIO_REGISTRY) {
    if (name === 'ambient') continue;
    const a = element(name);
    if (!a) continue;
    a.muted = true;
    a.play()?.then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
  }
}

/** Quiet looping background, started from a user gesture (Start button). */
export function startAmbient() {
  const url = getAudioUrl('ambient');
  if (ambient || !url) return;
  ambient = new Audio(url);
  ambient.loop = true;
  ambient.volume = 0.3;
  if (!muted) ambient.play()?.catch(() => {});
}

export const isMuted = () => muted;

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem('ks-muted', muted ? '1' : '0');
  } catch {
    // ignore
  }
  if (ambient) {
    if (muted) ambient.pause();
    else ambient.play()?.catch(() => {});
  }
  return muted;
}

// Tiny tween timeline (T31). Tracks write eased progress into whatever values the caller owns.
//   const tl = createTimeline();
//   tl.add(0.4, 0.8, (p) => { v.x = lerp(a, b, p); }, ease.inOutCubic);
//   tl.at(2.2, () => audio.play('chime'));
//   tl.update(dt);  tl.seek(4.2);  tl.done
// Only tracks that have started are applied (finished ones at p = 1), in the order they were added, so a
// later track on the same value takes over cleanly when it starts.

export const ease = {
  linear: (x) => x,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  outBack: (x) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  },
};

export const lerp = (a, b, p) => a + (b - a) * p;

export function createTimeline() {
  const tracks = [];
  const events = [];
  let time = 0;
  let end = 0;

  function apply() {
    for (const tr of tracks) {
      if (time < tr.start) continue;
      const p = tr.dur > 0 ? Math.min(1, (time - tr.start) / tr.dur) : 1;
      tr.fn(tr.ease(p));
    }
  }

  return {
    /** Add a track from `start` for `dur` seconds; fn receives eased progress 0..1. */
    add(start, dur, fn, easing = ease.linear) {
      tracks.push({ start, dur, fn, ease: easing });
      end = Math.max(end, start + dur);
      return this;
    },
    /** Fire fn once when playback passes `start` (skipped by seek). */
    at(start, fn) {
      events.push({ start, fn, fired: false });
      end = Math.max(end, start);
      return this;
    },
    update(dt) {
      const next = time + dt;
      for (const e of events) {
        if (!e.fired && e.start <= next) {
          e.fired = true;
          e.fn();
        }
      }
      time = next;
      apply();
    },
    /** Jump to a time; events before it are marked as fired without running. */
    seek(t) {
      time = t;
      for (const e of events) if (e.start < t) e.fired = true;
      apply();
    },
    get time() { return time; },
    get duration() { return end; },
    get done() { return time >= end; },
  };
}

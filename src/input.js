// Pointer + keyboard input in design-space coordinates (T12). One active pointer at a time.
// The current scene receives: pointerDown/Move/Up/Cancel(p), wheel(p, dir), key(key, event) -> handled?

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ toDesign: (x: number, y: number) => { x: number, y: number } }} layout
 * @param {() => any} getHandler returns the current scene
 */
export function createInput(canvas, layout, getHandler) {
  let active = null;
  const pos = (e) => layout.toDesign(e.clientX, e.clientY);

  canvas.addEventListener('pointerdown', (e) => {
    if (active !== null) return; // ignore extra touches
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    active = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail (e.g. synthetic or already-released pointers); input still works without it.
    }
    e.preventDefault();
    getHandler()?.pointerDown?.(pos(e));
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active) return;
    getHandler()?.pointerMove?.(pos(e));
  });

  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerId !== active) return;
    active = null;
    getHandler()?.pointerUp?.(pos(e));
  });

  canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== active) return;
    active = null;
    const h = getHandler();
    if (h?.pointerCancel) h.pointerCancel(pos(e));
    else h?.pointerUp?.(pos(e));
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY !== 0) getHandler()?.wheel?.(pos(e), Math.sign(e.deltaY));
  }, { passive: false });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.repeat && e.key !== 'q' && e.key !== 'e' && e.key !== 'Q' && e.key !== 'E') return;
    if (getHandler()?.key?.(e.key, e)) e.preventDefault();
  });
}

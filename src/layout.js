// Fixed 1920 x 1080 design space, scaled to fit the window with letterbox bars (T02).
export const DESIGN_W = 1920;
export const DESIGN_H = 1080;
const MAX_DPR = 2;

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createLayout(canvas) {
  const layout = {
    scale: 1,      // design px -> CSS px
    offsetX: 0,    // CSS px from window left to design origin
    offsetY: 0,
    dpr: 1,
    cssW: 0,
    cssH: 0,
    /** @type {null | (() => void)} */
    onResize: null,
  };

  function resize() {
    const vv = window.visualViewport;
    const w = Math.round(vv ? vv.width : window.innerWidth);
    const h = Math.round(vv ? vv.height : window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));

    const scale = Math.min(w / DESIGN_W, h / DESIGN_H);
    layout.scale = scale;
    layout.offsetX = (w - DESIGN_W * scale) / 2;
    layout.offsetY = (h - DESIGN_H * scale) / 2;
    layout.dpr = dpr;
    layout.cssW = w;
    layout.cssH = h;
    layout.onResize?.();
  }

  /** Clear to letterbox black, then set the transform so drawing uses design px, clipped to the design area. */
  layout.begin = (/** @type {CanvasRenderingContext2D} */ ctx) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const k = layout.dpr * layout.scale;
    ctx.setTransform(k, 0, 0, k, layout.dpr * layout.offsetX, layout.dpr * layout.offsetY);
    ctx.beginPath();
    ctx.rect(0, 0, DESIGN_W, DESIGN_H);
    ctx.clip();
  };

  /** Convert a pointer's client coordinates to design-space coordinates. */
  layout.toDesign = (/** @type {number} */ clientX, /** @type {number} */ clientY) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - layout.offsetX) / layout.scale,
      y: (clientY - r.top - layout.offsetY) / layout.scale,
    };
  };

  layout.isPortrait = () => layout.cssH > layout.cssW;

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 50));
  window.visualViewport?.addEventListener('resize', resize);
  resize();
  return layout;
}

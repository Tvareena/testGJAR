// Shared drawing helpers for buttons and text. Button art has no text: labels come from text.json.
import { drawArt } from './assets.js';

export const UI_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const INK = '#e8e2d4';
export const INK_QUIET = 'rgba(232,226,212,0.6)';
export const GOLD = '#e2c48a';

export function text(ctx, str, x, y, size, color = INK, align = 'left', weight = 'normal') {
  ctx.font = `${weight} ${size}px ${UI_FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

/** Break text into lines no wider than maxWidth at the given font size. */
export function wrapText(ctx, str, maxWidth, size, weight = 'normal') {
  ctx.font = `${weight} ${size}px ${UI_FONT}`;
  const lines = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

/** Point inside a top-left rect {x, y, w, h}. */
export const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Point inside a centred box {cx, cy, w, h}. */
export const inBox = (p, b) => Math.abs(p.x - b.cx) <= b.w / 2 && Math.abs(p.y - b.cy) <= b.h / 2;

export function drawButton(ctx, art, box, label, enabled = true) {
  ctx.save();
  ctx.globalAlpha *= enabled ? 1 : 0.38; // multiply, so fading the whole UI also fades buttons
  drawArt(ctx, art, box.cx, box.cy, box.w, box.h);
  text(ctx, label, box.cx, box.cy + 2, Math.round(box.h * 0.4), '#f0e6d2', 'center', '600');
  ctx.restore();
}

/** Plain code-drawn text button for tools (author mode). */
export function drawTextButton(ctx, box, label, active = false, strong = false) {
  const x = box.cx - box.w / 2;
  const y = box.cy - box.h / 2;
  const r = Math.min(12, box.h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + box.w, y, x + box.w, y + box.h, r);
  ctx.arcTo(x + box.w, y + box.h, x, y + box.h, r);
  ctx.arcTo(x, y + box.h, x, y, r);
  ctx.arcTo(x, y, x + box.w, y, r);
  ctx.closePath();
  ctx.fillStyle = active ? 'rgba(226,196,138,0.28)' : '#232c3b';
  ctx.fill();
  ctx.strokeStyle = active || strong ? GOLD : 'rgba(176,141,87,0.7)';
  ctx.lineWidth = active || strong ? 3 : 2;
  ctx.stroke();
  text(ctx, label, box.cx, box.cy + 1, Math.round(Math.min(28, box.h * 0.45)), '#f0e6d2', 'center', '600');
}

/** Small round button (btn-small art) with a code-drawn icon: 'rotL', 'rotR' or 'del'. */
export function drawIconButton(ctx, x, y, size, icon) {
  drawArt(ctx, 'btn-small', x, y, size, size);
  const r = size * 0.22;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#f0e6d2';
  ctx.fillStyle = '#f0e6d2';
  ctx.lineWidth = Math.max(3, size * 0.07);
  ctx.lineCap = 'round';
  if (icon === 'del') {
    ctx.beginPath();
    ctx.moveTo(-r, -r); ctx.lineTo(r, r);
    ctx.moveTo(r, -r); ctx.lineTo(-r, r);
    ctx.stroke();
  } else {
    if (icon === 'rotL') ctx.scale(-1, 1);
    // Clockwise arc with an arrowhead at its end.
    const a0 = -Math.PI * 0.85;
    const a1 = Math.PI * 0.35;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a1);
    ctx.stroke();
    const ex = Math.cos(a1) * r;
    const ey = Math.sin(a1) * r;
    const h = size * 0.13;
    ctx.beginPath();
    ctx.moveTo(ex + h * 0.9, ey - h * 0.2);
    ctx.lineTo(ex - h * 0.5, ey + h * 0.9);
    ctx.lineTo(ex - h * 0.6, ey - h * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

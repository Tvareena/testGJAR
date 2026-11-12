// Code-drawn placeholders (T06). Each is drawn at the registry size and anchor of the final file it
// stands in for, so final art lines up with it exactly when swapped in.

const UI_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const TITLE_FONT = 'Georgia, "Times New Roman", serif';
const BRASS = '#b08d57';
const BRASS_LIGHT = '#e2c48a';
const BRASS_DARK = '#6e5328';
const PANEL = '#232c3b';

/** @param {{ w: number, h: number, kind: string, label?: string, shape?: string, name: string }} entry */
export function makePlaceholder(entry) {
  const c = document.createElement('canvas');
  c.width = entry.w;
  c.height = entry.h;
  const g = c.getContext('2d');
  (DRAW[entry.kind] ?? drawUnknown)(g, entry);
  return c;
}

function roundRectPath(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function label(g, text, x, y, size, color = 'rgba(255,255,255,0.35)', align = 'center') {
  g.font = `${size}px ${UI_FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

// ---- crystals: light grey glass, tinted in code later (T07) ----

function crystalPath(g, shape) {
  g.beginPath();
  switch (shape) {
    case 'pebble':
      g.ellipse(0, 0, 92, 66, 0, 0, Math.PI * 2);
      break;
    case 'stick':
      roundRectPath(g, -112, -17, 224, 34, 17);
      break;
    case 'cylinder':
      roundRectPath(g, -90, -42, 180, 84, 14);
      break;
    case 'ring':
      g.arc(0, 0, 98, 0, Math.PI * 2);
      g.moveTo(52, 0);
      g.arc(0, 0, 52, 0, Math.PI * 2, true);
      break;
    case 'shard':
      g.moveTo(-82, -58);
      g.lineTo(28, -98);
      g.lineTo(102, -12);
      g.lineTo(52, 86);
      g.lineTo(-72, 62);
      g.closePath();
      break;
    default:
      g.rect(-80, -80, 160, 160);
  }
}

function drawCrystal(g, e) {
  g.translate(e.w / 2, e.h / 2);
  crystalPath(g, e.shape);
  const grad = g.createLinearGradient(-100, -100, 100, 100);
  grad.addColorStop(0, '#f2f4f7');
  grad.addColorStop(1, '#a3a9b3');
  g.fillStyle = grad;
  g.fill('evenodd');

  g.save();
  crystalPath(g, e.shape);
  g.clip('evenodd');
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.ellipse(-34, -30, 44, 18, -0.6, 0, Math.PI * 2);
  g.fill();
  g.restore();

  if (e.shape === 'cylinder') {
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 4;
    for (const x of [-70, 70]) {
      g.beginPath();
      g.ellipse(x, 0, 12, 40, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }

  crystalPath(g, e.shape);
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = 4;
  g.stroke();
}

// ---- kaleidoscope frame pieces ----

function drawRing(g, e) {
  const cx = e.w / 2;
  const cy = e.h / 2;
  const outer = e.w / 2 - 4;
  const inner = e.w / 2 - 50; // transparent window radius = 400 at 900 px

  const grad = g.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0, BRASS_DARK);
  grad.addColorStop(0.35, BRASS_LIGHT);
  grad.addColorStop(0.7, BRASS);
  grad.addColorStop(1, BRASS_DARK);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, outer, 0, Math.PI * 2);
  g.arc(cx, cy, inner, 0, Math.PI * 2, true);
  g.fill('evenodd');

  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, inner, 0, Math.PI * 2);
  g.stroke();

  // "Up" notch at the top
  g.fillStyle = '#2a1e0c';
  g.beginPath();
  g.moveTo(cx - 18, 6);
  g.lineTo(cx + 18, 6);
  g.lineTo(cx, 44);
  g.closePath();
  g.fill();

  // Tick marks every 30 degrees
  g.strokeStyle = 'rgba(42,30,12,0.6)';
  g.lineWidth = 3;
  for (let i = 1; i < 12; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 6;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (outer - 8), cy + Math.sin(a) * (outer - 8));
    g.lineTo(cx + Math.cos(a) * (outer - 24), cy + Math.sin(a) * (outer - 24));
    g.stroke();
  }
}

function drawChamber(g, e) {
  // Square frosted-glass texture. The game crops it to the chamber wedge (any mirror count) and draws
  // the mirror edges itself, so the art has no wedge outline.
  const grad = g.createLinearGradient(0, 0, 0, e.h);
  grad.addColorStop(0, 'rgba(200,218,245,0.24)');
  grad.addColorStop(1, 'rgba(200,218,245,0.08)');
  g.fillStyle = grad;
  g.fillRect(0, 0, e.w, e.h);
  g.strokeStyle = 'rgba(235,242,255,0.06)';
  g.lineWidth = 10;
  for (let x = -e.h; x < e.w; x += 46) {
    g.beginPath();
    g.moveTo(x, e.h);
    g.lineTo(x + e.h, 0);
    g.stroke();
  }
  label(g, 'chamber', e.w / 2, e.h * 0.55, 26, 'rgba(255,255,255,0.18)');
}

// ---- screens and panels ----

function drawBg(g, e) {
  const grad = g.createLinearGradient(0, 0, 0, e.h);
  grad.addColorStop(0, '#1b2333');
  grad.addColorStop(1, '#0b0e14');
  g.fillStyle = grad;
  g.fillRect(0, 0, e.w, e.h);
  label(g, `placeholder · ${e.name}`, e.w - 40, e.h - 36, 28, 'rgba(255,255,255,0.22)', 'right');
}

function drawTitle(g, e) {
  drawBg(g, e);
  g.font = `bold 104px ${TITLE_FONT}`;
  g.fillStyle = BRASS_LIGHT;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Kaleidoscope Spellcasting', e.w / 2, e.h * 0.4);
  label(g, 'placeholder title art', e.w / 2, e.h * 0.4 + 90, 32);
}

function drawButton(g, e) {
  roundRectPath(g, 4, 4, e.w - 8, e.h - 8, 28);
  g.fillStyle = PANEL;
  g.fill();
  g.strokeStyle = BRASS;
  g.lineWidth = 6;
  g.stroke();
  // No baked-in label: button text is drawn by the game from text.json, so final button art has no text.
}

function drawRoundButton(g, e) {
  g.beginPath();
  g.arc(e.w / 2, e.h / 2, e.w / 2 - 4, 0, Math.PI * 2);
  g.fillStyle = PANEL;
  g.fill();
  g.strokeStyle = BRASS;
  g.lineWidth = 5;
  g.stroke();
}

function drawPanel(g, e) {
  roundRectPath(g, 3, 3, e.w - 6, e.h - 6, 32);
  g.fillStyle = 'rgba(20,26,36,0.88)';
  g.fill();
  g.strokeStyle = 'rgba(176,141,87,0.7)';
  g.lineWidth = 5;
  g.stroke();
}

function drawPortrait(g, e) {
  g.fillStyle = '#6b7686';
  g.beginPath();
  g.arc(e.w / 2, e.h * 0.37, e.w * 0.17, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.rect(0, 0, e.w, e.h);
  g.clip();
  g.beginPath();
  g.ellipse(e.w / 2, e.h * 0.95, e.w * 0.37, e.h * 0.32, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  label(g, e.label ?? '', e.w / 2, e.h - 36, 34, 'rgba(255,255,255,0.75)');
}

function drawBead(g, e) {
  const r = e.w / 2 - 8;
  const grad = g.createRadialGradient(e.w * 0.4, e.h * 0.35, 4, e.w / 2, e.h / 2, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#8b95a5');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(e.w / 2, e.h / 2, r, 0, Math.PI * 2);
  g.fill();
  label(g, e.label ?? '', e.w / 2, e.h / 2 + 2, 48, '#1b2333');
}

function drawSparkle(g, e) {
  const cx = e.w / 2;
  const cy = e.h / 2;
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, e.w / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, e.w, e.h);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const rad = i % 2 === 0 ? e.w * 0.46 : e.w * 0.08;
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
  g.fill();
}

function drawFigure(g, e) {
  g.fillStyle = '#6b7686';
  g.beginPath();
  g.arc(e.w / 2, e.h * 0.12, e.w * 0.11, 0, Math.PI * 2);
  g.fill();
  roundRectPath(g, e.w * 0.28, e.h * 0.21, e.w * 0.44, e.h * 0.45, 40);
  g.fill();
  roundRectPath(g, e.w * 0.3, e.h * 0.62, e.w * 0.16, e.h * 0.36, 24);
  g.fill();
  roundRectPath(g, e.w * 0.54, e.h * 0.62, e.w * 0.16, e.h * 0.36, 24);
  g.fill();
  label(g, e.label ?? '', e.w / 2, e.h * 0.42, 40, 'rgba(255,255,255,0.75)');
}

function drawUnknown(g, e) {
  g.fillStyle = '#ff00ff';
  g.fillRect(0, 0, e.w, e.h);
  label(g, e.name, e.w / 2, e.h / 2, 24, '#000');
}

const DRAW = {
  crystal: drawCrystal,
  ring: drawRing,
  chamber: drawChamber,
  bg: drawBg,
  title: drawTitle,
  button: drawButton,
  roundbtn: drawRoundButton,
  panel: drawPanel,
  portrait: drawPortrait,
  bead: drawBead,
  sparkle: drawSparkle,
  figure: drawFigure,
};

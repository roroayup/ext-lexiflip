// Renders the toolbar/store icons into src/icons/ (two stacked cards on an indigo tile).
// Run with `npm run icons` after changing the design; the PNGs are committed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './util.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'icons');
const SIZES = [16, 32, 48, 96, 128];
const SAMPLES = 4; // 4x4 supersampling for anti-aliased edges

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Signed distance to a rounded box centred on (cx, cy), rotated by `deg`.
function roundBox(px, py, { cx, cy, hw, hh, r, deg = 0 }) {
  const a = (-deg * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  const x = Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) - hw + r;
  const y = Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) - hh + r;
  return Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0) - r;
}

// Local point inside a rotated shape, for placing the "text" lines on the front card.
function toLocal(px, py, { cx, cy, deg }) {
  const a = (-deg * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}

const TILE = { cx: 0.5, cy: 0.5, hw: 0.5, hh: 0.5, r: 0.23 };
const BACK = { cx: 0.575, cy: 0.465, hw: 0.19, hh: 0.25, r: 0.05, deg: 14 };
const FRONT = { cx: 0.445, cy: 0.54, hw: 0.19, hh: 0.25, r: 0.05, deg: -8 };
const LINE1 = { cx: 0, cy: -0.07, hw: 0.115, hh: 0.032, r: 0.03 };
const LINE2 = { cx: 0, cy: 0.045, hw: 0.075, hh: 0.026, r: 0.025 };

const C_TOP = hex('#6366f1');
const C_BOTTOM = hex('#4338ca');
const C_BACK = hex('#a5b4fc');
const C_FRONT = hex('#ffffff');
const C_LINE1 = hex('#4f46e5');
const C_LINE2 = hex('#c7d2fe');

function shade(x, y) {
  // Returns [r, g, b, a] for one sample, painting layers bottom to top.
  if (roundBox(x, y, TILE) > 0) return [0, 0, 0, 0];
  let c = mix(C_TOP, C_BOTTOM, Math.min(1, Math.max(0, (x + y) / 2)));
  if (roundBox(x, y, BACK) <= 0) c = C_BACK;
  if (roundBox(x, y, FRONT) <= 0) {
    c = C_FRONT;
    const [lx, ly] = toLocal(x, y, FRONT);
    if (roundBox(lx, ly, LINE1) <= 0) c = C_LINE1;
    else if (roundBox(lx, ly, LINE2) <= 0) c = C_LINE2;
  }
  return [...c, 255];
}

function render(size) {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const s = shade((x + (sx + 0.5) / SAMPLES) / size, (y + (sy + 0.5) / SAMPLES) / size);
          // Premultiply so transparent samples don't darken the edge.
          acc[0] += s[0] * s[3]; acc[1] += s[1] * s[3]; acc[2] += s[2] * s[3]; acc[3] += s[3];
        }
      }
      const i = (y * size + x) * 4;
      const a = acc[3] / (SAMPLES * SAMPLES);
      px[i + 3] = Math.round(a);
      if (acc[3] > 0) for (let k = 0; k < 3; k++) px[i + k] = Math.round(acc[k] / acc[3]);
    }
  }
  return encodePng(size, size, px);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  writeFileSync(join(OUT, `icon-${size}.png`), render(size));
  console.log(`icons/icon-${size}.png`);
}

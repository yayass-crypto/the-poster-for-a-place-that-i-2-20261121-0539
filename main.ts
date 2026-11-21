// LUMARIS — Isles of the Lantern Tide.
// A travel poster for a place that does not exist, painted procedurally
// with Node's standard library only (no network, no fonts, no assets).
// Deterministic: one fixed seed drives every star, lantern and cloud,
// so two runs write byte-identical PNGs.
//
// Run:  node main.ts            (Node 22, type-stripped; also Node 24)
// Out:  $MAKEFUN_OUTPUT_DIR/entry.png  (or /output/entry.png)
//       1024 x 1024, RGB PNG, <= 1 MiB.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- seed
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261121);

// ---------------------------------------------------------------- canvas
const px = new Uint8ClampedArray(W * H * 4);
for (let i = 3; i < px.length; i += 4) px[i] = 255;

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function blend(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 4;
  const ia = 1 - a;
  px[i] = clamp255(r * a + px[i] * ia);
  px[i + 1] = clamp255(g * a + px[i + 1] * ia);
  px[i + 2] = clamp255(b * a + px[i + 2] * ia);
}

function fillRect(x0, y0, x1, y1, r, g, b, a) {
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W - 1, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H - 1, Math.ceil(y1));
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) blend(x, y, r, g, b, a);
}

// Vertical gradient through colour stops [[y, r, g, b], ...], with a
// whisper of deterministic grain so wide skies do not band.
function vGradient(stops) {
  for (let y = 0; y < H; y++) {
    let s0 = stops[0], s1 = stops[stops.length - 1];
    for (let k = 0; k < stops.length - 1; k++) {
      if (y >= stops[k][0] && y <= stops[k + 1][0]) { s0 = stops[k]; s1 = stops[k + 1]; break; }
    }
    const t = s1[0] === s0[0] ? 0 : (y - s0[0]) / (s1[0] - s0[0]);
    const r = s0[1] + (s1[1] - s0[1]) * t;
    const g = s0[2] + (s1[2] - s0[2]) * t;
    const b = s0[3] + (s1[3] - s0[3]) * t;
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      // tiny hash grain, +-2, deterministic per pixel
      const n = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 5 - 2;
      const i = row + x * 4;
      px[i] = clamp255(r + n); px[i + 1] = clamp255(g + n); px[i + 2] = clamp255(b + n);
    }
  }
}

function disc(cx, cy, rad, r, g, b, a) {
  const xa = Math.max(0, Math.floor(cx - rad)), xb = Math.min(W - 1, Math.ceil(cx + rad));
  const ya = Math.max(0, Math.floor(cy - rad)), yb = Math.min(H - 1, Math.ceil(cy + rad));
  const rr = rad * rad;
  for (let y = ya; y <= yb; y++) {
    const dy = y - cy;
    for (let x = xa; x <= xb; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= rr) blend(x, y, r, g, b, a);
    }
  }
}

// Soft radial glow: colour fades to transparent at radius rad.
function glow(cx, cy, rad, r, g, b, peak) {
  const xa = Math.max(0, Math.floor(cx - rad)), xb = Math.min(W - 1, Math.ceil(cx + rad));
  const ya = Math.max(0, Math.floor(cy - rad)), yb = Math.min(H - 1, Math.ceil(cy + rad));
  for (let y = ya; y <= yb; y++) {
    const dy = (y - cy) / rad;
    for (let x = xa; x <= xb; x++) {
      const dx = (x - cx) / rad;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1) continue;
      const f = (1 - d) * (1 - d);
      blend(x, y, r, g, b, peak * f);
    }
  }
}

function ellipse(cx, cy, rx, ry, r, g, b, a) {
  const xa = Math.max(0, Math.floor(cx - rx)), xb = Math.min(W - 1, Math.ceil(cx + rx));
  const ya = Math.max(0, Math.floor(cy - ry)), yb = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = ya; y <= yb; y++) {
    const dy = (y - cy) / ry;
    for (let x = xa; x <= xb; x++) {
      const dx = (x - cx) / rx;
      if (dx * dx + dy * dy <= 1) blend(x, y, r, g, b, a);
    }
  }
}

// Scanline polygon fill.
function polygon(points, r, g, b, a) {
  let minY = H, maxY = 0;
  for (const p of points) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const ya = Math.max(0, Math.floor(minY)), yb = Math.min(H - 1, Math.ceil(maxY));
  for (let y = ya; y <= yb; y++) {
    const xs = [];
    for (let k = 0; k < points.length; k++) {
      const p0 = points[k], p1 = points[(k + 1) % points.length];
      if ((p0[1] <= y && p1[1] > y) || (p1[1] <= y && p0[1] > y)) {
        xs.push(p0[0] + (y - p0[1]) * (p1[0] - p0[0]) / (p1[1] - p0[1]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k])), xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) blend(x, y, r, g, b, a);
    }
  }
}

// Thick line with round caps, by stamping discs along the segment.
function thickLine(x0, y0, x1, y1, w, r, g, b, a) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(1, w * 0.35);
  const n = Math.max(1, Math.ceil(len / step));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, r, g, b, a);
  }
}

// ---------------------------------------------------------------- type
// A hand-drawn geometric stroke font on a 5 x 7 grid (x 0..4, y 0..6).
// Each glyph is a list of polylines; strokes carry the poster's mood
// better than any borrowed font file could, and keep the program
// self-contained (no font files exist in the sandbox).
const FONT = {
  A: [[[0, 6], [2, 0], [4, 6]], [[1, 4], [3, 4]]],
  B: [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 5], [3, 6], [0, 6]]],
  E: [[[0, 0], [0, 6]], [[0, 0], [4, 0]], [[0, 3], [3, 3]], [[0, 6], [4, 6]]],
  F: [[[0, 0], [0, 6]], [[0, 0], [4, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[0, 0], [4, 0]], [[2, 0], [2, 6]], [[0, 6], [4, 6]]],
  J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [1, 3]], [[2, 4], [4, 6]]],
  L: [[[0, 0], [0, 6]], [[0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  P: [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
  Q: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[2.5, 4.5], [4, 6.5]]],
  R: [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[2, 3], [4, 6]]],
  S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 3], [3, 6], [4, 0]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  "·": [[[2, 2.6], [2, 3.4]]],
  "—": [[[0, 3], [4, 3]]],
  " ": [],
};

function textWidth(text, unit) {
  let w = 0;
  for (const ch of text) w += ch === " " ? 3 * unit : 6 * unit;
  return w - unit; // no trailing advance
}

// Draw text centred at (cx, topY); capHeight in px; strokeW in grid units.
function drawText(text, cx, topY, capHeight, strokeW, r, g, b, a) {
  const unit = capHeight / 6;
  let x = cx - textWidth(text, unit) / 2;
  for (const ch of text) {
    const glyph = FONT[ch];
    if (glyph) {
      for (const stroke of glyph) {
        for (let k = 0; k + 1 < stroke.length; k++) {
          thickLine(
            x + stroke[k][0] * unit, topY + stroke[k][1] * unit,
            x + stroke[k + 1][0] * unit, topY + stroke[k + 1][1] * unit,
            strokeW * unit, r, g, b, a,
          );
        }
      }
    }
    x += (ch === " " ? 3 : 6) * unit;
  }
}

// ---------------------------------------------------------------- sky
vGradient([
  [0, 26, 32, 66],      // deep indigo night at the top
  [300, 74, 58, 112],   // violet
  [520, 178, 84, 106],  // rose
  [660, 242, 150, 92],  // amber horizon
  [760, 250, 196, 120], // low gold haze
  [1024, 250, 214, 150],
]);

// Stars, only where the sky is still dark.
for (let k = 0; k < 150; k++) {
  const x = rnd() * W, y = rnd() * 430;
  const s = rnd();
  const a = 0.25 + s * 0.65;
  const r = s > 0.92 ? 2.2 : 1.3;
  disc(x, y, r, 255, 244, 214, a);
  if (s > 0.85) { // cross sparkle on the brightest few
    thickLine(x - 5, y, x + 5, y, 1, 255, 244, 214, a * 0.5);
    thickLine(x, y - 5, x, y + 5, 1, 255, 244, 214, a * 0.5);
  }
}

// The low sun, half-sunk behind the right isle, and its halo.
glow(860, 590, 280, 255, 170, 90, 0.55);
glow(860, 590, 160, 255, 205, 120, 0.6);
disc(860, 590, 88, 255, 216, 138, 1);
disc(860, 590, 88, 255, 190, 100, 0.25); // warm inner tint
// Sun's reflection shimmer on the cloud sea below.
for (let k = 0; k < 26; k++) {
  const y = 760 + rnd() * 220;
  const wdt = 30 + rnd() * 150;
  const x = 860 + (rnd() - 0.5) * (900 - (y - 760));
  fillRect(x - wdt / 2, y, x + wdt / 2, y + 2.5, 255, 200, 120, 0.10 + rnd() * 0.12);
}

// ------------------------------------------------------- distant isles
// Far, hazy silhouette so the world feels deep (the right side is
// kept clear for the low sun).
ellipse(150, 640, 120, 26, 90, 70, 120, 0.55);
polygon([[60, 640], [150, 612], [240, 640], [205, 700], [95, 700]], 90, 70, 120, 0.55);

// ------------------------------------------------------- cloud sea
// Layered cloud bands, back to front, so the isles float above mist.
function cloudBand(yBase, amp, r, g, b, a, seedOff) {
  const rr = mulberry32(777 + seedOff);
  for (let k = 0; k < 46; k++) {
    const cx = rr() * W;
    const cy = yBase + (rr() - 0.5) * amp;
    const rx = 60 + rr() * 150;
    const ry = 14 + rr() * 26;
    ellipse(cx, cy, rx, ry, r, g, b, a);
  }
}
cloudBand(740, 60, 214, 170, 200, 0.55, 1);   // rose-lit far clouds
cloudBand(820, 80, 240, 205, 170, 0.75, 2);   // gold mid clouds
cloudBand(920, 90, 250, 228, 196, 0.9, 3);    // cream near clouds
cloudBand(1000, 70, 247, 214, 178, 0.95, 4);  // bottom cream

// ------------------------------------------------------- left isle
polygon([[58, 566], [300, 566], [268, 606], [215, 668], [176, 700], [150, 660], [96, 610]], 74, 53, 80, 1);
ellipse(179, 566, 122, 24, 63, 125, 107, 1);                       // mossy top
ellipse(179, 560, 122, 18, 94, 158, 122, 1);                       // sunlit rim
// trees on the left isle
disc(120, 540, 16, 46, 84, 66, 1); disc(150, 528, 20, 52, 96, 72, 1); disc(185, 542, 14, 46, 84, 66, 1);
fillRect(148, 544, 152, 566, 60, 42, 52, 1);
// waterfall off the left isle, falling into the mist
for (let y = 590; y < 760; y += 2) {
  const wob = Math.sin(y * 0.06) * 4;
  const x = 96 + wob;
  const fade = 1 - (y - 590) / 220;
  fillRect(x - 7, y, x + 7, y + 2, 214, 232, 242, 0.55 * fade + 0.08);
  fillRect(x - 2, y, x + 2, y + 2, 255, 255, 255, 0.5 * fade);
}

// ------------------------------------------------------- right isle
polygon([[742, 600], [972, 600], [940, 640], [896, 690], [862, 716], [836, 676], [782, 636]], 74, 53, 80, 1);
ellipse(857, 600, 116, 22, 63, 125, 107, 1);
ellipse(857, 594, 116, 16, 94, 158, 122, 1);
disc(820, 576, 15, 46, 84, 66, 1); disc(880, 568, 18, 52, 96, 72, 1); disc(912, 580, 12, 46, 84, 66, 1);
fillRect(878, 582, 882, 600, 60, 42, 52, 1);
// waterfall off the right isle
for (let y = 624; y < 780; y += 2) {
  const wob = Math.sin(y * 0.055 + 2) * 4;
  const x = 940 + wob;
  const fade = 1 - (y - 624) / 210;
  fillRect(x - 6, y, x + 6, y + 2, 214, 232, 242, 0.5 * fade + 0.08);
  fillRect(x - 2, y, x + 2, y + 2, 255, 255, 255, 0.45 * fade);
}

// ------------------------------------------------------- main isle
// The great isle: wide green crown, rocky root tapering into the clouds.
polygon([[238, 500], [786, 500], [742, 556], [668, 640], [588, 716], [540, 758], [512, 776],
         [484, 758], [436, 716], [356, 640], [282, 556]], 66, 46, 74, 1);
// warm rim light on the rock's right edge
polygon([[700, 540], [742, 556], [668, 640], [640, 640], [700, 560]], 214, 130, 80, 0.5);
polygon([[560, 700], [588, 716], [540, 758], [512, 776], [520, 740]], 214, 130, 80, 0.35);
// crown
ellipse(512, 500, 276, 40, 58, 118, 100, 1);
ellipse(512, 490, 276, 30, 88, 152, 116, 1);
// a pale path winding to the tower
polygon([[470, 496], [560, 496], [540, 470], [490, 470]], 232, 214, 176, 0.85);

// Trees across the crown
const trees = [[300, 470, 22], [350, 458, 26], [420, 466, 20], [620, 462, 24], [690, 472, 20], [730, 482, 16]];
for (const [tx, ty, tr] of trees) {
  disc(tx, ty - tr * 0.5, tr, 40, 76, 60, 1);
  disc(tx - tr * 0.4, ty - tr * 0.2, tr * 0.7, 46, 88, 66, 1);
  fillRect(tx - 2, ty, tx + 2, ty + 12, 56, 40, 50, 1);
}

// Waterfalls off the main isle, left and right, into the cloud sea.
for (const [fx, top, bot] of [[300, 520, 800], [724, 520, 800]]) {
  for (let y = top; y < bot; y += 2) {
    const wob = Math.sin(y * 0.05 + fx) * 5;
    const x = fx + wob;
    const fade = 1 - (y - top) / (bot - top);
    fillRect(x - 9, y, x + 9, y + 2, 214, 232, 242, 0.5 * fade + 0.06);
    fillRect(x - 3, y, x + 3, y + 2, 255, 255, 255, 0.45 * fade);
  }
  // mist puff where the fall meets the clouds
  glow(fx, bot, 46, 240, 230, 220, 0.35);
}

// ------------------------------------------------------- lantern tower
// The one landmark: a slender tower of stacked lantern-rooms on the
// crown, its windows lit, a great paper lantern crowning it.
const TX = 512;
fillRect(TX - 26, 330, TX + 26, 470, 52, 34, 62, 1);                 // tower body
fillRect(TX - 34, 318, TX + 34, 336, 40, 26, 50, 1);                // eaves
polygon([[TX - 40, 318], [TX + 40, 318], [TX, 288]], 40, 26, 50, 1); // roof
disc(TX, 284, 5, 255, 190, 100, 1);                                 // finial
// glowing windows, three stacked
for (const wy of [352, 392, 432]) {
  fillRect(TX - 12, wy, TX + 12, wy + 22, 255, 196, 110, 1);
  fillRect(TX - 2, wy, TX + 2, wy + 22, 255, 220, 150, 0.6);
  glow(TX, wy + 11, 34, 255, 180, 90, 0.5);
}
// the tower is crowned by a small finial only — a big lantern here
// would collide with the subtitle above it.
disc(TX, 284, 5, 255, 190, 100, 1);                                 // finial

// Lantern posts along the crown, small and warm.
for (const [lx, ly] of [[330, 486], [392, 478], [636, 478], [700, 488]]) {
  fillRect(lx - 1.5, ly - 22, lx + 1.5, ly, 52, 36, 52, 1);
  glow(lx, ly - 28, 20, 255, 180, 90, 0.6);
  ellipse(lx, ly - 28, 7, 9, 255, 180, 96, 1);
}

// ------------------------------------------------------- sky lanterns
// Paper lanterns drifting up from the isles, each with a halo.
function skyLantern(x, y, s) {
  glow(x, y, 26 * s, 255, 170, 80, 0.5);
  ellipse(x, y, 9 * s, 11 * s, 255, 178, 94, 1);
  ellipse(x, y, 6 * s, 8 * s, 255, 208, 132, 1);
  fillRect(x - 9 * s, y - 3 * s, x + 9 * s, y - 1 * s, 190, 120, 55, 0.85);
  fillRect(x - 9 * s, y + 6 * s, x + 9 * s, y + 8 * s, 190, 120, 55, 0.85);
  thickLine(x, y + 11 * s, x, y + 17 * s, 2, 140, 90, 50, 0.9);
}
const lanternSpots = [];
for (let k = 0; k < 34; k++) {
  // drift lanes: above the isles and out to the sides, never over the name
  const lane = rnd();
  let x, y;
  if (lane < 0.45) { x = 60 + rnd() * 300; y = 330 + rnd() * 320; }
  else if (lane < 0.9) { x = 660 + rnd() * 300; y = 330 + rnd() * 320; }
  else { x = 330 + rnd() * 360; y = 300 + rnd() * 120; }
  lanternSpots.push([x, y, 0.55 + rnd() * 0.6]);
}
for (const [x, y, s] of lanternSpots) skyLantern(x, y, s);
// a few tiny far lanterns as glowing dots
for (let k = 0; k < 22; k++) {
  const x = 40 + rnd() * 944, y = 300 + rnd() * 380;
  glow(x, y, 8, 255, 180, 100, 0.55);
  disc(x, y, 2.5, 255, 205, 140, 0.95);
}

// ------------------------------------------------------- airship
// A small dusk airship crossing the rose sky — the way visitors arrive.
const AX = 796, AY = 356;
ellipse(AX, AY, 52, 20, 58, 40, 72, 1);                 // balloon
ellipse(AX - 8, AY - 4, 44, 14, 74, 52, 88, 1);         // balloon highlight
polygon([[AX + 48, AY - 2], [AX + 66, AY - 8], [AX + 66, AY + 4]], 58, 40, 72, 1); // tail fin
polygon([[AX + 48, AY + 2], [AX + 62, AY + 12], [AX + 48, AY + 8]], 58, 40, 72, 1);
fillRect(AX - 26, AY + 20, AX + 22, AY + 30, 52, 34, 62, 1); // gondola
fillRect(AX - 18, AY + 23, AX - 8, AY + 27, 255, 200, 120, 1); // lit window
fillRect(AX + 2, AY + 23, AX + 12, AY + 27, 255, 200, 120, 1);
glow(AX, AY + 25, 26, 255, 190, 110, 0.35);
thickLine(AX - 40, AY + 18, AX - 26, AY + 20, 2, 58, 40, 72, 1);
thickLine(AX + 22, AY + 18, AX + 26, AY + 20, 2, 58, 40, 72, 1);

// A small skiff sailing the cloud sea — the way visitors arrive by water.
// (drawn after the cloud bands, before the type, so it sits on the mist)
for (const [cx, cy, rx, ry] of [[240, 940, 150, 16], [760, 960, 170, 18], [520, 990, 190, 16]]) {
  ellipse(cx, cy, rx, ry, 226, 190, 160, 0.5);
}
const SX = 340, SY = 872;
polygon([[SX - 62, SY], [SX + 62, SY], [SX + 40, SY + 20], [SX - 40, SY + 20]], 52, 34, 62, 1); // hull
thickLine(SX, SY - 4, SX, SY - 82, 4, 52, 34, 62, 1);                              // mast
polygon([[SX + 5, SY - 78], [SX + 5, SY - 10], [SX + 58, SY - 10]], 244, 196, 150, 1); // sail
polygon([[SX - 5, SY - 78], [SX - 5, SY - 10], [SX - 46, SY - 10]], 228, 178, 138, 1);
glow(SX + 74, SY - 10, 22, 255, 180, 90, 0.6);
ellipse(SX + 74, SY - 10, 8, 10, 255, 180, 96, 1);                                // stern lantern
for (let k = 0; k < 8; k++) {                                                        // wake
  const wx = SX - 80 - k * 14, wy = SY + 16 + k * 2;
  fillRect(wx - 18, wy, wx + 18, wy + 2, 255, 240, 210, 0.35 - k * 0.03);
}

// Birds, far and small.
for (const [bx, by, bs] of [[220, 300, 10], [268, 330, 8], [700, 290, 9], [880, 420, 8], [150, 380, 7]]) {
  thickLine(bx - bs, by, bx, by - bs * 0.55, 2.5, 40, 30, 58, 0.85);
  thickLine(bx, by - bs * 0.55, bx + bs, by, 2.5, 40, 30, 58, 0.85);
}

// ------------------------------------------------------- type
// Name first in a soft shadow, then in warm cream, high over the sky
// where the indigo is darkest — the name carries the poster.
drawText("LUMARIS", 512, 118, 118, 0.82, 30, 22, 52, 0.45);
drawText("LUMARIS", 512, 112, 118, 0.82, 255, 243, 214, 1);
// Subtitle, letterspaced by the wide advance, with flanking rules.
drawText("ISLES OF THE LANTERN TIDE", 512, 256, 27, 0.72, 30, 22, 52, 0.4);
drawText("ISLES OF THE LANTERN TIDE", 512, 253, 27, 0.72, 255, 233, 184, 1);
const subW = textWidth("ISLES OF THE LANTERN TIDE", 27 / 6);
thickLine(512 - subW / 2 - 130, 268, 512 - subW / 2 - 18, 268, 2, 255, 233, 184, 0.8);
thickLine(512 + subW / 2 + 18, 268, 512 + subW / 2 + 130, 268, 2, 255, 233, 184, 0.8);

// A thin cream frame holds the poster together.
fillRect(28, 28, 996, 32, 255, 243, 214, 0.9);
fillRect(28, 992, 996, 996, 255, 243, 214, 0.9);
fillRect(28, 28, 32, 996, 255, 243, 214, 0.9);
fillRect(992, 28, 996, 996, 255, 243, 214, 0.9);

// ---------------------------------------------------------------- PNG
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    crc32.table = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng() {
  // Filter 1 (Sub) per row: gradients and flat skies compress far better.
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    const rowStart = y * (1 + W * 3);
    raw[rowStart] = 1;
    for (let x = 0; x < W; x++) {
      const si = (y * W + x) * 4;
      const di = rowStart + 1 + x * 3;
      for (let c = 0; c < 3; c++) {
        const v = px[si + c];
        const left = x === 0 ? 0 : px[si - 4 + c];
        raw[di + c] = (v - left) & 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
fs.mkdirSync(outDir, { recursive: true });
const png = encodePng();
fs.writeFileSync(path.join(outDir, "entry.png"), png);
console.log(`wrote ${path.join(outDir, "entry.png")} ${png.length} bytes ${W}x${H}`);

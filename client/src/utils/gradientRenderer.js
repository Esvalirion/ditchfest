// Pure renderer for the Sign Studio gradient background. No Vue, no DOM beyond
// the canvas and image elements it's handed — keeps it testable and reusable
// (the studio preview, the download export, and any future preset thumbnail all
// call the same path).
//
// The current gradient kind ("arrow") is a stencil composite: a binary mask PNG
// (bckgrnask.png, 2048×512, white vs near-black) splits the canvas into two
// zones shaped like a `>`. Zone A (mask ≈ white) gets painted with one
// left→right 2-stop gradient, zone B (mask ≈ black) with another. A dots tile
// and a base overlay (frames/logos) are composited on top.
//
// Dispatch is on options.kind → a per-kind render function. Adding a new kind
// is a new render function plus an entry in GRADIENTS
// (../data/signStudioGradients.js). The UI dropdown picks up kinds from there
// automatically.

import { DEFAULT_GRADIENT_KIND, defaultColorsFor } from '../data/signStudioGradients.js';

export const STUDIO_WIDTH = 2048;
export const STUDIO_HEIGHT = 512;

let maskImage = null; // HTMLImageElement / HTMLCanvasElement with the stencil, or null.
let dotsTile = null;

const MASK_URL = '/Signs/Studio/bckgrnask.png';
const DOTS_TILE_URL = '/Signs/Studio/dots-tile.png';
const BASE_URL = '/Signs/Studio/ditchfest_base.png';

let baseImage = null; // overlay (logos/frames) drawn last, on top of everything.

export function setMask(img) {
  maskImage = img || null;
}
export function setDotsTile(tile) {
  dotsTile = tile || null;
}
export function setBase(img) {
  baseImage = img || null;
}
export function getMask() {
  return maskImage;
}
export function getDotsTile() {
  return dotsTile;
}
export function getBase() {
  return baseImage;
}
export function getAssetUrls() {
  return { mask: MASK_URL, dots: DOTS_TILE_URL, base: BASE_URL };
}

function clamp8(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Tiny 8-bit dither to keep dark gradients from banding — Photoshop's
// "Dither: on" does the same. ~1.5% amplitude.
function applyDither(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() + Math.random() - 1) * 4;
    data[i] = clamp8(data[i] + n);
    data[i + 1] = clamp8(data[i + 1] + n);
    data[i + 2] = clamp8(data[i + 2] + n);
  }
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
}

// Parse #rrggbb → [r, g, b] (0..255). Returns [0,0,0] on a malformed string.
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// Render the gradient background into `canvas`.
//
// options.kind   — which gradient to render (default: first in the registry)
// options.colors — map of { stopKey: '#rrggbb' }; keys come from the gradient's
//                  stop definitions in signStudioGradients.js
// options.showDots / showBase — toggle the overlay layers (default: true)
//
// Dispatches on kind. Unknown kinds fall back to the default. After the
// gradient body, dither + dots + base are applied uniformly.
export function renderGradient(canvas, options = {}) {
  if (!canvas) return;
  const W = STUDIO_WIDTH;
  const H = STUDIO_HEIGHT;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const wantDots = options.showDots !== false;
  const wantBase = options.showBase !== false;

  const kind = options.kind || DEFAULT_GRADIENT_KIND;
  // Merge defaults with user-supplied colours so a missing key still renders.
  const colors = { ...defaultColorsFor(kind), ...(options.colors || {}) };

  // Dispatch on kind. Each renderer fills the canvas with the gradient body
  // only; overlays are composited uniformly below.
  switch (kind) {
    case 'linear':
      renderLinearGradient(ctx, W, H, colors);
      break;
    case 'arrow':
    default:
      renderArrowGradient(ctx, W, H, colors);
      break;
  }

  applyDither(ctx, W, H);
  if (wantDots) compositeDots(ctx, W, H);
  if (wantBase) compositeBase(ctx, W, H);
}

// The "linear" kind: a plain left→right gradient across the whole canvas with
// three evenly-spaced stops (left / center / right). No mask, no zones — the
// simplest possible background, useful as a baseline or when the `>` shape
// isn't wanted.
function renderLinearGradient(ctx, W, H, colors) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, colors.c1);
  g.addColorStop(0.5, colors.c2);
  g.addColorStop(1, colors.c3);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// The "arrow" kind: stencil mask splits the canvas into two halves shaped like
// `>`. The right half (mask ≈ white) gets a left→right gradient from
// colors.right1 → colors.right2; the left half (mask ≈ black) from
// colors.left1 → colors.left2. Each zone's gradient is mapped onto its own
// half of the canvas so the user sees the full ramp within each visible zone.
//
// If the mask isn't loaded yet, falls back to a plain right1→right2 horizontal
// fill so the studio is never blank — the `>` appears as soon as the mask loads.
function renderArrowGradient(ctx, W, H, colors) {
  const r1 = hexToRgb(colors.right1);
  const r2 = hexToRgb(colors.right2);
  const l1 = hexToRgb(colors.left1);
  const l2 = hexToRgb(colors.left2);

  if (!maskImage) {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, colors.right1);
    g.addColorStop(1, colors.right2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  // Draw the mask into an offscreen canvas to read its pixels. The mask is
  // expected to be 2048×512 RGBA; we use the red channel as the zone selector.
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = W;
  maskCanvas.height = H;
  const maskCtx = maskCanvas.getContext('2d');
  maskCtx.drawImage(maskImage, 0, 0, W, H);
  const maskData = maskCtx.getImageData(0, 0, W, H).data;

  // Build the composited image one pixel at a time. Each zone's gradient is
  // mapped onto its own half of the canvas so the user sees the full colour
  // ramp within each visible zone rather than only half of one canvas-wide ramp.
  const out = ctx.createImageData(W, H);
  const dst = out.data;
  const half = W / 2;
  // Precompute each zone's colour per column once.
  const rightR = new Float32Array(W);
  const rightG = new Float32Array(W);
  const rightB = new Float32Array(W);
  const leftR = new Float32Array(W);
  const leftG = new Float32Array(W);
  const leftB = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    // Right zone ramp lives on the left half; clamp on the right half (rare
    // pixels there get the right2 endpoint, which the mask hides anyway).
    const tR = Math.max(0, Math.min(1, x / half));
    rightR[x] = r1[0] + (r2[0] - r1[0]) * tR;
    rightG[x] = r1[1] + (r2[1] - r1[1]) * tR;
    rightB[x] = r1[2] + (r2[2] - r1[2]) * tR;
    // Left zone ramp lives on the right half, measured from W/2.
    const tL = Math.max(0, Math.min(1, (x - half) / half));
    leftR[x] = l1[0] + (l2[0] - l1[0]) * tL;
    leftG[x] = l1[1] + (l2[1] - l1[1]) * tL;
    leftB[x] = l1[2] + (l2[2] - l1[2]) * tL;
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const mi = (y * W + x) * 4;
      // Mask: white (>127) → right zone, else left zone. Smoothstep the
      // boundary over a few brightness levels to avoid a razor edge.
      const m = maskData[mi]; // red channel, 0..255
      const k = m < 110 ? 0 : m > 150 ? 1 : (m - 110) / 40;
      dst[mi] = rightR[x] * k + leftR[x] * (1 - k);
      dst[mi + 1] = rightG[x] * k + leftG[x] * (1 - k);
      dst[mi + 2] = rightB[x] * k + leftB[x] * (1 - k);
      dst[mi + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

function compositeDots(ctx, W, H) {
  if (!dotsTile) return;
  const pattern = ctx.createPattern(dotsTile, 'repeat');
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
  }
}

// The base overlay (logos, frames) is the last layer — drawn on top of the
// gradient + dots so the branding reads cleanly over any colour choice.
function compositeBase(ctx, W, H) {
  if (!baseImage) return;
  ctx.drawImage(baseImage, 0, 0, W, H);
}

// Trigger a JPEG download of the current canvas.
export function downloadJpeg(canvas, filename = 'ditchfest-sign.jpg', quality = 0.92) {
  return new Promise((resolve, reject) => {
    if (!canvas) {
      reject(new Error('canvas missing'));
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('toBlob returned null'));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

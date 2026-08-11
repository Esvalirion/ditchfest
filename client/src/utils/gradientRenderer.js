// Pure renderer for the Sign Studio gradient background. No Vue, no DOM beyond
// the canvas and image elements it's handed — keeps it testable and reusable
// (the studio preview, the download export, and any future preset thumbnail all
// call the same path).
//
// The Ditchfest sign background is a stencil composite: a binary mask PNG
// (bckgrnask.png, 2048×512, white vs near-black) splits the canvas into two
// zones shaped like a `>`. Zone A (mask ≈ white) gets painted with gradient A,
// zone B (mask ≈ black) with gradient B — both simple vertical 2-stop linear
// gradients. A static dots tile is composited on top when available.
//
// Two gradients × two colours each = four user-facing colour pickers. The
// stencil mask is what carries the signature `>` shape; there is no angle or
// hardness to tune — the shape is baked in, only colours vary.

export const STUDIO_WIDTH = 2048;
export const STUDIO_HEIGHT = 512;

// Default colours — sampled off the production background. Gradient A is the
// brighter "light side" of the stencil, gradient B is the darker "shadow side".
export const DEFAULT_COLOR_A1 = '#6c6c6c'; // top of light zone
export const DEFAULT_COLOR_A2 = '#2e2e2e'; // bottom of light zone
export const DEFAULT_COLOR_B1 = '#1a1a1a'; // top of shadow zone
export const DEFAULT_COLOR_B2 = '#030303'; // bottom of shadow zone

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

// Render the masked two-gradient composite into `canvas`.
// options.colorA1/A2 — top/bottom of the "light" zone gradient
// options.colorB1/B2 — top/bottom of the "shadow" zone gradient
// If the stencil mask isn't loaded yet, falls back to a plain gradient A fill
// so the studio is never blank — the `>` appears as soon as the mask loads.
export function renderGradient(canvas, options = {}) {
  if (!canvas) return;
  const W = STUDIO_WIDTH;
  const H = STUDIO_HEIGHT;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;

  const a1 = hexToRgb(options.colorA1 ?? DEFAULT_COLOR_A1);
  const a2 = hexToRgb(options.colorA2 ?? DEFAULT_COLOR_A2);
  const b1 = hexToRgb(options.colorB1 ?? DEFAULT_COLOR_B1);
  const b2 = hexToRgb(options.colorB2 ?? DEFAULT_COLOR_B2);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const wantDots = options.showDots !== false;
  const wantBase = options.showBase !== false;

  if (!maskImage) {
    // No mask yet: paint gradient A as a plain horizontal fill so the studio
    // isn't empty while the asset loads.
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, options.colorA1 ?? DEFAULT_COLOR_A1);
    g.addColorStop(1, options.colorA2 ?? DEFAULT_COLOR_A2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    applyDither(ctx, W, H);
    if (wantDots) compositeDots(ctx, W, H);
    if (wantBase) compositeBase(ctx, W, H);
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
  // mapped onto its own half of the canvas (A: left half 0..W/2, B: right half
  // W/2..W) so the user sees the full colour ramp within each visible zone
  // rather than only half of one canvas-wide ramp.
  const out = ctx.createImageData(W, H);
  const dst = out.data;
  const half = W / 2;
  // Precompute each zone's colour per column once.
  const aRamp = new Float32Array(W);
  const aGamp = new Float32Array(W);
  const aBamp = new Float32Array(W);
  const bRamp = new Float32Array(W);
  const bGamp = new Float32Array(W);
  const bBamp = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    // Zone A ramp lives on the left half; clamp on the right half (rare pixels
    // there get the A2 endpoint, which the mask hides anyway).
    const tA = Math.max(0, Math.min(1, x / half));
    aRamp[x] = a1[0] + (a2[0] - a1[0]) * tA;
    aGamp[x] = a1[1] + (a2[1] - a1[1]) * tA;
    aBamp[x] = a1[2] + (a2[2] - a1[2]) * tA;
    // Zone B ramp lives on the right half, measured from W/2.
    const tB = Math.max(0, Math.min(1, (x - half) / half));
    bRamp[x] = b1[0] + (b2[0] - b1[0]) * tB;
    bGamp[x] = b1[1] + (b2[1] - b1[1]) * tB;
    bBamp[x] = b1[2] + (b2[2] - b1[2]) * tB;
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const mi = (y * W + x) * 4;
      // Mask: white (>127) → zone A (light), else zone B (shadow). Smoothstep
      // the boundary over a few brightness levels to avoid a razor edge.
      const m = maskData[mi]; // red channel, 0..255
      const k = m < 110 ? 0 : m > 150 ? 1 : (m - 110) / 40;
      dst[mi] = aRamp[x] * k + bRamp[x] * (1 - k);
      dst[mi + 1] = aGamp[x] * k + bGamp[x] * (1 - k);
      dst[mi + 2] = aBamp[x] * k + bBamp[x] * (1 - k);
      dst[mi + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  applyDither(ctx, W, H);
  if (wantDots) compositeDots(ctx, W, H);
  if (wantBase) compositeBase(ctx, W, H);
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

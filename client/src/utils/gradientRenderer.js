// Pure renderer for the Sign Studio gradient background. No Vue, no DOM beyond
// the canvas and image elements it's handed — keeps it testable and reusable
// (the studio preview, the download export, and any future preset thumbnail all
// call the same path).
//
// The renderer is format-parametric: options.format supplies { width, height }
// (one of the Nadeo advertisement ratios — 1x1, 2x1, 4x1, 6x1; see
// ../data/signStudioFormats.js). The canvas is sized to that and all layers
// (gradient body, dither, dots, base) composite at that resolution.
//
// The "arrow" gradient kind is a stencil composite: a binary mask PNG
// (bckgrnask.png, authored at native 2048×512, white vs near-black) splits the
// canvas into two zones shaped like `>`. Zone A (mask ≈ white) gets one
// left→right 2-stop gradient, zone B (mask ≈ black) another. The mask and the
// base overlay are placed at their NATIVE size, centred on the canvas — never
// stretched — so the `>` shape and the centred logo keep their geometry on any
// format. On wider canvases (6×1) the mask is continued into the side margins
// by edge-clamping (the `>` reads as fully-left-zone at its left edge,
// fully-right-zone at its right edge), so the gradient flows smoothly into the
// margins; on narrower ones (1×1/2×1) its central slice is cropped into view.
//
// Dispatch is on options.kind → a per-kind render function. Adding a new kind
// is a new render function plus an entry in GRADIENTS
// (../data/signStudioGradients.js). The UI dropdown picks up kinds from there
// automatically.

import {
  DEFAULT_GRADIENT_KIND,
  defaultColorsFor,
} from '../data/signStudioGradients.js';
import {
  DEFAULT_FORMAT_KIND,
  findFormat,
  NATIVE_MASK_WIDTH,
  NATIVE_MASK_HEIGHT,
} from '../data/signStudioFormats.js';

let maskImage = null; // HTMLImageElement / HTMLCanvasElement with the stencil, or null.
let dotsTile = null;

const MASK_URL = '/Signs/Studio/bckgrnask.png';
const DOTS_TILE_URL = '/Signs/Studio/dots-tile.png';
const BASE_URL = '/Signs/Studio/ditchfest_base.png';

let baseImage = null; // overlay (logos/frames) drawn last, on top of everything.

export function setMask(img) {
  maskImage = img || null;
  // Invalidate the cached mask bitmap so the next render rebuilds it.
  cachedMaskData = null;
}
export function setDotsTile(tile) {
  dotsTile = tile || null;
}
export function setBase(img) {
  baseImage = img || null;
}

// Note: the user-chosen overlay is passed directly through renderGradient's
// options.userOverlay on every paint() — there's no module-scope setter for it
// (an earlier setUserOverlay/getUserOverlay pair existed but was never read by
// the renderer, so it was dead code and is now removed).
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
//
// (No try/catch needed: gallery overlays are loaded via a CORS proxy
// — see loadOverlayImage in SignStudio.vue — so the canvas never gets
// tainted and getImageData is always safe.)
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

// Cached pixel data of the mask, rasterised once at its native size. Reused
// across renders (and across formats) until the mask image is swapped via
// setMask(). Sampling in normalised coordinates means every format reads the
// same bitmap — only the per-pixel index math differs.
let cachedMaskData = null;
function getMaskData() {
  if (cachedMaskData || !maskImage) return cachedMaskData;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = NATIVE_MASK_WIDTH;
  maskCanvas.height = NATIVE_MASK_HEIGHT;
  const maskCtx = maskCanvas.getContext('2d');
  maskCtx.drawImage(maskImage, 0, 0, NATIVE_MASK_WIDTH, NATIVE_MASK_HEIGHT);
  cachedMaskData = maskCtx.getImageData(0, 0, NATIVE_MASK_WIDTH, NATIVE_MASK_HEIGHT).data;
  return cachedMaskData;
}

// Render the gradient background into `canvas`.
//
// options.format — { width, height } of the output (default: 4x1 / 2048×512).
//                  A format kind string ("4x1") is also accepted for brevity.
// options.kind   — which gradient to render (default: first in the registry)
// options.colors — map of { stopKey: '#rrggbb' }; keys come from the gradient's
//                  stop definitions in signStudioGradients.js
// options.showDots / showBase — toggle the overlay layers (default: true)
//
// Dispatches on kind. Unknown kinds fall back to the default. After the
// gradient body, dither + dots + base are applied uniformly.
export function renderGradient(canvas, options = {}) {
  if (!canvas) return;

  // Resolve the canvas size from the format. A kind string or a {width,height}
  // object are both accepted; unknown values fall back to the default format.
  const fmt =
    typeof options.format === 'string'
      ? findFormat(options.format)
      : options.format && options.format.width && options.format.height
        ? options.format
        : findFormat(DEFAULT_FORMAT_KIND);
  const W = fmt.width;
  const H = fmt.height;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // Always start from a blank (fully transparent) canvas. The gradient body
  // used to cover every pixel opaquely, hiding stale content, but with
  // showGradient:false the previous frame would otherwise linger forever.
  ctx.clearRect(0, 0, W, H);
  const wantGradient = options.showGradient !== false;
  const wantDots = options.showDots !== false;
  const wantBase = options.showBase !== false;
  // User overlay (gallery artwork) draws on top of base; null/missing skips it.
  const userOverlay = options.userOverlay || null;
  const userOverlayScale = Number.isFinite(options.userOverlayScale)
    ? options.userOverlayScale
    : 1;

  const kind = options.kind || DEFAULT_GRADIENT_KIND;
  // Merge defaults with user-supplied colours so a missing key still renders.
  const colors = { ...defaultColorsFor(kind), ...(options.colors || {}) };

  // Dispatch on kind. Each renderer fills the canvas with the gradient body
  // only; overlays are composited uniformly below. With showGradient:false the
  // canvas is left transparent (no body, no dither — dither only exists to
  // de-band the gradient), so the export must be PNG to keep the alpha.
  if (wantGradient) {
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
  }
  if (wantDots) compositeDots(ctx, W, H);
  if (wantBase) compositeBase(ctx, W, H);
  if (userOverlay) {
    compositeUserOverlay(ctx, W, H, userOverlay, userOverlayScale);
  }
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
// The mask is authored at native 2048×512 (a 4:1 ratio) and is placed at its
// NATIVE size, centred on the canvas — never stretched. Canvas height is always
// 512px (= native mask height), so the mask always spans the full height; only
// its horizontal placement shifts. On a wider canvas (6×1 = 3072×512) the mask
// sits centred and the `>` is continued into the side margins by edge-clamping
// the mask sample to its nearest edge column — the left edge of the `>` is
// fully the left zone, the right edge fully the right zone, so the margins
// read as a smooth continuation of the arrow's two zones (with the per-column
// gradient ramp carrying through). On a narrower canvas (1×1/2×1) the central
// slice of the mask is cropped into view.
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

  const maskData = getMaskData();
  const nW = NATIVE_MASK_WIDTH;
  const nH = NATIVE_MASK_HEIGHT;
  // Mask placed at native size, horizontally centred on the canvas. dx is 0 at
  // 4×1, positive on wider canvases (margins on the sides), negative on narrower
  // ones (the mask is wider than the canvas, so its central slice is cropped).
  const dx = Math.round((W - nW) / 2);
  const maskLeft = dx; // canvas-x where the mask's column 0 lands
  const maskRight = dx + nW; // canvas-x just past the mask's last column

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
  // Canvas height equals native mask height, so each canvas row maps 1:1 to a
  // mask row; clamp defensively anyway.
  const nativeY = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    nativeY[y] = Math.min(nH - 1, Math.max(0, Math.floor((y / H) * nH)));
  }
  for (let y = 0; y < H; y++) {
    const nY = nativeY[y];
    for (let x = 0; x < W; x++) {
      const di = (y * W + x) * 4;
      // Outside the mask's native footprint: continue the `>` into the margins
      // by clamping the mask sample to its nearest edge column (edge-clamp
      // extrapolation). At the mask's left edge the `>` is fully black
      // (left zone), at the right edge fully white (right zone) — so the side
      // margins read as a smooth continuation of the arrow's two zones, with
      // the per-column gradient ramp already computed in leftR/rightR. No flat
      // fill, no seam.
      const nX = x < maskLeft ? 0 : x >= maskRight ? nW - 1 : x - dx;
      const mi = (nY * nW + nX) * 4;
      // Mask: white (>127) → right zone, else left zone. Smoothstep the
      // boundary over a few brightness levels to avoid a razor edge.
      const m = maskData[mi]; // red channel, 0..255
      const k = m < 110 ? 0 : m > 150 ? 1 : (m - 110) / 40;
      dst[di] = rightR[x] * k + leftR[x] * (1 - k);
      dst[di + 1] = rightG[x] * k + leftG[x] * (1 - k);
      dst[di + 2] = rightB[x] * k + leftB[x] * (1 - k);
      dst[di + 3] = 255;
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
// gradient + dots so the branding reads cleanly over any colour choice. Like
// the arrow mask, the asset is authored at native 2048×512 and placed at its
// NATIVE size, centred on the canvas — never stretched, so the centred logo
// keeps its geometry. On wider canvases (6×1) the base sits centred with empty
// margins; on narrower ones (1×1/2×1) its central slice is cropped into view.
// This matches the mask placement so the `>` and the logo stay registered.
function compositeBase(ctx, W, H) {
  if (!baseImage) return;
  const nW = NATIVE_MASK_WIDTH;
  const nH = NATIVE_MASK_HEIGHT;
  const dx = Math.round((W - nW) / 2);
  // Source crop keeps us inside [0, nW]; dest crop keeps us inside [0, W]. On
  // the native 4×1 canvas both crops are the full image (dx = 0).
  const sx = dx < 0 ? -dx : 0;
  const sw = Math.min(nW - sx, W);
  ctx.drawImage(baseImage, sx, 0, sw, nH, dx + sx, 0, sw, nH);
}

// The user-chosen overlay (arrows, memes, mapper avatars) — the topmost layer,
// drawn after base so it sits above the branding. Contain-fit: scaled so the
// WHOLE image is visible inside the canvas (scale = min(W/nW, H/nH)), keeping
// its native aspect — never stretched or squashed — and centred. For the
// 2048×512 gallery art this means the exact same absolute size on every format
// (all canvases are 512px tall): 1×1/2×1 clip the sides, 4×1 is an exact fit,
// 6×1 centres it with gradient margins. On wide canvases use the zoom slider
// to enlarge (100% = contain; >100% grows past it, cropping edges).
function compositeUserOverlay(ctx, W, H, img, zoom = 1) {
  const nW = img.naturalWidth;
  const nH = img.naturalHeight;
  if (!nW || !nH) return;
  const fit = Math.min(W / nW, H / nH);
  const scale = fit * zoom;
  const drawW = nW * scale;
  const drawH = nH * scale;
  const dx = Math.round((W - drawW) / 2);
  const dy = Math.round((H - drawH) / 2);
  ctx.drawImage(img, dx, dy, drawW, drawH);
}


// Shared blob download: encode the canvas with the given type and trigger a
// file download.
function downloadBlob(canvas, filename, type, quality) {
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
      type,
      quality,
    );
  });
}

// Trigger a JPEG download of the current canvas (opaque renders).
export function downloadJpeg(canvas, filename = 'ditchfest-sign.jpg', quality = 0.92) {
  return downloadBlob(canvas, filename, 'image/jpeg', quality);
}

// Trigger a PNG download — use when the gradient layer is off and the canvas
// has transparency (JPEG has no alpha channel and would bake it to black).
export function downloadPng(canvas, filename = 'ditchfest-sign.png') {
  return downloadBlob(canvas, filename, 'image/png');
}

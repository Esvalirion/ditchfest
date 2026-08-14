<!-- Sign Studio: build a custom Ditchfest sign background in the browser.
     The "arrow" gradient kind uses a stencil mask to split the canvas into two
     halves shaped like a `>`, each filled with its own left→right gradient. A
     dots tile, a base overlay (frames/logos) and one user-chosen gallery
     overlay (arrows / memes / mappers) are composited on top, in that order.
     The output is a JPEG in one of the Nadeo sign formats (1×1, 2×1, 4×1, 6×1
     — see ../data/signStudioFormats.js), rendered entirely client-side.

     Gradient kinds are defined in ../data/signStudioGradients.js; the dropdown
     and colour pickers below are generated from that registry, so adding a new
     kind is a new entry there (plus a renderer branch) — no UI edits needed.

     The same full-resolution canvas is used for the preview (scaled down via
     CSS) and for the export, so what you see is what you get. Gallery overlays
     are loaded through a CORS proxy (loadOverlayImage below) so the canvas
     stays exportable — dashmap.live itself sends no CORS headers. -->
<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import {
  renderGradient,
  downloadJpeg,
  downloadPng,
  setMask,
  setDotsTile,
  setBase,
  getAssetUrls,
} from '../utils/gradientRenderer.js';
import {
  GRADIENTS,
  DEFAULT_GRADIENT_KIND,
  defaultColorsFor,
} from '../data/signStudioGradients.js';
import {
  FORMATS,
  DEFAULT_FORMAT_KIND,
  findFormat,
} from '../data/signStudioFormats.js';
import { OVERLAY_CATEGORIES } from '../data/signs.js';

// Active canvas format (one of the Nadeo aspect ratios — 1×1, 2×1, 4×1, 6×1).
// Drives the canvas dimensions and the preview's aspect ratio. Switching format
// repaints at the new size without resetting colours — the palette is
// independent of the canvas shape.
const selectedFormat = ref(DEFAULT_FORMAT_KIND);
const activeFormat = computed(() => findFormat(selectedFormat.value));

// Which gradient kind is active. Drives both the renderer dispatch and which
// colour pickers show up (computed from the registry).
const selectedKind = ref(DEFAULT_GRADIENT_KIND);
const selectedGradient = computed(
  () => GRADIENTS.find((g) => g.kind === selectedKind.value) || GRADIENTS[0],
);

// Colour state keyed by stop key (matches the registry). Reactive object so
// v-model on <input type="color"> stays simple. When the kind changes, the
// stop keys change too — reset to that kind's defaults so we never feed the
// renderer a stop it doesn't know about.
const colors = reactive(defaultColorsFor(DEFAULT_GRADIENT_KIND));

function onKindChange() {
  // Reset colours to the new kind's defaults. Keeps the canvas sensible rather
  // than carrying over colours that may no longer map to anything.
  const next = defaultColorsFor(selectedKind.value);
  for (const k of Object.keys(colors)) delete colors[k];
  Object.assign(colors, next);
  scheduleRender();
}

const maskLoaded = ref(false);
const dotsLoaded = ref(false);
const baseLoaded = ref(false);
// Toggles for the overlay layers — on by default, user can turn either off.
// showGradient disables the background body entirely: the canvas stays
// transparent under dots/base/overlay and the export switches to PNG (JPEG
// has no alpha).
const showGradient = ref(true);
const showDots = ref(true);
const showBase = ref(true);
const canvasEl = ref(null);
const isDownloading = ref(false);
const downloadError = ref('');
// First paint not done yet — the canvas is hidden behind a loading placeholder
// until assets load and the initial render lands, so the empty/black canvas
// never flashes on mount.
const firstPaintDone = ref(false);

// User-chosen gallery overlay (arrows / memes / mappers). One at a time: picking
// a new one replaces the old; `null` clears it. Dots/Base are independent
// toggles and coexist with this layer. The loaded image is passed directly to
// the renderer via paint()'s options.userOverlay — no module-scope setter.
const overlayCategory = ref(OVERLAY_CATEGORIES[0].key); // active picker tab
const pickerOpen = ref(false); // grid collapsed until the user opens it
const selectedOverlaySrc = ref(null); // src of the active overlay, or null
const selectedOverlayAlt = ref(''); // alt label for the chip
const overlayScale = ref(100); // percent; 100 = contain-fit, slider 10..200
const overlayImg = ref(null); // loaded HTMLImageElement (CORS-proxied, see loadOverlayImage)
const overlayLoading = ref(false);

const overlayCategorySigns = computed(
  () => OVERLAY_CATEGORIES.find((c) => c.key === overlayCategory.value)?.signs || [],
);

const { mask: MASK_URL, dots: DOTS_TILE_URL, base: BASE_URL } = getAssetUrls();

let renderTimer = null;
function scheduleRender() {
  // Debounce: coalesce rapid picker drags into one paint. The pixel-level
  // composite walks ~1M pixels, so this is real insurance.
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(paint, 60);
}

function paint() {
  if (!canvasEl.value) return;
  const fmt = activeFormat.value;
  renderGradient(canvasEl.value, {
    format: { width: fmt.width, height: fmt.height },
    kind: selectedKind.value,
    colors: { ...colors },
    showGradient: showGradient.value,
    showDots: showDots.value,
    showBase: showBase.value,
    userOverlay: overlayImg.value || null,
    userOverlayScale: overlayScale.value / 100,
  });
}

function onFormatChange() {
  // The canvas resizes to the new format; colours carry over (palette is
  // independent of canvas shape). A repaint at the new dimensions is enough.
  scheduleRender();
}

// Pick a gallery overlay: load its image (via the CORS proxy so the canvas
// stays exportable), stash it, repaint. Replaces whatever was active before
// (one at a time). On error, clear so the chip doesn't sit on a broken image.
async function selectOverlay(sign) {
  selectedOverlaySrc.value = sign.src;
  selectedOverlayAlt.value = sign.alt;
  overlayLoading.value = true;
  pickerOpen.value = false;
  const img = await loadOverlayImage(sign.src);
  overlayLoading.value = false;
  // If the user picked something else while this was loading, drop the stale one.
  if (selectedOverlaySrc.value !== sign.src) return;
  if (!img) {
    clearOverlay();
    return;
  }
  overlayImg.value = img;
  overlayScale.value = 100;
  scheduleRender();
}

function onScaleInput(e) {
  overlayScale.value = Number(e.target.value);
  // Same debounce path as every other control — the full pipeline (gradient +
  // arrow composite + dither + overlays) walks ~1M pixels, so the 60ms coalesce
  // is still worth it here even though the overlay itself is a cheap drawImage.
  scheduleRender();
}

function clearOverlay() {
  selectedOverlaySrc.value = null;
  selectedOverlayAlt.value = '';
  overlayImg.value = null;
  overlayLoading.value = false;
  scheduleRender();
}

// Same-origin asset loader (mask/dots/base live under /Signs/Studio/). No CORS
// concern, no crossOrigin attribute needed.
function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Cross-origin overlay loader. Gallery overlays are hosted on dashmap.live,
// which does NOT send Access-Control-Allow-Origin — loading them directly and
// drawing onto the canvas would taint it, breaking getImageData (dither, arrow
// mask composite) and toBlob (Download JPEG). wsrv.nl is a public image proxy
// that re-serves the same bytes with Access-Control-Allow-Origin: * and a
// correct Content-Type, so with crossOrigin='anonymous' the image loads
// same-origin-equivalent and the canvas stays clean/exportable. Same-origin
// URLs (already-proxied or local) are loaded directly.
function loadOverlayImage(url) {
  const proxied = url.startsWith('http') && !url.startsWith(window.location.origin)
    ? `https://wsrv.nl/?url=${encodeURIComponent(url)}`
    : url;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = proxied;
  });
}

// Export the current canvas in the chosen format. Both are always available:
// PNG keeps transparency (for Gradient-off renders), JPEG is smaller but
// bakes transparent pixels to black.
async function onDownload(type) {
  if (!canvasEl.value || isDownloading.value) return;
  isDownloading.value = true;
  downloadError.value = '';
  try {
    if (type === 'png') {
      await downloadPng(canvasEl.value, 'ditchfest-sign.png');
    } else {
      await downloadJpeg(canvasEl.value, 'ditchfest-sign.jpg', 0.92);
    }
  } catch (e) {
    downloadError.value = e.message || String(e);
  } finally {
    isDownloading.value = false;
  }
}

onMounted(async () => {
  await nextTick();
  // Load all three assets in parallel; render as soon as the mask is in. The
  // renderer degrades gracefully if any are missing.
  const [mask, dots, base] = await Promise.all([
    loadImage(MASK_URL),
    loadImage(DOTS_TILE_URL),
    loadImage(BASE_URL),
  ]);
  if (mask) {
    setMask(mask);
    maskLoaded.value = true;
  }
  if (dots) {
    setDotsTile(dots);
    dotsLoaded.value = true;
  }
  if (base) {
    setBase(base);
    baseLoaded.value = true;
  }
  paint();
  firstPaintDone.value = true;
});

onBeforeUnmount(() => {
  if (renderTimer) clearTimeout(renderTimer);
});

// Any colour or toggle change repaints. Watch colors deeply (object values
// mutate via v-model); the scalar refs get plain watches. The overlay scale
// slider also routes through scheduleRender via its @input handler.
watch(colors, scheduleRender, { deep: true });
watch([showGradient, showDots, showBase], scheduleRender);
</script>

<template>
  <div class="studio">
    <div class="format-bar">
      <span class="format-label">Format</span>
      <div class="format-buttons">
        <button
          v-for="f in FORMATS"
          :key="f.kind"
          class="format-btn"
          :class="{ active: selectedFormat === f.kind }"
          :title="`${f.width} × ${f.height} px`"
          @click="selectedFormat = f.kind; onFormatChange()"
        >
          <span class="format-glyph" :style="{ aspectRatio: `${f.width} / ${f.height}` }"></span>
          <span class="format-text">{{ f.label }}</span>
        </button>
      </div>
      <span class="format-dims">{{ activeFormat.width }} × {{ activeFormat.height }} px</span>
    </div>

    <p class="format-usage">{{ activeFormat.usage }}</p>

    <div class="studio-preview-wrap">
      <div
        class="studio-preview"
        :class="{ transparent: !showGradient }"
        :style="{
          aspectRatio: `${activeFormat.width} / ${activeFormat.height}`,
          width: `min(100%, ${Math.round(320 * activeFormat.width / activeFormat.height)}px)`,
        }"
      >
        <canvas v-show="firstPaintDone" ref="canvasEl" class="studio-canvas"></canvas>
        <div v-if="!firstPaintDone" class="studio-preview-loading">
          <span class="spinner" aria-hidden="true"></span>
          <span class="loading-label">Rendering…</span>
        </div>
      </div>
    </div>

    <p v-if="!maskLoaded" class="studio-warn">
      Stencil mask not found at <code>{{ MASK_URL }}</code> — showing a flat
      gradient until it loads. Drop <code>bckgrnask.png</code> in
      <code>client/public/Signs/Studio/</code>.
    </p>

    <div class="studio-controls">
      <div class="studio-header">
        <label v-if="GRADIENTS.length > 1" class="kind-select">
          <span>Style</span>
          <select v-model="selectedKind" @change="onKindChange">
            <option v-for="g in GRADIENTS" :key="g.kind" :value="g.kind">{{ g.label }}</option>
          </select>
        </label>
      </div>

      <div class="zones" :class="{ disabled: !showGradient }">
        <fieldset v-for="(grp, gi) in selectedGradient.groups" :key="gi" class="zone">
          <legend>{{ grp.legend }}</legend>
          <label v-for="st in grp.stops" :key="st.key" class="stop">
            <span class="stop-label">{{ st.label }}</span>
            <span class="stop-input">
              <input
                type="color"
                v-model="colors[st.key]"
                :aria-label="`${grp.legend} ${st.label} colour`"
              />
              <span class="stop-hex">{{ colors[st.key] }}</span>
            </span>
          </label>
        </fieldset>
      </div>

      <div class="studio-actions">
        <button
          class="download-btn"
          :disabled="isDownloading"
          @click="onDownload('jpeg')"
        >{{ isDownloading ? 'Preparing…' : 'Download JPEG' }}</button>
        <button
          class="download-btn png"
          :disabled="isDownloading"
          @click="onDownload('png')"
        >Download PNG (Overlay)</button>
        <p v-if="downloadError" class="download-error">Failed: {{ downloadError }}</p>

        <label class="toggle">
          <input type="checkbox" v-model="showGradient" />
          <span>Background</span>
        </label>
        <label class="toggle" :class="{ missing: !dotsLoaded }">
          <input type="checkbox" v-model="showDots" :disabled="!dotsLoaded" />
          <span>Dots</span>
          <span v-if="!dotsLoaded" class="toggle-missing">(missing)</span>
        </label>
        <label class="toggle" :class="{ missing: !baseLoaded }">
          <input type="checkbox" v-model="showBase" :disabled="!baseLoaded" />
          <span>Ditchfest Frame</span>
          <span v-if="!baseLoaded" class="toggle-missing">(missing)</span>
        </label>
      </div>

      <!-- User-chosen gallery overlay: arrows / memes / mappers. One at a time,
           layered on top of Base. Picker is collapsed by default; opening it
           shows a category tab strip + a thumbnail grid. The active overlay has
           a chip (preview + name + remove) and a zoom slider. -->
      <div class="overlay-block">
        <div class="overlay-header">
          <span class="overlay-title">Overlay</span>
          <button
            v-if="!selectedOverlaySrc"
            class="overlay-toggle-btn"
            @click="pickerOpen = !pickerOpen"
          >{{ pickerOpen ? 'Cancel' : 'Add overlay' }}</button>
        </div>

        <!-- Active overlay chip + zoom slider (only when one is chosen). -->
        <div v-if="selectedOverlaySrc" class="overlay-active">
          <div class="overlay-chip">
            <img :src="selectedOverlaySrc" :alt="selectedOverlayAlt" class="overlay-chip-thumb" />
            <span class="overlay-chip-name">{{ selectedOverlayAlt }}</span>
            <span v-if="overlayLoading" class="overlay-chip-loading">loading…</span>
            <button
              class="overlay-chip-remove"
              :aria-label="`Remove ${selectedOverlayAlt}`"
              @click="clearOverlay"
            >✕</button>
          </div>
          <label class="overlay-scale">
            <span class="overlay-scale-label">Scale: {{ overlayScale }}%</span>
            <input
              type="range"
              min="10"
              max="200"
              step="5"
              :value="overlayScale"
              @input="onScaleInput"
              aria-label="Overlay scale"
            />
          </label>
          <button class="overlay-change-btn" @click="pickerOpen = true">Change</button>
        </div>

        <!-- Picker: category tabs + thumbnail grid. -->
        <div v-if="pickerOpen" class="overlay-picker">
          <div class="overlay-tabs">
            <button
              v-for="cat in OVERLAY_CATEGORIES"
              :key="cat.key"
              class="overlay-tab"
              :class="{ active: overlayCategory === cat.key }"
              @click="overlayCategory = cat.key"
            >{{ cat.label }}</button>
          </div>
          <div class="overlay-grid">
            <button
              v-for="sign in overlayCategorySigns"
              :key="sign.src"
              type="button"
              class="overlay-thumb"
              :class="{ active: selectedOverlaySrc === sign.src }"
              :title="sign.alt"
              @click="selectOverlay(sign)"
            >
              <img :src="sign.src" :alt="sign.alt" loading="lazy" />
            </button>
          </div>
        </div>
      </div>

      <p class="hosting-note">
        Trackmania doesn't accept local files — host the image somewhere and
        paste the URL into your map. For example,
        <a href="https://dashmap.live/files/" target="_blank" rel="noopener">dashmap.live/files</a>.
      </p>
    </div>
  </div>
</template>

<style scoped>
.studio {
  max-width: 1300px;
  margin: 30px auto;
  padding: 0 16px;
  box-sizing: border-box;
}

.format-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.format-label {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.format-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.format-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--color-bg);
  color: var(--color-text-bright);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: border 0.15s;
}
.format-btn:hover,
.format-btn.active {
  border: 1px solid var(--color-text-bright);
}

/* A tiny rectangle whose own aspect ratio mirrors the format's — the width of
   the glyph encodes the shape (1×1 square, 6×1 long bar) so the choice reads
   visually without parsing the label. Height fixed; width follows aspect-ratio. */
.format-glyph {
  display: inline-block;
  height: 14px;
  /* width derives from the inline aspect-ratio (set per format in the
     template), so the glyph mirrors the format's shape: a 14×14 square for
     1×1, a 56×14 bar for 4×1, etc. Capped so long ratios stay tidy. */
  max-width: 56px;
  background: var(--color-text-muted);
  border-radius: 2px;
}
.format-btn.active .format-glyph {
  background: var(--color-accent);
}

.format-text {
  font-variant-numeric: tabular-nums;
}

.format-dims {
  color: var(--color-text-faint);
  font-size: 0.8rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

/* Where this sign format is applicable in the game — shown under the format
   selector so pickers know which blocks the export fits. */
.format-usage {
  margin: -8px 0 14px;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

/* Preview box: width is set inline as min(100%, 320px × format-ratio) and the
   height follows from the inline aspect-ratio — so the box is ALWAYS the exact
   format ratio (1×1 square, 6×1 strip) while never exceeding 320px in height.
   The previous version (fixed height:320px + max-width:100%) silently squished
   wide formats: on 6×1 the aspect-ratio wanted 1920px wide, max-width capped it
   at ~1268px, and the fixed height couldn't yield — the box ended up ~3.8:1
   while the canvas bitmap was 6:1, horizontally compressing everything drawn
   (the "distorted overlay on 6×1" bug; the exported JPEG was always correct,
   only the preview lied). The wrapper centres the preview horizontally. */
.studio-preview-wrap {
  display: flex;
  justify-content: center;
}

.studio-preview {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background-color: #000;
  box-shadow: var(--shadow-card);
  /* aspect-ratio + width are set inline per active format. */
}

/* Checkerboard behind the canvas when the gradient layer is off — reads as
   "these areas are transparent" instead of solid black. */
.studio-preview.transparent {
  background-color: #1a1a1a;
  background-image: repeating-conic-gradient(#242424 0% 25%, #141414 0% 50%);
  background-size: 24px 24px;
}

/* Colour pickers do nothing without the gradient body — dim and lock them. */
.zones.disabled {
  opacity: 0.4;
  pointer-events: none;
}

.studio-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* Loading placeholder sits over the same sized preview box as the canvas so
   layout doesn't shift when the first paint lands. Centred spinner + label. */
.studio-preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.spinner {
  width: 22px;
  height: 22px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: studio-spin 0.8s linear infinite;
}

@keyframes studio-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}

.studio-warn {
  margin: 12px 0 0;
  padding: 10px 12px;
  border: 1px dashed var(--color-border-dashed);
  border-radius: var(--radius-sm);
  background-color: rgba(229, 115, 115, 0.08);
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.studio-warn code {
  color: var(--color-danger);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.studio-controls {
  margin-top: 22px;
}

.studio-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.studio-hint {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin: 0;
  flex: 1 1 320px;
}

.kind-select {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.kind-select select {
  background: var(--color-bg);
  color: var(--color-text-bright);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 0.9rem;
  cursor: pointer;
}
.kind-select select:focus {
  outline: none;
  border-color: var(--color-text-bright);
}

.zones {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.zone {
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
  background-color: var(--color-overlay-1);
  padding: 14px;
  margin: 0;
}

.zone legend {
  color: var(--color-text-bright);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0 6px;
}

.stop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
}
.stop + .stop {
  border-top: 1px solid var(--color-border-subtle);
}

.stop-label {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.stop-input {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stop-input input[type='color'] {
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: none;
  cursor: pointer;
}
.stop-input input[type='color']::-webkit-color-swatch-wrapper {
  padding: 2px;
}
.stop-input input[type='color']::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
}

.stop-hex {
  color: var(--color-text);
  font-size: 0.85rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.studio-actions {
  margin-top: 22px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.download-btn {
  background: var(--color-accent);
  color: #fff;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  padding: 12px 26px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.15s, border 0.15s;
}
.download-btn:hover:not(:disabled) {
  background: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}
.download-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}

.download-error {
  color: var(--color-danger);
  font-size: 0.85rem;
  margin: 0;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-sm);
  background-color: var(--color-overlay-1);
  color: var(--color-text);
  font-size: 0.85rem;
  cursor: pointer;
  user-select: none;
}
.toggle input[type='checkbox'] {
  accent-color: var(--color-accent);
  cursor: pointer;
}
.toggle.missing {
  opacity: 0.5;
  cursor: not-allowed;
}
.toggle-missing {
  color: var(--color-text-faint);
  font-size: 0.75rem;
}

.hosting-note {
  margin: 22px 0 0;
  padding: 12px 14px;
  border: 1px solid var(--color-border-soft);
  border-left: 3px solid var(--color-border);
  border-radius: var(--radius-sm);
  background-color: var(--color-overlay-1);
  color: var(--color-text-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}
.hosting-note a {
  color: var(--color-text-bright);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.hosting-note a:hover {
  color: var(--color-accent-text);
}

/* --- User overlay picker --- */
.overlay-block {
  margin-top: 22px;
  padding: 16px;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
  background-color: var(--color-overlay-1);
}

.overlay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.overlay-title {
  color: var(--color-text-bright);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.overlay-toggle-btn,
.overlay-change-btn {
  background: var(--color-bg);
  color: var(--color-text-bright);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: border 0.15s;
}
.overlay-toggle-btn:hover,
.overlay-change-btn:hover {
  border-color: var(--color-text-bright);
}

/* Active overlay: chip (thumb + name + remove) + zoom slider. */
.overlay-active {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.overlay-chip {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px 6px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background-color: var(--color-bg);
}

.overlay-chip-thumb {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 3px;
  background: #000;
}

.overlay-chip-name {
  color: var(--color-text);
  font-size: 0.85rem;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overlay-chip-loading {
  color: var(--color-text-faint);
  font-size: 0.75rem;
}

.overlay-chip-remove {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 1rem;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  line-height: 1;
}
.overlay-chip-remove:hover {
  color: var(--color-danger);
  background-color: var(--color-overlay-5);
}

.overlay-scale {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.overlay-scale-label {
  font-variant-numeric: tabular-nums;
  min-width: 76px;
}
.overlay-scale input[type='range'] {
  accent-color: var(--color-accent);
  cursor: pointer;
  width: 140px;
}

/* Picker: category tabs + thumbnail grid. */
.overlay-picker {
  margin-top: 14px;
}

.overlay-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.overlay-tab {
  background: var(--color-bg);
  color: var(--color-text-bright);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 14px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: border 0.15s;
}
.overlay-tab:hover,
.overlay-tab.active {
  border-color: var(--color-text-bright);
}

.overlay-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(74px, 1fr));
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background-color: var(--color-bg);
}

.overlay-thumb {
  display: block;
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 3px;
  background: #000;
  cursor: pointer;
  overflow: hidden;
  transition: border 0.12s;
}
.overlay-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.overlay-thumb:hover {
  border-color: var(--color-text-muted);
}
.overlay-thumb.active {
  border-color: var(--color-accent);
}
</style>

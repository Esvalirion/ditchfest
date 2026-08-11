<!-- Sign Studio: build a custom Ditchfest sign background in the browser.
     A stencil mask (bckgrnask.png, `>`-shaped) splits the canvas into a light
     zone and a shadow zone; each zone gets its own top→bottom two-stop
     gradient. A static dots tile is composited on top. Output is a 2048×512
     JPEG, rendered entirely client-side — no server round-trip.

     The same full-resolution canvas is used for the preview (scaled down via
     CSS) and for the export, so what you see is what you get. -->
<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import {
  renderGradient,
  downloadJpeg,
  setMask,
  setDotsTile,
  setBase,
  getAssetUrls,
  DEFAULT_COLOR_A1,
  DEFAULT_COLOR_A2,
  DEFAULT_COLOR_B1,
  DEFAULT_COLOR_B2,
  STUDIO_WIDTH,
  STUDIO_HEIGHT,
} from '../utils/gradientRenderer.js';

// Four colours — two per stencil zone, each zone is a top→bottom gradient.
// A = the bright "light side" of the `>`, B = the dark "shadow side".
const colorA1 = ref(DEFAULT_COLOR_A1);
const colorA2 = ref(DEFAULT_COLOR_A2);
const colorB1 = ref(DEFAULT_COLOR_B1);
const colorB2 = ref(DEFAULT_COLOR_B2);

const maskLoaded = ref(false);
const dotsLoaded = ref(false);
const baseLoaded = ref(false);
// Toggles for the overlay layers — on by default, user can turn either off.
const showDots = ref(true);
const showBase = ref(true);
const canvasEl = ref(null);
const isDownloading = ref(false);
const downloadError = ref('');

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
  renderGradient(canvasEl.value, {
    colorA1: colorA1.value,
    colorA2: colorA2.value,
    colorB1: colorB1.value,
    colorB2: colorB2.value,
    showDots: showDots.value,
    showBase: showBase.value,
  });
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function onDownload() {
  if (!canvasEl.value || isDownloading.value) return;
  isDownloading.value = true;
  downloadError.value = '';
  try {
    await downloadJpeg(canvasEl.value, 'ditchfest-sign.jpg', 0.92);
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
});

onBeforeUnmount(() => {
  if (renderTimer) clearTimeout(renderTimer);
});

watch([colorA1, colorA2, colorB1, colorB2, showDots, showBase], scheduleRender);
</script>

<template>
  <div class="studio">
    <div class="studio-preview">
      <canvas
        ref="canvasEl"
        class="studio-canvas"
        :width="STUDIO_WIDTH"
        :height="STUDIO_HEIGHT"
      ></canvas>
    </div>

    <p v-if="!maskLoaded" class="studio-warn">
      Stencil mask not found at <code>{{ MASK_URL }}</code> — showing a flat
      gradient until it loads. Drop <code>bckgrnask.png</code> in
      <code>client/public/Signs/Studio/</code>.
    </p>

    <div class="studio-controls">
      <p class="studio-hint">
        Pick a colour pair for each side of the stencil. Light side and shadow
        side each get a left→right gradient. Result is 2048×512 — download it as
        a JPEG when you're happy.
      </p>

      <div class="zones">
        <fieldset class="zone zone-light">
          <legend>Light side</legend>
          <label class="stop">
            <span class="stop-label">Left</span>
            <span class="stop-input">
              <input type="color" v-model="colorA1" aria-label="Light side left colour" />
              <span class="stop-hex">{{ colorA1 }}</span>
            </span>
          </label>
          <label class="stop">
            <span class="stop-label">Right</span>
            <span class="stop-input">
              <input type="color" v-model="colorA2" aria-label="Light side right colour" />
              <span class="stop-hex">{{ colorA2 }}</span>
            </span>
          </label>
        </fieldset>

        <fieldset class="zone zone-shadow">
          <legend>Shadow side</legend>
          <label class="stop">
            <span class="stop-label">Left</span>
            <span class="stop-input">
              <input type="color" v-model="colorB1" aria-label="Shadow side left colour" />
              <span class="stop-hex">{{ colorB1 }}</span>
            </span>
          </label>
          <label class="stop">
            <span class="stop-label">Right</span>
            <span class="stop-input">
              <input type="color" v-model="colorB2" aria-label="Shadow side right colour" />
              <span class="stop-hex">{{ colorB2 }}</span>
            </span>
          </label>
        </fieldset>
      </div>

      <div class="studio-actions">
        <button
          class="download-btn"
          :disabled="isDownloading"
          @click="onDownload"
        >{{ isDownloading ? 'Preparing…' : 'Download JPEG' }}</button>
        <p v-if="downloadError" class="download-error">Failed: {{ downloadError }}</p>

        <label class="toggle" :class="{ missing: !dotsLoaded }">
          <input type="checkbox" v-model="showDots" :disabled="!dotsLoaded" />
          <span>Dots</span>
          <span v-if="!dotsLoaded" class="toggle-missing">(missing)</span>
        </label>
        <label class="toggle" :class="{ missing: !baseLoaded }">
          <input type="checkbox" v-model="showBase" :disabled="!baseLoaded" />
          <span>Base</span>
          <span v-if="!baseLoaded" class="toggle-missing">(missing)</span>
        </label>
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

.studio-preview {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background-color: #000;
  box-shadow: var(--shadow-card);
  aspect-ratio: 2048 / 512;
}

.studio-canvas {
  display: block;
  width: 100%;
  height: 100%;
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

.studio-hint {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin: 0 0 16px;
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
</style>

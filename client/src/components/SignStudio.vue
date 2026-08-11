<!-- Sign Studio: build a custom Ditchfest sign background in the browser.
     The current gradient kind ("arrow") uses a stencil mask to split the
     canvas into two halves shaped like a `>`, each filled with its own
     left→right two-stop gradient. A dots tile and a base overlay (frames/
     logos) are composited on top. Output is a 2048×512 JPEG, rendered entirely
     client-side — no server round-trip.

     Gradient kinds are defined in ../data/signStudioGradients.js; the dropdown
     and colour pickers below are generated from that registry, so adding a new
     kind is a new entry there (plus a renderer branch) — no UI edits needed.

     The same full-resolution canvas is used for the preview (scaled down via
     CSS) and for the export, so what you see is what you get. -->
<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import {
  renderGradient,
  downloadJpeg,
  setMask,
  setDotsTile,
  setBase,
  getAssetUrls,
  STUDIO_WIDTH,
  STUDIO_HEIGHT,
} from '../utils/gradientRenderer.js';
import {
  GRADIENTS,
  DEFAULT_GRADIENT_KIND,
  defaultColorsFor,
} from '../data/signStudioGradients.js';

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
    kind: selectedKind.value,
    colors: { ...colors },
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

// Any colour or toggle change repaints. Watch colors deeply (object values
// mutate via v-model); the scalar refs get plain watches.
watch(colors, scheduleRender, { deep: true });
watch([showDots, showBase], scheduleRender);
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
      <div class="studio-header">
        <label v-if="GRADIENTS.length > 1" class="kind-select">
          <span>Style</span>
          <select v-model="selectedKind" @change="onKindChange">
            <option v-for="g in GRADIENTS" :key="g.kind" :value="g.kind">{{ g.label }}</option>
          </select>
        </label>
      </div>

      <div class="zones">
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
</style>

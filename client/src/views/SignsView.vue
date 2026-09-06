<!-- Ported from index.html + js/script.js. The 80 hardcoded <div class="image-container">
     entries now live in ../data/signs.js; filtering is reactive state instead of
     querySelectorAll + toggling display/active classes by hand. -->
<script setup>
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { SIGNS } from '../data/signs.js';

const TOP_FILTERS = [
  { key: '1x4', label: '1x4' },
  { key: '1x6', label: '1x6' },
  { key: 'all', label: 'All' },
  // The Sign Studio builder used to live here as a fake 'studio' filter; it now
  // has its own /studio route. The entry point is the CTA link below.
];

const BOTTOM_FILTERS = {
  '1x4': [
    { type: 'backgrounds', label: 'Backgrounds' },
    { type: 'overlays', label: 'Overlays' },
    { type: 'memes', label: 'Memes' },
    { type: 'mappers', label: 'Mappers' },
  ],
  '1x6': [{ type: 'ditchfest', label: 'Ditchfest' }],
};

const topFilter = ref('1x4');
const bottomFilter = ref('backgrounds');
const accordionOpen = ref(false);
const notificationVisible = ref(false);
let notifTimer = null;

function setTopFilter(key) {
  topFilter.value = key;
  // 'all' has no bottom filter. Everything else picks the first bottom category.
  if (key === 'all') {
    bottomFilter.value = null;
  } else {
    bottomFilter.value = BOTTOM_FILTERS[key][0].type;
  }
}

function setBottomFilter(type) {
  bottomFilter.value = type;
}

const visibleSigns = computed(() => {
  if (topFilter.value === 'all') return SIGNS;
  return SIGNS.filter((s) => s.type === bottomFilter.value);
});

async function copySrc(src) {
  try {
    await navigator.clipboard.writeText(src);
  } catch (e) {
    console.error('Failed to copy:', e);
    return;
  }
  notificationVisible.value = true;
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => {
    notificationVisible.value = false;
  }, 2000);
}
</script>

<template>
  <div class="accordion">
    <button
      class="accordion-toggle"
      :aria-expanded="accordionOpen"
      aria-controls="signs-help"
      @click="accordionOpen = !accordionOpen"
    >Click here for more information</button>
    <div id="signs-help" class="accordion-content" :class="{ open: accordionOpen }">
      <p class="subtitle">Click on any image to copy its URL to clipboard</p>
      <p class="subtitle">If images don't load, it is most likely dashmap.live being down</p>
    </div>
  </div>

  <div class="filter-buttons top-level">
    <button
      v-for="f in TOP_FILTERS"
      :key="f.key"
      class="filter-btn"
      :class="{ active: topFilter === f.key }"
      @click="setTopFilter(f.key)"
    >{{ f.label }}</button>
    <!-- CTA to the Sign Studio builder, which now lives on its own /studio
         route. Styled as a filter button so it reads as part of this row, but
         it's a RouterLink (navigation), not a filter toggle. -->
    <RouterLink :to="{ name: 'studio' }" class="filter-btn studio-cta">Studio →</RouterLink>
  </div>

  <template v-for="(group, key) in BOTTOM_FILTERS" :key="key">
    <div v-if="topFilter === key" class="filter-buttons bottom-level">
      <button
        v-for="f in group"
        :key="f.type"
        class="filter-btn"
        :class="{ active: bottomFilter === f.type }"
        @click="setBottomFilter(f.type)"
      >{{ f.label }}</button>
    </div>
  </template>

  <div class="gallery">
    <div
      v-for="sign in visibleSigns"
      :key="sign.src"
      class="image-container"
      @click="copySrc(sign.src)"
    >
      <img :src="sign.src" :alt="sign.alt" />
    </div>
  </div>

  <div class="notification" :style="{ opacity: notificationVisible ? 1 : 0 }">
    URL copied to clipboard!
  </div>
</template>

<style scoped>
/* A real <button> so the toggle is keyboard-reachable; styled to read as the
   same quiet inline link it always was. */
.accordion-toggle {
  display: block;
  margin: 10px auto;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--color-text-muted);
  text-decoration: underline;
  cursor: pointer;
}

.accordion-toggle:hover {
  color: var(--color-text-bright);
}

.accordion-content {
  display: none;
  overflow: hidden;
}

.accordion-content.open {
  display: block;
}

.filter-buttons {
  margin: 10px 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  padding: 0 10px;
}

.filter-buttons.top-level {
  margin-top: 20px;
}

.filter-buttons.bottom-level {
  margin-bottom: 20px;
}

/* .filter-btn lives in base.css (shared with the Maps and Mappers pages). */

/* Studio CTA is a RouterLink styled as a filter button, but with the accent
   border to signal it's a navigation to the builder, not a catalogue filter. */
.studio-cta {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--color-accent) !important;
  color: var(--color-accent-text);
}
.studio-cta:hover {
  background: var(--color-accent);
  color: var(--color-text-bright);
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 15px;
  justify-items: center;
  align-items: start;
  margin: 30px auto;
  max-width: 1300px;
  box-sizing: border-box;
}

.image-container {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  box-sizing: border-box;
  background-color: var(--color-overlay-1);
  transition: background-color var(--transition-medium);
}

.image-container:hover {
  background-color: var(--color-overlay-5);
}

.image-container img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.notification {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--color-notification);
  color: var(--color-text-bright);
  padding: 15px;
  border-radius: var(--radius-sm);
  transition: opacity var(--transition-slow);
  pointer-events: none;
  z-index: var(--z-toast);
}
</style>

<!-- Ported from index.html + js/script.js. The 80 hardcoded <div class="image-container">
     entries now live in ../data/signs.js; filtering is reactive state instead of
     querySelectorAll + toggling display/active classes by hand. -->
<script setup>
import { ref, computed } from 'vue';
import { SIGNS } from '../data/signs.js';

const TOP_FILTERS = [
  { key: '1x4', label: '1x4' },
  { key: '1x6', label: '1x6' },
  { key: 'all', label: 'All' },
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
  bottomFilter.value = key === 'all' ? null : BOTTOM_FILTERS[key][0].type;
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
    <p class="accordion-toggle" @click="accordionOpen = !accordionOpen">Click here for more information</p>
    <div class="accordion-content" :class="{ open: accordionOpen }">
      <p class="subtitle">Click on any image to copy its URL to clipboard</p>
      <p class="subtitle">Кликните на любое изображение, чтобы скопировать его URL в буффер обмена</p>
      <p class="subtitle">Если картинки не загружаются, то, скорее-всего, это вина dashmap.live</p>
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
  </div>

  <div
    v-for="(group, key) in BOTTOM_FILTERS"
    :key="key"
    v-show="topFilter === key"
    class="filter-buttons bottom-level"
  >
    <button
      v-for="f in group"
      :key="f.type"
      class="filter-btn"
      :class="{ active: bottomFilter === f.type }"
      @click="setBottomFilter(f.type)"
    >{{ f.label }}</button>
  </div>

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
.accordion-toggle {
  margin: 10px 0;
  text-align: center;
  cursor: pointer;
  color: var(--color-text-muted);
  text-decoration: underline;
}

.accordion-toggle:hover {
  color: var(--color-text-bright);
}

.accordion-content {
  display: none;
  overflow: hidden;
  transition: max-height 0.3s ease;
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

.filter-btn {
  background: var(--color-bg);
  color: var(--color-text-bright);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 10px 22px;
  font-size: 1rem;
  cursor: pointer;
  transition: border 0.15s;
}

.filter-btn:hover,
.filter-btn.active {
  background: var(--color-bg);
  color: var(--color-text-bright);
  border: 1px solid var(--color-text-bright);
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
  transition: background-color 0.2s;
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
  color: #fff;
  padding: 15px;
  border-radius: var(--radius-sm);
  transition: opacity 0.3s;
  pointer-events: none;
  z-index: 20;
}
</style>

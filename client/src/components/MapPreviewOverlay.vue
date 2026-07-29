<!-- Singleton floating box — mount once in App.vue. See utils/mapPreview.js. -->
<script setup>
import { mapPreviewState } from '../utils/mapPreview';
</script>

<template>
  <div
    class="map-preview"
    :class="{ visible: mapPreviewState.visible }"
    :style="{ transform: `translate(${mapPreviewState.x}px, ${mapPreviewState.y}px)` }"
  >
    <img v-if="mapPreviewState.url" :src="mapPreviewState.url" alt="" />
  </div>
</template>

<style scoped>
.map-preview {
  position: fixed;
  top: 0;
  left: 0;
  width: 420px;
  max-width: 60vw;
  padding: 4px;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.12s;
  pointer-events: none;
  z-index: 100;
}

.map-preview.visible {
  opacity: 1;
  visibility: visible;
}

.map-preview img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 3px;
}
</style>

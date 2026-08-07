<!-- Thumbnail + name + vote button. Identical between mapper.html and
     voting.html in the original (js/mapper.js mapRow() / js/voting.js
     mapRow()) — one shared component instead of two copies. The caller owns
     `voted` (its own myVotes Set) and gets an update via @voted; this
     component only knows about a single row. -->
<script setup>
import { RouterLink } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { api } from '../utils/api';
import { showMapPreview, moveMapPreview, hideMapPreview } from '../utils/mapPreview';
import { showVoters, hideVoters, invalidateVoters } from '../utils/votersPopover';
import StyleTags from './StyleTags.vue';

const props = defineProps({
  map: { type: Object, required: true },
  subtitle: { type: String, default: '' },
  voted: { type: Boolean, required: true },
});
const emit = defineEmits(['voted']);

const session = useSessionStore();

async function toggleVote() {
  if (!session.isLoggedIn) {
    session.login();
    return;
  }
  const value = !props.voted;
  props.map._pending = true;
  try {
    const data = await api('/api/vote', { body: { mapUid: props.map.mapUid, value } });
    props.map.votes = data.votes;
    // The vote count just changed — next hover should show the fresh list.
    invalidateVoters(props.map.mapUid);
    emit('voted', data.voted);
  } catch (e) {
    if (e.status === 401) session.sessionExpired();
    // Network error — leave the button as it was.
  } finally {
    props.map._pending = false;
  }
}

function onThumbError(e) {
  e.target.style.display = 'none';
  hideMapPreview();
}
</script>

<template>
  <div class="map-row">
    <img
      v-if="map.thumbnailUrl"
      class="map-thumb"
      :src="map.thumbnailUrl"
      alt=""
      loading="lazy"
      @mouseenter="showMapPreview(map.thumbnailUrl, $event)"
      @mousemove="moveMapPreview"
      @mouseleave="hideMapPreview"
      @error="onThumbError"
    />
    <div class="map-info">
      <RouterLink class="map-name" :to="{ name: 'map', params: { mapUid: map.mapUid } }">{{ map.name }}</RouterLink>
      <div class="map-author">{{ subtitle }}</div>
      <StyleTags :style="map.style" :tags="map.tags" :on-tmx="map.onTmx" />
    </div>
    <button
      class="vote-btn vote-btn-sm"
      :class="{ voted }"
      :disabled="map._pending"
      @click="toggleVote"
      @mouseenter="showVoters($event.currentTarget, map.mapUid, map.votes)"
      @mouseleave="hideVoters"
    >{{ voted ? '✓' : '+' }} {{ map.votes }}</button>
  </div>
</template>

<style scoped>
.map-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border-hairline);
}

.map-row:last-child {
  border-bottom: none;
}

.map-thumb {
  width: 64px;
  height: 36px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: 3px;
  background-color: var(--color-bg-elevated);
}

@media (hover: hover) {
  .map-thumb {
    cursor: zoom-in;
  }
}

.map-info {
  flex: 1;
  min-width: 0;
}

.map-name {
  color: inherit;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: none;
}

.map-name:hover {
  text-decoration: underline;
}

.map-author {
  color: var(--color-text-dim);
  font-size: 0.8rem;
}

.vote-btn {
  background: var(--color-bg);
  color: var(--color-text-bright);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  font-size: 1rem;
  cursor: pointer;
  transition: border 0.15s, background 0.15s;
}

.vote-btn:hover {
  border: 1px solid var(--color-text-bright);
}

.vote-btn.voted {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.vote-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.vote-btn-sm {
  flex-shrink: 0;
  min-width: 56px;
  padding: 6px 12px;
  font-size: 0.9rem;
}
</style>

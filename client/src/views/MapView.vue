<!-- One map: thumbnail/author/edition, external links (trackmania.io leaderboard,
     Trackmania Exchange when the map is listed there), the top 5 times from
     trackmania.io, and the Ditchfest rating (vote count + your own toggle).
     Route is /map/:mapUid — this is where MapRow's map name links now,
     instead of redirecting straight to trackmania.io. -->
<script setup>
import { ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { api } from '../utils/api';
import { useSessionStore } from '../stores/session';
import { showVoters, hideVoters, invalidateVoters } from '../utils/votersPopover';
import StyleTags from '../components/StyleTags.vue';

const route = useRoute();
const session = useSessionStore();

const state = ref('loading'); // 'loading' | 'not-found' | 'error' | 'ready'
const map = ref(null);
const votePending = ref(false);

function formatTime(ms) {
  if (ms == null) return '—';
  const total = Math.round(ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

async function load(mapUid) {
  state.value = 'loading';
  map.value = null;

  if (!mapUid) {
    state.value = 'error';
    return;
  }

  try {
    const data = await api('/api/map/' + encodeURIComponent(mapUid));
    map.value = data;
    state.value = 'ready';
    document.title = 'Ditchfest ' + (data.name || 'Map');
  } catch (e) {
    state.value = e.status === 404 ? 'not-found' : 'error';
  }
}

async function toggleVote() {
  if (!session.isLoggedIn) {
    session.login();
    return;
  }
  const value = !map.value.voted;
  votePending.value = true;
  try {
    const data = await api('/api/vote', { body: { mapUid: map.value.mapUid, value } });
    map.value.votes = data.votes;
    map.value.voted = data.voted;
    invalidateVoters(map.value.mapUid);
  } catch (e) {
    if (e.status === 401) session.sessionExpired();
  } finally {
    votePending.value = false;
  }
}

watch(() => route.params.mapUid, load, { immediate: true });
</script>

<template>
  <div id="map-root">
    <p v-if="state === 'loading'" class="subtitle">Loading…</p>

    <template v-else-if="state === 'not-found' || state === 'error'">
      <p class="subtitle">
        {{ state === 'not-found' ? 'No such map.' : 'Failed to load this map. Try again later.' }}
      </p>
      <p class="subtitle">
        <RouterLink class="map-back" :to="{ name: 'maps' }">← Back to Maps</RouterLink>
      </p>
    </template>

    <template v-else-if="map">
      <div class="map-card">
        <img v-if="map.thumbnailUrl" class="map-card-thumb" :src="map.thumbnailUrl" alt="" />
        <h1 class="map-card-name">{{ map.name }}</h1>
        <div class="map-card-meta">
          <RouterLink v-if="map.authorAccountId" :to="{ name: 'mapper', params: { id: map.authorAccountId } }">
            {{ map.authorName || 'Unknown mapper' }}
          </RouterLink>
          <span v-else>{{ map.authorName || 'Unknown mapper' }}</span>
          <span class="map-card-dot">·</span>
          <span>{{ map.editionName }}</span>
        </div>

        <StyleTags
          v-if="map.style || map.tags?.length || map.onTmx === false"
          class="map-card-tags"
          :style="map.style"
          :tags="map.tags"
          :on-tmx="map.onTmx"
        />

        <div class="map-links">
          <a class="map-link-btn" :href="map.tmioUrl" target="_blank" rel="noopener">Trackmania.io</a>
          <a v-if="map.tmxUrl" class="map-link-btn" :href="map.tmxUrl" target="_blank" rel="noopener">Trackmania Exchange</a>
          <span v-else class="map-link-btn map-link-btn-disabled">Not on TMX</span>
        </div>
      </div>

      <h2 class="map-section">Ditchfest rating</h2>
      <div class="map-rating">
        <button
          class="vote-btn"
          :class="{ voted: map.voted }"
          :disabled="votePending"
          @click="toggleVote"
          @mouseenter="showVoters($event.currentTarget, map.mapUid, map.votes)"
          @mouseleave="hideVoters"
        >{{ map.voted ? '✓' : '+' }} {{ map.votes }}</button>
        <span class="map-rating-label">{{ map.votes === 1 ? 'vote' : 'votes' }}</span>
      </div>

      <h2 class="map-section">Top 5 times</h2>
      <p v-if="!map.leaderboard.length" class="ach-empty">No leaderboard data available.</p>
      <table v-else class="map-leaderboard">
        <tbody>
          <tr v-for="row in map.leaderboard" :key="row.position">
            <td class="lb-position">#{{ row.position }}</td>
            <td class="lb-name">{{ row.name || 'Unknown' }}</td>
            <td class="lb-time">{{ formatTime(row.time) }}</td>
          </tr>
        </tbody>
      </table>

      <p class="subtitle">
        <RouterLink class="map-back" :to="{ name: 'maps' }">← Back to Maps</RouterLink>
      </p>
    </template>
  </div>
</template>

<style scoped>
#map-root {
  max-width: 820px;
  margin: 0 auto;
}

.map-card {
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-overlay-2);
  box-shadow: var(--shadow-card);
  text-align: center;
}

.map-card-thumb {
  width: 100%;
  max-width: 480px;
  border-radius: var(--radius-md);
  object-fit: cover;
}

.map-card-name {
  margin: 16px 0 0 0;
  color: var(--color-text-bright);
  font-size: 1.6rem;
  overflow-wrap: anywhere;
}

.map-card-meta {
  margin-top: 8px;
  color: var(--color-text-dim);
  font-size: 0.9rem;
}

.map-card-meta a {
  color: var(--color-text-dim);
}

.map-card-meta a:hover {
  color: var(--color-text-bright);
}

.map-card-dot {
  margin: 0 6px;
}

.map-card-tags {
  margin-top: 12px;
  justify-content: center;
}

.map-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}

.map-link-btn {
  display: inline-block;
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-bright);
  font-size: 0.9rem;
  text-decoration: none;
  transition: border 0.15s, background 0.15s;
}

.map-link-btn:hover {
  border: 1px solid var(--color-text-bright);
  background: var(--color-bg);
}

.map-link-btn-disabled {
  color: var(--color-text-faintest);
  cursor: default;
}

.map-link-btn-disabled:hover {
  border: 1px solid var(--color-border);
  background: none;
}

.map-section {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 32px 0 0 0;
}

.map-rating {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.map-rating-label {
  color: var(--color-text-dim);
  font-size: 0.9rem;
}

.vote-btn {
  background: var(--color-bg);
  color: var(--color-text-bright);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 16px;
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

.map-leaderboard {
  width: 100%;
  margin-top: 16px;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
  background-color: var(--color-overlay-1);
  border-collapse: collapse;
  overflow: hidden;
}

.map-leaderboard td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border-hairline);
}

.map-leaderboard tr:last-child td {
  border-bottom: none;
}

.lb-position {
  color: var(--color-text-dim);
  width: 48px;
}

.lb-name {
  color: var(--color-text-bright);
}

.lb-time {
  color: var(--color-text-dim);
  text-align: right;
  font-family: monospace;
}

.ach-empty {
  color: var(--color-text-dimmer);
  font-size: 0.9rem;
  margin: 16px 0;
}

.map-back {
  color: var(--color-text-dim);
  text-decoration: none;
}

.map-back:hover {
  color: var(--color-text-bright);
}
</style>

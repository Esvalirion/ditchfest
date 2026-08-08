<!-- Ported from voting.html + js/voting.js. Every Ditchfest edition as a
     collapsible group of maps, each with a "+" button. A logged-in player can
     vote for as many maps as they like and toggle any vote at any time.

     This is the "I know what I'm doing" view. Newcomers get OnboardingView,
     which walks the same catalog one edition at a time. -->
<script setup>
import { ref } from 'vue';
import { api } from '../utils/api';
import { useSessionStore } from '../stores/session';
import MapRow from '../components/MapRow.vue';

const session = useSessionStore();

const state = ref('loading'); // 'loading' | 'error' | 'empty' | 'ready'
const editions = ref([]);
const myVotes = ref(new Set());

async function load() {
  state.value = 'loading';
  try {
    const data = await api('/api/editions');
    myVotes.value = new Set(data.myVotes || []);
    // Newest edition open, the rest collapsed, so the page reads as a list
    // of numbers you can expand.
    editions.value = (data.editions || []).map((edition, i) => ({
      ...edition,
      _open: i === 0,
    }));
    state.value = editions.value.length ? 'ready' : 'empty';
  } catch (e) {
    state.value = 'error';
  }
}

function onVoted(mapUid, voted) {
  if (voted) myVotes.value.add(mapUid);
  else myVotes.value.delete(mapUid);
  myVotes.value = new Set(myVotes.value); // Set mutation isn't reactive on its own
}

// "by Author" plus a "+ N more" hint when the map has admin-added co-authors.
// Names aren't resolved in the catalog (that'd be a TM API call per view);
// the single-map page shows them in full.
function mapSubtitle(map) {
  if (!map.authorName) return '';
  const n = map.coauthors?.length || 0;
  return n ? `by ${map.authorName} & ${n} more` : `by ${map.authorName}`;
}

load();
</script>

<template>
  <div id="maps-root">
    <p v-if="state === 'loading'" class="subtitle">Loading…</p>
    <p v-else-if="state === 'error'" class="subtitle">Failed to load maps. Try again later.</p>
    <p v-else-if="state === 'empty'" class="subtitle">The map catalog is syncing. Please check back soon.</p>

    <template v-else>
      <p v-if="!session.isLoggedIn" class="subtitle">
        Log in to vote — you can vote for as many maps as you like.
      </p>

      <section
        v-for="edition in editions"
        :key="edition.name"
        class="vote-group"
        :class="{ open: edition._open }"
      >
        <button class="vote-group-header" @click="edition._open = !edition._open">
          <span class="vg-title">
            {{ edition.name }}
            <span v-if="edition.theme" class="vg-theme">— {{ edition.theme }}</span>
          </span>
          <span class="vg-count">{{ edition.maps.length }} maps</span>
        </button>

        <div class="vote-group-body">
          <MapRow
            v-for="map in edition.maps"
            :key="map.mapUid"
            :map="map"
            :subtitle="mapSubtitle(map)"
            :voted="myVotes.has(map.mapUid)"
            @voted="(voted) => onVoted(map.mapUid, voted)"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
#maps-root {
  max-width: 820px;
  margin: 0 auto;
}

.vote-group {
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  background-color: var(--color-overlay-1);
  overflow: hidden;
}

.vote-group-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: transparent;
  color: var(--color-text-bright);
  border: none;
  padding: 12px 16px;
  font-size: 1.05rem;
  text-align: left;
  cursor: pointer;
}

.vote-group-header:hover {
  background: var(--color-overlay-3);
}

.vote-group-header::before {
  content: "▸";
  color: var(--color-text-dim);
  margin-right: 8px;
  transition: transform 0.15s;
  display: inline-block;
}

.vote-group.open .vote-group-header::before {
  transform: rotate(90deg);
}

.vg-title {
  flex: 1;
}

.vg-theme {
  color: var(--color-text-dim);
  font-weight: normal;
  font-size: 0.9rem;
}

.vg-count {
  color: var(--color-text-dim);
  font-size: 0.8rem;
  font-weight: normal;
}

.vote-group-body {
  display: none;
  border-top: 1px solid var(--color-border-subtle);
}

.vote-group.open .vote-group-body {
  display: block;
}
</style>

<!-- Ported from voting.html + js/voting.js. Every Ditchfest edition as a
     collapsible group of maps, each with a "+" button. A logged-in player can
     vote for as many maps as they like and toggle any vote at any time.

     This is the "I know what I'm doing" view. Newcomers get OnboardingView,
     which walks the same catalog one edition at a time.

     Two tabs: the classic per-edition browser (default) and "Top Maps" —
     the whole catalog flattened and sorted by likes. Two thousand rows at
     once would be a slug, so the top list renders in chunks of TOP_PAGE. -->
<script setup>
import { computed, ref } from 'vue';
import { api } from '../utils/api';
import { useSessionStore } from '../stores/session';
import MapRow from '../components/MapRow.vue';

const TABS = [
  { key: 'editions', label: 'Editions' },
  { key: 'top', label: 'Top Maps' },
];

const TOP_PAGE = 100;

const session = useSessionStore();

const state = ref('loading'); // 'loading' | 'error' | 'empty' | 'ready'
const editions = ref([]);
const myVotes = ref(new Set());
const tab = ref('editions');
const topCount = ref(TOP_PAGE);

// The catalog payload already carries each map's vote count, so the top list
// is just a client-side flatten-and-sort; rank is the post-sort array index.
const topMaps = computed(() =>
  editions.value.flatMap((e) => e.maps).sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return (a.name || '').localeCompare(b.name || '');
  }),
);

const displayedTopMaps = computed(() => topMaps.value.slice(0, topCount.value));

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

      <div class="filter-buttons">
        <button
          v-for="t in TABS"
          :key="t.key"
          class="filter-btn"
          :class="{ active: tab === t.key }"
          @click="tab = t.key"
        >{{ t.label }}</button>
      </div>

      <template v-if="tab === 'top'">
        <section class="vote-group open top-maps">
          <div class="vote-group-body">
            <div v-for="(map, i) in displayedTopMaps" :key="map.mapUid" class="top-map-row">
              <span class="top-rank">{{ i + 1 }}</span>
              <MapRow
                class="top-map-entry"
                :map="map"
                :subtitle="mapSubtitle(map)"
                :voted="myVotes.has(map.mapUid)"
                @voted="(voted) => onVoted(map.mapUid, voted)"
              />
            </div>
          </div>
        </section>
        <button
          v-if="topCount < topMaps.length"
          class="filter-btn show-more"
          @click="topCount += TOP_PAGE"
        >Show more ({{ topMaps.length - topCount }} left)</button>
      </template>

      <template v-else>
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
    </template>
  </div>
</template>

<style scoped>
#maps-root {
  max-width: 820px;
  margin: 0 auto;
}

.filter-buttons {
  margin: 20px auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  padding: 0 10px;
  max-width: 640px;
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

.show-more {
  display: block;
  margin: 16px auto;
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

/* "Top Maps" reuses the edition group chrome with no header; each row gets a
   rank number to the left of the regular MapRow. */
.top-maps .vote-group-body {
  border-top: none;
}

.top-map-row {
  display: flex;
  align-items: center;
}

.top-rank {
  width: 40px;
  flex-shrink: 0;
  text-align: center;
  color: var(--color-text-dim);
  font-size: 0.9rem;
}

.top-map-entry {
  flex: 1;
  min-width: 0;
}
</style>

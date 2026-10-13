<!-- Players tab: in-game medals on Ditchfest maps, by map medal times.
     Structured as a tab strip ("Medals" now — records leaderboards etc. can
     join later). Data comes from the records sweep (server/services/
     records.js), which walks each map's FULL leaderboard — every finisher
     counts, whatever their place — so while the backfill is running the
     board only covers already-checked maps (tracks.checked vs tracks.total).
     All numeric column headers (medal tiers + Finisher) are the sort
     switches, default: Author. The board is ~18k players, so sort, name
     search and paging (PAGE_SIZE at a time, "Show more") all run on the
     server; ranks come from the full board, so a search hit keeps its place. -->
<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '../utils/api';

// Content tabs of the Players page — one for now, the strip is the growth
// point for future boards (records, styles, ...).
const TABS = [{ key: 'medals', label: 'Medals' }];

// Sortable columns — the medal tiers plus the raw finish count. Medals are
// cumulative (Nadeo-style): beating a time earns that medal and every softer
// one below it, so bronze <= silver <= gold <= author <= finishes.
const MEDAL_COLUMNS = [
  { key: 'wr', label: 'WR', title: 'World records — #1 on the map leaderboard' },
  { key: 'author', label: 'Author' },
  { key: 'gold', label: 'Gold' },
  { key: 'silver', label: 'Silver' },
  { key: 'bronze', label: 'Bronze' },
];
const FINISHER_COL = { key: 'finishes', label: 'Finisher' };

const PAGE_SIZE = 200;
const SEARCH_DEBOUNCE_MS = 250;

const router = useRouter();

const state = ref('loading'); // 'loading' | 'error' | 'pending' | 'empty' | 'ready'
const players = ref([]);
const total = ref(0); // players matching the current search
const tracks = ref({ total: 0, checked: 0 });
const activeTab = ref('medals');
// Always descending — nobody scrolls down a medal board to see the zeros.
const sortKey = ref('author');
const search = ref('');
const loadingMore = ref(false);
const searching = ref(false); // a re-query is in flight; the old rows stay up

// Every (re)query bumps this; a response that comes back after a newer
// request was sent is dropped, so fast typing can't land stale rows.
let requestSeq = 0;
let searchTimer = null;

function fetchPage(offset) {
  const params = new URLSearchParams({
    sort: sortKey.value,
    offset: String(offset),
    limit: String(PAGE_SIZE),
  });
  const q = search.value.trim();
  if (q) params.set('q', q);
  return api('/api/results/players?' + params);
}

/** Fresh first page for the current sort/search. */
async function load() {
  const seq = ++requestSeq;
  if (state.value !== 'ready') state.value = 'loading';
  else searching.value = true;
  try {
    const data = await fetchPage(0);
    if (seq !== requestSeq) return;
    players.value = data.players || [];
    total.value = data.total || 0;
    tracks.value = data.tracks || { total: 0, checked: 0 };
    // 'empty' is only for a board with nobody on it — a search with no hits
    // keeps the table (and the search box) up with its own message.
    state.value = data.pending
      ? 'pending'
      : players.value.length || search.value.trim()
        ? 'ready'
        : 'empty';
  } catch (e) {
    if (seq === requestSeq) state.value = 'error';
  } finally {
    if (seq === requestSeq) searching.value = false;
  }
}

async function loadMore() {
  const seq = requestSeq;
  loadingMore.value = true;
  try {
    const data = await fetchPage(players.value.length);
    if (seq !== requestSeq) return;
    players.value = players.value.concat(data.players || []);
    total.value = data.total || 0;
  } catch (e) {
    // Keep what's shown; the button stays for a retry.
  } finally {
    loadingMore.value = false;
  }
}

function setSort(key) {
  if (sortKey.value === key) return;
  sortKey.value = key;
  load();
}

watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, SEARCH_DEBOUNCE_MS);
});

onBeforeUnmount(() => clearTimeout(searchTimer));

// Whole row forwards to the account page; the name itself is a real
// <RouterLink> (middle-click works), so skip the push when the click
// already landed on it.
function goToPlayer(p, event) {
  if (event.target.closest('.lb-name')) return;
  router.push({ name: 'mapper', params: { id: p.accountId } });
}

onMounted(load);
</script>

<template>
  <div id="players-root">
    <h1 class="page-title">Players</h1>

    <div class="filter-buttons">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="filter-btn"
        :class="{ active: activeTab === t.key }"
        @click="activeTab = t.key"
      >{{ t.label }}</button>
    </div>

    <p v-if="state === 'loading'" class="subtitle">Loading…</p>
    <p v-else-if="state === 'error'" class="subtitle">Failed to load players. Try again later.</p>
    <p v-else-if="state === 'pending'" class="subtitle">
      Medals are not live on this server yet — they appear once the records
      update lands. Everything else works as usual.
    </p>
    <p v-else-if="state === 'empty'" class="subtitle">
      No records yet — the sync hasn't checked any maps. Give it a run and come back.
    </p>

    <template v-else>
      <p class="subtitle">
        Every medal farmed off a Ditchfest map, counted. Click a column to rank by it.
        <span v-if="tracks.checked < tracks.total" class="pl-coverage">
          (Syncing: {{ tracks.checked }} of {{ tracks.total }} maps checked so far.)
        </span>
      </p>

      <div class="pl-search">
        <input
          v-model="search"
          type="search"
          class="admin-input"
          placeholder="Search player…"
          aria-label="Search player by name"
        />
      </div>

      <table class="leaderboard" :class="{ 'is-stale': searching }">
        <thead>
          <tr>
            <th class="lb-rank">#</th>
            <th>Player</th>
            <th
              v-for="col in MEDAL_COLUMNS"
              :key="col.key"
              class="lb-num"
              :class="'lb-medal-' + col.key"
              :title="col.title || 'Time at or under the ' + col.key + ' time — also counts for every softer medal'"
              :aria-sort="sortKey === col.key ? 'descending' : 'none'"
            >
              <button
                class="th-sort"
                :class="{ active: sortKey === col.key }"
                @click="setSort(col.key)"
              >{{ col.label }}<span class="th-arrow">▾</span></button>
            </th>
            <th
              class="lb-num"
              :aria-sort="sortKey === FINISHER_COL.key ? 'descending' : 'none'"
              title="Finished maps — every finisher counts, whatever their place"
            >
              <button
                class="th-sort"
                :class="{ active: sortKey === FINISHER_COL.key }"
                @click="setSort(FINISHER_COL.key)"
              >{{ FINISHER_COL.label }}<span class="th-arrow">▾</span></button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in players"
            :key="p.accountId"
            class="lb-link"
            @click="goToPlayer(p, $event)"
          >
            <td class="lb-rank">{{ p.rank }}</td>
            <td>
              <RouterLink class="lb-name" :to="{ name: 'mapper', params: { id: p.accountId } }">
                {{ p.name || 'Unknown player' }}
              </RouterLink>
            </td>
            <td
              v-for="col in MEDAL_COLUMNS"
              :key="col.key"
              class="lb-num"
              :class="['lb-medal-' + col.key, { 'lb-author': col.key === 'author' }]"
            >{{ p[col.key] }}</td>
            <td class="lb-num lb-finisher">{{ p.finishes }}</td>
          </tr>
          <tr v-if="!players.length">
            <td colspan="8" class="pl-none">No players match “{{ search.trim() }}”.</td>
          </tr>
        </tbody>
      </table>

      <div v-if="players.length < total" class="pl-more">
        <button class="filter-btn" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loading…' : 'Show ' + Math.min(PAGE_SIZE, total - players.length) + ' more' }}
        </button>
        <span class="pl-count">{{ players.length }} of {{ total }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
#players-root {
  max-width: 760px;
  margin: 0 auto;
}

#players-root .page-title {
  text-align: center;
  margin-top: 8px;
}

#players-root .subtitle {
  text-align: center;
  max-width: 620px;
  margin-left: auto;
  margin-right: auto;
}

.filter-buttons {
  margin: 14px auto 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  padding: 0 10px;
}

/* .filter-btn lives in base.css (shared with the Signs, Maps and Mappers pages). */

.pl-coverage {
  color: var(--color-text-dim);
}

.pl-search {
  display: flex;
  justify-content: center;
  margin-top: 18px;
}

.pl-search .admin-input {
  width: 100%;
  max-width: 320px;
}

.pl-none {
  text-align: center;
  color: var(--color-text-dim);
}

.pl-more {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.pl-count {
  color: var(--color-text-dim);
  font-size: 0.85rem;
}

.leaderboard.is-stale {
  opacity: 0.6;
  transition: opacity var(--transition-fast);
}

.leaderboard {
  max-width: 760px;
  margin: 24px auto;
  width: 100%;
  border-collapse: collapse;
  background-color: var(--color-overlay-2);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.leaderboard th,
.leaderboard td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--color-border-subtle);
}

.leaderboard th {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.leaderboard td {
  color: var(--color-text);
}

.leaderboard tbody tr:hover {
  background-color: var(--color-overlay-3);
}

.lb-rank {
  width: 44px;
  color: var(--color-text-dim);
}

.lb-num {
  text-align: right;
  width: 68px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
}

.leaderboard th.lb-num {
  text-align: right;
}

/* The numeric headers are the sort switches — a real button so keyboard
   users get one too, styled as a plain header until active. The arrow is
   absolutely positioned inside a reserved padding: an inline arrow (even
   visibility:hidden) takes line-box width and wraps narrow columns onto a
   second line, which once made the one-line headers sit visibly lower. */
.th-sort {
  position: relative;
  margin: 0;
  padding: 0 14px 0 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
}

.th-sort .th-arrow {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  line-height: 1;
  visibility: hidden;
}

.th-sort.active {
  color: var(--color-text-bright);
}

.th-sort.active .th-arrow {
  visibility: visible;
}

.th-sort:hover {
  color: var(--color-text-bright);
}

/* WR — the rarest column; bright, but not the Author accent. */
td.lb-medal-wr {
  color: var(--color-text-bright);
}

/* Author is the headline medal — the only data column with an accent. */
.lb-author {
  color: var(--color-accent-text, var(--color-text-bright));
}

/* Finisher is context, not a ranking — visually quieter than the medals. */
.lb-finisher {
  color: var(--color-text-dim);
  font-weight: normal;
}

.lb-link {
  cursor: pointer;
}

.lb-name {
  color: var(--color-text);
  text-decoration: none;
  border-bottom: 1px solid transparent;
}

.lb-link:hover .lb-name {
  color: var(--color-text-bright);
  border-bottom-color: var(--color-text-faint);
}

/* Phones: keep the name and the headline medals, drop the mid tiers. */
@media (max-width: 600px) {
  .lb-medal-silver,
  .lb-medal-bronze {
    display: none;
  }
}
</style>

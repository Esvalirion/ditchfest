<!-- Players tab: in-game medals on Ditchfest maps, tiered by Nadeo times.
     Structured as a tab strip ("Medals" now — records leaderboards etc. can
     join later). Data comes from the records sweep (server/services/
     records.js), which walks each map's FULL leaderboard — every finisher
     counts, whatever their place — so while the backfill is running the
     board only covers already-checked maps (tracks.checked vs tracks.total).
     All numeric column headers (medal tiers + Finisher) are the sort
     switches, default: Author. -->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '../utils/api';

// Content tabs of the Players page — one for now, the strip is the growth
// point for future boards (records, styles, ...).
const TABS = [{ key: 'medals', label: 'Medals' }];

// Sortable columns — the medal tiers plus the raw finish count. Medal tiers
// are bands, so author+gold+silver+bronze never double-count one finish.
const MEDAL_COLUMNS = [
  { key: 'author', label: 'Author' },
  { key: 'gold', label: 'Gold' },
  { key: 'silver', label: 'Silver' },
  { key: 'bronze', label: 'Bronze' },
];
const FINISHER_COL = { key: 'finishes', label: 'Finisher' };

const router = useRouter();

const state = ref('loading'); // 'loading' | 'error' | 'pending' | 'empty' | 'ready'
const players = ref([]);
const tracks = ref({ total: 0, checked: 0 });
const activeTab = ref('medals');
const sortKey = ref('author');

// Backend ships the list ordered by author medals; the client re-sorts
// locally when another column is picked (same deal as TopMappersView).
// Always descending — nobody scrolls down a medal board to see the zeros.
const displayedPlayers = computed(() => {
  const metric = sortKey.value;
  return [...players.value].sort((a, b) => {
    if (b[metric] !== a[metric]) return b[metric] - a[metric];
    return (a.name || '').localeCompare(b.name || '');
  });
});

async function load() {
  state.value = 'loading';
  try {
    const data = await api('/api/results/players');
    players.value = data.players || [];
    tracks.value = data.tracks || { total: 0, checked: 0 };
    state.value = data.pending
      ? 'pending'
      : players.value.length
        ? 'ready'
        : 'empty';
  } catch (e) {
    state.value = 'error';
  }
}

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
        Medals on Ditchfest maps, tiered by Nadeo times. Click a column to rank by it.
        <span v-if="tracks.checked < tracks.total" class="pl-coverage">
          (Syncing: {{ tracks.checked }} of {{ tracks.total }} maps checked so far.)
        </span>
      </p>

      <table class="leaderboard">
        <thead>
          <tr>
            <th class="lb-rank">#</th>
            <th>Player</th>
            <th
              v-for="col in MEDAL_COLUMNS"
              :key="col.key"
              class="lb-num"
              :class="'lb-medal-' + col.key"
              :aria-sort="sortKey === col.key ? 'descending' : 'none'"
            >
              <button
                class="th-sort"
                :class="{ active: sortKey === col.key }"
                @click="sortKey = col.key"
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
                @click="sortKey = FINISHER_COL.key"
              >{{ FINISHER_COL.label }}<span class="th-arrow">▾</span></button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(p, i) in displayedPlayers"
            :key="p.accountId"
            class="lb-link"
            @click="goToPlayer(p, $event)"
          >
            <td class="lb-rank">{{ i + 1 }}</td>
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
        </tbody>
      </table>
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

<!-- Ported from top-mappers.html + js/mappers.js. The three former sub-tabs
     (Likes Received / Maps Made / Likes Given) are now ONE board styled like
     the Players tab: every metric is its own column and the column headers
     are the sort switches — no tab strip. -->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '../utils/api';

// Sortable columns — default stays 'votes' (Likes Received). Adding an entry
// here plus the matching field in the SQL is all it takes to grow a new
// category. 'castVotes' ranks by votes cast (participation), not votes
// received — its rows come straight from the votes table via FULL OUTER
// JOIN, so people who never shipped a map appear too (with votes/maps = 0);
// on the authorship columns they simply sink to the bottom.
const SORT_COLUMNS = [
  { key: 'votes', label: 'Likes Received', title: 'Likes received across the mapper’s maps' },
  { key: 'maps', label: 'Maps Made', title: 'Maps shipped — co-authored maps count too' },
  { key: 'castVotes', label: 'Likes Given', title: 'Likes this account gave to other maps' },
];

const router = useRouter();

const state = ref('loading'); // 'loading' | 'error' | 'empty' | 'ready'
const mappers = ref([]);
const sortKey = ref('votes');

// Backend returns the list ordered by votes; the client re-sorts locally when
// the user picks another column. Rank is always the post-sort array index.
const displayedMappers = computed(() => {
  const metric = sortKey.value;
  return [...mappers.value].sort((a, b) => {
    if (b[metric] !== a[metric]) return b[metric] - a[metric];
    return (a.name || '').localeCompare(b.name || '');
  });
});

function setSort(key) {
  if (sortKey.value === key) return;
  sortKey.value = key;
}

async function load() {
  state.value = 'loading';
  try {
    const data = await api('/api/results/mappers');
    mappers.value = data.mappers || [];
    state.value = mappers.value.length ? 'ready' : 'empty';
  } catch (e) {
    state.value = 'error';
  }
}

// Whole row forwards to the mapper page; the name itself is a real <RouterLink>
// (middle-click / open-in-new-tab work), so skip the extra push when the click
// already landed on it.
function goToMapper(m, event) {
  if (event.target.closest('.lb-name')) return;
  router.push({ name: 'mapper', params: { id: m.accountId } });
}

onMounted(load);
</script>

<template>
  <div id="mappers-root">
    <p v-if="state === 'loading'" class="subtitle">Loading…</p>
    <p v-else-if="state === 'error'" class="subtitle">Failed to load results. Try again later.</p>
    <p v-else-if="state === 'empty'" class="subtitle">No votes yet. Head to the Maps tab to get started.</p>

    <template v-else>
      <p class="subtitle">Every Ditchfest mapper and voter in one board. Click a column to rank by it.</p>

      <table class="leaderboard">
        <thead>
          <tr>
            <th class="lb-rank">#</th>
            <th>Mapper</th>
            <th
              v-for="col in SORT_COLUMNS"
              :key="col.key"
              class="lb-num"
              :class="'lb-' + col.key"
              :title="col.title"
              :aria-sort="sortKey === col.key ? 'descending' : 'none'"
            >
              <button
                class="th-sort"
                :class="{ active: sortKey === col.key }"
                @click="setSort(col.key)"
              >{{ col.label }}<span class="th-arrow">▾</span></button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(m, i) in displayedMappers"
            :key="m.accountId"
            class="lb-link"
            @click="goToMapper(m, $event)"
          >
            <td class="lb-rank">{{ i + 1 }}</td>
            <td>
              <RouterLink class="lb-name" :to="{ name: 'mapper', params: { id: m.accountId } }">
                {{ m.name || 'Unknown mapper' }}
              </RouterLink>
            </td>
            <td
              v-for="col in SORT_COLUMNS"
              :key="col.key"
              class="lb-num"
              :class="'lb-' + col.key"
            >{{ m[col.key] }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped>
#mappers-root {
  max-width: 640px;
  margin: 0 auto;
}

#mappers-root .subtitle {
  text-align: center;
  max-width: 620px;
  margin-left: auto;
  margin-right: auto;
}

.leaderboard {
  max-width: 640px;
  margin: 30px auto;
  width: 100%;
  border-collapse: collapse;
  background-color: var(--color-overlay-2);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.leaderboard th,
.leaderboard td {
  padding: 12px 16px;
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
  width: 48px;
  color: var(--color-text-dim);
}

.lb-num {
  text-align: right;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
}

.leaderboard th.lb-num {
  text-align: right;
}

/* The numeric headers are the sort switches — a real button so keyboard
   users get one too, styled as a plain header until active. The arrow is
   absolutely positioned inside a reserved padding (same trick as the
   Players tab: an inline arrow takes line-box width and wraps headers
   onto a second line). */
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
  white-space: nowrap;
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

/* Likes Received is the headline metric — the only data column with an
   accent, mirroring Author on the Players tab. The td prefix keeps this
   above `.leaderboard td`'s plain color. */
td.lb-votes {
  color: var(--color-accent-text, var(--color-text-bright));
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

/* Phones: keep the name and the two authorship columns, drop participation. */
@media (max-width: 600px) {
  .lb-castVotes {
    display: none;
  }
}
</style>

<!-- Ported from top-mappers.html + js/mappers.js. -->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '../utils/api';

// Sort categories — default stays 'votes' (Rating). Adding an entry here plus
// the matching field in the SQL is all it takes to grow a new category.
// 'castVotes' ranks by votes cast (participation), not votes received — its
// rows come straight from the votes table via FULL OUTER JOIN, so people who
// never shipped a map appear too (with votes/maps = 0); the mapper-only tabs
// below filter those back out to keep the old behaviour.
const SORT_OPTIONS = [
  { key: 'votes', label: 'Likes Received', metric: 'votes' },
  { key: 'maps', label: 'Maps Made', metric: 'maps' },
  { key: 'cast', label: 'Likes Given', metric: 'castVotes' },
];

const router = useRouter();

const state = ref('loading'); // 'loading' | 'error' | 'empty' | 'ready'
const mappers = ref([]);
const sortKey = ref('votes');

const activeOption = computed(
  () => SORT_OPTIONS.find((o) => o.key === sortKey.value) ?? SORT_OPTIONS[0],
);

// Backend returns the list ordered by votes; the client re-sorts locally when
// the user picks another category. Rank is always the post-sort array index.
// Mapper-only tabs ('votes'/'maps') hide rows without maps — the backend also
// ships pure voters for the 'castVotes' tab, and they'd clutter those two.
const displayedMappers = computed(() => {
  const opt = activeOption.value;
  const metric = opt.metric;
  const pool = metric === 'castVotes'
    ? mappers.value
    : mappers.value.filter((m) => m.maps > 0);
  return [...pool].sort((a, b) => {
    if (b[metric] !== a[metric]) return b[metric] - a[metric];
    return (a.name || '').localeCompare(b.name || '');
  });
});

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
      <div class="filter-buttons">
        <button
          v-for="opt in SORT_OPTIONS"
          :key="opt.key"
          class="filter-btn"
          :class="{ active: sortKey === opt.key }"
          @click="sortKey = opt.key"
        >{{ opt.label }}</button>
      </div>

      <table class="leaderboard">
        <thead>
          <tr>
            <th class="lb-rank">#</th>
            <th>Mapper</th>
            <th class="lb-votes">{{ activeOption.label }}</th>
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
            <td class="lb-votes">{{ m[activeOption.metric] }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped>
.filter-buttons {
  margin: 20px auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  padding: 0 10px;
  max-width: 640px;
}

/* .filter-btn lives in base.css (shared with the Signs and Maps pages). */

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

.lb-votes {
  text-align: right;
  width: 80px;
  font-weight: bold;
}

.leaderboard th.lb-votes {
  text-align: right;
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
</style>

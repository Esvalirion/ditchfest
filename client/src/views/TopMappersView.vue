<!-- Ported from top-mappers.html + js/mappers.js. -->
<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '../utils/api';

const router = useRouter();

const state = ref('loading'); // 'loading' | 'error' | 'empty' | 'ready'
const mappers = ref([]);

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

    <table v-else class="leaderboard">
      <thead>
        <tr>
          <th class="lb-rank">#</th>
          <th>Mapper</th>
          <th class="lb-votes">Votes</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(m, i) in mappers"
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
          <td class="lb-votes">{{ m.votes }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
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

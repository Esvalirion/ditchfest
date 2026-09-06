<!-- Maps confirmed absent from Trackmania Exchange — a quiet page for the
     people who want to fix that, not a nav destination. Reached from the
     footer link, from the "Not on TMX" pill on a map's page, and highlighted
     under the Maps tab (meta.navGroup in the router). -->
<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../utils/api';
import MapRow from '../components/MapRow.vue';

const state = ref('loading'); // 'loading' | 'error' | 'empty' | 'ready'
const maps = ref([]);

// mapUid → true while a recheck is in flight; one button press = one request,
// no double-fires while the first is still running.
const rechecking = ref({});

async function load() {
  state.value = 'loading';
  try {
    const data = await api('/api/missing-tmx');
    maps.value = data.maps || [];
    state.value = maps.value.length ? 'ready' : 'empty';
  } catch (e) {
    state.value = 'error';
  }
}

function tmioUrl(mapUid) {
  return `https://trackmania.io/#/leaderboard/${encodeURIComponent(mapUid)}`;
}

// "by Author · Edition" — MapRow's subtitle line.
function subtitle(m) {
  const by = `by ${m.authorName || 'Unknown mapper'}`;
  return m.editionName ? `${by} · ${m.editionName}` : by;
}

// The per-row "refresh": ask TMX about this one map right now. Found → the
// row is gone from the list (the server stamps it too). Not found → the
// button flashes "checked, still missing". Deliberately manual — this page
// is the only place that fires these, so TMX doesn't get hovered into its
// rate limit.
async function recheck(m) {
  if (rechecking.value[m.mapUid]) return;
  rechecking.value[m.mapUid] = true;
  m._recheck = 'pending';
  try {
    const data = await api(`/api/missing-tmx/${encodeURIComponent(m.mapUid)}/recheck`, { body: {} });
    if (data.onTmx) {
      maps.value = maps.value.filter((x) => x.mapUid !== m.mapUid);
      if (!maps.value.length) state.value = 'empty';
      return;
    }
    m._recheck = 'absent';
  } catch (e) {
    m._recheck = 'error';
  } finally {
    rechecking.value[m.mapUid] = false;
    if (m._recheck && m._recheck !== 'pending') {
      setTimeout(() => (m._recheck = null), 1500);
    }
  }
}

function recheckTitle(m) {
  if (m._recheck === 'absent') return 'Checked — still not on TMX';
  if (m._recheck === 'error') return 'TMX unreachable, try again later';
  return 'Recheck on TMX now';
}

onMounted(load);
</script>

<template>
  <div id="missing-root">
    <h1 class="page-title">Not on TMX</h1>

    <p v-if="state === 'loading'" class="subtitle">Loading…</p>
    <p v-else-if="state === 'error'" class="subtitle">Failed to load the list. Try again later.</p>
    <p v-else-if="state === 'empty'" class="subtitle">
      Every Ditchfest map is already on Trackmania Exchange. Nothing to do here.
    </p>

    <template v-else>
      <p class="subtitle">
        {{ maps.length }} {{ maps.length === 1 ? 'map is' : 'maps are' }} confirmed missing from
        <a class="text-link" href="https://trackmania.exchange" target="_blank" rel="noopener">Trackmania Exchange</a>.
      </p>
      <p class="subtitle subtitle-help">
        Want to help? Grab a map on trackmania.io and upload it to TMX. Once it's up, hit the
        refresh button on its row — it drops off right away. No button-pressing? The periodic
        check catches up within a couple of days.
      </p>

      <div class="missing-list">
        <!-- Regular MapRows, but with the actions slot swapped: recheck +
             download are this page's whole point, so they replace the default
             hover cluster and stay always visible. No vote toggle here. -->
        <MapRow
          v-for="m in maps"
          :key="m.mapUid"
          :map="m"
          :subtitle="subtitle(m)"
          :voted="false"
          :votable="false"
          actions-visibility="always"
        >
          <template #actions>
            <button
              class="icon-btn recheck-btn"
              :class="{
                busy: m._recheck === 'pending',
                ok: m._recheck === 'absent',
                err: m._recheck === 'error',
              }"
              :title="recheckTitle(m)"
              :aria-label="recheckTitle(m)"
              :disabled="m._recheck === 'pending'"
              @click="recheck(m)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
              </svg>
            </button>
            <a
              class="icon-btn"
              :href="tmioUrl(m.mapUid)"
              target="_blank"
              rel="noopener"
              title="Download on trackmania.io"
              aria-label="Download on trackmania.io"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" />
              </svg>
            </a>
          </template>
        </MapRow>
      </div>
    </template>
  </div>
</template>

<style scoped>
#missing-root {
  max-width: 820px;
  margin: 0 auto;
  padding: 0 12px;
}

/* Inline link inside a sentence — themed instead of the browser-default
   blue: bright text with a faint underline that lights up on hover. */
.text-link {
  color: var(--color-text-bright);
  text-decoration: underline;
  text-decoration-color: var(--color-text-faint);
  text-underline-offset: 3px;
}

.text-link:hover {
  text-decoration-color: var(--color-text-bright);
}

.subtitle-help {
  margin-bottom: 24px;
}

.missing-list {
  background-color: var(--color-overlay-2);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* .icon-btn lives in base.css; only the recheck state machine is local. */

/* Recheck states: spinner while in flight; a muted "ok" flash when TMX was
   asked and confirmed the map is still absent; danger tint on failure. */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.recheck-btn.busy {
  cursor: default;
}

.recheck-btn.busy svg {
  animation: spin 0.8s linear infinite;
}

.recheck-btn.ok {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.recheck-btn.err {
  color: var(--color-danger);
  border-color: var(--color-danger);
}
</style>

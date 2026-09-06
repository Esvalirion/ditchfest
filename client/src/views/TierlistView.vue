<!-- TierMaker-style ranking board for the two tierlist activities. One view
     serves both routes: it tells them apart by route name, loads its item
     list from the matching public API (mappers or ditchfest editions) and
     renders the classic S/A/B/C/D/idk board with the unranked pool below.

     Drag & drop is native HTML5 (desktop browsers; touch is not supported —
     the point of the page is screenshots, not mobile sorting). Nothing is
     ever sent to the server: the layout lives in localStorage (one key per
     tierlist), so a reload keeps your work, entries the catalog no longer
     knows are dropped on restore, and new ones simply appear in the pool. -->
<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../utils/api';
import { findActivity } from '../data/homeActivities';
import TierlistChip from '../components/TierlistChip.vue';

// route name → homeActivities kind: the header reuses the registry's label
// and description, so this page and the home block can't drift apart.
const KIND_BY_ROUTE = {
  'tierlist-mappers': 'mappers-tierlist',
  'tierlist-ditchfests': 'ditchfests-tierlist',
};

// What each board ranks and where its layout is stored. load() normalizes
// everything to {id, label, card?, media?, theme?} — the rest of the view is
// kind-agnostic.
const BOARDS = {
  'mappers-tierlist': {
    storageKey: 'tierlist:mappers',
    async load() {
      const data = await api('/api/results/mappers');
      return (
        data.mappers
          // Pure voters (0 maps) aren't mappers to rank — the same filter
          // the mapper-only leaderboard tabs use.
          .filter((m) => m.maps > 0)
          // Alphabetical: the pool is scanned by name, not by popularity.
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          .map((m) => ({ id: String(m.accountId), label: m.name || 'Unknown mapper' }))
      );
    },
  },
  'ditchfests-tierlist': {
    storageKey: 'tierlist:ditchfests',
    async load() {
      const data = await api('/api/editions');
      // The API returns newest-first; the pool reads naturally that way.
      // card: editions always render as cover cards — even the ones without
      // media (admin folders, pre-cover syncs) get a numbered placeholder
      // so the pool stays visually uniform.
      return data.editions.map((e) => ({
        id: String(e.campaignId),
        label: e.name,
        card: true,
        media: e.media,
        theme: e.theme || null,
      }));
    },
  },
};

// The classic TierMaker rainbow, kept pastel with dark text but framed by
// the site's dark cards. 'idk' replaces the traditional F — the parking row
// for entries you don't know well enough to judge.
const TIERS = [
  { key: 'S', color: '#ff7f7f' },
  { key: 'A', color: '#ffbf7f' },
  { key: 'B', color: '#ffdf7f' },
  { key: 'C', color: '#ffff7f' },
  { key: 'D', color: '#bfff7f' },
  { key: 'idk', color: '#a6a6a6' },
];

const ZONES = ['pool', ...TIERS.map((t) => t.key)];

const route = useRoute();
const kind = KIND_BY_ROUTE[route.name];
const activity = findActivity(kind);
const board = BOARDS[kind];

const state = ref('loading'); // 'loading' | 'error' | 'ready'
const items = ref([]);
const byId = computed(() => new Map(items.value.map((i) => [i.id, i])));

// zone key → ordered item ids. The whole board renders off this one object.
const placement = reactive(Object.fromEntries(ZONES.map((z) => [z, []])));

// --- Local persistence -------------------------------------------------------
// The page is local-only by design: the server never hears about any of
// this. localStorage survives reloads and page closes.

function persist() {
  try {
    localStorage.setItem(board.storageKey, JSON.stringify(placement));
  } catch (e) {
    // Private mode / quota — the board still works for this session.
  }
}

function resetPlacement() {
  for (const z of ZONES) placement[z] = [];
  placement.pool = items.value.map((i) => i.id);
}

function restore() {
  resetPlacement();
  try {
    const saved = JSON.parse(localStorage.getItem(board.storageKey));
    if (!saved) return;
    const seen = new Set();
    for (const z of ZONES) {
      if (!Array.isArray(saved[z])) continue;
      // Drop ids the catalog no longer knows and duplicates; keep order.
      placement[z] = saved[z].filter((id) => {
        if (!byId.value.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }
    // Items synced since the last visit start unranked.
    for (const i of items.value) {
      if (!seen.has(i.id)) placement.pool.push(i.id);
    }
  } catch (e) {
    resetPlacement(); // corrupted entry — start over rather than half-apply
  }
}

// --- Drag & drop -------------------------------------------------------------
// A chip carries its id in `dragging`; every zone body is a drop target
// (append at the end) and every chip is one too (insert before it). The
// chip-level handlers stop propagation so a drop on a chip doesn't also fire
// the zone-body append. Reordering inside a zone falls out of move()
// removing the id everywhere before inserting it at its new spot.

const dragging = ref(null); // id of the item currently held
const overZone = ref(null); // zone key under the cursor, for the highlight

function onDragStart(item, e) {
  dragging.value = item.id;
  // Firefox only fires dragover/drop when dragstart set some payload.
  e.dataTransfer.setData('text/plain', item.id);
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd() {
  dragging.value = null;
  overZone.value = null;
}

function onZoneOver(zone, e) {
  e.preventDefault(); // without this the browser refuses the drop
  e.dataTransfer.dropEffect = 'move';
  overZone.value = zone;
}

function dropOnZone(zone) {
  if (dragging.value == null) return;
  move(dragging.value, zone, null);
}

function dropOnChip(zone, beforeId) {
  if (dragging.value == null || dragging.value === beforeId) return;
  move(dragging.value, zone, beforeId);
}

function move(id, zone, beforeId) {
  for (const z of ZONES) {
    if (placement[z].includes(id)) placement[z] = placement[z].filter((x) => x !== id);
  }
  const arr = placement[zone];
  const at = beforeId != null ? arr.indexOf(beforeId) : -1;
  if (at === -1) arr.push(id);
  else arr.splice(at, 0, id);
  persist();
}

// --- Reset -------------------------------------------------------------------
// Two-step inline confirm instead of a native dialog: the first click arms
// the button for three seconds, the second actually wipes the board.

const resetArmed = ref(false);
let disarmTimer = null;

function onReset() {
  if (!resetArmed.value) {
    resetArmed.value = true;
    clearTimeout(disarmTimer);
    disarmTimer = setTimeout(() => (resetArmed.value = false), 3000);
    return;
  }
  resetArmed.value = false;
  clearTimeout(disarmTimer);
  resetPlacement();
  persist();
}

// The rendered chips for one zone (ids → items; stale ids are silently gone).
function chipsOf(zone) {
  return placement[zone].map((id) => byId.value.get(id)).filter(Boolean);
}

onMounted(async () => {
  try {
    items.value = await board.load();
    restore();
    state.value = 'ready';
  } catch (e) {
    state.value = 'error';
  }
});
</script>

<template>
  <div id="tierlist-root">
    <header class="tierlist-head">
      <h1 class="page-title">{{ activity.label }}</h1>
      <p class="subtitle">{{ activity.description }}</p>
      <p class="tierlist-note">
        Drag entries between rows to rank them. Your board is saved only in this
        browser — nothing is sent to the server — so once you like it, take a
        screenshot and share it.
      </p>
    </header>

    <p v-if="state === 'loading'" class="subtitle">Loading…</p>
    <p v-else-if="state === 'error'" class="subtitle">Failed to load the list. Try again later.</p>

    <template v-else>
      <div class="board">
        <div
          v-for="t in TIERS"
          :key="t.key"
          class="tier"
          :class="{ 'drag-over': dragging && overZone === t.key }"
        >
          <div class="tier-label" :style="{ backgroundColor: t.color }">{{ t.key }}</div>
          <div
            class="tier-body"
            @dragover="onZoneOver(t.key, $event)"
            @drop.prevent="dropOnZone(t.key)"
          >
            <TierlistChip
              v-for="item in chipsOf(t.key)"
              :key="item.id"
              :item="item"
              :dragging="dragging === item.id"
              @dragstart="onDragStart(item, $event)"
              @dragend="onDragEnd"
              @dragover.stop="onZoneOver(t.key, $event)"
              @drop.stop.prevent="dropOnChip(t.key, item.id)"
            />
          </div>
        </div>
      </div>

      <div class="pool" :class="{ 'drag-over': dragging && overZone === 'pool' }">
        <div class="pool-head">
          <span class="pool-title">Unranked</span>
          <span class="pool-count">{{ chipsOf('pool').length }} left</span>
          <button class="reset-btn" :class="{ armed: resetArmed }" @click="onReset">
            {{ resetArmed ? 'Really reset?' : 'Reset' }}
          </button>
        </div>
        <div
          class="pool-body"
          @dragover="onZoneOver('pool', $event)"
          @drop.prevent="dropOnZone('pool')"
        >
          <TierlistChip
            v-for="item in chipsOf('pool')"
            :key="item.id"
            :item="item"
            :dragging="dragging === item.id"
            @dragstart="onDragStart(item, $event)"
            @dragend="onDragEnd"
            @dragover.stop="onZoneOver('pool', $event)"
            @drop.stop.prevent="dropOnChip('pool', item.id)"
          />
          <p v-if="!chipsOf('pool').length" class="pool-empty">
            Nothing left — everything is ranked.
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
#tierlist-root {
  max-width: 980px;
  margin: 0 auto;
}

.tierlist-head {
  text-align: center;
  margin-bottom: 22px;
}

.tierlist-note {
  margin: 10px auto 0;
  max-width: 640px;
  color: var(--color-text-dim);
  font-size: 0.9rem;
}

/* --- The board -------------------------------------------------------------- */
.board {
  background-color: var(--color-overlay-1);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.tier {
  display: flex;
  min-height: 100px;
}

.tier + .tier {
  border-top: 1px solid var(--color-border-hairline);
}

.tier-label {
  flex: 0 0 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.7rem;
  font-weight: bold;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #151515;
  /* A faint top shade grounds the classic pastel on the dark board. */
  background-image: linear-gradient(rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0));
  border-right: 1px solid rgba(0, 0, 0, 0.22);
}

.tier-body {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 8px;
  padding: 10px;
  min-height: 100px;
  box-sizing: border-box;
}

.tier.drag-over .tier-body {
  background-color: var(--color-overlay-3);
  outline: 1px dashed var(--color-text-faint);
  outline-offset: -3px;
}

/* --- The unranked pool ------------------------------------------------------- */
.pool {
  margin-top: 16px;
  background-color: var(--color-overlay-1);
  border: 1px dashed var(--color-border-dashed);
  border-radius: var(--radius-lg);
}

.pool-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 0;
}

.pool-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.pool-count {
  font-size: 0.8rem;
  color: var(--color-text-dim);
}

.pool-body {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 8px;
  padding: 12px 14px 14px;
  min-height: 72px;
}

.pool.drag-over {
  background-color: var(--color-overlay-2);
  border-color: var(--color-text-faint);
}

.pool-empty {
  margin: 0;
  align-self: center;
  color: var(--color-text-faint);
  font-style: italic;
  font-size: 0.9rem;
}

.reset-btn {
  margin-left: auto;
  background: var(--color-bg);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 14px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}

.reset-btn:hover {
  color: var(--color-text-bright);
  border-color: var(--color-text-bright);
}

.reset-btn.armed {
  color: var(--color-danger);
  border-color: var(--color-danger);
}

@media (max-width: 560px) {
  .tier-label {
    flex-basis: 52px;
    font-size: 1.2rem;
  }

  .tier,
  .tier-body {
    min-height: 84px;
  }
}
</style>

<!-- Move maps between campaigns and set each campaign's public theme. A
     "campaign" here is a real Nadeo campaign (editions.campaign_id) — when
     one edition needs more than the 25-map cap on a single TM campaign,
     organizers split it into a second real campaign on trackmania.io, which
     syncs in as its own unrelated edition. Dragging a map into a different
     column sets maps.display_campaign_id so it shows there instead, without
     touching what sync itself writes (services/editions.js reads that
     override; services/sync.js never sees it). Dragging it back into its
     real column clears the override. -->
<script setup>
import { ref, computed } from 'vue';
import { api } from '../utils/api';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();

const state = ref('loading'); // 'unauthenticated' | 'loading' | 'forbidden' | 'error' | 'ready'
const editions = ref([]); // [{ campaignId, name, displayName, theme, hidden, isVirtual, maps: [...] }]
const themeDrafts = ref({}); // campaignId -> draft text while editing
const savingTheme = ref({}); // campaignId -> bool
const nameDrafts = ref({}); // campaignId -> draft text while editing
const savingName = ref({}); // campaignId -> bool
const savingHidden = ref({}); // campaignId -> bool
const deletingFolder = ref({}); // campaignId -> bool
const newFolderName = ref('');
const creatingFolder = ref(false);
const draggingMapUid = ref(null);
const draggingColumnId = ref(null);
const dragOverCampaignId = ref(null);

// Flat list of every map with its real (synced) campaign alongside any
// display override, so columns can be built by *effective* campaign instead
// of the real grouping the API returns them in.
const allMaps = computed(() => {
  const out = [];
  for (const e of editions.value) {
    for (const m of e.maps) out.push({ ...m, realCampaignId: e.campaignId });
  }
  return out;
});

function mapsForColumn(campaignId) {
  return allMaps.value
    .filter((m) => (m.displayCampaignId ?? m.realCampaignId) === campaignId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function load() {
  if (!session.isLoggedIn) {
    state.value = 'unauthenticated';
    return;
  }
  state.value = 'loading';
  try {
    const data = await api('/api/campaigns');
    editions.value = data.editions || [];
    themeDrafts.value = Object.fromEntries(editions.value.map((e) => [e.campaignId, e.theme || '']));
    nameDrafts.value = Object.fromEntries(
      editions.value.map((e) => [e.campaignId, e.displayName || e.name])
    );
    state.value = 'ready';
  } catch (e) {
    if (e.status === 403) state.value = 'forbidden';
    else if (e.status === 401) session.sessionExpired();
    else state.value = 'error';
  }
}

async function saveTheme(edition) {
  savingTheme.value = { ...savingTheme.value, [edition.campaignId]: true };
  try {
    await api('/api/campaigns/theme', {
      body: { campaignId: edition.campaignId, theme: themeDrafts.value[edition.campaignId] || null },
    });
    edition.theme = themeDrafts.value[edition.campaignId] || null;
  } catch (e) {
    // Draft stays in the box; the input itself is the error state here.
  } finally {
    savingTheme.value = { ...savingTheme.value, [edition.campaignId]: false };
  }
}

async function saveName(edition) {
  const name = (nameDrafts.value[edition.campaignId] || '').trim();
  savingName.value = { ...savingName.value, [edition.campaignId]: true };
  try {
    await api('/api/campaigns/name', { body: { campaignId: edition.campaignId, name } });
    if (edition.isVirtual) {
      edition.name = name;
    } else {
      edition.displayName = name || null;
    }
    nameDrafts.value[edition.campaignId] = name || edition.name;
  } catch (e) {
    // Draft stays in the box; the input itself is the error state here.
  } finally {
    savingName.value = { ...savingName.value, [edition.campaignId]: false };
  }
}

async function toggleHidden(edition) {
  const next = !edition.hidden;
  savingHidden.value = { ...savingHidden.value, [edition.campaignId]: true };
  try {
    await api('/api/campaigns/hide', { body: { campaignId: edition.campaignId, hidden: next } });
    edition.hidden = next;
  } catch (e) {
    // leave as-is on failure
  } finally {
    savingHidden.value = { ...savingHidden.value, [edition.campaignId]: false };
  }
}

async function deleteFolder(edition) {
  deletingFolder.value = { ...deletingFolder.value, [edition.campaignId]: true };
  try {
    await api('/api/campaigns/delete', { body: { campaignId: edition.campaignId } });
    // Mirrors the FK's ON DELETE SET NULL: any map display-overridden into
    // this folder falls back to its real campaign.
    for (const e of editions.value) {
      for (const m of e.maps) {
        if (m.displayCampaignId === edition.campaignId) m.displayCampaignId = null;
      }
    }
    editions.value = editions.value.filter((e) => e.campaignId !== edition.campaignId);
  } catch (e) {
    deletingFolder.value = { ...deletingFolder.value, [edition.campaignId]: false };
  }
}

async function createFolder() {
  const name = newFolderName.value.trim();
  if (!name) return;
  creatingFolder.value = true;
  try {
    const res = await api('/api/campaigns', { body: { name } });
    editions.value.unshift({
      campaignId: res.campaignId,
      name,
      displayName: null,
      theme: null,
      hidden: false,
      isVirtual: true,
      maps: [],
    });
    themeDrafts.value[res.campaignId] = '';
    nameDrafts.value[res.campaignId] = name;
    newFolderName.value = '';
  } catch (e) {
    // input keeps its text so the admin can retry
  } finally {
    creatingFolder.value = false;
  }
}

function onDragStart(map) {
  draggingMapUid.value = map.mapUid;
}

function onDragEnd() {
  draggingMapUid.value = null;
  dragOverCampaignId.value = null;
}

function onColumnDragStart(edition) {
  draggingColumnId.value = edition.campaignId;
}

function onColumnDragEnd() {
  draggingColumnId.value = null;
  dragOverCampaignId.value = null;
}

async function persistOrder(newIds) {
  const prevEditions = editions.value;
  editions.value = newIds.map((id) => prevEditions.find((e) => e.campaignId === id));

  try {
    await api('/api/campaigns/reorder', { body: { order: newIds } });
  } catch (e) {
    editions.value = prevEditions; // roll back
  }
}

async function reorderColumns(draggedId, targetId) {
  if (draggedId === targetId) return;
  const ids = editions.value.map((e) => e.campaignId);
  const fromIdx = ids.indexOf(draggedId);
  const toIdx = ids.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1) return;

  const newIds = [...ids];
  newIds.splice(fromIdx, 1);
  newIds.splice(toIdx, 0, draggedId);
  await persistOrder(newIds);
}

// Typing a position directly beats dragging a column across a hundred-plus
// others to reach the far end of the board.
function movePosition(edition, rawPosition) {
  const ids = editions.value.map((e) => e.campaignId);
  const fromIdx = ids.indexOf(edition.campaignId);
  if (fromIdx === -1) return;

  const parsed = Number(rawPosition);
  if (!Number.isFinite(parsed)) return;
  const toIdx = Math.max(0, Math.min(ids.length - 1, Math.round(parsed) - 1));
  if (toIdx === fromIdx) return;

  const newIds = [...ids];
  newIds.splice(fromIdx, 1);
  newIds.splice(toIdx, 0, edition.campaignId);
  persistOrder(newIds);
}

// Shared by drag-drop and the "Return" button: moves a map to targetCampaignId
// (or back to its real campaign when targetCampaignId is its own
// realCampaignId), optimistically, rolling back on API failure.
async function moveMapTo(map, targetCampaignId) {
  const currentEffective = map.displayCampaignId ?? map.realCampaignId;
  if (currentEffective === targetCampaignId) return; // already there

  // The map object lives inside editions.value[x].maps — mutate it there so
  // the computed column list picks it up.
  const home = editions.value.find((e) => e.campaignId === map.realCampaignId);
  const target = home?.maps.find((m) => m.mapUid === map.mapUid);
  if (!target) return;

  const nextOverride = targetCampaignId === map.realCampaignId ? null : targetCampaignId;
  const prevOverride = target.displayCampaignId;
  target.displayCampaignId = nextOverride; // optimistic

  try {
    await api('/api/campaigns/move-map', { body: { mapUid: map.mapUid, campaignId: nextOverride } });
  } catch (e) {
    target.displayCampaignId = prevOverride; // roll back
  }
}

function returnMap(map) {
  moveMapTo(map, map.realCampaignId);
}

async function onDrop(targetCampaignId) {
  if (draggingColumnId.value !== null) {
    const draggedId = draggingColumnId.value;
    dragOverCampaignId.value = null;
    draggingColumnId.value = null;
    await reorderColumns(draggedId, targetCampaignId);
    return;
  }

  const mapUid = draggingMapUid.value;
  dragOverCampaignId.value = null;
  draggingMapUid.value = null;
  if (!mapUid) return;

  const map = allMaps.value.find((m) => m.mapUid === mapUid);
  if (!map) return;
  await moveMapTo(map, targetCampaignId);
}

load();
</script>

<template>
  <div id="admin-campaigns-root">
    <p v-if="state === 'unauthenticated'" class="subtitle">Log in to access the admin panel.</p>
    <p v-else-if="state === 'loading'" class="subtitle">Loading…</p>
    <p v-else-if="state === 'forbidden'" class="subtitle">Access denied — admins only.</p>
    <p v-else-if="state === 'error'" class="subtitle">Failed to load. Try again later.</p>

    <template v-else-if="state === 'ready'">
      <div class="new-folder-row">
        <input
          v-model="newFolderName"
          type="text"
          class="campaign-theme-input"
          placeholder="New folder name"
          @keydown.enter="createFolder"
        />
        <button class="auth-btn" :disabled="creatingFolder" @click="createFolder">+ New folder</button>
      </div>

      <div class="campaign-board">
      <div
        v-for="(edition, index) in editions"
        :key="edition.campaignId"
        class="campaign-col"
        :class="{ 'drag-over': dragOverCampaignId === edition.campaignId, hidden: edition.hidden, dragging: draggingColumnId === edition.campaignId }"
        @dragover.prevent="dragOverCampaignId = edition.campaignId"
        @dragleave="dragOverCampaignId === edition.campaignId && (dragOverCampaignId = null)"
        @drop.prevent="onDrop(edition.campaignId)"
      >
        <div class="campaign-col-header">
          <input
            type="number"
            min="1"
            :max="editions.length"
            class="campaign-position"
            :value="index + 1"
            @keydown.enter="movePosition(edition, $event.target.value); $event.target.blur()"
            @change="movePosition(edition, $event.target.value)"
          />
          <div
            class="campaign-drag-handle"
            draggable="true"
            @dragstart="onColumnDragStart(edition)"
            @dragend="onColumnDragEnd"
          >⠿ drag to reorder</div>
          <div class="campaign-name-row">
            <input
              v-model="nameDrafts[edition.campaignId]"
              type="text"
              class="campaign-name-input"
              placeholder="Name"
              @keydown.enter="saveName(edition)"
            />
            <button
              class="auth-btn"
              :disabled="savingName[edition.campaignId]"
              @click="saveName(edition)"
            >Save</button>
          </div>
          <div class="campaign-id-row">
            <span class="campaign-id">{{ edition.isVirtual ? 'custom folder' : '#' + edition.campaignId }}</span>
            <span v-if="edition.hidden" class="campaign-hidden-badge">hidden</span>
            <button class="campaign-hide-btn" :disabled="savingHidden[edition.campaignId]" @click="toggleHidden(edition)">
              {{ edition.hidden ? 'Show' : 'Hide' }}
            </button>
            <button
              v-if="edition.isVirtual"
              class="campaign-hide-btn campaign-delete-btn"
              :disabled="deletingFolder[edition.campaignId]"
              @click="deleteFolder(edition)"
            >Delete</button>
          </div>
          <div class="campaign-theme-row">
            <input
              v-model="themeDrafts[edition.campaignId]"
              type="text"
              class="campaign-theme-input"
              placeholder="Theme"
              @keydown.enter="saveTheme(edition)"
            />
            <button
              class="auth-btn"
              :disabled="savingTheme[edition.campaignId]"
              @click="saveTheme(edition)"
            >Save</button>
          </div>
        </div>

        <div class="campaign-col-body">
          <div
            v-for="map in mapsForColumn(edition.campaignId)"
            :key="map.mapUid"
            class="map-card"
            :class="{ dragging: draggingMapUid === map.mapUid, moved: map.realCampaignId !== edition.campaignId }"
            draggable="true"
            @dragstart="onDragStart(map)"
            @dragend="onDragEnd"
          >
            <div class="map-card-name">{{ map.name }}</div>
            <div class="map-card-author">{{ map.authorName || 'Unknown' }}</div>
            <div v-if="map.realCampaignId !== edition.campaignId" class="map-card-moved-row">
              <span class="map-card-moved">moved from #{{ map.realCampaignId }}</span>
              <button class="map-card-return" @click="returnMap(map)">↩ Return</button>
            </div>
          </div>
          <p v-if="mapsForColumn(edition.campaignId).length === 0" class="campaign-col-empty">No maps</p>
        </div>
      </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
#admin-campaigns-root {
  max-width: 100%;
}

.campaign-board {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 12px;
}

/* Thin, dark-themed scrollbars for the horizontal board and each column's
   vertical map list — the browser default is a jarring light-grey slab on
   this otherwise all-dark page. */
.campaign-board,
.campaign-col-body {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.campaign-board::-webkit-scrollbar,
.campaign-col-body::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.campaign-board::-webkit-scrollbar-track,
.campaign-col-body::-webkit-scrollbar-track {
  background: transparent;
}

.campaign-board::-webkit-scrollbar-thumb,
.campaign-col-body::-webkit-scrollbar-thumb {
  background-color: var(--color-border);
  border-radius: var(--radius-sm);
}

.campaign-board::-webkit-scrollbar-thumb:hover,
.campaign-col-body::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-dim);
}

.campaign-col {
  position: relative;
  flex: 0 0 260px;
  background-color: var(--color-overlay-1);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

.campaign-position {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  padding: 2px 4px;
  background: var(--color-overlay-4);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  color: var(--color-text-dim);
  font-size: 0.7rem;
  font-family: monospace;
  text-align: center;
  -moz-appearance: textfield;
}

.campaign-position:focus {
  outline: none;
  border-color: var(--color-text-bright);
  color: var(--color-text-bright);
}

.campaign-position::-webkit-outer-spin-button,
.campaign-position::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.campaign-col.drag-over {
  border-color: var(--color-text-bright);
}

.campaign-col.hidden {
  opacity: 0.55;
}

.campaign-col.dragging {
  opacity: 0.4;
}

.new-folder-row {
  display: flex;
  gap: 6px;
  max-width: 400px;
  margin: 0 0 16px 0;
}

.campaign-col-header {
  padding: 12px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.campaign-drag-handle {
  color: var(--color-text-dimmer);
  font-size: 0.75rem;
  margin-bottom: 8px;
  cursor: grab;
  user-select: none;
}

.campaign-drag-handle:hover {
  color: var(--color-text-dim);
}

.campaign-name-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.campaign-name-input {
  flex: 1;
  min-width: 0;
  background: var(--color-bg-elevated);
  color: var(--color-text-bright);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-size: 0.9rem;
}

.campaign-name-input:focus {
  outline: none;
  border-color: var(--color-text-bright);
}

.campaign-id-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.campaign-id {
  color: var(--color-text-dimmer);
  font-family: monospace;
  font-size: 0.75rem;
  flex: 1;
}

.campaign-hidden-badge {
  color: var(--color-danger);
  font-size: 0.7rem;
  text-transform: uppercase;
}

.campaign-hide-btn {
  background: transparent;
  color: var(--color-text-dim);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  padding: 3px 8px;
  font-size: 0.75rem;
  cursor: pointer;
}

.campaign-hide-btn:hover {
  border-color: var(--color-text-bright);
  color: var(--color-text-bright);
}

.campaign-delete-btn:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.campaign-theme-row {
  display: flex;
  gap: 6px;
}

.campaign-theme-input {
  flex: 1;
  min-width: 0;
  background: var(--color-bg-elevated);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-size: 0.85rem;
}

.campaign-theme-input:focus {
  outline: none;
  border-color: var(--color-text-bright);
}

.campaign-theme-row .auth-btn {
  padding: 6px 12px;
  font-size: 0.8rem;
}

.campaign-col-body {
  padding: 8px;
  overflow-y: auto;
  flex: 1;
}

.campaign-col-empty {
  color: var(--color-text-dim);
  font-size: 0.8rem;
  text-align: center;
  margin: 12px 0;
}

.map-card {
  background-color: var(--color-overlay-2);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  margin-bottom: 6px;
  cursor: grab;
}

.map-card.dragging {
  opacity: 0.4;
}

.map-card.moved {
  border-color: var(--color-text-bright);
}

.map-card-name {
  color: var(--color-text);
  font-size: 0.85rem;
}

.map-card-author {
  color: var(--color-text-dim);
  font-size: 0.75rem;
}

.map-card-moved-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 4px;
}

.map-card-moved {
  color: var(--color-text-dimmer);
  font-size: 0.7rem;
}

.map-card-return {
  flex-shrink: 0;
  background: transparent;
  color: var(--color-text-dim);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  font-size: 0.7rem;
  cursor: pointer;
}

.map-card-return:hover {
  border-color: var(--color-text-bright);
  color: var(--color-text-bright);
}
</style>

<!-- Ported from mapper.html + js/mapper.js. Route is /mapper/:id — replaces
     the old mapper.html?id= query param.

     This is also your own page — there is no separate profile page. Opening
     your own adds logout and, for admins, the way into the admin panel; to
     everyone else it looks like any other account page. -->
<script setup>
import { ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { api } from '../utils/api';
import { useSessionStore } from '../stores/session';
import AchievementGrid from '../components/AchievementGrid.vue';
import MapRow from '../components/MapRow.vue';

const route = useRoute();
const session = useSessionStore();

const state = ref('loading'); // 'loading' | 'not-found' | 'error' | 'ready'
const mapper = ref(null);
const myVotes = ref(new Set());
// Verified server-side separately from isOwner() below — a dead session must
// not keep showing owner controls, and the answer also says whether to
// reveal the admin entry.
const adminConfirmed = ref(false);

function isOwner(accountId) {
  return session.isLoggedIn && session.user.accountId === accountId;
}

async function confirmSession() {
  if (!session.token) return;
  try {
    const me = await api('/api/me');
    adminConfirmed.value = !!(me && me.isAdmin);
  } catch (e) {
    if (e.status === 401) {
      session.logout();
      window.location.reload();
    }
    // Anything else: leave the page as rendered.
  }
}

async function load(id) {
  state.value = 'loading';
  mapper.value = null;
  adminConfirmed.value = false;

  if (!id) {
    state.value = 'error';
    return;
  }

  try {
    const data = await api('/api/mapper?id=' + encodeURIComponent(id));
    myVotes.value = new Set(data.myVotes || []);
    mapper.value = data;
    state.value = 'ready';
    document.title = 'Ditchfest ' + (data.name || 'Account');
    if (isOwner(data.accountId)) confirmSession();
  } catch (e) {
    state.value = e.status === 404 ? 'not-found' : 'error';
  }
}

function doLogout() {
  session.logout();
  window.location.reload(); // falls back to the public view
}

function onVoted(mapUid, voted) {
  if (voted) myVotes.value.add(mapUid);
  else myVotes.value.delete(mapUid);
  myVotes.value = new Set(myVotes.value); // Set mutation isn't reactive on its own
}

watch(() => route.params.id, load, { immediate: true });
</script>

<template>
  <div id="mapper-root">
    <p v-if="state === 'loading'" class="subtitle">Loading…</p>

    <template v-else-if="state === 'not-found' || state === 'error'">
      <p class="subtitle">
        {{ state === 'not-found' ? 'No such Trackmania account.' : 'Failed to load this account. Try again later.' }}
      </p>
      <p class="subtitle">
        <RouterLink class="mapper-back" :to="{ name: 'top-mappers' }">← Back to the Mappers top</RouterLink>
      </p>
    </template>

    <template v-else-if="mapper">
      <div class="mapper-card">
        <h1 class="mapper-name">{{ mapper.name || 'Unknown player' }}</h1>

        <div class="mapper-stats">
          <div class="mapper-stat">
            <div class="mapper-stat-value">{{ mapper.rank ? '#' + mapper.rank : '—' }}</div>
            <div class="mapper-stat-label">{{ mapper.rank ? 'of ' + mapper.total + ' mappers' : 'not in the mappers top' }}</div>
          </div>
          <div class="mapper-stat">
            <div class="mapper-stat-value">{{ mapper.votes }}</div>
            <div class="mapper-stat-label">{{ mapper.votes === 1 ? 'vote' : 'votes' }}</div>
          </div>
          <div class="mapper-stat">
            <div class="mapper-stat-value">{{ mapper.maps.length }}</div>
            <div class="mapper-stat-label">{{ mapper.maps.length === 1 ? 'map' : 'maps' }}</div>
          </div>
        </div>

        <div class="mapper-id">{{ mapper.accountId }}</div>

        <div v-if="isOwner(mapper.accountId)" class="mapper-owner">
          <div class="mapper-you">This is your page.</div>
          <div class="mapper-owner-actions">
            <!-- The only entry point to onboarding — deliberately not in the nav. -->
            <RouterLink class="auth-btn" :to="{ name: 'onboarding' }">Start here</RouterLink>
            <button class="auth-btn" @click="doLogout">Logout</button>
            <RouterLink v-if="adminConfirmed" class="admin-badge" :to="{ name: 'admin' }">Admin</RouterLink>
          </div>
        </div>
      </div>

      <h2 class="mapper-section">Achievements</h2>
      <AchievementGrid :achievements="mapper.achievements" empty-text="Nothing unlocked yet." />

      <h2 class="mapper-section">Maps</h2>
      <p v-if="!mapper.maps.length" class="ach-empty">No maps in the catalog.</p>
      <div v-else class="mapper-maps">
        <MapRow
          v-for="map in mapper.maps"
          :key="map.mapUid"
          :map="map"
          :subtitle="map.editionName || ''"
          :voted="myVotes.has(map.mapUid)"
          @voted="(voted) => onVoted(map.mapUid, voted)"
        />
      </div>

      <p class="subtitle">
        <RouterLink class="mapper-back" :to="{ name: 'top-mappers' }">← Back to the Mappers top</RouterLink>
      </p>
    </template>
  </div>
</template>

<style scoped>
#mapper-root {
  max-width: 820px;
  margin: 0 auto;
}

.mapper-card {
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-overlay-2);
  box-shadow: var(--shadow-card);
  text-align: center;
}

.mapper-name {
  margin: 0;
  color: var(--color-text-bright);
  font-size: 1.8rem;
  overflow-wrap: anywhere;
}

.mapper-stats {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 32px;
  margin-top: 20px;
}

.mapper-stat-value {
  color: var(--color-text-bright);
  font-size: 1.5rem;
  font-weight: bold;
}

.mapper-stat-label {
  color: var(--color-text-dim);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.mapper-id {
  margin-top: 20px;
  color: var(--color-text-faintest);
  font-family: monospace;
  font-size: 0.75rem;
  overflow-wrap: anywhere;
}

.mapper-section {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 32px 0 0 0;
}

.mapper-maps {
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
  background-color: var(--color-overlay-1);
  margin-top: 16px;
  overflow: hidden;
}

.mapper-back {
  color: var(--color-text-dim);
  text-decoration: none;
}

.mapper-back:hover {
  color: var(--color-text-bright);
}

.ach-empty {
  color: var(--color-text-dimmer);
  font-size: 0.9rem;
  margin: 16px 0;
}

/* Shown only when you open your own account page. */
.mapper-owner {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border-soft);
}

.mapper-you {
  color: var(--color-text-dim);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 14px;
}

.mapper-owner-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

/* Admin status badge — shown only to admins, only on their own page. */
.admin-badge {
  display: inline-block;
  padding: 6px 16px;
  background: var(--color-accent);
  color: #fff;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: bold;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  text-decoration: none;
}

.admin-badge::before {
  content: "★ ";
}

.admin-badge:hover {
  background: var(--color-accent-hover);
}
</style>

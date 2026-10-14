<!-- Ported from mapper.html + js/mapper.js. Route is /mapper/:id — replaces
     the old mapper.html?id= query param.

     This is also your own page — there is no separate profile page. Opening
     your own adds logout and, for admins, the way into the admin panel; to
     everyone else it looks like any other account page. -->
<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { api } from '../utils/api';
import { useSessionStore } from '../stores/session';
import { useParallax } from '../utils/parallax';
import AchievementGrid from '../components/AchievementGrid.vue';
import MapRow from '../components/MapRow.vue';

const route = useRoute();
const session = useSessionStore();

const state = ref('loading'); // 'loading' | 'not-found' | 'error' | 'ready'
const mapper = ref(null);
const myVotes = ref(new Set());

// The header card uses the mapper's best solo map thumbnail as a parallax
// background — same idea as the latest-edition card on HomeView.
const mapperCard = ref(null);
const handleCardMove = useParallax(() => mapperCard.value);

/** Thumbnail of the mapper's best SOLO map — the card's moving background.
 *  Solo first (no co-authors): collabs pull votes from several makers'
 *  audiences at once, so without this filter the same few collabs would
 *  dominate and most cards would share one background. Falls back to the
 *  best collab when no solo map has a thumbnail, and to null — the account
 *  gradient below — when there are no maps to show at all. mapper.maps
 *  arrives already sorted (votes DESC), so the first match is the best one. */
const heroImage = computed(() => {
  const maps = mapper.value?.maps || [];
  const best =
    maps.find((m) => m.solo && m.thumbnailUrl) ||
    maps.find((m) => m.thumbnailUrl);
  return best?.thumbnailUrl || null;
});

// A map-less profile (a pure voter or player) still gets its own backdrop:
// a muted gradient keyed to the account. An FNV-1a hash of the accountId
// picks the hue pair — deterministic, so a player's card always looks like
// theirs, and no two players share one. Saturation and lightness stay low
// on purpose: a backdrop, not a statement.
const heroGradient = computed(() => {
  const id = mapper.value?.accountId || '';
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hue = Math.abs(h % 360);
  return `linear-gradient(135deg, hsl(${hue} 30% 14%), hsl(${(hue + 40) % 360} 24% 8%))`;
});

// In-game records count only the maps the sweep has checked; while the
// backfill is catching up the numbers understate. Same dim hint as the
// Players tab, null once every map is checked.
const recordsSyncNote = computed(() => {
  const t = mapper.value?.records?.tracks;
  if (!t || t.checked >= t.total) return null;
  return `Syncing: ${t.checked} of ${t.total} maps checked so far.`;
});

// Linked accounts' nicknames, comma-joined — null when there are none, so the
// template can skip the whole "(...)" span. alts comes from the API already
// empty for an unlinked account.
const altNames = computed(() => {
  const alts = mapper.value?.alts;
  if (!alts || !alts.length) return null;
  return alts.map((a) => a.displayName || a.accountId).join(', ');
});

function isOwner(accountId) {
  return session.isLoggedIn && session.user.accountId === accountId;
}

// Verified server-side separately from isOwner() above — a dead session
// must not keep showing owner controls (logout button, onboarding link).
async function confirmSession() {
  if (!session.token) return;
  try {
    await api('/api/me');
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
        <RouterLink class="back-link" :to="{ name: 'top-mappers' }">← Back to the Mappers top</RouterLink>
      </p>
    </template>

    <template v-else-if="mapper">
      <div
        ref="mapperCard"
        class="mapper-card"
        :class="{ 'has-hero': heroImage }"
        :style="heroImage ? undefined : { backgroundImage: heroGradient }"
        @mousemove="handleCardMove"
      >
        <div
          v-if="heroImage"
          class="parallax-hero mapper-hero"
          :style="{ backgroundImage: `url(${heroImage})` }"
          aria-hidden="true"
        ></div>
        <div class="mapper-card-content">
        <h1 class="mapper-name">
          {{ mapper.name || 'Unknown player' }}
          <span v-if="altNames" class="mapper-alts">({{ altNames }})</span>
        </h1>

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

        <!-- In-game records straight from the Players board — same identity,
             same numbers. The API omits it for people without a single
             finish (and while records aren't live on this server), so the
             block never shows zeros-by-absence. No caption: the stats rows
             share one style and the gap separates them, like the Maps row. -->
        <div v-if="mapper.records" class="mapper-records">
          <div class="mapper-stats">
            <div class="mapper-stat">
              <div class="mapper-stat-value">#{{ mapper.records.rank }}</div>
              <div class="mapper-stat-label">of {{ mapper.records.total }} players</div>
            </div>
            <div class="mapper-stat">
              <div class="mapper-stat-value">{{ mapper.records.wr }}</div>
              <div class="mapper-stat-label">{{ mapper.records.wr === 1 ? 'world record' : 'world records' }}</div>
            </div>
            <div class="mapper-stat">
              <div class="mapper-stat-value">{{ mapper.records.author }}</div>
              <div class="mapper-stat-label">{{ mapper.records.author === 1 ? 'author medal' : 'author medals' }}</div>
            </div>
            <div class="mapper-stat">
              <div class="mapper-stat-value">{{ mapper.records.finishes }}</div>
              <div class="mapper-stat-label">{{ mapper.records.finishes === 1 ? 'finish' : 'finishes' }}</div>
            </div>
          </div>
          <div v-if="recordsSyncNote" class="mapper-records-note">{{ recordsSyncNote }}</div>
        </div>

        <div class="mapper-id">{{ mapper.accountId }}</div>

        <div v-if="isOwner(mapper.accountId)" class="mapper-owner">
          <div class="mapper-you">This is your page.</div>
          <div class="mapper-owner-actions">
            <!-- The only entry point to onboarding — deliberately not in the nav. -->
            <RouterLink class="auth-btn" :to="{ name: 'onboarding' }">Start here</RouterLink>
            <button class="auth-btn" @click="doLogout">Logout</button>
          </div>
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
        <RouterLink class="back-link" :to="{ name: 'top-mappers' }">← Back to the Mappers top</RouterLink>
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
  position: relative;
  overflow: hidden;
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-overlay-2);
  box-shadow: var(--shadow-card);
  text-align: center;
}

/* The best solo map's thumbnail becomes a slowly drifting background, same as
 * the latest-edition card on HomeView. Drift mechanics are .parallax-hero
 * (base.css); this layer only adds the darkening treatment. */
.mapper-hero {
  filter: brightness(0.18) saturate(0.85);
}

/* With a hero image, lean on it for the card background; without one, the
 * account-keyed gradient takes over (bound inline — it's derived from the
 * accountId, which CSS can't see), so this class only handles the image. */
.mapper-card.has-hero {
  background-color: var(--color-bg-elevated);
}

.mapper-card-content {
  position: relative;
  z-index: 1;
}

.mapper-name {
  margin: 0;
  color: var(--color-text-bright);
  font-size: 1.8rem;
  overflow-wrap: anywhere;
}

.mapper-alts {
  color: var(--color-text-dim);
  font-size: 1rem;
  font-weight: normal;
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

/* In-game records: a second stats row under the mapping one — no caption,
   the same badge style with a wider gap does the separating. */
.mapper-records {
  margin-top: 32px;
}

.mapper-records-note {
  margin-top: 12px;
  color: var(--color-text-faint);
  font-size: 0.8rem;
}

.mapper-id {
  margin-top: 20px;
  color: var(--color-text-faintest);
  font-family: var(--font-family-mono);
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
</style>

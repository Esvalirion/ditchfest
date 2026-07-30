<!-- Ported from onboarding.html + js/onboarding.js. Guided first-time voting,
     one Ditchfest edition per screen instead of the wall of groups on
     VotingView. Nothing lives only in the browser: likes go to /api/vote
     immediately and each finished edition is marked with
     /api/onboarding/step, so closing the tab mid-run loses nothing — the
     page resumes on the first unfinished edition. Walking through all of
     them unlocks an achievement. -->
<script setup>
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../utils/api';
import { useSessionStore } from '../stores/session';
import AchievementCard from '../components/AchievementCard.vue';

const session = useSessionStore();

const screen = ref('loading'); // 'signin' | 'loading' | 'error' | 'empty' | 'step' | 'finish'
const signInNote = ref(null);

const editions = ref([]); // oldest first, only ones that have maps
const done = ref(new Set()); // campaignIds already walked through
const myVotes = ref(new Set()); // mapUids this player has liked
const index = ref(0); // edition currently on screen
const stepping = ref(false);
const unlockedAchievements = ref(null);

const currentEdition = computed(() => editions.value[index.value]);
const progressPct = computed(() =>
  editions.value.length ? Math.round((done.value.size / editions.value.length) * 100) : 0
);

function firstUnfinished() {
  for (let i = 0; i < editions.value.length; i++) {
    if (!done.value.has(editions.value[i].campaignId)) return i;
  }
  return -1;
}

function scrollUp() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function sessionExpired() {
  session.logout();
  screen.value = 'signin';
  signInNote.value = 'Your session expired. Sign in again to continue.';
}

async function load() {
  if (!session.isLoggedIn) {
    screen.value = 'signin';
    signInNote.value = null;
    return;
  }

  screen.value = 'loading';

  let data;
  try {
    data = await api('/api/onboarding');
  } catch (e) {
    if (e.status === 401) {
      sessionExpired();
      return;
    }
    screen.value = 'error';
    return;
  }

  editions.value = data.editions || [];
  done.value = new Set(data.done || []);
  myVotes.value = new Set(data.myVotes || []);

  if (!editions.value.length) {
    screen.value = 'empty';
    return;
  }
  if (data.completed) {
    unlockedAchievements.value = null;
    screen.value = 'finish';
    return;
  }

  const pending = firstUnfinished();
  index.value = pending === -1 ? 0 : pending;
  screen.value = 'step';
}

async function toggleMap(map) {
  const value = !myVotes.value.has(map.mapUid);
  // Flip straight away — the click should feel instant; the server response
  // only confirms it.
  if (value) myVotes.value.add(map.mapUid);
  else myVotes.value.delete(map.mapUid);
  myVotes.value = new Set(myVotes.value);
  map._pending = true;

  try {
    const data = await api('/api/vote', { body: { mapUid: map.mapUid, value } });
    if (data.voted) myVotes.value.add(map.mapUid);
    else myVotes.value.delete(map.mapUid);
    myVotes.value = new Set(myVotes.value);
  } catch (e) {
    if (e.status === 401) {
      sessionExpired();
      return;
    }
    // Network died — undo the optimistic flip.
    if (value) myVotes.value.delete(map.mapUid);
    else myVotes.value.add(map.mapUid);
    myVotes.value = new Set(myVotes.value);
  } finally {
    map._pending = false;
  }
}

/** Next screen: the following edition, or the first one still unfinished
 *  (they may have jumped Back and forth). */
function advance() {
  if (index.value + 1 < editions.value.length) {
    index.value++;
  } else {
    const pending = firstUnfinished();
    if (pending === -1) {
      unlockedAchievements.value = null;
      screen.value = 'finish';
      scrollUp();
      return;
    }
    index.value = pending;
  }
  scrollUp();
}

/** Mark the current edition done server-side, then move on. */
async function goNext() {
  const edition = currentEdition.value;
  stepping.value = true;
  try {
    const data = await api('/api/onboarding/step', { body: { campaignId: edition.campaignId } });
    done.value = new Set(data.done || []);
    stepping.value = false;
    if (data.completed) {
      unlockedAchievements.value = data.newAchievements;
      screen.value = 'finish';
      scrollUp();
      return;
    }
    advance();
  } catch (e) {
    stepping.value = false;
    if (e.status === 401) {
      sessionExpired();
      return;
    }
    // Mark it locally anyway so a flaky network doesn't trap them on one
    // screen; the next successful step re-syncs the real list.
    const newDone = new Set(done.value);
    newDone.add(edition.campaignId);
    done.value = newDone;
    advance();
  }
}

function goBack() {
  if (index.value > 0) {
    index.value--;
    scrollUp();
  }
}

load();
</script>

<template>
  <div id="onboarding-root">
    <p v-if="screen === 'loading'" class="subtitle">Loading…</p>
    <p v-else-if="screen === 'error'" class="subtitle">Failed to load the maps. Try again later.</p>
    <p v-else-if="screen === 'empty'" class="subtitle">The map catalog is syncing. Please check back soon.</p>

    <div v-else-if="screen === 'signin'" class="ob-card-panel">
      <h1 class="ob-title">Vote like a local</h1>
      <p class="ob-lead">
        Ditchfest voting used to live in Discord. Now it lives here: we walk you
        through the editions one at a time, you tap the maps you like, and you
        can stop whenever you want.
      </p>
      <p v-if="signInNote" class="ob-note">{{ signInNote }}</p>
      <button class="auth-btn" @click="session.login()">Login with Ubisoft</button>
    </div>

    <template v-else-if="screen === 'step' && currentEdition">
      <!-- Progress reflects editions actually finished, not the screen you
           are on — going Back doesn't rewind the bar. -->
      <div class="ob-head">
        <div class="ob-step">Edition {{ index + 1 }} of {{ editions.length }}</div>
        <div class="ob-bar"><div class="ob-bar-fill" :style="{ width: progressPct + '%' }"></div></div>
        <div class="ob-step">{{ done.size }} / {{ editions.length }} done</div>
      </div>

      <h1 class="ob-title">{{ currentEdition.name }}</h1>
      <p v-if="currentEdition.theme" class="ob-theme">{{ currentEdition.theme }}</p>
      <p class="ob-lead">Click every map you like. Liking nothing here is a valid answer — just hit Next.</p>

      <div class="ob-grid">
        <button
          v-for="map in currentEdition.maps"
          :key="map.mapUid"
          type="button"
          class="ob-map"
          :class="{ liked: myVotes.has(map.mapUid) }"
          :disabled="map._pending"
          @click="toggleMap(map)"
        >
          <img
            v-if="map.thumbnailUrl"
            class="ob-thumb"
            :src="map.thumbnailUrl"
            alt=""
            loading="lazy"
            @error="$event.target.style.display = 'none'"
          />
          <div class="ob-map-info">
            <a
              class="ob-map-name"
              :href="`https://trackmania.io/#/leaderboard/${encodeURIComponent(map.mapUid)}`"
              target="_blank"
              rel="noopener"
              @click.stop
            >{{ map.name }}</a>
            <div class="ob-map-author">{{ map.authorName ? 'by ' + map.authorName : '' }}</div>
          </div>
          <div class="ob-mark">{{ myVotes.has(map.mapUid) ? '✓' : '+' }}</div>
        </button>
      </div>

      <div class="ob-controls">
        <button class="auth-btn" :disabled="index === 0" @click="goBack">← Back</button>
        <RouterLink class="ob-later" :to="{ name: 'signs' }" title="Your progress is already saved">
          Finish later
        </RouterLink>
        <button class="auth-btn ob-next" :disabled="stepping" @click="goNext">
          {{ index === editions.length - 1 ? 'Finish' : 'Next →' }}
        </button>
      </div>
    </template>

    <div v-else-if="screen === 'finish'" class="ob-card-panel">
      <h1 class="ob-title">That is every edition. Respect.</h1>
      <p class="ob-lead">
        Your votes are counted in the Mappers top. Come back when a new
        Ditchfest drops — it will show up here as one more step.
      </p>

      <template v-if="unlockedAchievements && unlockedAchievements.length">
        <div class="ob-unlocked">Achievement unlocked</div>
        <AchievementCard v-for="a in unlockedAchievements" :key="a.code" :achievement="a" />
      </template>

      <div class="ob-controls">
        <RouterLink class="auth-btn" :to="{ name: 'top-mappers' }">See the Mappers top</RouterLink>
        <RouterLink
          v-if="session.isLoggedIn"
          class="auth-btn"
          :to="{ name: 'mapper', params: { id: session.user.accountId } }"
        >My achievements</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
#onboarding-root {
  max-width: 900px;
  margin: 0 auto;
}

.ob-card-panel {
  max-width: 560px;
  margin: 40px auto;
  padding: 30px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-overlay-2);
  box-shadow: var(--shadow-card);
  text-align: center;
}

.ob-title {
  color: var(--color-text-bright);
  font-size: 1.6rem;
  margin: 0 0 10px 0;
}

.ob-theme {
  color: var(--color-text-dim);
  font-size: 0.95rem;
  margin: -6px 0 10px 0;
}

.ob-lead {
  color: var(--color-text-muted);
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0 0 20px 0;
}

.ob-note {
  color: var(--color-danger);
  font-size: 0.85rem;
}

.ob-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}

.ob-step {
  color: var(--color-text-dim);
  font-size: 0.8rem;
  white-space: nowrap;
}

.ob-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background-color: var(--color-border-subtle);
  overflow: hidden;
}

.ob-bar-fill {
  height: 100%;
  background-color: var(--color-accent);
  transition: width 0.3s ease;
}

.ob-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin: 20px 0 28px 0;
}

/* Each map is a button so it is keyboard-reachable; clicking anywhere on the
   card is the like toggle. */
.ob-map {
  display: flex;
  flex-direction: column;
  padding: 0;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
  background-color: var(--color-overlay-1);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  position: relative;
  transition: border-color 0.15s, background-color 0.15s;
}

.ob-map:hover {
  border-color: var(--color-border);
  background-color: var(--color-overlay-4);
}

.ob-map.liked {
  border-color: var(--color-accent);
  background-color: rgba(46, 125, 50, 0.15);
}

.ob-map:disabled {
  opacity: 0.6;
  cursor: default;
}

.ob-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background-color: var(--color-bg-elevated);
  display: block;
}

.ob-map-info {
  padding: 10px 12px;
  min-width: 0;
}

.ob-map-name {
  color: inherit;
  text-decoration: none;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.ob-map-name:hover {
  text-decoration: underline;
}

.ob-map-author {
  color: var(--color-text-dim);
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-mark {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.65);
  border: 1px solid var(--color-border);
  color: var(--color-text-bright);
  font-size: 0.95rem;
}

.ob-map.liked .ob-mark {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
}

.ob-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 24px 0 40px 0;
}

.ob-controls .ob-next {
  border-color: var(--color-accent);
  background-color: var(--color-accent);
}

.ob-controls .ob-next:hover {
  border-color: var(--color-text-bright);
}

.ob-controls .auth-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.ob-controls .auth-btn:disabled:hover {
  border-color: var(--color-border);
}

.ob-later {
  color: var(--color-text-dim);
  font-size: 0.85rem;
  text-decoration: none;
}

.ob-later:hover {
  color: var(--color-text-bright);
}

.ob-unlocked {
  margin-top: 8px;
  color: var(--color-accent-text);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.ob-card-panel :deep(.ach-item) {
  margin-top: 10px;
  text-align: left;
}
</style>

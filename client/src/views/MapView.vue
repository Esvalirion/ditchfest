<!-- One map: thumbnail/author/edition, external links (trackmania.io leaderboard,
     Trackmania Exchange when the map is listed there), the top 5 times from
     trackmania.io, and the Ditchfest rating (vote count + your own toggle).
     Route is /map/:mapUid — this is where MapRow's map name links now,
     instead of redirecting straight to trackmania.io. -->
<script setup>
import { ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { api } from '../utils/api';
import { useSessionStore } from '../stores/session';
import { showVoters, hideVoters, invalidateVoters } from '../utils/votersPopover';
import StyleTags from '../components/StyleTags.vue';

const route = useRoute();
const session = useSessionStore();

const state = ref('loading'); // 'loading' | 'not-found' | 'error' | 'ready'
const map = ref(null);
const votePending = ref(false);

// The map card uses the thumbnail as a drifting parallax background, same idea
// as the latest-edition panel on the home page. mapCard anchors the cursor math.
const mapCard = ref(null);

/** Parallax over the map card: the cursor position within the card nudges the
 *  background a few px. Scoped to this element; no-ops on touch devices (no
 *  mousemove fires there, the bg just stays static — consistent with home). */
function handleCardMove(e) {
  const el = mapCard.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width - 0.5) * 4; // up to 2px each way
  const y = ((e.clientY - rect.top) / rect.height - 0.5) * 4;
  el.style.setProperty('--hero-x', `${x}px`);
  el.style.setProperty('--hero-y', `${y}px`);
}

// Admin co-author editor state. coauthorDraft is a newline-separated list of
// accountIds; seeded from map.coauthors on every load so the admin always
// edits the current set. saveCoauthors replaces the whole set server-side.
const coauthorDraft = ref('');
const savingCoauthors = ref(false);
const coauthorMsg = ref('');
const coauthorErr = ref(false);

function formatTime(ms) {
  if (ms == null) return '—';
  const total = Math.round(ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

async function load(mapUid) {
  state.value = 'loading';
  map.value = null;

  if (!mapUid) {
    state.value = 'error';
    return;
  }

  try {
    const data = await api('/api/map/' + encodeURIComponent(mapUid));
    map.value = data;
    state.value = 'ready';
    document.title = 'Ditchfest ' + (data.name || 'Map');
    // Seed the co-author editor from the current set (empty when none / when
    // the server hasn't applied migration 008 yet).
    coauthorDraft.value = (data.coauthors || []).map((c) => c.accountId).join('\n');
    coauthorMsg.value = '';
    coauthorErr.value = false;
  } catch (e) {
    state.value = e.status === 404 ? 'not-found' : 'error';
  }
}

async function saveCoauthors() {
  if (!map.value) return;
  // Split on any whitespace, dedup, drop empties — the server does the same,
  // but doing it here keeps the UI honest about what it's about to send.
  const accountIds = [
    ...new Set(
      coauthorDraft.value
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
  savingCoauthors.value = true;
  coauthorErr.value = false;
  coauthorMsg.value = 'Saving…';
  try {
    await api('/api/map/' + encodeURIComponent(map.value.mapUid) + '/coauthors', {
      body: { accountIds },
    });
    coauthorMsg.value = 'Saved.';
    await load(map.value.mapUid);
  } catch (e) {
    coauthorErr.value = true;
    if (e.status === 503) {
      coauthorMsg.value = "This feature isn't enabled on the server yet.";
    } else if (e.status === 401) {
      session.sessionExpired();
      coauthorMsg.value = 'Session expired.';
    } else {
      coauthorMsg.value = 'Failed to save co-authors.';
    }
  } finally {
    savingCoauthors.value = false;
  }
}

async function toggleVote() {
  if (!session.isLoggedIn) {
    session.login();
    return;
  }
  const value = !map.value.voted;
  votePending.value = true;
  try {
    const data = await api('/api/vote', { body: { mapUid: map.value.mapUid, value } });
    map.value.votes = data.votes;
    map.value.voted = data.voted;
    invalidateVoters(map.value.mapUid);
  } catch (e) {
    if (e.status === 401) session.sessionExpired();
  } finally {
    votePending.value = false;
  }
}

watch(() => route.params.mapUid, load, { immediate: true });
</script>

<template>
  <div id="map-root">
    <p v-if="state === 'loading'" class="subtitle">Loading…</p>

    <template v-else-if="state === 'not-found' || state === 'error'">
      <p class="subtitle">
        {{ state === 'not-found' ? 'No such map.' : 'Failed to load this map. Try again later.' }}
      </p>
      <p class="subtitle">
        <RouterLink class="map-back" :to="{ name: 'maps' }">← Back to Maps</RouterLink>
      </p>
    </template>

    <template v-else-if="map">
      <div
        class="map-card"
        ref="mapCard"
        :class="{ 'has-hero': map.thumbnailUrl }"
        @mousemove="handleCardMove"
      >
        <div
          v-if="map.thumbnailUrl"
          class="map-card-hero"
          :style="{ backgroundImage: `url(${map.thumbnailUrl})` }"
          aria-hidden="true"
        ></div>
        <div v-if="map.thumbnailUrl" class="map-card-scrim" aria-hidden="true"></div>
        <div class="map-card-body">
        <div class="map-card-headline">
        <h1 class="map-card-name">{{ map.name }}</h1>
        <div class="map-card-meta">
          <RouterLink v-if="map.authorAccountId" :to="{ name: 'mapper', params: { id: map.authorAccountId } }">
            {{ map.authorName || 'Unknown mapper' }}
          </RouterLink>
          <span v-else>{{ map.authorName || 'Unknown mapper' }}</span>
          <template v-for="(co, i) in map.coauthors" :key="co.accountId">
            <span class="map-card-coauthors-sep">{{ i === 0 ? ' & ' : ', ' }}</span>
            <RouterLink :to="{ name: 'mapper', params: { id: co.accountId } }">
              {{ co.name || co.accountId }}
            </RouterLink>
          </template>
          <span class="map-card-dot">·</span>
          <span>{{ map.editionName }}</span>
        </div>
        <StyleTags
          v-if="map.style || map.tags?.length || map.onTmx === false"
          class="map-card-tags"
          :style="map.style"
          :tags="map.tags"
          :on-tmx="map.onTmx"
        />
        </div>

        <div class="map-card-foot">
        <div class="map-links">
          <a class="map-link-btn" :href="map.tmioUrl" target="_blank" rel="noopener">Trackmania.io</a>
          <a v-if="map.tmxUrl" class="map-link-btn" :href="map.tmxUrl" target="_blank" rel="noopener">Trackmania Exchange</a>
          <!-- Confirmed absence → link to the community list where the map can
               be picked up for upload; a plain non-link pill stays for the
               "TMX unreachable" case (tmxUrl null while onTmx is not false). -->
          <RouterLink
            v-else-if="map.onTmx === false"
            class="map-link-btn map-link-btn-disabled map-link-btn-link"
            :to="{ name: 'missing-tmx' }"
            title="See all maps missing from TMX"
          >Not on TMX</RouterLink>
          <span v-else class="map-link-btn map-link-btn-disabled">Not on TMX</span>
        </div>

        <div v-if="session.isAdmin" class="coauthors-admin">
          <label class="coauthors-admin-label">Co-authors (accountIds, one per line)</label>
          <textarea
            v-model="coauthorDraft"
            class="coauthors-admin-input"
            rows="3"
            placeholder="one accountId per line&#10;(leave empty to clear)"
            :disabled="savingCoauthors"
          />
          <button class="coauthors-admin-btn" :disabled="savingCoauthors" @click="saveCoauthors">
            {{ savingCoauthors ? 'Saving…' : 'Save co-authors' }}
          </button>
          <div v-if="coauthorMsg" class="coauthors-admin-msg" :class="{ 'coauthors-admin-err': coauthorErr }">
            {{ coauthorMsg }}
          </div>
        </div>
        </div>
        </div>
      </div>

      <h2 class="map-section">Ditchfest rating</h2>
      <div class="map-rating">
        <button
          class="vote-btn"
          :class="{ voted: map.voted }"
          :disabled="votePending"
          @click="toggleVote"
          @mouseenter="showVoters($event.currentTarget, map.mapUid, map.votes)"
          @mouseleave="hideVoters"
        >{{ map.voted ? '✓' : '+' }} {{ map.votes }}</button>
        <span class="map-rating-label">{{ map.votes === 1 ? 'vote' : 'votes' }}</span>
      </div>

      <h2 class="map-section">Top 5 times</h2>
      <p v-if="!map.leaderboard.length" class="ach-empty">No leaderboard data available.</p>
      <table v-else class="map-leaderboard">
        <tbody>
          <tr v-for="row in map.leaderboard" :key="row.position">
            <td class="lb-position">#{{ row.position }}</td>
            <td class="lb-name">{{ row.name || 'Unknown' }}</td>
            <td class="lb-time">{{ formatTime(row.time) }}</td>
          </tr>
        </tbody>
      </table>

      <p class="subtitle">
        <RouterLink class="map-back" :to="{ name: 'maps' }">← Back to Maps</RouterLink>
      </p>
    </template>
  </div>
</template>

<style scoped>
#map-root {
  max-width: 820px;
  margin: 0 auto;
}

.map-card {
  position: relative;
  overflow: hidden;
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-overlay-2);
  box-shadow: var(--shadow-card);
  text-align: center;
}

/* With a hero image, lean on it for the card background (same as the home
 * page's latest panel) and give it banner height so the thumbnail has room
 * to breathe instead of hugging the text. Without one, the overlay background
 * above shows and the card stays content-sized.
 *
 * min-height must exceed the body's natural height to actually open up the
 * banner — otherwise the content already fills the card and the value is a
 * no-op. 440px comfortably clears the headline + tags + links block. The
 * admin co-author form adds more, but it sits below and just grows the card
 * past the min — which is fine, the banner simply gets taller. */
.map-card.has-hero {
  min-height: 680px;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-elevated);
}

/* The thumbnail becomes a slowly drifting background. Slightly oversized
 * (inset: -6%) so the few-px parallax shift never reveals an empty edge.
 * --hero-x/--hero-y are set by handleCardMove (mousemove). No brightness
 * filter here: the scrim gradient below does the darkening toward the
 * bottom, where the text lives. */
.map-card-hero {
  position: absolute;
  inset: -6%;
  background-size: cover;
  background-position: center;
  transform: translate(var(--hero-x, 0px), var(--hero-y, 0px));
  transition: transform 0.2s ease-out;
  z-index: 0;
  pointer-events: none;
}

/* Gradient scrim: darkened at BOTH ends (top and bottom) where the text
 * lives, lighter in the middle so the thumbnail still reads. The bottom stays
 * fully opaque so the name/meta/links/admin form sit on a solid field;
 * the top is strongly tinted too so the card's top edge reads as a card.
 * On top of this, the body itself carries a translucent plaque (see
 * .map-card-body-plaque) as a second guarantee against bright photo patches. */
.map-card-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(17, 17, 17, 0.7) 0%,
    rgba(17, 17, 17, 0.35) 35%,
    rgba(17, 17, 17, 0.55) 70%,
    var(--color-bg-elevated) 100%
  );
  z-index: 0;
  pointer-events: none;
}

.map-card-body {
  position: relative;
  z-index: 1;
}

/* With a hero image the card is a flex column (see .has-hero): make the body a
 * flex column too so the headline (name/authors/tags) sticks to the top and
 * the foot (links + admin form) sticks to the bottom. Without a hero this is a
 * no-op, the body flows normally. */
.map-card.has-hero .map-card-body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
}

/* Foot (links + admin co-author form) pushed to the bottom of the banner. */
.map-card.has-hero .map-card-foot {
  margin-top: auto;
}

.map-card-name {
  margin: 16px 0 0 0;
  color: var(--color-text-bright);
  font-size: 1.6rem;
  overflow-wrap: anywhere;
}

.map-card-meta {
  margin-top: 8px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.map-card-meta a {
  color: var(--color-text-muted);
}

.map-card-meta a:hover {
  color: var(--color-text-bright);
}

/* Translucent plaque behind the name + meta + tags: a second guarantee that
 * the text stays legible on bright patches of the hero photo (the gradient
 * scrim is the first). align-self: center keeps the plaque centered within the
 * flex column instead of stretching full-width. Only with a hero. */
.map-card.has-hero .map-card-headline {
  align-self: center;
  max-width: 90%;
  padding: 12px 18px;
  border-radius: var(--radius-md);
  background: rgba(17, 17, 17, 0.45);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.map-card.has-hero .map-card-name {
  margin-top: 0;
}

.map-card-dot {
  margin: 0 6px;
}

.map-card-tags {
  margin-top: 12px;
  justify-content: center;
}

.map-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}

.map-link-btn {
  display: inline-block;
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text-bright);
  font-size: 0.9rem;
  text-decoration: none;
  transition: border 0.15s, background 0.15s;
}

.map-link-btn:hover {
  border: 1px solid var(--color-text-bright);
  background: var(--color-bg);
}

.map-link-btn-disabled {
  color: var(--color-text-faintest);
  cursor: default;
}

.map-link-btn-disabled:hover {
  border: 1px solid var(--color-border);
  background: none;
}

/* Confirmed-absent variant: still visually quiet, but a real link to
   /missing-tmx. Later in the file than the -disabled:hover rule above so
   the same-specificity hover wins. */
.map-link-btn-link {
  cursor: pointer;
}

.map-link-btn-link:hover {
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  background: none;
}

.map-section {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 32px 0 0 0;
}

.map-rating {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.map-rating-label {
  color: var(--color-text-dim);
  font-size: 0.9rem;
}

.vote-btn {
  background: var(--color-bg);
  color: var(--color-text-bright);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 16px;
  font-size: 1rem;
  cursor: pointer;
  transition: border 0.15s, background 0.15s;
}

.vote-btn:hover {
  border: 1px solid var(--color-text-bright);
}

.vote-btn.voted {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.vote-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.map-leaderboard {
  width: 100%;
  margin-top: 16px;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
  background-color: var(--color-overlay-1);
  border-collapse: collapse;
  overflow: hidden;
}

.map-leaderboard td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border-hairline);
}

.map-leaderboard tr:last-child td {
  border-bottom: none;
}

.lb-position {
  color: var(--color-text-dim);
  width: 48px;
}

.lb-name {
  color: var(--color-text-bright);
}

.lb-time {
  color: var(--color-text-dim);
  text-align: right;
  font-family: monospace;
}

.ach-empty {
  color: var(--color-text-dimmer);
  font-size: 0.9rem;
  margin: 16px 0;
}

.map-back {
  color: var(--color-text-dim);
  text-decoration: none;
}

.map-back:hover {
  color: var(--color-text-bright);
}

.map-card-coauthors-sep {
  margin-left: 4px;
  color: var(--color-text-faintest);
}

/* Admin co-author editor — inline block inside the map card, shown only for
   admins. Styled to match the rest of the card, not the separate admin pages. */
.coauthors-admin {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-hairline);
  text-align: left;
}

.coauthors-admin-label {
  display: block;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.coauthors-admin-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  background: var(--color-bg);
  color: var(--color-text-bright);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: monospace;
  font-size: 0.85rem;
  resize: vertical;
}

.coauthors-admin-input:focus {
  outline: none;
  border-color: var(--color-text-bright);
}

.coauthors-admin-btn {
  margin-top: 10px;
  padding: 6px 14px;
  background: var(--color-bg);
  color: var(--color-text-bright);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  cursor: pointer;
  transition: border 0.15s, background 0.15s;
}

.coauthors-admin-btn:hover:not(:disabled) {
  border-color: var(--color-text-bright);
}

.coauthors-admin-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.coauthors-admin-msg {
  margin-top: 8px;
  color: var(--color-text-dim);
  font-size: 0.85rem;
}

.coauthors-admin-err {
  color: var(--color-accent);
}
</style>

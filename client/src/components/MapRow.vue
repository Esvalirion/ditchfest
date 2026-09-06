<!-- Thumbnail + name + vote button. Identical between mapper.html and
     voting.html in the original (js/mapper.js mapRow() / js/voting.js
     mapRow()) — one shared component instead of two copies. The caller owns
     `voted` (its own myVotes Set) and gets an update via @voted; this
     component only knows about a single row. -->
<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { api } from '../utils/api';
import { fetchTmxId } from '../utils/tmxId';
import { showMapPreview, moveMapPreview, hideMapPreview } from '../utils/mapPreview';
import { showVoters, hideVoters, invalidateVoters } from '../utils/votersPopover';
import StyleTags from './StyleTags.vue';

const props = defineProps({
  map: { type: Object, required: true },
  subtitle: { type: String, default: '' },
  voted: { type: Boolean, required: true },
  // Non-voting listings (Missing on TMX) hide the toggle entirely.
  votable: { type: Boolean, default: true },
  // 'hover' reveals the action cluster on hover (desktop default);
  // 'always' keeps it visible — for pages where those actions ARE the point.
  actionsVisibility: { type: String, default: 'hover' },
});
const emit = defineEmits(['voted']);

const session = useSessionStore();

// The TMX id for the "copy id" action — unknown (undefined) until the row is
// first hovered, then a number, or null when the map isn't on TMX (fetch
// failures read the same way: no button, which is the safe degradation).
const tmxId = ref(undefined);
const copied = ref(false);
let copiedTimer = null;

function onRowEnter() {
  if (tmxId.value === undefined) fetchTmxId(props.map.mapUid).then((id) => (tmxId.value = id));
}

async function copyTmxId() {
  const text = String(tmxId.value);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // http fallback (dev / non-TLS mirror): the hidden-textarea classic.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = false), 1500);
  } catch (e) {
    // Clipboard denied — leave the button as it was, nothing to fall back to.
  }
}

async function toggleVote() {
  if (!session.isLoggedIn) {
    session.login();
    return;
  }
  const value = !props.voted;
  props.map._pending = true;
  try {
    const data = await api('/api/vote', { body: { mapUid: props.map.mapUid, value } });
    props.map.votes = data.votes;
    // The vote count just changed — next hover should show the fresh list.
    invalidateVoters(props.map.mapUid);
    emit('voted', data.voted);
  } catch (e) {
    if (e.status === 401) session.sessionExpired();
    // Network error — leave the button as it was.
  } finally {
    props.map._pending = false;
  }
}

function onThumbError(e) {
  e.target.style.display = 'none';
  hideMapPreview();
}
</script>

<template>
  <div class="map-row" @mouseenter="onRowEnter">
    <img
      v-if="map.thumbnailUrl"
      class="map-thumb"
      :src="map.thumbnailUrl"
      alt=""
      loading="lazy"
      @mouseenter="showMapPreview(map.thumbnailUrl, $event)"
      @mousemove="moveMapPreview"
      @mouseleave="hideMapPreview"
      @error="onThumbError"
    />
    <div class="map-info">
      <RouterLink class="map-name" :to="{ name: 'map', params: { mapUid: map.mapUid } }">{{ map.name }}</RouterLink>
      <div class="map-author">{{ subtitle }}</div>
      <StyleTags :style="map.style" :tags="map.tags" :on-tmx="map.onTmx" />
    </div>
    <div class="row-actions" :class="{ always: actionsVisibility === 'always' }">
      <!-- Default cluster: download link + copy TMX id. Pages with their own
           action set (Missing on TMX passes recheck + download) replace it
           wholesale via the actions slot. -->
      <slot name="actions">
        <a
          class="icon-btn"
          :href="`https://trackmania.io/#/leaderboard/${encodeURIComponent(map.mapUid)}`"
          target="_blank"
          rel="noopener"
          title="Download on trackmania.io"
          aria-label="Download on trackmania.io"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" />
          </svg>
        </a>
        <button
          v-if="tmxId != null"
          class="icon-btn"
          :class="{ ok: copied }"
          :title="copied ? 'Copied!' : `Copy TMX id (${tmxId})`"
          :aria-label="copied ? 'TMX id copied' : 'Copy TMX id'"
          @click="copyTmxId"
        >
          <svg v-if="!copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m4 12.5 5 5L20 6.5" />
          </svg>
        </button>
      </slot>
    </div>
    <button
      v-if="votable"
      class="vote-btn vote-btn-sm"
      :class="{ voted }"
      :disabled="map._pending"
      @click="toggleVote"
      @mouseenter="showVoters($event.currentTarget, map.mapUid, map.votes)"
      @mouseleave="hideVoters"
    >{{ voted ? '✓' : '+' }} {{ map.votes }}</button>
  </div>
</template>

<style scoped>
/* .map-thumb / .map-name / .map-author / .icon-btn / .vote-btn live in
   base.css — shared with the other card-row listings and detail pages. */

.map-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border-hairline);
}

.map-row:last-child {
  border-bottom: none;
}

@media (hover: hover) {
  .map-thumb {
    cursor: zoom-in;
  }
}

.map-info {
  flex: 1;
  min-width: 0;
}

/* Hover actions (the slot's default: download + copy TMX id). Hidden until
   the row is hovered on pointer devices, always visible on touch (there is no
   hover to reveal them), via keyboard (:focus-within), and whenever the
   caller passes actions-visibility="always". */
.row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

@media (hover: hover) {
  .map-row:hover .row-actions,
  .map-row:focus-within .row-actions {
    opacity: 1;
  }
}

@media (hover: none) {
  .row-actions {
    opacity: 1;
  }
}

.row-actions.always {
  opacity: 1;
}

.vote-btn-sm {
  flex-shrink: 0;
  min-width: 56px;
  padding: 6px 12px;
  font-size: 0.9rem;
}
</style>

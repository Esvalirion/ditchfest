<!-- Linked accounts: several Ubisoft accounts that are the same person. The
     backend already resolves identities at read time via canon() — this page
     only manages the links themselves. Alt accounts stay attached to the
     primary until an admin detaches them; nothing is ever merged in storage,
     so unlinking is a one-row delete (reversible for stats). -->
<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../utils/api';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();

const state = ref('loading'); // 'unauthenticated' | 'loading' | 'forbidden' | 'error' | 'ready'
const groups = ref([]);

const newAltId = ref('');
const newPrimaryId = ref('');
const linking = ref(false);
const linkMsg = ref('');
const linkError = ref(false);

async function load() {
  if (!session.isLoggedIn) {
    state.value = 'unauthenticated';
    return;
  }
  state.value = 'loading';
  try {
    const data = await api('/api/links');
    groups.value = data.groups || [];
    state.value = 'ready';
  } catch (e) {
    if (e.status === 403) state.value = 'forbidden';
    else if (e.status === 401) session.sessionExpired();
    else state.value = 'error';
  }
}

function errorText(e) {
  switch (e.message) {
    case 'unknown_account':
      return 'No Trackmania account with that ID was found.';
    case 'missing_accountId':
      return 'Enter both account IDs.';
    case 'lookup_failed':
      return 'Could not verify the accounts. Try again.';
    case 'same_account':
      return 'An account cannot be linked to itself.';
    case 'primary_is_alt_of_target':
      return 'Those two are already linked the other way round — swap the IDs.';
    case 'forbidden':
      return 'Access denied.';
    default:
      return 'Error: ' + e.message;
  }
}

async function linkAccounts() {
  const accountId = newAltId.value.trim();
  const primaryId = newPrimaryId.value.trim();
  if (!accountId || !primaryId) return;

  linking.value = true;
  linkError.value = false;
  linkMsg.value = 'Linking…';

  try {
    await api('/api/links', { body: { accountId, primaryId } });
    newAltId.value = '';
    newPrimaryId.value = '';
    linkMsg.value = '';
    await load();
  } catch (e) {
    linkError.value = true;
    linkMsg.value = errorText(e);
  } finally {
    linking.value = false;
  }
}

async function unlinkAlt(alt) {
  if (!confirm(`Detach ${alt.displayName || alt.accountId}?\nIts votes and maps will count on their own again.`)) {
    return;
  }
  alt._removing = true;
  try {
    await api('/api/links/unlink', { body: { accountId: alt.accountId } });
    await load();
  } catch (e) {
    alt._removing = false;
  }
}

load();
</script>

<template>
  <div id="admin-links-root">
    <p v-if="state === 'unauthenticated'" class="subtitle">Log in to access the admin panel.</p>
    <p v-else-if="state === 'loading'" class="subtitle">Loading…</p>
    <p v-else-if="state === 'forbidden'" class="subtitle">Access denied — admins only.</p>
    <p v-else-if="state === 'error'" class="subtitle">Failed to load. Try again later.</p>

    <template v-else-if="state === 'ready'">
      <p class="admin-nav-link">
        <RouterLink :to="{ name: 'admin' }">← Back to admin</RouterLink>
      </p>

      <div class="admin-card">
        <label class="admin-label">Link an alternate account to a primary</label>
        <p class="admin-hint">
          Both accounts are treated as one person in every stat. Votes and maps stay where
          they are — only the counting merges.
        </p>
        <div class="admin-add admin-add-stack">
          <input
            v-model="newPrimaryId"
            type="text"
            class="admin-input"
            placeholder="Primary account ID (the identity it joins)"
            @keydown.enter="linkAccounts"
          />
          <input
            v-model="newAltId"
            type="text"
            class="admin-input"
            placeholder="Alternate account ID (the one being linked)"
            @keydown.enter="linkAccounts"
          />
          <button class="auth-btn" :disabled="linking" @click="linkAccounts">Link</button>
        </div>
        <div class="admin-msg" :class="{ 'admin-err': linkError }">{{ linkMsg }}</div>
      </div>

      <div class="admin-section-title" v-if="groups.length">Linked groups</div>
      <p v-else class="subtitle empty">No linked accounts yet.</p>

      <div class="groups-list">
        <div v-for="g in groups" :key="g.primaryId" class="group-card">
          <div class="group-primary">
            <span class="group-primary-name">{{ g.primaryName || 'Unknown' }}</span>
            <span class="group-primary-id">{{ g.primaryId }}</span>
            <span class="group-badge">primary</span>
          </div>
          <div class="group-alts">
            <div v-for="alt in g.alts" :key="alt.accountId" class="admin-row">
              <div class="admin-info">
                <div class="admin-name">{{ alt.displayName || 'Unknown' }}</div>
                <div class="admin-id">{{ alt.accountId }}</div>
              </div>
              <button
                class="auth-btn admin-remove"
                :disabled="alt._removing"
                @click="unlinkAlt(alt)"
              >Detach</button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* .admin-card / .admin-label / .admin-input / .admin-msg / .admin-err /
   .admin-info / .admin-name / .admin-id / .admin-remove live in base.css
   (shared with AdminView). Only this page's layout bits are local. */

.admin-nav-link {
  max-width: 640px;
  margin: 0 auto 16px auto;
  text-align: left;
}

.admin-nav-link a {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.admin-hint {
  color: var(--color-text-dimmer);
  font-size: 0.82rem;
  margin: 0 0 14px 0;
  line-height: 1.4;
}

.admin-add-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Stack layout wants full-width boxes (the base class is width-agnostic). */
.admin-input {
  width: 100%;
  box-sizing: border-box;
}

.admin-section-title {
  max-width: 640px;
  margin: 0 auto 12px auto;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.empty {
  max-width: 640px;
  margin: 0 auto;
  text-align: center;
}

.groups-list {
  max-width: 640px;
  margin: 0 auto;
}

.group-card {
  padding: 16px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  margin-bottom: 12px;
  background-color: var(--color-overlay-1);
}

.group-primary {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-wrap: wrap;
}

.group-primary-name {
  color: var(--color-text);
  font-weight: 600;
}

.group-primary-id {
  color: var(--color-text-dimmer);
  font-family: var(--font-family-mono);
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-badge {
  color: var(--color-text-dimmer);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.group-alts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Sits inside a .group-card (overlay-1 background), so this row inverts the
   base pattern: tighter padding, lighter fill for contrast. */
.admin-row {
  padding: 10px 14px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background-color: var(--color-overlay-2);
}
</style>

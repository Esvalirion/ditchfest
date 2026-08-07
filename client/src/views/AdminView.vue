<!-- Ported from admin.html + js/admin.js. Add and remove admins by Ubisoft
     account ID. Reachable only from your own account page, and every action
     is gated server-side (the API answers 403 to non-admins) — this page
     checks first purely so it can show a clean message instead of a broken
     list. -->
<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../utils/api';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();

const state = ref('loading'); // 'unauthenticated' | 'loading' | 'forbidden' | 'error' | 'ready'
const admins = ref([]);

const newAccountId = ref('');
const adding = ref(false);
const addMsg = ref('');
const addError = ref(false);

async function load() {
  if (!session.isLoggedIn) {
    state.value = 'unauthenticated';
    return;
  }
  state.value = 'loading';
  try {
    const data = await api('/api/admins');
    admins.value = data.admins || [];
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
      return 'Enter an account ID.';
    case 'lookup_failed':
      return 'Could not verify the account. Try again.';
    case 'forbidden':
      return 'Access denied.';
    default:
      return 'Error: ' + e.message;
  }
}

async function addAdmin() {
  const accountId = newAccountId.value.trim();
  if (!accountId) return;

  adding.value = true;
  addError.value = false;
  addMsg.value = 'Adding…';

  try {
    await api('/api/admins', { body: { accountId } });
    newAccountId.value = '';
    addMsg.value = '';
    await load(); // re-read the list rather than patch it locally
  } catch (e) {
    addError.value = true;
    addMsg.value = errorText(e);
  } finally {
    adding.value = false;
  }
}

async function removeAdmin(admin) {
  admin._removing = true;
  try {
    await api('/api/admins/remove', { body: { accountId: admin.accountId } });
    await load();
  } catch (e) {
    admin._removing = false;
  }
}

load();
</script>

<template>
  <div id="admin-root">
    <p v-if="state === 'unauthenticated'" class="subtitle">Log in to access the admin panel.</p>
    <p v-else-if="state === 'loading'" class="subtitle">Loading…</p>
    <p v-else-if="state === 'forbidden'" class="subtitle">Access denied — admins only.</p>
    <p v-else-if="state === 'error'" class="subtitle">Failed to load. Try again later.</p>

    <template v-else-if="state === 'ready'">
      <div class="admin-nav-link">
        <RouterLink :to="{ name: 'admin-campaigns' }">Manage campaigns →</RouterLink>
        <RouterLink :to="{ name: 'admin-links' }">Linked accounts →</RouterLink>
      </div>

      <div class="admin-card">
        <label class="admin-label">Add admin by Ubisoft account ID</label>
        <div class="admin-add">
          <input
            v-model="newAccountId"
            type="text"
            class="admin-input"
            placeholder="e.g. 9963810c-63ef-42d7-acd5-56c132c22b06"
            @keydown.enter="addAdmin"
          />
          <button class="auth-btn" :disabled="adding" @click="addAdmin">Add</button>
        </div>
        <div class="admin-msg" :class="{ 'admin-err': addError }">{{ addMsg }}</div>
      </div>

      <div class="admin-list">
        <div v-for="a in admins" :key="a.accountId" class="admin-row">
          <div class="admin-info">
            <div class="admin-name">{{ a.displayName || 'Unknown' }}{{ a.isRoot ? ' (owner)' : '' }}</div>
            <div class="admin-id">{{ a.accountId }}</div>
          </div>
          <!-- The root admin comes from a Worker var and cannot be removed here. -->
          <button
            v-if="!a.isRoot"
            class="auth-btn admin-remove"
            :disabled="a._removing"
            @click="removeAdmin(a)"
          >Remove</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.admin-nav-link {
  max-width: 560px;
  margin: 0 auto 16px auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.admin-nav-link a {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.admin-card {
  max-width: 560px;
  margin: 0 auto 24px auto;
  padding: 24px;
  background-color: var(--color-overlay-2);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
}

.admin-label {
  display: block;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  margin-bottom: 8px;
}

.admin-add {
  display: flex;
  gap: 8px;
}

.admin-input {
  flex: 1;
  min-width: 0;
  background: var(--color-bg-elevated);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 9px 12px;
  font-size: 0.9rem;
}

.admin-input:focus {
  outline: none;
  border-color: var(--color-text-bright);
}

.admin-msg {
  margin-top: 10px;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  min-height: 1em;
}

.admin-err {
  color: var(--color-danger);
}

.admin-list {
  max-width: 560px;
  margin: 0 auto;
}

.admin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  background-color: var(--color-overlay-1);
}

.admin-info {
  min-width: 0;
}

.admin-name {
  color: var(--color-text);
}

.admin-id {
  color: var(--color-text-dimmer);
  font-family: monospace;
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-remove {
  flex-shrink: 0;
  padding: 6px 14px;
  font-size: 0.85rem;
}

.admin-remove:hover {
  border-color: var(--color-danger);
}
</style>

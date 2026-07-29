<script setup>
import { RouterLink } from 'vue-router';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
</script>

<template>
  <div class="auth-bar">
    <template v-if="session.isLoggedIn">
      <RouterLink
        class="auth-user"
        :to="{ name: 'mapper', params: { id: session.user.accountId } }"
      >{{ session.user.displayName }}</RouterLink>
      <button class="auth-btn" @click="session.logout()">Logout</button>
    </template>
    <button v-else class="auth-btn" @click="session.login()">Login with Ubisoft</button>
  </div>
</template>

<style scoped>
.auth-bar {
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

.auth-user {
  color: var(--color-text);
  font-size: 0.95rem;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s;
}

.auth-user:hover {
  border-bottom: 1px solid var(--color-text-bright);
}

@media (max-width: 760px) {
  .auth-bar {
    position: static;
    justify-content: center;
    margin: 10px auto 0;
  }
}
</style>

<!-- Catch-all for client routes that don't exist. Before this the router
     matched nothing and the page was an empty gap between header and footer. -->
<script setup>
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="not-found">
    <img class="nf-art" src="/res/404.webp" alt="A car stuck in a ditch next to the track" width="1200" height="600" />
    <h1>404 — off the track</h1>
    <p class="subtitle">
      Nothing lives at <code>{{ route.path }}</code>. This one ended up in the ditch.
    </p>
    <p class="nf-links">
      <RouterLink class="filter-btn" :to="{ name: 'home' }">Main page</RouterLink>
      <RouterLink class="filter-btn" :to="{ name: 'maps' }">Maps</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.not-found {
  max-width: 720px;
  margin: 0 auto;
  text-align: center;
}

.nf-art {
  display: block;
  width: 100%;
  height: auto;
  margin: 0 auto 8px;
}

h1 {
  color: var(--color-text-bright);
  margin: 0 0 8px;
}

code {
  font-family: var(--font-family-mono);
  color: var(--color-text);
  word-break: break-all;
}

.nf-links {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin: 20px 0;
}

.nf-links .filter-btn {
  text-decoration: none;
}
</style>

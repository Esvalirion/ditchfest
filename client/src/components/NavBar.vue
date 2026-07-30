<script setup>
// Nav entries + the "which subpage belongs to which nav item" mapping used
// to live in js/layout.js as NAV / BELONGS_TO. Here it's route.meta.navGroup
// set per-route in router/index.js instead of a filename lookup table.
import { RouterLink, useRoute } from 'vue-router';

const NAV = [
  { name: 'signs', label: 'Signs' },
  { name: 'maps', label: 'Maps' },
  { name: 'top-players', label: 'Players' },
  { name: 'top-mappers', label: 'Mappers' },
  { name: 'roadmap', label: 'Roadmap' },
];

const route = useRoute();

function isActive(navName) {
  return route.name === navName || route.meta.navGroup === navName;
}
</script>

<template>
  <nav class="nav-bar">
    <RouterLink
      v-for="item in NAV"
      :key="item.name"
      :to="{ name: item.name }"
      class="nav-link"
      :class="{ active: isActive(item.name) }"
    >{{ item.label }}</RouterLink>
  </nav>
</template>

<style scoped>
.nav-bar {
  position: absolute;
  top: 20px;
  left: 20px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  z-index: 10;
}

.nav-link {
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: 0.95rem;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition: color 0.15s, border-color 0.15s;
}

.nav-link:hover {
  color: var(--color-text-bright);
}

.nav-link.active {
  color: var(--color-text-bright);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
}

@media (max-width: 760px) {
  .nav-bar {
    position: static;
    justify-content: center;
    margin: 0 auto;
  }
}
</style>

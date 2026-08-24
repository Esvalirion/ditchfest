<script setup>
import { RouterLink } from 'vue-router';

const DISCORDS = [
  { href: 'https://discord.gg/VWaTmrXmh5', label: 'Ditchfest (EN)' },
  {
    href: 'https://discord.gg/TaPZBp7mTS',
    label: 'Trackmania Russian Community (RU)',
  },
];
</script>

<template>
  <footer>
    <div class="discord-links">
      <a
        v-for="d in DISCORDS"
        :key="d.href"
        class="discord-link-item"
        :href="d.href"
        target="_blank"
        rel="noopener"
      >
        <img class="discord-icon" src="/res/discord-sign-logo.svg" alt="" />
        <span>{{ d.label }}</span>
      </a>
      <a
        class="discord-link-item"
        href="https://github.com/Esvalirion/ditchfest"
        target="_blank"
        rel="noopener"
      >
        <img class="discord-icon" src="/res/github.svg" alt="" />
        <span>Github</span>
      </a>
      <!-- Internal link, same row: the quiet entry point to the community
           "maps missing from TMX" page — findable, but not nav material. -->
      <RouterLink class="discord-link-item" :to="{ name: 'missing-tmx' }">
        <svg class="discord-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" />
        </svg>
        <span>Missing on TMX</span>
      </RouterLink>
    </div>
    <p class="developer-info">Credits: onrd.., Soba, Rezzn, DamnedLight, esvalirion</p>
    <div class="copyright">Fuck you ditchfest mappers © 2025-2026</div>
  </footer>
</template>

<style scoped>
footer {
  text-align: center;
  margin-top: 20px;
  padding: 20px 20px 40px 20px;
  color: var(--color-text-faint);
}

.copyright {
  margin-top: 10px;
}

.discord-links {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-top: 0;
  flex-wrap: wrap;
}

.discord-link-item {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--color-text);
  transition: transform 0.2s;
}

.discord-link-item:hover {
  transform: scale(1.05);
}

.discord-link-item span {
  font-size: 0.9rem;
}

.discord-icon {
  width: 32px;
  height: 32px;
  transition: opacity 0.2s;
  opacity: 0.8;
}

.discord-link-item:hover .discord-icon {
  opacity: 1;
}

.developer-info {
  text-align: center;
  color: var(--color-text-faintest);
  font-size: 0.8rem;
  margin-top: 20px;
  margin-bottom: 0;
}
</style>

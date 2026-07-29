<script setup>
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
    </div>
    <p class="developer-info">Credits: onrd.., Soba, Rezzn, DamnedLight</p>
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

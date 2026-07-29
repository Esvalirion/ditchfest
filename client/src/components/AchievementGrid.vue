<!-- Ported from js/achievements.js grid(). -->
<script setup>
import AchievementCard from './AchievementCard.vue';

defineProps({
  achievements: { type: Array, default: () => [] },
  emptyText: { type: String, default: 'No achievements yet.' },
});
</script>

<template>
  <p v-if="!achievements.length" class="ach-empty">{{ emptyText }}</p>
  <div v-else class="ach-grid">
    <AchievementCard v-for="a in achievements" :key="a.code" :achievement="a" />
  </div>
</template>

<style scoped>
.ach-empty {
  color: var(--color-text-dimmer);
  font-size: 0.9rem;
  margin: 16px 0;
}

.ach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
  margin: 16px 0;
  text-align: left;
}
</style>

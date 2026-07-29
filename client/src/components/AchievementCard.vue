<!-- Ported from js/achievements.js card(). The catalog lives on the Worker
     (src/achievements.ts) and arrives complete — every badge, with `earned`
     telling us which ones this account has. Locked ones are shown too, so
     there is something to chase. This component never decides what a badge
     means. -->
<script setup>
const props = defineProps({
  achievement: { type: Object, required: true },
});

// Anything without an `earned` flag (a freshly unlocked badge handed back by
// /api/onboarding/step) counts as earned.
const earned = props.achievement.earned !== false;
</script>

<template>
  <div
    class="ach-item"
    :class="earned ? 'earned' : 'locked'"
    :data-hint="achievement.hint || undefined"
    :aria-label="achievement.hint ? `${achievement.name || achievement.code} — ${achievement.hint}` : undefined"
  >
    <div class="ach-icon">{{ achievement.icon || '🏆' }}</div>
    <div class="ach-body">
      <div class="ach-name">{{ achievement.name || achievement.code }}</div>
      <div v-if="achievement.description" class="ach-desc">{{ achievement.description }}</div>
      <!-- Spelled out rather than left to colour alone — on a dark theme a
           greyed-out card reads a lot like a normal one. -->
      <div class="ach-status">{{ earned ? '✓ Unlocked' : '🔒 Locked' }}</div>
    </div>
  </div>
</template>

<style scoped>
.ach-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
  background-color: var(--color-overlay-1);
}

/* Earned: green, the same colour a cast vote uses elsewhere on the site. */
.ach-item.earned {
  border-color: var(--color-accent);
  background-color: rgba(46, 125, 50, 0.12);
}

/* Not earned yet. Fully opaque — a locked badge should read as "still to get",
   not as disabled UI you can barely see — but flat, dashed and colourless so it
   cannot be mistaken for an earned one at a glance. */
.ach-item.locked {
  border-style: dashed;
  border-color: var(--color-border-dashed);
  background-color: rgba(0, 0, 0, 0.35);
}

/* Only the emoji is desaturated; greying the whole card would drag the tooltip
   down with it. */
.ach-item.locked .ach-icon {
  filter: grayscale(1) brightness(0.8);
}

.ach-item.locked .ach-name {
  color: #8a8a8a;
}

.ach-item.locked .ach-desc {
  color: #5c5c5c;
}

.ach-status {
  margin-top: 5px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.ach-item.earned .ach-status {
  color: var(--color-accent-text);
}

.ach-item.locked .ach-status {
  color: #6b6b6b;
}

/* Unlock condition on hover (data-hint is set above when present). */
.ach-item[data-hint]:hover::after {
  content: attr(data-hint);
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 6px);
  padding: 8px 10px;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 0.8rem;
  line-height: 1.35;
  box-shadow: var(--shadow-popover);
  pointer-events: none;
  z-index: 50;
}

.ach-icon {
  font-size: 1.6rem;
  line-height: 1;
  flex-shrink: 0;
}

.ach-body {
  min-width: 0;
}

.ach-name {
  color: var(--color-text-bright);
  font-size: 0.95rem;
}

.ach-desc {
  color: var(--color-text-dim);
  font-size: 0.8rem;
  margin-top: 2px;
}
</style>

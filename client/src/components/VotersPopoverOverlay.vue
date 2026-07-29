<!-- Singleton floating box — mount once in App.vue. See utils/votersPopover.js. -->
<script setup>
import { votersPopoverState } from '../utils/votersPopover';
</script>

<template>
  <div
    class="voters-popover"
    :class="{ visible: votersPopoverState.visible }"
    :style="{ transform: `translate(${votersPopoverState.x}px, ${votersPopoverState.y}px)` }"
  >
    <div v-if="votersPopoverState.status === 'loading'" class="voters-status">Loading…</div>
    <div v-else-if="votersPopoverState.status === 'error'" class="voters-status">Failed to load.</div>
    <div v-else-if="!votersPopoverState.voters.length" class="voters-status">No votes yet.</div>
    <ul v-else class="voters-list">
      <li v-for="(voter, i) in votersPopoverState.voters" :key="i" class="voters-item">
        {{ voter.name || 'Unknown player' }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.voters-popover {
  position: fixed;
  top: 0;
  left: 0;
  min-width: 160px;
  max-width: 260px;
  max-height: 220px;
  overflow-y: auto;
  padding: 8px 10px;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.12s;
  pointer-events: none;
  z-index: 100;
}

.voters-popover.visible {
  opacity: 1;
  visibility: visible;
}

.voters-status {
  color: var(--color-text-dim);
  font-size: 0.8rem;
}

.voters-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.voters-item {
  padding: 3px 0;
  color: var(--color-text);
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.voters-item + .voters-item {
  border-top: 1px solid var(--color-border-hairline);
}
</style>

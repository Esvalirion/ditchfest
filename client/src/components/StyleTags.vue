<!-- Small coloured "chips" for a map's TMX style + tags, shown under the
     author line. `style` is the readable StyleName (e.g. "SpeedMapping"),
     `tags` is [{name,color}] (color is a TMX hex like "bd46b0", no leading #).
     When the map has been confirmed NOT on TMX (onTmx === false) and there is
     no style/tags to show, a single neutral "Not on TMX" chip is rendered
     instead. Shared by MapRow (catalog), OnboardingView, and MapView. -->
<script setup>
import { computed } from 'vue';

const props = defineProps({
  style: { type: String, default: null },
  tags: { type: Array, default: () => [] },
  onTmx: { type: Boolean, default: true },
});

// Turn a TMX hex ("bd46b0") into a chip style object: tinted translucent
// background + matching solid border, white text reads on every tint on the
// dark theme. Returns null for blank/invalid colours so the caller falls back
// to the neutral chip class.
function chipStyle(color) {
  if (!color) return null;
  const hex = color.replace('#', '');
  if (!/^[0-9a-fA-F]{3,6}$/.test(hex)) return null;
  let r, g, b;
  if (hex.length === 3) {
  r = parseInt(hex[0] + hex[0], 16);
  g = parseInt(hex[1] + hex[1], 16);
  b = parseInt(hex[2] + hex[2], 16);
  } else {
  r = parseInt(hex.slice(0, 2), 16);
  g = parseInt(hex.slice(2, 4), 16);
  b = parseInt(hex.slice(4, 6), 16);
  }
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.18)`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.5)`,
  };
}

const chips = computed(() => {
  const out = [];
  if (props.style) {
    const s = chipStyle(styleColor(props.style));
    out.push({ label: props.style, style: s });
  }
  for (const t of props.tags || []) {
    if (!t || !t.name) continue;
    // Skip a tag that just repeats the style name (TMX commonly tags the
    // primary style as both StyleName and one of the Tags).
    if (props.style && t.name.toLowerCase() === props.style.toLowerCase()) continue;
    out.push({ label: t.name, style: chipStyle(t.color) });
  }
  return out;
});

const showNotOnTmx = computed(() => chips.value.length === 0 && props.onTmx === false);

// Most TMX styles double as tag names and have a colour in the tag table
// (SpeedMapping, Dirt, Ice…). We don't have that table client-side, so the
// style chip is neutral unless the server happened to attach a colour. Keep
// the hook so a future server change can colour it without a client edit.
function styleColor(_name) {
  return null;
}
</script>

<template>
  <div v-if="chips.length || showNotOnTmx" class="style-tags">
    <span
      v-for="(c, i) in chips"
      :key="i"
      class="style-tag"
      :style="c.style"
    >{{ c.label }}</span>
    <span v-if="showNotOnTmx" class="style-tag style-tag-muted">Not on TMX</span>
  </div>
</template>

<style scoped>
.style-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.style-tag {
  display: inline-block;
  padding: 1px 6px;
  font-size: 0.68rem;
  line-height: 1.5;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background-color: var(--color-overlay-4);
  color: var(--color-text);
  white-space: nowrap;
}

.style-tag-muted {
  color: var(--color-text-faintest);
  font-style: italic;
}
</style>

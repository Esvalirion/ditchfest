<!-- One draggable entry of the tierlist board (see TierlistView.vue).
     Renders a cover card when the item is marked `card` (editions — with
     the cover image, or a numbered placeholder when the edition has no
     media), a text pill otherwise (mappers have no avatars to show). The
     drag listeners are NOT declared as emits on purpose: they fall through
     from the parent to this root element as native listeners, so the view
     keeps full control of the drop-target wiring per zone. -->
<script setup>
defineProps({
  item: { type: Object, required: true }, // { id, label, card?, media? }
  dragging: { type: Boolean, default: false }, // true while this chip is held
});

/** The trailing number/range of an edition name ("DITCHFEST 129-130" →
 *  "129-130", "DITCHFEST 123-125.1" → "123-125.1") for the no-cover
 *  placeholder; "DF" when there's no number. */
function editionNumber(label) {
  const m = /(\d+(?:[.\u2013-]\d+)*)\s*$/.exec(label || '');
  return m ? m[1] : 'DF';
}
</script>

<template>
  <article
    class="chip"
    :class="{ 'as-media': item.card, dragging }"
    draggable="true"
    :title="item.label"
  >
    <template v-if="item.card">
      <!-- draggable=false: a native-draggable <img> would hijack the chip's drag -->
      <img
        v-if="item.media"
        class="chip-media"
        :src="item.media"
        alt=""
        loading="lazy"
        draggable="false"
      />
      <div v-else class="chip-media chip-media-blank">
        <span>{{ editionNumber(item.label) }}</span>
      </div>
      <span class="chip-caption">{{ item.label }}</span>
    </template>
    <span v-else class="chip-text">{{ item.label }}</span>
  </article>
</template>

<style scoped>
.chip {
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}

.chip.dragging {
  opacity: 0.45;
}

/* Text pill (mappers) */
.chip-text {
  display: inline-block;
  padding: 6px 12px;
  background-color: var(--color-overlay-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-bright);
  font-size: 0.9rem;
  white-space: nowrap;
}

.chip:hover .chip-text {
  border-color: var(--color-text-faint);
}

/* Cover card (editions) */
.chip.as-media {
  width: 128px;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.chip.as-media:hover {
  border-color: var(--color-text-faint);
}

.chip-media {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background-color: var(--color-bg-elevated);
}

/* Same box as a cover, with the edition number instead of an image. */
.chip-media-blank {
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(160deg, var(--color-overlay-5), var(--color-overlay-2)),
    var(--color-bg-elevated);
  color: var(--color-text-dim);
  font-size: 1.05rem;
  font-weight: bold;
  letter-spacing: 0.03em;
}

.chip-caption {
  padding: 4px 6px 5px;
  font-size: 0.72rem;
  line-height: 1.25;
  color: var(--color-text-muted);
  text-align: center;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>

import { reactive } from 'vue';

// Floating full-size preview of a hovered map thumbnail. Ported from
// js/mapper.js / js/voting.js — both pages had an identical copy of this;
// here it's one shared singleton overlay (mounted once in App.vue) instead
// of one per page. Pointer-only: touch devices skip it.
const canHover = !window.matchMedia || window.matchMedia('(hover: hover)').matches;

export const mapPreviewState = reactive({
  visible: false,
  url: '',
  x: 0,
  y: 0,
});

function move(e) {
  const pad = 12;
  const gap = 20;
  const w = 420; // matches the CSS width — the box has no measured size yet
  const h = w * 0.5625; // 16:9 guess until the real image loads

  let x = e.clientX + gap;
  let y = e.clientY + gap;
  // Flip to the other side of the cursor rather than run off-screen.
  if (x + w + pad > window.innerWidth) x = e.clientX - w - gap;
  if (y + h + pad > window.innerHeight) y = e.clientY - h - gap;

  mapPreviewState.x = Math.max(pad, x);
  mapPreviewState.y = Math.max(pad, y);
}

export function showMapPreview(url, e) {
  if (!canHover) return;
  mapPreviewState.url = url;
  mapPreviewState.visible = true;
  move(e);
}

export function moveMapPreview(e) {
  if (!canHover || !mapPreviewState.visible) return;
  move(e);
}

export function hideMapPreview() {
  mapPreviewState.visible = false;
}

// Fixed-position popovers would otherwise be stranded next to an element
// that scrolled or is no longer there.
if (canHover) {
  window.addEventListener('scroll', hideMapPreview, true);
  window.addEventListener('blur', hideMapPreview);
}

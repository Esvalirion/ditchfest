import { reactive } from 'vue';
import { api } from './api';

// Hovering a vote button that already has at least one vote shows who voted
// for that map. Resolved lazily from /api/map-voters and cached per map so
// re-hovering the same button doesn't refetch. Ported from js/mapper.js /
// js/voting.js as one shared singleton overlay. Pointer-only, same reasoning
// as mapPreview.js.
const canHover = !window.matchMedia || window.matchMedia('(hover: hover)').matches;

const voterCache = new Map(); // mapUid -> { status: 'loading'|'done'|'error', voters }
let token = 0;

export const votersPopoverState = reactive({
  visible: false,
  status: 'loading',
  voters: [],
  x: 0,
  y: 0,
});

function position(btnEl) {
  const rect = btnEl.getBoundingClientRect();
  const pad = 12;
  const gap = 8;
  const w = 220; // approximate — matches the CSS min/max width
  const h = 60;

  let x = rect.left;
  let y = rect.bottom + gap;
  if (x + w + pad > window.innerWidth) x = window.innerWidth - w - pad;
  if (x < pad) x = pad;
  // Flip above the button if there's no room below.
  if (y + h + pad > window.innerHeight) y = rect.top - h - gap;

  votersPopoverState.x = Math.max(pad, x);
  votersPopoverState.y = Math.max(pad, y);
}

async function loadVoters(mapUid) {
  const cached = voterCache.get(mapUid);
  if (cached && cached.status !== 'error') return cached;

  voterCache.set(mapUid, { status: 'loading', voters: [] });
  let entry;
  try {
    const data = await api('/api/map-voters?mapUid=' + encodeURIComponent(mapUid));
    entry = { status: 'done', voters: data.voters || [] };
  } catch (e) {
    entry = { status: 'error', voters: [] };
  }
  voterCache.set(mapUid, entry);
  return entry;
}

/** Call after a vote toggle so a re-hover sees the fresh voter list. */
export function invalidateVoters(mapUid) {
  voterCache.delete(mapUid);
}

export async function showVoters(btnEl, mapUid, count) {
  if (!canHover || !count) return; // nobody to show

  const myToken = ++token;
  const cached = voterCache.get(mapUid);
  const initial = cached && cached.status !== 'error' ? cached : { status: 'loading', voters: [] };
  votersPopoverState.status = initial.status;
  votersPopoverState.voters = initial.voters;
  votersPopoverState.visible = true;
  position(btnEl);

  const state = await loadVoters(mapUid);
  if (myToken !== token) return;
  if (!votersPopoverState.visible) return;
  votersPopoverState.status = state.status;
  votersPopoverState.voters = state.voters;
  position(btnEl);
}

export function hideVoters() {
  votersPopoverState.visible = false;
}

if (canHover) {
  window.addEventListener('scroll', hideVoters, true);
  window.addEventListener('blur', hideVoters);
}

<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
} from 'chart.js';
import { api } from '../utils/api';
import { useParallax } from '../utils/parallax';
import { ACTIVITIES, DEFAULT_ACTIVITY_KIND, findActivity } from '../data/homeActivities';

// Tree-shakeable Chart.js: register only the pieces the line chart needs.
Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

const state = ref('loading'); // 'loading' | 'error' | 'ready'
const stats = ref(null);

const chartCanvas = ref(null);
let chart = null;

// The latest-edition card uses the top-voted map's thumbnail as a parallax
// background (see latestCard + handleLatestMove below).
const latestCard = ref(null);

/** The best map's thumbnail URL, when there is one — used as the card's
 *  moving background. Falls back to null (no background image). */
const heroImage = computed(() => stats.value?.latest?.topMaps?.[0]?.thumbnailUrl || null);

// --- Activities block --------------------------------------------------------
// Tabbed teaser between the latest-edition panel and the chart. The registry
// (client/src/data/homeActivities.js) drives the tabs/description/CTA — the
// first activity is selected by default.
const activeActivityKind = ref(DEFAULT_ACTIVITY_KIND);
const activeActivity = computed(() => findActivity(activeActivityKind.value));

const activitiesPanel = ref(null);

// Same light parallax for both hero panels — see utils/parallax.js.
const handleActivitiesMove = useParallax(() => activitiesPanel.value);
const handleLatestMove = useParallax(() => latestCard.value);

// Keyboard support for the activities tab strip (ARIA Tabs: roving tabindex +
// arrow keys move between tabs). Home/End jump to the first/last tab.
function onTabKeydown(e) {
  const i = ACTIVITIES.findIndex((a) => a.kind === activeActivityKind.value);
  let next = null;
  if (e.key === 'ArrowRight') next = (i + 1) % ACTIVITIES.length;
  else if (e.key === 'ArrowLeft') next = (i - 1 + ACTIVITIES.length) % ACTIVITIES.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = ACTIVITIES.length - 1;
  if (next == null) return;
  e.preventDefault();
  activeActivityKind.value = ACTIVITIES[next].kind;
  nextTick(() => document.getElementById(`activity-tab-${ACTIVITIES[next].kind}`)?.focus());
}

// English pluralization: singular only for exactly 1, plural otherwise.
function en(n, singular, pluralForm) {
  return n === 1 ? singular : pluralForm;
}

const pluralize = {
  maps: (n) => en(n, 'map', 'maps'),
  votes: (n) => en(n, 'vote', 'votes'),
  editions: (n) => en(n, 'ditchfest', 'ditchfests'),
  mappers: (n) => en(n, 'mapper', 'mappers'),
  days: (n) => en(n, 'day', 'days'),
  hours: (n) => en(n, 'hour', 'hours'),
  minutes: (n) => en(n, 'minute', 'minutes'),
  seconds: (n) => en(n, 'second', 'seconds'),
};

// --- Countdown to the next ditchfest ---------------------------------------
// Ditchfests run every other Friday at 20:45 Moscow time (UTC+3, no DST).
// The anchor is a known past start; we walk it forward in 2-week steps until
// it's in the future. Hardcoded for now — a future task will move the time
// into an admin-editable setting.
const FEST_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;
// 2026-08-07T20:45:00+03:00 — a known ditchfest Friday (the env clock runs in
// 2026, where Aug 7 is a Friday; Aug 8 is Saturday). Two-week cadence from
// here lands on subsequent Fridays.
const FEST_ANCHOR = new Date('2026-08-07T20:45:00+03:00').getTime();

/** The next upcoming ditchfest start instant. */
function nextFestStart(now = Date.now()) {
  let t = FEST_ANCHOR;
  while (t <= now) t += FEST_INTERVAL_MS;
  return t;
}

const countdown = ref({ days: 0, hours: 0, minutes: 0, seconds: 0 });
let countdownTimer = null;

function tickCountdown() {
  const diff = Math.max(0, nextFestStart() - Date.now());
  countdown.value = {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

async function load() {
  state.value = 'loading';
  try {
    stats.value = await api('/api/home');
    state.value = 'ready';
  } catch (e) {
    state.value = 'error';
  }
}

/** Resolve a CSS token to its computed value on <html>, falling back to the
 *  hardcoded palette so the chart still renders before styles settle. Chart.js
 *  draws on a canvas, so scoped CSS variables don't reach it automatically. */
function token(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Alpha variant of a hex colour for the canvas fill (Chart.js can't consume
 *  color-mix()); falls back to the default accent when the token resolves to
 *  something non-hex. */
function withAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return `rgba(46, 125, 50, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function renderChart() {
  if (!chartCanvas.value || !stats.value || !stats.value.perEdition.length) return;
  // Newest-first from the API → reverse so the chart reads chronologically
  // left-to-right (oldest edition on the left, latest on the right).
  const series = [...stats.value.perEdition].reverse();

  const accent = token('--color-accent', '#2e7d32');
  const accentHover = token('--color-accent-hover', '#388e3c');
  const textColor = token('--color-text-muted', '#aaaaaa');
  const gridColor = token('--color-border-subtle', '#2a2a2a');
  const panelBg = token('--color-bg-elevated', '#111111');
  const brightText = token('--color-text-bright', '#ffffff');
  const bodyText = token('--color-text', '#e0e0e0');

  chart = new Chart(chartCanvas.value, {
    type: 'line',
    data: {
      labels: series.map((e) => e.name),
      datasets: [
        {
          label: 'Maps',
          data: series.map((e) => e.mapCount),
          // tension < 0.5 gives a smooth monotone-style curve through the real
          // points (no synthetic values); points stay anchored to real data.
          tension: 0.35,
          borderColor: accent,
          borderWidth: 2,
          // Subtle translucent fill under the line, derived from the accent.
          backgroundColor: withAlpha(accent, 0.12),
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: accent,
          pointBorderColor: accent,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: accentHover,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: panelBg,
          titleColor: brightText,
          bodyColor: bodyText,
          borderColor: gridColor,
          borderWidth: 1,
          callbacks: {
            label: (ctx) => ' ' + ctx.parsed.y + ' ' + pluralize.maps(ctx.parsed.y),
          },
        },
      },
      scales: {
        x: {
          // No tick labels: with many editions the names overlapped into an
          // unreadable mess. The tooltip still shows the name on hover, so the
          // axis line alone is enough.
          ticks: { display: false },
          grid: { display: false },
          border: { color: gridColor },
        },
        y: {
          beginAtZero: true,
          ticks: { color: textColor, precision: 0 },
          grid: { color: gridColor },
          border: { display: false },
        },
      },
    },
  });
}

onMounted(async () => {
  // Countdown ticks immediately so the numbers aren't zero for a second.
  tickCountdown();
  countdownTimer = setInterval(tickCountdown, 1000);

  await load();
  // Next frame so the <canvas> exists in the DOM before we draw on it.
  requestAnimationFrame(renderChart);
});

onBeforeUnmount(() => {
  clearInterval(countdownTimer);
  countdownTimer = null;
  chart?.destroy();
  chart = null;
});
</script>

<template>
  <div id="home-root">
    <!-- Countdown to the next ditchfest: independent of the stats fetch so it
         shows even while the dashboard is loading. -->
    <section class="countdown-card">
      <h2 class="countdown-title">Next ditchfest in</h2>
      <div class="countdown-timer">
        <div class="cd-unit">
          <span class="cd-value">{{ countdown.days }}</span>
          <span class="cd-label">{{ pluralize.days(countdown.days) }}</span>
        </div>
        <div class="cd-unit">
          <span class="cd-value">{{ countdown.hours }}</span>
          <span class="cd-label">{{ pluralize.hours(countdown.hours) }}</span>
        </div>
        <div class="cd-unit">
          <span class="cd-value">{{ countdown.minutes }}</span>
          <span class="cd-label">{{ pluralize.minutes(countdown.minutes) }}</span>
        </div>
        <div class="cd-unit">
          <span class="cd-value">{{ countdown.seconds }}</span>
          <span class="cd-label">{{ pluralize.seconds(countdown.seconds) }}</span>
        </div>
      </div>
    </section>

    <p v-if="state === 'loading'" class="subtitle">Loading…</p>
    <p v-else-if="state === 'error'" class="subtitle">Failed to load stats. Try again later.</p>

    <template v-else-if="state === 'ready' && stats">
      <!-- Headline metric cards -->
      <section class="metric-row">
        <div class="metric-card">
          <span class="metric-value">{{ stats.totals.maps }}</span>
          <span class="metric-label">{{ pluralize.maps(stats.totals.maps) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">{{ stats.totals.mappers }}</span>
          <span class="metric-label">{{ pluralize.mappers(stats.totals.mappers) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">{{ stats.totals.editions }}</span>
          <span class="metric-label">{{ pluralize.editions(stats.totals.editions) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">{{ stats.totals.votes }}</span>
          <span class="metric-label">{{ pluralize.votes(stats.totals.votes) }}</span>
        </div>
      </section>

      <!-- Latest edition summary -->
      <section class="panels">
        <article
          v-if="stats.latest"
          ref="latestCard"
          class="panel latest-panel"
          :class="{ 'has-hero': heroImage }"
          @mousemove="handleLatestMove"
        >
          <div
            v-if="heroImage"
            class="parallax-hero latest-hero"
            :style="{ backgroundImage: `url(${heroImage})` }"
            aria-hidden="true"
          ></div>
          <div class="latest-content">
            <header class="latest-head">
              <img
                v-if="stats.latest.media"
                class="latest-cover"
                :src="stats.latest.media"
                :alt="stats.latest.name"
                loading="lazy"
              />
              <div class="latest-titles">
                <h2 class="latest-name">
                  <span class="latest-prefix">Latest ditchfest:</span> {{ stats.latest.name }}
                </h2>
                <p v-if="stats.latest.theme" class="latest-theme">{{ stats.latest.theme }}</p>
                <p class="latest-meta">
                  {{ stats.latest.mapCount }} {{ pluralize.maps(stats.latest.mapCount) }}
                  · {{ stats.latest.voteCount }} {{ pluralize.votes(stats.latest.voteCount) }}
                </p>
              </div>
            </header>

          <div v-if="stats.latest.topMaps.length" class="latest-section">
            <h3 class="section-title">Top edition maps</h3>
            <ol class="top-maps">
              <li v-for="m in stats.latest.topMaps" :key="m.mapUid" class="top-map">
                <RouterLink class="top-map-name" :to="{ name: 'map', params: { mapUid: m.mapUid } }">
                  {{ m.name }}
                </RouterLink>
                <span class="top-map-author">{{ m.authorName || 'Unknown mapper' }}</span>
                <span class="top-map-votes">{{ m.votes }}</span>
              </li>
            </ol>
          </div>

            <div v-if="stats.latest.topMapper" class="latest-section">
              <h3 class="section-title">Top edition mapper</h3>
              <RouterLink
                class="top-mapper"
                :to="{ name: 'mapper', params: { id: stats.latest.topMapper.accountId } }"
              >
                <span class="top-mapper-name">{{ stats.latest.topMapper.name || 'Unknown mapper' }}</span>
                <span class="top-mapper-votes">{{ stats.latest.topMapper.votes }}</span>
              </RouterLink>
            </div>
          </div>
        </article>
      </section>

      <!-- Activities: tabbed teaser; the CTA leads to the activity's
           page (stubs for the tierlists, the real onboarding flow). -->
      <section class="activities-row">
        <article
          ref="activitiesPanel"
          class="panel activities-panel"
          :class="`activity-${activeActivity.kind}`"
          @mousemove="handleActivitiesMove"
        >
          <div
            class="parallax-hero activities-hero"
            :style="{ backgroundImage: `url(${activeActivity.background})` }"
            aria-hidden="true"
          ></div>
          <div
            class="activities-content"
            role="tabpanel"
            id="activity-panel"
            :aria-labelledby="`activity-tab-${activeActivity.kind}`"
          >
            <h2 class="panel-title">Activities</h2>
            <div class="activity-tabs" role="tablist" aria-label="Activities" @keydown="onTabKeydown">
              <button
                v-for="a in ACTIVITIES"
                :key="a.kind"
                :id="`activity-tab-${a.kind}`"
                class="activity-tab"
                role="tab"
                :class="{ active: a.kind === activeActivityKind }"
                :aria-selected="a.kind === activeActivityKind"
                :aria-controls="'activity-panel'"
                :tabindex="a.kind === activeActivityKind ? 0 : -1"
                @click="activeActivityKind = a.kind"
              >{{ a.label }}</button>
            </div>
            <p class="activity-description">{{ activeActivity.description }}</p>
            <RouterLink class="activity-cta" :to="{ name: activeActivity.routeName }">
              {{ activeActivity.ctaLabel }} →
            </RouterLink>
          </div>
        </article>
      </section>

      <!-- Per-edition chart, full width on its own row so it has room to breathe -->
      <section v-if="stats.perEdition.length" class="chart-row">
        <article class="panel chart-panel">
          <h2 class="panel-title">Maps per ditchfest</h2>
          <div class="chart-wrap">
            <canvas ref="chartCanvas"></canvas>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
#home-root {
  max-width: 980px;
  margin: 0 auto;
}

/* --- Metric cards ------------------------------------------------------- */
.metric-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 24px 0;
}

.metric-card {
  flex: 1 1 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 18px 12px;
  background-color: var(--color-overlay-2);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}

.metric-value {
  font-size: 2rem;
  color: var(--color-text-bright);
  line-height: 1;
}

.metric-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

/* --- Countdown to the next ditchfest ----------------------------------- */
.countdown-card {
  margin: 8px 0 24px;
  padding: 22px 18px;
  background-color: var(--color-overlay-2);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  text-align: center;
}

.countdown-title {
  margin: 0 0 14px;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.countdown-timer {
  display: flex;
  justify-content: center;
  gap: 18px;
  flex-wrap: wrap;
}

.cd-unit {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 64px;
}

.cd-value {
  font-size: 2.2rem;
  line-height: 1;
  color: var(--color-text-bright);
  font-variant-numeric: tabular-nums;
}

.cd-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-dim);
}

/* --- Latest edition panel (full width, on its own row) ----------------- */
.panels {
  margin-bottom: 16px;
}

.panel {
  background-color: var(--color-overlay-2);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 18px;
}

/* --- Chart row (full width, below the edition panel) ------------------- */
.chart-panel {
  display: flex;
  flex-direction: column;
}

.chart-panel .panel-title {
  flex: 0 0 auto;
  margin-bottom: 12px;
}

.chart-wrap {
  position: relative;
  height: 320px;
}

/* --- Latest edition ----------------------------------------------------- */

/* The top map's thumbnail becomes a slowly drifting background. The card sits
 * above it; a dark scrim keeps the text legible regardless of the image. */
.latest-panel {
  position: relative;
  overflow: hidden;
}

/* Drift mechanics are .parallax-hero (base.css); this layer only adds the
 * darkening treatment. */
.latest-hero {
  /* Darken + desaturate so the foreground text and cards stay the focus,
   * regardless of how bright the source thumbnail is. */
  filter: brightness(0.28) saturate(0.85);
}

/* With a hero image, lean on it for the card background and add a scrim so the
 * panel border / padding still read as a card. Without one, .panel's default
 * overlay background shows through as before. */
.latest-panel.has-hero {
  background-color: var(--color-bg-elevated);
}

.latest-content {
  position: relative;
  z-index: 1;
}

.latest-prefix {
  color: var(--color-text-dim);
  font-weight: normal;
}

.latest-head {
  display: flex;
  gap: 14px;
  align-items: center;
}

.latest-cover {
  width: 96px;
  height: 54px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
  background-color: var(--color-bg-elevated);
}

.latest-titles {
  min-width: 0;
}

.latest-name {
  margin: 0;
  font-size: 1.25rem;
  color: var(--color-text-bright);
}

.latest-theme {
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.latest-meta {
  margin: 6px 0 0;
  color: var(--color-text-dim);
  font-size: 0.85rem;
}

.latest-section {
  margin-top: 16px;
}

.section-title {
  margin: 0 0 8px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.top-maps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.top-map {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'name votes'
    'author votes';
  align-items: baseline;
  gap: 0 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--color-border-subtle);
}

.top-map:last-child {
  border-bottom: none;
}

.top-map-name {
  grid-area: name;
  color: var(--color-text);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-map-name:hover {
  color: var(--color-text-bright);
}

.top-map-author {
  grid-area: author;
  color: var(--color-text-dim);
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-map-votes {
  grid-area: votes;
  font-weight: bold;
  color: var(--color-accent-text);
}

.top-mapper {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 0;
  color: var(--color-text);
  text-decoration: none;
  border-bottom: 1px solid var(--color-border-subtle);
}

.top-mapper:hover .top-mapper-name {
  color: var(--color-text-bright);
}

.top-mapper-votes {
  font-weight: bold;
  color: var(--color-accent-text);
}

/* --- Fan activities block (between latest edition and chart) ------------ */
.activities-row {
  margin-bottom: 16px;
}

/* Sibling of .latest-panel / .chart-panel: the same .panel card look (overlay
 * background, soft border, shadow). The activity's image is a quiet
 * translucent wash over that card rather than a heavy backdrop, so the block
 * reads like its neighbours; swapping the registry URL still retints it. */
.activities-panel {
  position: relative;
  overflow: hidden;
}

.activities-hero {
  /* Drift mechanics are .parallax-hero (base.css); this layer only adds the
   * quiet wash treatment. */
  opacity: 0.16;
  filter: saturate(0.85);
}

.activities-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
}

/* Same heading treatment as the chart panel's title; margins collapse to
 * zero so the column gap alone sets the rhythm. */
.activities-panel .panel-title {
  margin: 0;
}

.activity-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Sibling of .filter-btn from the Signs gallery (same tokens, tighter
 * padding) so the two tab rows read as one family. */
.activity-tab {
  background: var(--color-bg);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 16px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}

.activity-tab:hover {
  color: var(--color-text-bright);
  border-color: var(--color-text-bright);
}

.activity-tab.active {
  color: var(--color-text-bright);
  border-color: var(--color-text-bright);
  background: var(--color-overlay-4);
}

.activity-description {
  margin: 0;
  max-width: 640px;
  color: var(--color-text);
  line-height: 1.5;
}

/* Same accent treatment as the "Studio →" CTA in the Signs gallery: an
 * accent-bordered link that navigates somewhere, not a filter. The extra
 * large top margin (on top of the column gap) pushes the button well down
 * so the panel fills noticeably more vertical space. */
.activity-cta {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  padding: 10px 22px;
  margin-top: 122px;
  background: var(--color-bg);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  color: var(--color-accent-text);
  font-size: 0.95rem;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.activity-cta:hover {
  background: var(--color-accent);
  color: var(--color-text-bright);
}

</style>

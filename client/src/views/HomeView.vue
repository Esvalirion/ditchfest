<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
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

// Tree-shakeable Chart.js: register only the pieces the line chart needs.
Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

const state = ref('loading'); // 'loading' | 'error' | 'ready'
const stats = ref(null);

const chartCanvas = ref(null);
let chart = null;

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

const pluralize = {
  maps: (n) => plural(n, 'карта', 'карты', 'карт'),
  votes: (n) => plural(n, 'голос', 'голоса', 'голосов'),
  editions: (n) => plural(n, 'дичфест', 'дичфеста', 'дичфестов'),
  mappers: (n) => plural(n, 'маппер', 'маппера', 'мапперов'),
};

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

function renderChart() {
  if (!chartCanvas.value || !stats.value || !stats.value.perEdition.length) return;
  // API returns newest-first; keep it that way so the latest edition sits on
  // the left and the oldest trails off to the right.
  const series = [...stats.value.perEdition];

  const accent = token('--color-accent', '#2e7d32');
  const accentHover = token('--color-accent-hover', '#388e3c');
  const textColor = token('--color-text-muted', '#aaaaaa');
  const gridColor = token('--color-border-subtle', '#2a2a2a');

  chart = new Chart(chartCanvas.value, {
    type: 'line',
    data: {
      labels: series.map((e) => e.name),
      datasets: [
        {
          label: 'Карты',
          data: series.map((e) => e.mapCount),
          // tension < 0.5 gives a smooth monotone-style curve through the real
          // points (no synthetic values); points stay anchored to real data.
          tension: 0.35,
          borderColor: accent,
          borderWidth: 2,
          // Subtle translucent fill under the line, derived from the accent.
          backgroundColor: 'rgba(46, 125, 50, 0.12)',
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
          backgroundColor: '#111',
          titleColor: '#fff',
          bodyColor: '#e0e0e0',
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
  await load();
  // Next frame so the <canvas> exists in the DOM before we draw on it.
  requestAnimationFrame(renderChart);
});

onBeforeUnmount(() => {
  chart?.destroy();
  chart = null;
});
</script>

<template>
  <div id="home-root">
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

      <!-- Latest edition summary + per-edition chart -->
      <section class="panels">
        <article v-if="stats.latest" class="panel latest-panel">
          <header class="latest-head">
            <img
              v-if="stats.latest.media"
              class="latest-cover"
              :src="stats.latest.media"
              :alt="stats.latest.name"
              loading="lazy"
            />
            <div class="latest-titles">
              <h2 class="latest-name">{{ stats.latest.name }}</h2>
              <p v-if="stats.latest.theme" class="latest-theme">{{ stats.latest.theme }}</p>
              <p class="latest-meta">
                {{ stats.latest.mapCount }} {{ pluralize.maps(stats.latest.mapCount) }}
                · {{ stats.latest.voteCount }} {{ pluralize.votes(stats.latest.voteCount) }}
              </p>
            </div>
          </header>

          <div v-if="stats.latest.topMaps.length" class="latest-section">
            <h3 class="section-title">Топ карты</h3>
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
            <h3 class="section-title">Топ маппер дичфеста</h3>
            <RouterLink
              class="top-mapper"
              :to="{ name: 'mapper', params: { id: stats.latest.topMapper.accountId } }"
            >
              <span class="top-mapper-name">{{ stats.latest.topMapper.name || 'Unknown mapper' }}</span>
              <span class="top-mapper-votes">{{ stats.latest.topMapper.votes }}</span>
            </RouterLink>
          </div>
        </article>
      </section>

      <!-- Per-edition chart, full width on its own row so it has room to breathe -->
      <section v-if="stats.perEdition.length" class="chart-row">
        <article class="panel chart-panel">
          <h2 class="panel-title">Карты по дичфестам</h2>
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
</style>

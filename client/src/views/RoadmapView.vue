<script setup>
// Ported from roadmap.html — pure static content, first page moved per
// REWRITE_PLAN.md's "простая -> сложная" order.
const GROUPS = [
  {
    badgeClass: 'roadmap-badge-short',
    badgeLabel: 'Hotfixes/Small features',
    heading: 'Fixes or easy features',
    items: [
      { text: 'В футтере добавить ссылку на github сайта.' },
    ],
  },
  {
    badgeClass: 'roadmap-badge-mid',
    badgeLabel: 'Features',
    heading: 'Standard features that need to be implemented',
    items: [
      { text: 'Объединение аккаунтов для пользователей с несколькими аккаунтами (частично уже завершено).' },
      { text: 'Добавить страницу карты со ссылками на tmx и trackmania.io (вместо прямого редиректа).' },
      { text: 'Новые задачи по вкладке карты появятся после её появления.' },
    ],
  },
  {
    badgeClass: 'roadmap-badge-long',
    badgeLabel: 'Global features',
    heading: 'Big features for big update',
    items: [
      { text: 'Вкладка Players. Первоначально: сбор рекордов и топ игроков. Новые задачи по вкладке игроков появятся позже.' },
      { text: 'Опубликовать backend в open-source. Надо думать над безопасностью, документацией и гайдами.' },
    ],
  },
  {
    badgeClass: 'roadmap-badge-plan',
    badgeLabel: 'Planning',
    heading: 'Need to think about whether it can be canceled or changed.',
    items: [
      { text: 'Лидерборд кампании/папки (сумма таймов игроков по всем картам). trackmania.io не отдаёт готовый агрегированный лидерборд кампании — только per-map (и то не более ~15 записей на карту). Нужен свой кэш по каждой карте с оглядкой на рейт-лимит trackmania.io — требует отдельного дизайна.' },
      { text: 'Бинго. Оценить сложность и целесообразность.' },
      { text: 'Различные интеграции с ботами. Оценить сложность и целесообразность.' },
      { text: 'Социальный контент. Комментарии, подписки на авторов и так далее. Развить и оценить сложность и целесообразность.' },
      { text: 'Какая-нибудь статистика. Онлайн за сегодня, last-seen пользователей, и так далее.' },
    ],
  },
];
</script>

<template>
  <div id="roadmap-root">
    <h1 class="page-title roadmap-title">Roadmap</h1>
    <p class="subtitle">Планы развития сайта, по приоритету.</p>

    <section v-for="group in GROUPS" :key="group.badgeLabel" class="roadmap-group">
      <h2 class="roadmap-heading">
        <span class="roadmap-badge" :class="group.badgeClass">{{ group.badgeLabel }}</span>
        <span class="roadmap-heading-text">{{ group.heading }}</span>
      </h2>
      <ul class="roadmap-list">
        <li v-for="item in group.items" :key="item.text" class="roadmap-item muted">
          {{ item.text }}
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
#roadmap-root {
  max-width: 720px;
  margin: 0 auto;
}

.roadmap-title {
  text-align: center;
}

.roadmap-group {
  margin: 32px 0 0 0;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  background-color: var(--color-overlay-2);
  overflow: hidden;
}

.roadmap-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 14px 18px;
  color: var(--color-text-bright);
  font-size: 1.05rem;
  font-weight: normal;
  border-bottom: 1px solid var(--color-border-subtle);
}

.roadmap-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: bold;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  flex-shrink: 0;
  color: #fff;
}

.roadmap-badge-short { background-color: var(--color-badge-short); }
.roadmap-badge-mid   { background-color: var(--color-badge-mid); }
.roadmap-badge-long  { background-color: var(--color-badge-long); }
.roadmap-badge-plan  { background-color: var(--color-badge-plan); }

.roadmap-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.roadmap-item {
  position: relative;
  padding: 12px 18px 12px 36px;
  color: var(--color-text);
  font-size: 0.95rem;
  line-height: 1.45;
  border-bottom: 1px solid var(--color-border-hairline);
}

.roadmap-item:last-child {
  border-bottom: none;
}

.roadmap-item::before {
  content: "○";
  position: absolute;
  left: 16px;
  color: var(--color-text-faint);
  font-size: 0.85rem;
}

.roadmap-item.muted {
  color: var(--color-text-faint);
  font-style: italic;
}

.roadmap-item.muted::before {
  content: "–";
  color: var(--color-text-faintest);
}
</style>

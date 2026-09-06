# Client (Vue 3 + Vite)

SPA ditchfest-сайта: галерея знаков, Sign Studio, каталог карт с голосованием,
топы, тирлисты, онбординг, админка.

```bash
npm install
npm run dev      # :5173, проксирует /api и /auth на Express :3000 (см. vite.config.js)
npm run build    # прод-сборка в dist/
npm run preview  # локально посмотреть собранный dist (без API)
```

Структура:

- `src/styles/tokens.css` — дизайн-токены: цвета, радиусы, тени, шрифты,
  z-слои (`--z-*`), длительности transition (`--transition-*`). Новые значения
  цветов — сюда; производные прозрачности — через
  `color-mix(in srgb, var(--token) N%, transparent)`.
- `src/styles/base.css` — reset + кросc-страничные классы (`.auth-btn`,
  `.filter-btn`, `.icon-btn`, `.vote-btn`, `.back-link`, `.map-thumb`,
  admin-набор, `.parallax-hero`, `:focus-visible`).
- `src/components/` — переиспользуемые блоки; `src/views/` — страницы
  (маршруты в `src/router/index.js`).
- `src/utils/parallax.js` — `useParallax()`: дрейф hero-фонов по курсору
  (`--hero-x/--hero-y` + класс `.parallax-hero`).

Правило стилей: токен → общий класс из base.css → и только потом
`<style scoped>` компонента. Подробности — в [CLAUDE.md](../CLAUDE.md).

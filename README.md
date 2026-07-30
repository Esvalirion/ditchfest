# Ditchfest Signs

Сайт сообщества **Ditchfest** — Trackmania-ивента, где мапперы делают карты на
общую тему, а сообщество голосует за них и следит за топами. Живой прод:
**https://df.esvalirion.tech** (зеркало — **https://ditchfest.su**, тот же
сервер и та же БД, оба домена смотрят в один Docker-контейнер).

Галерея «знаков» (шаблонов для соцсетей), голосование за карты, страница
каждой карты со ссылками на trackmania.io/Trackmania Exchange и топ-5 таймов,
топ мапперов, достижения, онбординг новичков, каталог карт синкается напрямую
с [trackmania.io](https://trackmania.io). Админка (`/admin`) — управление
списком админов и объединением аккаунтов, плюс `/admin/campaigns`: доска
кампаний-«папок» с drag-n-drop (тема, переименование, скрытие, кастомные
папки без реальной Nadeo-кампании, перенос карт между кампаниями, ручная
сортировка) — нужна, когда на один Ditchfest-эдишен приходится больше 25 карт
(лимит Nadeo на кампанию) и его приходится дробить на несколько реальных
кампаний на trackmania.io.

## Стек

| | |
|---|---|
| Фронтенд | Vue 3 + Pinia + vue-router + Vite — `client/` |
| Бэкенд | Express 5 + PostgreSQL, CommonJS — `server/` |
| Деплой | Docker (multi-stage) + GitHub Actions → GHCR → VPS |

Один Express-процесс отдаёт и API, и собранный клиент (`server/public` после
сборки) — нет отдельного фронтенд-хостинга и отдельного бэкенд-сервиса.

Подробности архитектуры, переменные окружения, известные грабли — в
[CLAUDE.md](CLAUDE.md).

## Локальный запуск

```bash
# Postgres — своя база, схема (по порядку, все идемпотентны):
psql -d postgres -f server/db/001_create_databases.sql
psql -d postgres -f server/db/002_schema.sql
psql -d postgres -f server/db/003_campaign_overrides.sql
psql -d postgres -f server/db/004_campaign_folders.sql
psql -d postgres -f server/db/005_campaign_sort_order.sql

# Бэкенд
cd server
cp .env.example .env   # заполнить TM_CLIENT_ID/SECRET, DATABASE_URL и т.д.
npm install

# Фронтенд
cd ../client
npm install
```

Дальше — либо руками в двух терминалах (`cd server && npm run dev` — :3000,
`cd client && npm run dev` — :5173, проксирует `/api` и `/auth` на :3000),
либо одной командой из корня репозитория: `./scripts/dev.sh` (поднимает оба,
`Ctrl+C` гасит оба).

Открыть `http://localhost:5173`.

## Деплой

```bash
docker build -t ditchfest-signs .
docker compose up -d    # ожидает внешнюю сеть tm-network и .env в корне
```

Пуш в `main` собирает образ и пушит его в GHCR (`.github/workflows/deploy.yml`);
докатка на VPS — через секреты `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY`/`VPS_PATH`.

## Каталог карт

`editions`/`maps` не вводятся руками — раз в 30 минут (`server/services/sync.js`,
cron `7,37 * * * *`) сайт сам подтягивает клубную папку Ditchfest с
trackmania.io. Ручной триггер — `POST /api/sync` с заголовком `X-Sync-Secret`.

## Контрибьютить

- Взять страницу/фичу, поднять `client/`+`server/` локально, открыть PR.
- Бэкенд намеренно сверен с реальным контрактом API — не менять формы
  ответов без крайней необходимости, старый фронтенд (если где-то ещё жив)
  на это рассчитывает.
- Вопросы — в Discord: [Ditchfest (EN)](https://discord.gg/VWaTmrXmh5),
  [Trackmania Russian Community (RU)](https://discord.gg/TaPZBp7mTS).

## Credits

onrd.., Soba, Rezzn, DamnedLight

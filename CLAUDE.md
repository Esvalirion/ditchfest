# Ditchfest Signs

Vue 3 + Express/Postgres site for Ditchfest, a Trackmania mapping event.
Прод: https://df.esvalirion.tech (позже — зеркало на `ditchfest.su`, см.
плановый перенос в конце файла). Один Docker-образ отдаёт и API, и клиент —
`server/` в проде раздаёт собранный `client/dist` как статику.

Бэкенд — не оригинальный: он **переписан с нуля на Express/Postgres**, сверен
построчно с реальным `tm-votes` (закрытый Cloudflare Worker + D1, лежит вне
этого репозитория) так, чтобы API-контракт и бизнес-правила совпадали.
Расхождения с оригиналом ниже помечены явно — это не баги, а осознанные
решения при переносе.

## Стек

| Слой | Технологии |
|---|---|
| `client/` | Vue 3 + Pinia + vue-router + Vite, ESM, SFC |
| `server/` | Node, Express 5, `pg`, CommonJS (`require`) |
| БД | PostgreSQL — своя `ditchfest_db`, может жить в общем Postgres-контейнере с другими проектами |
| Деплой | Docker multi-stage → GHCR → VPS, GitHub Actions |

## Как устроена страница/запрос

Один SPA вместо кучи HTML-файлов: `client/src/router/index.js` — маршруты,
`App.vue` — шапка/футер/оверлеи + `<RouterView/>`. `main.js` создаёт Pinia и
**обязательно** вызывает `useSessionStore().consumeRedirect()` до `app.mount()`
— так весь остальной код видит уже готовую сессию (JWT из `#tm_token=` в URL).

В dev клиент и сервер — два процесса: `vite dev` (:5173) проксирует `/api` и
`/auth` на Express (:3000), см. `client/vite.config.js`. В проде один процесс:
`server/app.js` отдаёт API и `express.static(server/public)` с fallback на
`index.html` для клиентских маршрутов.

## Карта модулей (`server/`)

| Файл | Зона ответственности |
|---|---|
| `routes/auth.js` | OAuth-флоу с api.trackmania.com (`/auth/login`, `/auth/callback`) |
| `routes/editions.js`, `votes.js` | каталог, голосование, кто проголосовал |
| `routes/mapper.js` | публичная страница аккаунта (`/api/mapper`), `/api/me` |
| `routes/mappers.js` | топ мапперов |
| `routes/onboarding.js` | пошаговое голосование новичка |
| `routes/admins.js`, `links.js` | список админов, объединение аккаунтов |
| `routes/sync.js` | ручной триггер синка каталога |
| `middleware/auth.js` | Bearer JWT → `req.accountId`, `isAdmin()`, `first_login`-грант на каждый валидный токен |
| `services/jwt.js` | подпись/проверка сессионного токена (HS256) |
| `services/links.js` | объединение аккаунтов: `canon()` — SQL-фрагмент identity-резолва, `groupMembers`/`groupAlts` |
| `services/achievements.js` | каталог ачивок + `earnedFromStats()` |
| `services/grants.js` | выдача статистических ачивок (`refreshAccount`, `refreshEveryone`) |
| `services/sync.js`, `tmio.js`, `catalog.js` | синк каталога с trackmania.io каждые 30 мин |
| `services/names.js` | accountId → ник через TM OAuth (client credentials) |
| `db.js` | `pg.Pool`, `DATABASE_URL` |

Правило: роут парсит запрос и формирует ответ, домен-специфичные SQL-запросы —
в соответствующем `services/*.js`, доменные решения (что считается
достижением) — в `achievements.js`. Новый роут = новый файл в `routes/` +
строка в `routes/index.js`.

## Ключевые переменные (`server/.env`, см. `.env.example`)

- `TM_CLIENT_ID`/`TM_CLIENT_SECRET` — TM OAuth-приложение (api.trackmania.com).
  **Сейчас переиспользуется приложение проекта COTD** (`42cf3d7ca92aadc403df`)
  — не своё; у оригинального `tm-votes` было отдельное. Redirect URI
  регистрируется в кабинете api.trackmania.com отдельной строкой на каждый
  домен, где крутится сайт.
- `TM_FRONTEND_URL` — куда редиректить после логина (не путать с redirect_uri
  самого OAuth — тот собирается динамически из запроса в `routes/auth.js`,
  чтобы работать на нескольких доменах без правки конфига).
- `JWT_SECRET` — свой, не переиспользовать секрет другого проекта.
- `ROOT_ADMIN_ID` — один accountId, всегда админ, не хранится в таблице
  `admins` и не может быть удалён через `/api/admins/remove`.
- `TM_CLUB_ID=52818`, `TM_FOLDER_ID=829200` — клуб/папка Ditchfest на
  trackmania.io, реальные значения из оригинального `tm-votes`.
- `SYNC_SECRET` — заголовок `X-Sync-Secret` для ручного `POST /api/sync`.

## Объединение аккаунтов (`services/links.js`)

Несколько Ubisoft-аккаунтов — один человек. Ничего не мержится в хранилище:
голос остаётся на аккаунте, которым он отдан, карта — на реальном авторе.
Все агрегаты (счётчик голосов, топ мапперов, ачивки) резолвят аккаунт в
идентичность **на чтении** через SQL-фрагмент `canon(col)` — не забывать
оборачивать `account_id`/`author_account_id` в `canon()` в новых запросах,
иначе привязанные аккаунты будут считаться отдельно.

## Достижения

Каталог — в коде (`services/achievements.js`), в БД только `code`.
**Код ачивки, который уже отгружен, нельзя переименовывать** — на него
ссылаются реальные строки в таблице `achievements`. Два вида:
- событийные — `grantAchievement()` в месте, где происходят (`first_login` —
  `middleware/auth.js`, `onboarding_complete` — `routes/onboarding.js`);
- статистические — правило в `earnedFromStats()`, выдаёт `grants.js`:
  `refreshAccount()` при заходе на страницу аккаунта/после голоса,
  `refreshEveryone()` — из каждого прогона синка каталога (ловит «был в
  топ-10» и для тех, чью страницу никто не открывает).

## Синк каталога (`services/sync.js`)

`editions`/`maps` не вводятся руками — cron (`node-cron`, `7,37 * * * *` в
`server.js`, та же частота, что была в оригинальном Worker-триггере) тянет
клубную папку Ditchfest с trackmania.io и складывает в Postgres.
`POST /api/sync` с `X-Sync-Secret` — ручной прогон для теста/бэкфилла.

**Грабли: у trackmania.io мягкий рейт-лимит (~2 req/s).** Ручные повторные
прогоны подряд (чаще раз в минуту) словят `sync_failed` — это не баг кода,
подождать хотя бы 60 секунд между ручными прогонами.

## Известные грабли

- **`app.set('trust proxy', 1)` в `app.js` обязателен.** Без него
  `req.protocol` всегда `'http'` за nginx, и `redirectUri()` в
  `routes/auth.js` соберёт `http://` вместо `https://` — TM OAuth отклонит
  как redirect_uri mismatch.
- **Cloudflare в режиме Flexible** (проверено на проде): коннект
  Cloudflare→origin идёт по HTTP, значит nginx-`$scheme` для этого
  соединения — всегда `http`, даже если реальный посетитель зашёл по
  `https`. `proxy_set_header X-Forwarded-Proto` должен быть захардкожен в
  `https`, а не `$scheme` — иначе та же ошибка redirect_uri, что и выше.
- **Не форсить редирект HTTP→HTTPS в nginx** (`certbot --redirect` это
  делает по умолчанию) при Cloudflare Flexible — получится редирект-луп
  через Cloudflare. Один server-блок на оба порта, без forced redirect —
  см. рабочий конфиг у COTD на том же VPS.
- Нет таблицы `accounts` — намеренно, как в оригинале. Имена резолвятся
  живьём через `services/names.js` (тот же TM OAuth client credentials, что
  и логин) и денормализуются на `maps.author_name`/`admins.display_name`.
- Ачивки/линковка написаны под Postgres, но структурно 1:1 с D1-оригиналом
  — если когда-нибудь появится доступ к реальным данным `tm-votes`, миграция
  голосов возможна через публичное API (`/api/editions` +
  `/api/map-voters?mapUid=`), не обязательно через экспорт D1.

## Как проверять изменения

- `cd server && npm run dev` (:3000) + `cd client && npm run dev` (:5173).
- `server/db/seed.js` — фикстуры для локального теста без реального
  trackmania.io/Postgres прод-данных.
- Перед пушем: `node --check` на изменённые файлы сервера (нет TS/линтера),
  `npm run build` в `client/` должен проходить чисто.

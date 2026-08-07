# Ditchfest Signs

Vue 3 + Express/Postgres site for Ditchfest, a Trackmania mapping event.
Прод: https://df.esvalirion.tech, зеркало — https://ditchfest.su (тот же
VPS/контейнер/БД, второй домен просто добавлен в `server_name` того же
nginx-блока — см. `redirectUri()`/`frontendBase()` в `routes/auth.js`, они
берут домен из запроса, а не из конфига, ровно чтобы работать на нескольких
доменах сразу). Один Docker-образ отдаёт и API, и клиент — `server/` в проде
раздаёт собранный `client/dist` как статику.

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
| `routes/campaigns.js` | admin-only управление кампаниями-«папками» (`/admin/campaigns`): тема, переименование, скрытие, создание кастомных папок, перенос карт между кампаниями, ручная сортировка |
| `routes/map.js` | страница одной карты (`/api/map/:uid`): ссылки на trackmania.io/TMX, топ-5 таймов, рейтинг |
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
| `services/sync.js`, `tmio.js`, `catalog.js` | синк каталога с trackmania.io каждые 30 мин; `tmio.js` также отдаёт топ-5 таймов карты для `routes/map.js` |
| `services/tmx.js` | поиск карты на Trackmania Exchange по `map_uid` + её стиль/теги (StyleName + раскрытие числовых ID тегов через кешируемую таблицу `/api/meta/tags`) — best-effort, не все карты там есть |
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

## Стили карт с TMX (`services/tmx.js`, `services/editions.js`, `routes/map.js`)

Под подписью автора карты (`by …`) рисуются маленькие цветные теги стилей
(компонент `client/src/components/StyleTags.vue`) — во всех трёх местах:
каталог/голосование (`MapRow`), onboarding и страница одной карты. Источник —
TMX. Не все Ditchfest-карты там выложены (многие — Discord-only мемы), и это
**нормальный сценарий**: для подтверждённо отсутствующей на TMX карты рисуется
одна серая карточка «Not on TMX».

TMX API хранит стиль и теги по-разному, и это важно при правках:
- `StyleName` — читаемая строка (`"SpeedMapping"`, `"Tech"`…).
- `Tags` — **числовые ID через запятую** (`"60,12,1"`), НЕ названия. ID→название
  (и цвет) берутся с `/api/meta/tags`, таблица из ~70 тегов; кешируется
  in-process на 24ч (`getTagsTable` в `services/tmx.js`), чтобы не дёргать на
  каждую карту. При сбое TMX таблица остаётся пустой → теги просто не
  раскроются, стиль всё равно покажется.

Чтобы каталог не делал N TMX-запросов на каждый просмотр страницы, стили
**кешируются в БД** (колонки `maps.tmx_style` / `tmx_tags` / `tmx_styles_updated_at`,
миграция `007_map_styles.sql`) — их заполняет тот же прогон синка:
`services/sync.js` ротационно refreshing по `MAX_TMX_STYLES_PER_RUN` (12) карт
за прогон через `getMapsMissingTmxStyles()` (наименее свежие / вообще не
проверенные). `tmx_tags` хранится **сырой строкой ID** (`"60,12,1"`), а не
раскрытыми названиями — так обновление таблицы тегов потом переразрешит имена
без нового TMX-фетча.

Семантика `tmx_styles_updated_at`: заполненная дата с пустыми `tmx_style` И
`tmx_tags` = «подтверждённо не на TMX» — синк её не переспрашивает каждый
прогон (только когда протухнет, 30 дней). При сетевой ошибке TMX таймстемп **не
трогается**, чтобы карта попала на повтор в следующем прогоне. `upsertMap` в
`catalog.js` эти колонки намеренно не пишет — ими управляет только
`updateMapTmxStyles()`, иначе каждый прогон синка обнулял бы стили у карт не из
текущего батча.

Каталог (`services/editions.js` `getEditions()`) раскрывает ID тегов в
`{name,color}` одним вызовом `getTagsTable` на весь каталог и отдаёт в каждой
карте `style`/`tags`/`onTmx`. Страница одной карты (`routes/map.js`) берёт стили
из live-lookup (TMX там и так дёргается на каждый запрос) с fallback на
сохранённые в БД колонки — транзитный сбой TMX не обнуляет теги. `onTmx: false`
только при подтверждённом отсутствии (live null или синк-таймстемп + пустые
колонки); для ещё не проверенной карты `onTmx: true`, и «Not on TMX» не
рисуется.

**Совместимость с неприменённой миграцией 007.** Оба SELECT'а, которые читают
`tmx_*` (`getEditions` и `/api/map/:uid`), сначала идут с style-колонками, а при
ошибке Postgres `42703` (undefined_column — миграция 007 ещё не наложена)
молча повторяют тот же запрос без них и работают дальше, просто без тегов
стилей. Сделано, чтобы деплой кода мог опережать деплой миграции на проде; как
только 007 применена везде — этот fallback мёртвый код. Сами style-колонки
пишет только синк (`services/catalog.js` `updateMapTmxStyles`/
`getMapsMissingTmxStyles`), и его TMX-свип обёрнут в try/catch — без 007 он
логирует ошибку каждый прогон, но синк не ломает.

## Кампании-«папки» и переопределения (`routes/campaigns.js`, `services/editions.js`)

Nadeo ограничивает кампанию 25 картами; когда в эдишене карт больше, его
приходится дробить на несколько реальных кампаний на trackmania.io — синк
заводит их как отдельные, формально не связанные строки в `editions`.
Чтобы админ мог показать это на сайте одним целым (и вообще управлять
подписью/видимостью кампании), у `editions`/`maps` есть отдельный слой
admin-редактируемых колонок, которые `services/sync.js`/`services/catalog.js`
**никогда не пишут** — правило то же, что и у `admins`/`account_links`: синк
не должен затирать ручные правки при следующем прогоне.

- `editions.theme`, `editions.display_name`, `editions.hidden` —
  публичная тема, переименование (не трогая синкнутое `name`), скрытие с
  сайта независимо от того, есть ли карты.
- `editions.sort_order` — ручной порядок колонок/эдишенов; `NULL` (по
  умолчанию) — сортировка как раньше, по `campaign_id`/новизне карт внутри.
- `maps.display_campaign_id` — карта показывается под другой кампанией, чем
  её реальная синкнутая `campaign_id` (перенос между «папками» на
  `/admin/campaigns`, drag-n-drop или кнопка «Return»).
- Кастомная «папка» без реальной Nadeo-кампании — `editions` с отрицательным
  `campaign_id` (`editions_virtual_id_seq`); реальные id у Nadeo всегда
  положительные, коллизий не будет.

`services/editions.js`'s `getEditions()` — единственное место, которое читает
все эти колонки и решает, что реально показать (эффективная кампания карты =
`COALESCE(display_campaign_id, campaign_id)`, эффективное имя = `COALESCE(
display_name, name)`, пустые и `hidden` эдишены отбрасываются) — используется
и `routes/editions.js`, и `routes/onboarding.js`, так что обе страницы всегда
видят один и тот же каталог.

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
- `routes/map.js` дёргает trackmania.io и trackmania.exchange напрямую (не
  через `services/sync.js`), на каждый запрос страницы карты — оба вызова
  обёрнуты в `try/catch` и best-effort: сбой одного не валит страницу, просто
  `leaderboard: []` / `tmxUrl: null`.
- **Пост-логин редирект в проде берётся из самого запроса, не из
  `TM_FRONTEND_URL`.** `routes/auth.js`'s `frontendBase()` проверяет
  `req.app.locals.servesClient` (true в проде, где `server/public` реально
  раздаётся) — если true, редиректит на `req.protocol`/`req.get('host')`, а
  не на статичный `TM_FRONTEND_URL`. Без этого залогинившийся с ditchfest.su
  после OAuth улетал бы на df.esvalirion.tech (или наоборот, смотря что
  прописано в `.env`) — так уже было один раз, когда мирроринг только
  добавили. В dev (raw `TM_FRONTEND_URL=http://localhost:5173`,
  `servesClient` = false) поведение не изменилось.

## Как проверять изменения

- `cd server && npm run dev` (:3000) + `cd client && npm run dev` (:5173) —
  или одной командой из корня: `./scripts/dev.sh` (поднимает оба, `Ctrl+C`
  гасит оба).
- `server/db/seed.js` — фикстуры для локального теста без реального
  trackmania.io/Postgres прод-данных.
- Перед пушем: `node --check` на изменённые файлы сервера (нет TS/линтера),
  `npm run build` в `client/` должен проходить чисто.
- Новые SQL-миграции — идемпотентные файлы `server/db/00N_*.sql` (как
  `002_schema.sql`), применяются вручную через `psql` (нет раннера
  миграций) — и локально, и на проде (`docker exec` в контейнер
  `tm-postgres` на VPS).

# План переписывания фронтенда

**Статус: фронтенд перенесён.** Все 8 страниц из списка ниже уже переехали в
`client/` (Vue 3 + Pinia + Vite + vue-router), `npm run build` в `client/`
проходит чисто, все маршруты проверены. Старые `*.html`/`css/`/`js/` в корне
репозитория пока оставлены рядом как референс — их можно убрать отдельным PR,
когда `client/` окончательно заменит их в деплое. Единственное, что ещё не
перенесено — бэкенд (см. «Как помочь» внизу).

Изначальная цель была: переписать фронтенд на Vue 3 + Pinia + Vite, сохранив
тот же визуал и тот же API-контракт с бэкендом. Этот документ по-прежнему
описывает, куда что переехало — полезно и для контекста, и для тех, кто
захочет помочь с оставшимся бэкендом.

## Целевой стек

- **Vue 3 + Pinia + vue-router + Vite** вместо вручную написанного DOM-кода
  на каждой странице.
- Один SPA вместо 8 отдельных HTML-файлов — маршрутизация через `vue-router`.
- Бэкенд (Cloudflare Worker `tm-votes`) не трогаем в рамках этой задачи —
  меняется только то, как фронт вызывает `/api/*`, а не сам API. Кто хочет
  помочь с бэкендом — пишите в Discord, это отдельный (пока закрытый)
  репозиторий.

## Структура `client/` (как есть сейчас)

```
client/
  index.html
  vite.config.js
  public/                 — Signs/, res/ (перенесены из корня как есть)
  src/
    main.js                — createApp + createPinia + router + consumeRedirect() + mount
    App.vue                — NavBar + AuthWidget + логотип + <RouterView/> + SiteFooter
                              + два singleton-оверлея (превью карты, попап голосовавших)
    config.js               — WORKER_URL
    router/index.js         — маршруты вместо 8 HTML-файлов; /mapper/:id вместо ?id=
    stores/
      session.js             — замена core.js: getUser/login/logout/sessionExpired,
                                JWT в localStorage, consumeRedirect()
    utils/
      api.js                  — обёртка над fetch (как tm.api сейчас), throws со .status
      mapPreview.js            — floating-превью карты по ховеру (общее для Mapper/Voting)
      votersPopover.js          — попап «кто проголосовал» по ховеру, с кэшем
    data/
      signs.js                 — 80 записей галереи (было захардкожено в index.html)
    styles/
      tokens.css, base.css      — см. «Как делить CSS»
    components/
      NavBar.vue, AuthWidget.vue, SiteFooter.vue, ParallaxBackground.vue — из layout.js/background.js
      AchievementGrid.vue, AchievementCard.vue        — из achievements.js
      MapRow.vue                                       — общая строка карты (mapper.js + voting.js
                                                          дублировали её один в один — теперь один компонент)
      MapPreviewOverlay.vue, VotersPopoverOverlay.vue  — рендерят состояние из utils/*.js,
                                                          монтируются один раз в App.vue
    views/
      SignsView.vue           — index.html + script.js
      VotingView.vue          — voting.html + voting.js
      OnboardingView.vue      — onboarding.html + onboarding.js
      MapperView.vue          — mapper.html + mapper.js (:id из route params)
      TopMappersView.vue      — top-mappers.html + mappers.js
      TopPlayersView.vue      — top-players.html (был и остаётся заглушкой)
      AdminView.vue           — admin.html + admin.js
      RoadmapView.vue         — roadmap.html
  package.json
```

## Соответствие старых файлов новым

| Сейчас | Станет |
|---|---|
| `js/core.js` | `stores/session.js` (Pinia) + `utils/api.js` |
| `js/layout.js` | `App.vue` + `NavBar.vue` + `AuthWidget.vue` + `SiteFooter.vue` |
| `js/achievements.js` | `AchievementGrid.vue` / `AchievementCard.vue` |
| `js/background.js` | `ParallaxBackground.vue` (или composable `useParallax()`) |
| `css/style.css` | разбирается сразу по-нормальному — см. «Как делить CSS» ниже, а не тащится единым файлом «на потом» |

## Как делить CSS

`css/style.css` сейчас — один файл, поделённый комментариями-секциями
(`/* --- ... --- */`) на смысловые блоки. Каждая секция и есть будущий
компонент/view — при переносе страницы (Фаза «Порядок переноса страниц»
ниже) её CSS-секция сразу переезжает вместе с разметкой, а не остаётся в
общем файле «на потом»:

```
client/src/
  styles/
    tokens.css      — CSS custom properties: цвета, шрифты, отступы, брейкпоинты
                       (то, что в style.css сейчас захардкожено по разным местам)
    base.css         — reset + действительно глобальное: body, типографика,
                        общие ссылки/скроллбары — то, что нельзя отнести
                        к конкретному компоненту
  App.vue            — импортирует tokens.css + base.css один раз в main.js
  components/*.vue   — <style scoped> — своя секция из старого style.css,
                        переписанная на переменные из tokens.css
  views/*.vue         — то же самое для стилей, специфичных для страницы целиком
```

Правило: когда переносите страницу или компонент — сразу вырезаете его
секцию из `style.css` и кладёте в `<style scoped>` этого файла, заменяя
захардкоженные цвета/отступы на `var(--...)` из `tokens.css`. Общий
`style.css` не копируется в новый проект целиком ни на каком этапе — только
`tokens.css`/`base.css` с нуля плюс то, что уже разобрано по компонентам. Так
на любой момент миграции нет висящего «legacy» CSS-файла, который непонятно
кому принадлежит.

## Реальный API-контракт (менять нельзя, только вызывать иначе)

Это то, что фронт уже сегодня зовёт через `tm.api()` — после переписывания
эти же эндпоинты вызываются из Pinia-стора/компонентов, но формат запросов
и ответов не меняется:

| Метод | Путь | Кто вызывает сейчас |
|---|---|---|
| GET | `/api/editions` | voting.js |
| POST | `/api/vote` `{ mapUid, value }` | onboarding.js, mapper.js, voting.js |
| GET | `/api/mapper?id=<accountId>` | mapper.js |
| GET | `/api/map-voters?mapUid=<uid>` | mapper.js, voting.js |
| GET | `/api/me` | mapper.js |
| GET | `/api/results/mappers` | mappers.js |
| GET | `/api/onboarding` | onboarding.js |
| POST | `/api/onboarding/step` | onboarding.js |
| GET | `/api/admins` | admin.js |
| POST | `/api/admins` `{ accountId }` | admin.js |
| POST | `/api/admins/remove` | admin.js |
| — | `WORKER_URL + '/auth/login'` (редирект) | core.js |

Ачивки отдельного эндпоинта не имеют — приходят вложенными в ответы
`/api/mapper` и `/api/onboarding/step`.

## Порядок переноса страниц — сделано

Перенесены и проверены (`npm run build` + все маршруты отдают 200) в этом
порядке, от простой к сложной:

1. ✅ `roadmap.html` → `RoadmapView.vue` — статический контент.
2. ✅ `top-players.html` → `TopPlayersView.vue` — заглушкой и остаётся.
3. ✅ `top-mappers.html` + `mappers.js` → `TopMappersView.vue`.
4. ✅ `index.html` + `script.js` → `SignsView.vue` — фильтры на
   `data-type`/`data-filter` теперь реактивное состояние компонента вместо
   `querySelectorAll` + toggle классов; список из 80 картинок вынесен в
   `data/signs.js`.
5. ✅ `mapper.html` + `mapper.js` → `MapperView.vue` (`:id` — route param
   вместо `tm.param('id')`).
6. ✅ `voting.html` + `voting.js` → `VotingView.vue`. По пути обнаружилось,
   что «строка карты» (превью по ховеру, попап голосовавших, кнопка «+») в
   исходниках дословно дублировалась между `mapper.js` и `voting.js` (в коде
   даже есть комментарий об этом) — вынесено в общий `MapRow.vue` +
   `utils/mapPreview.js`/`utils/votersPopover.js`, `MapperView.vue`
   отрефакторен на него же.
7. ✅ `onboarding.html` + `onboarding.js` → `OnboardingView.vue` — шаговая
   логика (экраны signin/loading/step/finish), прогресс хранится на сервере.
8. ✅ `admin.html` + `admin.js` → `AdminView.vue`.

Старые `*.html`/`css/`/`js/` в корне репозитория остаются нетронутыми до тех
пор, пока `client/` не проверен вживую (см. «Как помочь») — ничего не
отключалось по пути.

## Что не меняется

- Общая идея «фронт полностью зависит от JS, кроме галереи на главной» — остаётся.
- Только относительные пути в ссылках/ассетах — сайт должен продолжать
  работать и на `*.github.io`, и на кастомном домене.
- Все обращения к бэкенду — только через обёртку над `fetch` (сейчас
  `tm.api()`, после переезда — `utils/api.js`), голых `fetch()` в компонентах
  быть не должно.

## Как помочь

Перенос страниц закончен — дальше полезнее всего:

- **Живая проверка против реального Worker'а.** Сборка и роутинг проверены
  локально, но не против настоящих ответов `tm-votes` (нет доступа из этой
  сессии) — если запускаете `client/` у себя с рабочим логином, багрепорты
  по несовпадению с прежним поведением страниц очень welcome.
- **Убрать старые файлы.** Когда кто-то подтвердит, что `client/` работает
  как боевая замена — снести `*.html`, `css/`, `js/` из корня и настроить
  деплой (GitHub Pages или иначе) на `client/dist`.
- **Бэкенд.** Порт `tm-votes` на что-то более открытое — отдельная тема,
  пишите в Discord проекта, там разберёмся, что можно открыть, а что нет.

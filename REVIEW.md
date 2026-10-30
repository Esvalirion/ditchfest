# Ревью прода df.esvalirion.tech (2026-10-30)

Осмотр живого сайта: headless Chrome (1440 и 375 px), все маршруты, curl по API и заголовкам. Консоль чистая, битых картинок нет, горизонтального скролла нет, API отвечает за 0.07–0.4 с.

## Баги

1. **Длинные названия карт на мобиле залезают на кнопки.** `.map-name` это `RouterLink` (inline), а `text-overflow: ellipsis` у inline не работает (`client/src/styles/base.css:213`). На 375 px у `/mapper/:id` и `/missing-tmx` ссылка шириной 113 px торчит из `.map-info` шириной 79 px; на тач-экранах кнопки строки видны всегда, поэтому текст наезжает на них и обрезается краем без «…». Чинится `display: block` у `.map-name`.
2. **`/api/*` без маршрута отдаёт HTML с 200.** Catch-all `app.get('*path')` в `server/app.js` ловит и `/api/nonexistent`: клиент или плагин получит index.html вместо JSON 404. Нужен `app.use('/api', (req,res)=>res.status(404).json(...))` до SPA-фолбэка.
3. **Нет страницы 404.** `/totally-unknown` показывает пустую страницу между шапкой и футером (HTTP 200). Нужен маршрут `/:pathMatch(.*)*` с «Страница не найдена» и ссылкой на главную.
4. **`robots.txt` и `sitemap.xml` отдают SPA-HTML.** Поисковики видят мусор. Положить `robots.txt` (и при желании sitemap по картам/мапперам) в `client/public`.

## Производительность

5. **`/maps` рендерит все 1963 карты сразу**: ~37 700 DOM-узлов, ~4 МБ трафика на мобиле, `/api/editions` весит 162 КБ. Картинки ленивые, но сам список тяжёлый. Варианты: сворачивать старые эдишены по умолчанию или виртуализировать список.
6. **Хешированные `/assets/*` кешируются 4 часа** (`max-age=14400`, это дефолт Cloudflare). Для файлов с хешем в имени нужно `Cache-Control: public, max-age=31536000, immutable` (`express.static` с `setHeaders` для `/assets`).
7. **`og-default.png` весит 977 КБ.** Для превью хватит ~100–200 КБ (JPEG/WebP 1200×630).

## Безопасность и инфраструктура

8. **`http://ditchfest.su` не редиректит на https** (200 по http). Включить в Cloudflare Always Use HTTPS (и HSTS) для зоны ditchfest.su.
9. **Нет защитных заголовков**: HSTS, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`. Плюс светится `X-Powered-By: Express` (`app.disable('x-powered-by')`). Проще всего поставить `helmet` (CSP осторожно: Umami, thumbnails Nadeo, canvas Studio).
10. **`www.ditchfest.su` не резолвится.** Если кто-то наберёт с www, сайт не откроется. Нужна DNS-запись и редирект на голый домен.

## Мелочи

11. **`<title>` почти везде «Ditchfest Signs»**: у `/signs`, `/studio`, `/top-*`, тирлистов, `/missing-tmx` нет своих заголовков. Заголовок маппера разный: сервер отдаёт «WalteN. — #1 of 93», после загрузки клиент ставит «Ditchfest WalteN.».
12. **Нет `<h1>`** на главной, `/signs`, `/studio`, `/maps`, `/top-*`, `/admin`.
13. **Мелкие тач-цели на мобиле**: в таблицах `/top-players` (204 элемента) и `/top-mappers` (95) заголовки-сортировки и ссылки ниже 24 px; на `/maps` 14 штук.
14. **У «#135» пустая тема**: ждёт админа в `/admin/campaigns`.

Не проверено: сценарии после логина (голосование, админка, Studio с сохранением), реальные мобильные браузеры.

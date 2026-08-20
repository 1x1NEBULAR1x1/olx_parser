# TODO

Объединённый TODO после миграции `frontend/` + `backend/` в единое Next.js
приложение. Пункты, которые уже решены миграцией (Prisma+SQLite, единый
процесс/порт, устранение CORS), убраны. Старые `backend/TODO.md` и
`frontend/TODO.md` слиты сюда перед удалением папок.

## Архитектура

- [x] **FSD-реструктуризация** — `components/`, `hooks/`, `store/`, `lib/` мигрированы в слои `shared/`, `entities/`, `features/`, `widgets/`, `views/` (алиас `@/pages/*`). `app/` — тонкий роутинг.
- [x] **server/ по слоям** — `repositories/`, `fetchers/`, `scan/`, `domain/`, `shared/`. Скрипты: `scripts/server-restructure.mjs`, `scripts/fix-server-imports.mjs`.
- [x] **Единый источник типов** — `src/shared/types/{domain,api-contracts}.ts`; `server/types.ts` и `shared/api/client.ts` — re-export.
- [x] **Рефакторинг pipeline** — `parts-chain.ts` (цепочка запчастей), `run-with-concurrency.ts` (пул воркеров).
- [x] **ESLint boundaries** — `eslint-plugin-boundaries` v7, `boundaries/dependencies` в `eslint.config.mjs`. `npm run lint` проходит.
- [x] **Сборка** — `npm run typecheck` + `npm run build` проходят после переименования `src/pages` → `src/views`.

## Проверено в среде с реальным доступом в интернет

- [x] **Полный прогон pipeline с реальной сетью** — подтверждено несколькими живыми прогонами (`OLX_MAX_PAGES`/`OLX_PAGE_LIMIT` уменьшались для скорости теста):
  - OLX GraphQL реально возвращает объявления (`fetchOlxListingsForStates`), причём для обоих состояний `damaged` и `used`;
  - Ceneo.pl в большинстве случаев всё же отдаёт анти-бот заглушку (см. ниже) — поэтому основным источником запчастей стал OLX (`olx-parts-fetcher.ts`);
  - `scan_manager` корректно завершает `ScanRun` (`status: "completed"`) с реальным `devices_count > 0` (проверено на 13-21 устройствах за прогон).
- [x] **Оптимизация скорости скана асинхронностью + индикатор прогресса в %** — живой прогон на дефолтных настройках (`OLX_MAX_PAGES=5`, `OLX_PAGE_LIMIT=40`, `OLX_STATE_FILTERS=damaged,used`, `PIPELINE_CONCURRENCY=8`): **449-454 устройства теперь анализируются за ~90-104 секунды** (было ~11 минут / 669 секунд на том же объёме до оптимизации — ускорение ~6-7×). Подробности архитектуры — в `INSTRUCTIONS.md` → "Паттерн concurrency-limiter" и "Параллелизация внутри одного объявления". Ключевые изменения:
  - `concurrency-limiter.ts` (новый) — заменил ad-hoc throttle в `ceneo-fetcher.ts`/`olx-parts-fetcher.ts` на настоящий пул с ограничением параллелизма (несколько запросов ОДНОВРЕМЕННО, а не строго по очереди) + `fetchWithTimeout` (8с таймаут защищает от зависаний на анти-бот страницах).
  - `fix-parser.ts` — `analyzeOlxListingWithFixScore` разделена на `extractOlxListingSignals` (текст/повреждения, обязательный последовательный шаг) и `lookupIfixitDeviceMatch` (iFixit, теперь запускается ПАРАЛЛЕЛЬНО с поиском запчастей, а не после него). Также добавлены лимитеры для запросов к iFixit и к страницам объявлений OLX.
  - `pipeline.ts` — `fetchPartsData` обрабатывает `damage_types` объявления параллельно (`Promise.all`), а не последовательно; `runWithConcurrency` переписан с "фиксированных батчей" на пул воркеров со скользящим окном (не ждёт "хвост" батча из-за одного медленного элемента).
  - `PIPELINE_CONCURRENCY` — дефолт поднят с 2-3 до 8 (внутренняя работа на объявление лучше параллелится, реальные лимиты теперь на уровне лимитеров конкретных источников).
  - `ScanRun` (Prisma) — поля `stage`/`total_listings`/`processed_listings`; веса: `fetching_listings` 0-5%, `analyzing` 5-85%, `finalizing` 85-95%, `saving` 95-99%, `completed` 100%. Стадия `finalizing` — медианы/рентабельность после анализа всех объявлений (раньше UI зависал на ~95% с текстом «456/457»). Таймаут на объявление: `LISTING_ANALYZE_TIMEOUT_MS` (дефолт 90с). Кэш сортировки в `getLatestDevicesPage` ускоряет чанковую подгрузку `/api/devices`.
  - **Известный нюанс:** OLX может вернуть `403`, если запускать сканы подряд без паузы (проверено живьём — второй скан через 20с после первого упал с `HTTP 403`, обработка ошибки сработала штатно — `ScanRun.status: "failed"`). Не баг оптимизации, это анти-бот реакция самого OLX на слишком частые полные сканы с одного IP.

## Известные ограничения / нюансы

### scan-manager в dev-режиме (см. INSTRUCTIONS.md → "Паттерн scan-manager")
Исправлено: `is_scanning` теперь вычисляется как OR(in-memory флаг, `ScanRun.status === "running"` в БД) — см. `isScanningEffective()` в `src/server/scan-manager.ts`, используется в `/api/scan/start` и `/api/devices`. Это устраняет расслоение модуля между `instrumentation.ts` и Route Handlers, т.к. БД — общий источник истины независимо от инстанса модуля.

Остаточный нюанс: ~~между записью `createScanRun()` и реальным стартом long-running fetch есть небольшое окно~~ — **исправлено (волна 1):** `ScanCoordinator` (cron lock) + `expireStaleScanRuns()` watchdog (`SCAN_STALE_TIMEOUT_MINUTES`, дефолт 90). На проде после деплоя выполнить `npx prisma migrate deploy`.

### Источники цен на запчасти (Allegro → OLX → parts-store → Ceneo → статика)
- **Allegro (`allegro-parts-fetcher.ts`) — первичный источник.** Цепочка: REST API (`allegro-api-client.ts`, если приложение верифицировано) → HTML-парсинг `__listing_StoreState` → Scrapfly (`SCRAPFLY_API_KEY`, опционально) → пустой результат. Без верификации API и без Scrapfly на многих IP срабатывает DataDome — тогда fallback на OLX.
- **Allegro REST API — проверено живьём, недоступен без верификации приложения.** `POST /auth/oauth/token` (client_credentials) успешно выдаёт токен, но `GET /offers/listing` возвращает `403`. С 2025-2026 Allegro приостановил выдачу верификации новым приложениям. Ключи: `ALLEGRO_CLIENT_ID`/`ALLEGRO_CLIENT_SECRET` в `.env`.
- **OLX ("Części do telefonów", `olx-parts-fetcher.ts`) — вторичный источник.** Медианный фильтр цен (`parts-shared.ts#filterPartsByMedianPrice`) отсекает нереалистично дешёвые выбросы (экран за 27 zł).
- **parts-store.pl (`parts-store-fetcher.ts`) — третий источник.** Публичный GraphQL `POST https://parts-store.pl/graphql/v1/`, query `productsTextSearch`. Живой тест: HTTP 200 без challenge. Лимитер: `PARTS_STORE_CONCURRENCY=2`, `PARTS_STORE_MIN_INTERVAL_MS=450`. Массовая выгрузка: `npm run prefetch:parts-store` (чанки по `PARTS_STORE_PREFETCH_CHUNK_SIZE`, пауза `PARTS_STORE_PREFETCH_CHUNK_DELAY_MS`, JSON в `data/parts-store-export.json`).
- Ceneo.pl — четвёртая попытка; чаще анти-бот заглушка.
- Статические ориентировочные цены (`static-parts-prices.ts`, помечены ★) — финальный fallback.
- `estimatePartsCost()` считает **медиану** по типу повреждения, не минимум.

### Kimovil (liquidity-calculator)
- `src/server/liquidity-calculator/kimovil-fetcher.ts` работает через autocomplete + скрапинг страницы отзывов — может ломаться при изменении вёрстки/API Kimovil.
- [x] **L2-кэш Kimovil в `ModelCache`** — `kimovil-cache.ts`, поля `kimovil_*` в Prisma (волна 1). L1 in-memory по-прежнему в calculator.
- **Задача (волна 2):** подключить `getKimovilScoresCached` в hot path `getLiquidityScore`, чтобы ускорить скан.

### OLX фото
- Поле `photos` есть в GraphQL-запросе, но OLX может не возвращать ссылки на изображения.
- **Задача**: если `photos` пустой — скрапить страницу объявления напрямую.

### Поиск объявлений: расширено на "used" (б/у), не только "damaged"
- `OLX_STATE_FILTERS` (по умолчанию `damaged,used`) — `fetchOlxListingsForStates()` прогоняет пагинацию по каждому состоянию и объединяет с дедупликацией по id. `damaged` в Польше даёт всего ~2-3 тыс. объявлений, `used` — на порядок больше (~40 тыс.), там же чаще всего и находятся реальные арбитражные лоты, где дефект просто упомянут в описании, а не выставлен тегом "Uszkodzone".
- **Побочный эффект и как он обработан:** в "used"-объявлениях запчасти (батарея/экран/камера) чаще всего упоминаются как ДОСТОИНСТВО ("bateria 100%", "nowy wyświetlacz", "działają bez zarzutu"), а не как повреждение. `fix-parser.ts#detectDamageTypes` теперь проверяет контекст вокруг каждого совпадения (`text-match.ts#getKeywordContexts`, окно ±40 символов) и не засчитывает совпадение как повреждение, если рядом есть маркер здоровья (100%, nowa, sprawny, "bez zarzutu", "zero problemów" и т.п.), с приоритетным override на явные маркеры повреждения (uszkodzony, pękniety, zarysowany...) и обработкой отрицания ("bez rys, pęknięć" — при "bez" перед маркером повреждения в окне ~20 символов считаем ЗДОРОВЫМ, а не повреждённым).
- **Известное ограничение (эвристика, не NLP):** список маркеров здоровья/повреждения не покрывает все возможные формулировки на польском — это словарь частых фраз, а не полноценный NLP/классификатор. Возможны как редкие ложные срабатывания (нетипичная формулировка "здоровья" не в списке), так и редкие ложные отрицания. Для полного решения нужен LLM-классификатор текста объявления вместо keyword-эвристики — не сделано в рамках этой задачи.
- Из-за расширения на "used" и нового источника запчастей (OLX вместо/вместе с Ceneo) полный скан с дефолтными `OLX_MAX_PAGES=5`/`OLX_PAGE_LIMIT=40`×2 состояния занимает заметно больше времени (до ~400 объявлений на анализ вместо ~200) — учитывайте это при первом запуске.

### Оценка рыночной цены (медиана по скану) + нормализация модели
- [x] **Решено:** `market_sell_price` теперь считается двухфазно (`pipeline.ts#finalizeDevices`) — медиана `price_buy` среди объявлений ТОЙ ЖЕ `model_key` без обнаруженных повреждений в ЭТОМ ЖЕ скане (+4% если `has_box`, согласовано с `BOX_AND_ACCESSORIES_BONUS_SCORE`). `estimateMarketSellPrice` (бренд-эвристика, старая циклическая формула `buy_price / 0.38`) используется только как **fallback**, когда сравнимых объявлений меньше `MIN_COMPARABLE_LISTINGS_FOR_MEDIAN` (2). Метод расчёта сохраняется в `market_sell_price_source` (`"model_median" | "brand_estimate"`) и показывается на странице устройства короткой подписью.
- **Модель-нормализатор** (`src/server/model-normalizer.ts#extractModelKey`) — канонический `model_key`/`model_label` из заголовка объявления, общий источник истины и для группировки медианы цены, и для чекбокс-фильтра моделей. Регэксп-паттерны на популярные серии (Galaxy S/A/Z/Note, iPhone N Pro/Max/mini/SE, Redmi Note/POCO X/Xiaomi N, Pixel N Pro...) + generic fallback (первые значимые токены после бренда, с обрезкой памяти/RAM/состояния/рекламных слов).
- **Известное ограничение (эвристика, не NLP):** для редких/нестандартных заголовков (опечатки, нетипичный порядок слов, объявления-лоты типа "iPhone'y na części od 10 zł") fallback-парсинг может дать грубый/неточный `model_key`, из-за чего такое объявление либо не попадёт ни в одну медианную группу (мало сравнимых объявлений → `brand_estimate`), либо создаст свою мелкую "модель"-группу. Не критично: минимум `MIN_COMPARABLE_LISTINGS_FOR_MEDIAN=2` защищает от построения медианы на единичном выбросе.
- **Год выпуска** (`src/server/liquidity-calculator/release-year-hints.ts#getReleaseYear`) — статическая таблица `keyword -> release_year` по `model_key`, покрывает популярные модели последних ~7 лет. Модели вне справочника получают `release_year: null` и НЕ скрываются фильтром "минимальный год выпуска" (чтобы не терять реальные лоты из-за пробела в справочнике) — учитывайте это как известное ограничение при использовании фильтра.

### Авто-обновление данных (реализовано)
- [x] **Решено:** `AppSettings.auto_scan_interval_minutes` (0/15/30/60/180/360) + `src/server/scan-scheduler.ts#rescheduleAutoScan` (`node-cron`) — периодический авто-рескан без перезапуска процесса, переключается мгновенно через `PATCH /api/settings` или при старте сервера (`instrumentation.ts`).
- **Известное ограничение:** cron-задача живёт только в in-memory `active_task` одного процесса — при нескольких инстансах сервера (кластер/несколько воркеров) каждый инстанс завёл бы СВОЙ cron и скан запускался бы N раз одновременно. Не проблема для текущего однопроцессного деплоя, но нужно учесть при горизонтальном масштабировании (например, лидер-election или внешний scheduler вместо `node-cron` внутри приложения).

### Уведомления о хороших позициях (per-user)
- [x] **Решено (v2):** персональные критерии `UserNotificationSettings` (бренды/модели/регионы/диапазон рентабельности/цены) → после скана `checkAndNotify` создаёт in-app `Notification` на каждого подходящего пользователя; дедуп `NotifiedListing` per-user. Страницы `/notifications`, `/notifications/settings`, бейдж `NotificationBell`.
- [x] **Админка:** `/admin/notifications` — лог всех уведомлений + тест (`source: "test"`, опционально Telegram).
- [x] **Доставка:** онлайн — тост сверху (`NotificationToastHost`, смах/крестик); офлайн — Web Push (`PushSubscription` + VAPID + `public/sw.js`).
- **Известное ограничение:** Telegram — один общий чат (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`), не per-user. Для мультипользовательского Telegram нужна таблица подписок user → chat_id.
- **Известное ограничение:** Web Push требует HTTPS (или localhost) и VAPID-ключи в `.env`.
- **Известное ограничение:** `Notification` — снимок без FK на `Device`; актуальность объявления проверяется по ссылке на OLX.
- **Задача**: UI-индикация «уведомление устарело» (объявление снято с продажи).

### БД-кэш ремонтопригодности/цены/запчастей + TTL (реализовано)
- [x] **Решено:** двухуровневый кэш — L1 in-memory (`node-cache`, TTL из `.env`, живёт в рамках процесса) поверх L2 в БД (`ModelCache`/`PartsCostCache`, TTL из `AppSettings.cache_ttl_hours`, настраивается слайдером в `/settings`, диапазон 6ч-3мес, дефолт 72ч, переживает рестарт сервера). `avg_market_price` в `ModelCache` — доп. кросс-скановый источник `market_sell_price`, когда в текущем скане слишком мало сравнимых объявлений для медианы (`market_sell_price_source: "cached_median"`).
- **Известное ограничение:** кросс-скановый кеш цены — это "последняя известная медиана", а не полноценная история продаж/тренд цены во времени. Если рыночная цена модели резко упадёт/вырастет между сканами, кэш будет отставать до истечения TTL или до накопления новой медианы с достаточным числом сравнимых объявлений.

### Формулы рыночной цены и ликвидности (исправлено)
- [x] **Решено:** `estimateMarketSellPrice(brand, buy_price, is_damaged)` теперь по-разному считает цену для повреждённых/неповреждённых объявлений (раньше формула "восстановления битого телефона" применялась даже к целым устройствам, выдавая цену продажи вдвое выше цены покупки). `condition_score` в расчёте ликвидности заменён с хардкода `45` на `computeConditionScore(damage_types, battery_health_percent)` — реально зависит от состояния объявления.
- [x] **Решено (2026-07):** калибровка цен под OLX.pl б/у — `getModelMarketPrice` нормализует память к `MARKET_REFERENCE_STORAGE_GB` и умножает на `OLX_USED_MARKET_FACTOR=0.72`; для битых убрана формула `buy/0.38`, вместо неё `estimateDamagedResalePrice` от якоря (медиана/хинт) минус скидка по типам повреждения. Пример: iPhone 15 Pro 128 ~2088 zł рабочий → ~1880 zł после ремонта экрана (было ~3000). **Нужен перескан** для обновления `market_sell_price` в БД.
- **Известное ограничение:** обе формулы — эвристики с подобранными коэффициентами (не ML-модель на реальных данных о продажах), могут не совпадать с фактической рыночной ценой в отдельных случаях, особенно для редких моделей без достаточной статистики сравнимых объявлений.

## UI / Frontend

### Mobile FilterBar (решено)
- [x] **Решено:** кнопка "Фильтры" на мобильных открывает полноэкранный drawer (`is_filters_open` в `page.tsx`) с тем же `FilterBar`, что и десктопный сайдбар.

### Тёмная тема (реализовано)
- [x] **Решено:** CSS-переменные (`globals.scss`) + Tailwind v4 class-based `dark:` (`@custom-variant dark`), `ThemeSwitcher` (светлая/тёмная/системная, `localStorage`), анти-FOUC инлайн-скрипт в `layout.tsx`.
- **Известное ограничение:** декоративные немасштабируемые цвета (палитра `DamageTag` по типу повреждения, фиксированный градиент шкалы `StatBar`) не переведены на семантические переменные — у них отдельные явные `:global(.dark) &`-оверрайды внутри своих SCSS-модулей. Осознанное решение (эти цвета кодируют категорию/позицию на шкале, а не тему), но при добавлении новой категории повреждения нужно не забыть добавить и светлый, и тёмный вариант вручную.

### Редизайн карточки устройства (реализовано)
- [x] **Решено:** `StatBar` (шкала с фиксированным градиентом + затемняющий оверлей от `value%`) заменил числовые 2×2-блоки ликвидности/прибыльности/ремонтопригодности на `DeviceCard` и детальной странице; цена покупки/запчастей/прибыли остались компактными текстовыми строками в zł.

### Polling при сканировании
- [x] Индикатор прогресса в % по реальным стадиям реализован (см. выше).
- [x] **Long-poll (2026-08-19)** — скан: `GET /api/scan/status?wait=1`; уведомления: `GET /api/notifications/unread-count?wait=1`. Нет интервала 1с/15с/30с; скрытая вкладка молчит. SSE по-прежнему опционален для мультиинстанса.

### Пагинация / виртуализация
- [x] **Решено (волна 2):** серверная пагинация и фильтры в `/api/devices` (`page`/`offset`/`limit`/`sort` + csv-фильтры). Главная грузит только текущую страницу; `filter_meta` для FilterBar. Избранное — `load_all`.

### Фильтры, настройки батареи и подбор запчастей (реализовано)
- [x] **Баг с запчастями для неповреждённых устройств исправлен:** ключ кэша в `cache.ts#getAllegroCache/setAllegroCache` теперь включает отсортированный список `damage_types`, а не только `brand`+`model_query`.
- [x] **Порог замены батареи** — новая модель `AppSettings` (синглтон, `battery_health_threshold_percent`, дефолт 80), страница `/settings`, API `GET/PATCH /api/settings`. `fix-parser.ts#extractBatteryHealthPercent` извлекает реальный % из текста объявления (regex на "bateria/kondycja/akumulator/battery ... NN%") и, если найден, ПЕРЕОПРЕДЕЛЯЕТ keyword-эвристику повреждения батареи в `detectDamageTypes`. Порог читается один раз в начале `runFullPipeline()` — применяется к следующему скану, не к уже сохранённым данным.
- [x] **Наличие коробки** — `fix-parser.ts#detectHasBox` (словарь фраз "z pudełkiem", "oryginalne pudełko", "komplet akcesoriów" и т.п.), учитывается в бонусе к `market_sell_price` и в `liquidity_score` (`has_box_and_accessories`).
- [x] **Редизайн фильтров** — `CheckboxGroup`/`RangeSlider` (новые переиспользуемые примитивы), `FilterBar` теперь: чекбоксы брендов (с счётчиками) → второй уровень чекбоксов моделей (по раскрытым брендам), чекбоксы типов повреждений (мульти-выбор, с счётчиками), слайдеры цены/рентабельности/ликвидности, одинарный слайдер минимального года выпуска. Границы слайдеров (`price_bounds`/`profitability_bounds`/`year_bounds`) вычисляются из текущей выдачи в `page.tsx`; `null` в `FilterValues` означает "без фильтра" (весь диапазон), а не замороженное значение.
- **Известное ограничение:** модели во втором уровне чекбоксов показываются только для выбранных/раскрытых брендов (не показываем сразу все модели всех брендов одним списком) — соответствует плану, но если понадобится "плоский" список моделей независимо от бренда, потребуется доп. UI-режим.

### Режим исключения мусора + умная дедупликация моделей (реализовано)
- [x] **Новая настройка "Исключать мусорные объявления"** (`AppSettings.exclude_junk_listings`, вкл. по умолчанию) — `src/server/junk-filter.ts#evaluateJunkStatus`. Отбрасывает объявления, которые технически парсятся, но не являются нормальной продажей одного б/у смартфона: неизвестный бренд/модель, слишком старый год выпуска (`AppSettings.junk_min_release_year`, дефолт 2017 — **является частью того же режима**, а не отдельной настройкой), лоты из нескольких телефонов (по ключевым словам "zestaw"/"paczka"/"kilka sztuk"/числительное перед "szt"/"telefonów", включая словесные числительные типа "dwie sztuki"), объявления сервисов ремонта ("serwis gsm", "naprawa telefonów"), нереалистичная цена (< 20 zł или > 12000 zł). Проверка выполняется ДВАЖДЫ в `pipeline.ts#analyzeSingleListing`: сразу после определения brand/model_key/release_year (до дорогих сетевых запросов к iFixit/запчастям — экономит время скана на явном мусоре) и повторно после получения текста описания объявления (ловит лоты/сервисы, упомянутые только в тексте).
- **Известное ограничение:** список лот/сервис-ключевых слов и числительных словами — эвристика словаря, не NLP; нестандартные формулировки лотов могут не поймаются.
- [x] **Умная дедупликация модели устройства** — раньше разное написание одной модели (регистр, пробелы, опечатки: "Samsung S23", "samsungs23", "Samsung Galaxy S23") создавало РАЗНЫЕ `model_key`, размывая и медиану цены, и чекбокс-фильтр моделей. Решено на двух уровнях:
  1. `model-normalizer.ts` — паттерны для Samsung Galaxy S/A/Note/Z/M теперь принимают слово "galaxy" как ОПЦИОНАЛЬНОЕ (многие продавцы пишут "Samsung S23" без "Galaxy") через новое поле `canonical_prefix` у `SeriesPattern`: результат всегда канонизируется в одну форму независимо от того, что написал продавец. Аналогично для Motorola ("Motorola G15" и "Moto G15" → один ключ). Добавлены недостающие бренды (Nokia, Vivo, Infinix, Tecno, Asus/Zenfone, LG, HTC) и A-серия Oppo — раньше эти бренды всегда уходили в шумный generic fallback. Диакритика нормализуется (NFKD) до regex-этапа. Расширен список "шумных" слов, которые вырезаются до fallback-разбора (`stan bardzo dobry`, `uszkodzony`, `sprawny`, `pilnie`, `okazja`, `tanio`) — раньше могли утекать в `model_key` для брендов без выделенного паттерна.
  2. `src/server/model-key-clusterer.ts` (новый модуль) — пост-обработка ПОСЛЕ regex-нормализации: кластеризует все `model_key` одного скана по буквенному "отпечатку" (диакритика/регистр/пробелы убраны) с допуском на опечатку (расстояние Левенштейна ≤1-2 в зависимости от длины). Цифровая часть ключа (номер модели: "23" в "s23") должна совпадать ТОЧНО — не допускает слияния разных моделей ("s23" и "s24" никогда не сливаются, даже если по буквам похожи). Каноническим для кластера становится САМЫЙ ЧАСТЫЙ вариант написания в этом скане. Вызывается в `pipeline.ts#finalizeDevices` ДО расчёта медианы цены по модели — то есть дедуп происходит один раз и одинаково влияет и на цену, и на фильтр.
- **Известное ограничение:** кластеризация внутри одного скана (не между сканами) — при полной замене таблицы `Device` на каждом скане (см. `saveDevices`) это не проблема, но если в будущем появится инкрементальное обновление — нужно будет либо кластеризовать заново на объединённом наборе, либо хранить канонические ключи отдельно.

### UI / x-kom редизайн (2026-08-15)
- [x] Глобальная шапка `AppHeader` в layout, единый оранжевый CTA `#ff5900`, карточки/фильтры/PDP как витрина x-kom.
- [x] SSR ленты, избранного и деталки через `feed-loader.ts`; хуки вынесены из view-компонентов.
- [x] Анимации карточек/страниц + `prefers-reduced-motion`.
- [x] **UX-проход 2026-08-19:** glass-шапка, pill-навигация админки, TermHint на жаргоне, ErrorState/лоадеры, `useTransition`/`useDeferredValue` на ленте, человеческие названия вместо ModelCache/TTL/ROI.
- [ ] Светлая тема по умолчанию у части пользователей всё ещё перебивается сохранённым `dark` в localStorage — это ожидаемо.

### Офлайн / ошибка подключения
- [x] Понятные коды ошибок API (`jsonError` + `ApiRequestError`) и `ErrorState` на ленте, избранном, деталке, админке и 404/error. Не пустой экран и не сырой `HTTP 503`.

### Roadmap next_steps.txt (2026-07-12, реализовано)
- [x] **Линейки моделей** — `model-line-extractor.ts`, поля `model_line`/`model_line_label` в Prisma, фильтр и сортировка «Линейка модели» на главной.
- [x] **Расширенные повреждения** — `locked`, `software`, `sim_slot`, `frame` в `fix-parser.ts` + теги/переводы.
- [x] **Объявления «на части»** — `parts_only_listing` в `junk-filter.ts`.
- [x] **Одиночные запчасти OLX** — `isSinglePartListing()` в `olx-parts-fetcher.ts`, сортировка по цене (минимум для ремонта).
- [x] **Фильтр года** — устройства с `release_year === null` исключаются при активном `min_release_year`; слайдер на минимуме = фильтр выключен.
- [x] **Год из iFixit** — `extractReleaseYearFromIfixitHtml()` как fallback в pipeline.
- [x] **Продавец OLX** — парсинг `seller_name`/`seller_ads_count`/`seller_member_since` со страницы объявления, отображение в карточке и деталке.
- [x] **Пагинация + скролл** — scroll to top при смене страницы; `scroll-store.ts` сохраняет позицию ленты при переходе в деталку.
- [x] **MUI + Lucide** — `@mui/material`, `MuiProvider` в `layout.tsx`, редизайн `devices/[id]/page.tsx`.
- **Ограничение:** парсинг продавца зависит от вёрстки OLX (`__NEXT_DATA__`/data-testid) — может потребовать обновления при смене шаблона.

## План к релизу (аудит 2026-08-19)

Полный список находок — canvas `release-audit`. Ниже — только работа до тега.

### Фаза 0 — блокеры (часы)
- [ ] Удалить `client_secret_*.json`, добавить в `.gitignore`, ротировать Google OAuth secret
- [ ] `PRAGMA foreign_keys=ON`; ignore `*.db-wal` / `*.db-shm`
- [ ] `POST /api/scan/start` только admin; `E2E_SKIP_AUTH` не должен быть в prod
- [ ] Флаг `SKIP_SCAN_ON_BOOT` — не гонять OLX на каждый restart/deploy

### Фаза 1 — UX главной (1–2 дня)
- [ ] Debounce слайдеров FilterBar 250–400 мс
- [ ] Синхрон SSR `page_size` с persist; ждать hydration `filters-store` перед URL
- [ ] `React.memo(DeviceCard)` + стабильные колбэки; CSS-анимация спиннера деталки
- [x] Long-poll скана и unread+toast (`wait=1`, один цикл уведомлений на вкладку)

### Фаза 2 — скан и БД (2–3 дня, можно сразу после тега)
- [x] **Лёгкий SELECT для delta-scan** — `getLatestDeviceFingerprints` + `getDevicesByIds` только для unchanged.
- [x] **Batch snapshot в finalize** — `listFreshModelCaches` + `loadCatalogLookup` один раз на скан.
- [x] **`listings_seen_count` increment** в `syncCatalogFromLatestDevices`, не overwrite.
- [x] **ScanOutcome / partial OLX / не тереть ленту** — `scan-outcome.ts`; health-уведомления; статус в баннере.
- [ ] Опциональный junk-skip в pipeline до сети iFixit/parts (TODO.md:117 устарел — junk сейчас только на ленте)

### Фаза 3 — после v0.1.0
- [ ] `next/image` + remotePatterns; виртуализация при page_size 48+
- [ ] SQL paging вместо in-memory filter всей таблицы
- [ ] Ужесточить `isRelevantProduct`; enrich/TTL каталога
- [ ] E2E избранного: ждать `POST /api/user/listings`
- [ ] SSE вместо polling; TTL cleanup cache/history

**Критерий тега v0.1.0:** фаза 0 закрыта, фаза 1 на staging, один живой скан без 403, `npm test` + e2e зелёные, `npx prisma migrate deploy`.

### Волна 1 — аналитика ROI + инфра (2026-08, реализовано)
- [x] **Deal confidence** — `deal-confidence.ts`, поля `confidence_score`/`confidence_label`/`parts_*_count` на `Device`, бейдж на `DeviceCard`.
- [x] **Risk-adjusted profit** — `risk-adjusted-profit.ts` (комиссия 5%, торг −5%, holding 14д, liquidity/confidence factors), сортировка по `risk_adjusted_profit`.
- [x] **Price history** — модель `PriceHistorySnapshot`, сохранение после скана (`price-history-repository.ts`). **UI тренда — волна 2/3.**
- [x] **SKIP_CENEO** — env `SKIP_CENEO=1` (дефолт), Ceneo пропускается в авто-скане.
- [x] **Kimovil L2 cache** — поля в `ModelCache`, `getKimovilScoresCached`.
- [x] **Scan watchdog + cron lock** — `ScanCoordinator`, `expireStaleScanRuns`, проверка lock в `scan-scheduler`.

### Волна 2 — скорость скана (2026-08, реализовано)
- [x] **Delta-scan** — `delta-scan.ts`: повторно анализируются только новые/с изменёнными title/ценой; неизменённые берутся из прошлого скана и проходят `finalizeDevices`.
- [x] **Two-phase pipeline** — `listing-prefilter.ts`: дешёвый score по карточке → полный анализ топ-N (`TWO_PHASE_FULL_ANALYZE_LIMIT`, дефолт 80), остальные lightweight (без страницы OLX / сети iFixit).
- [x] **Server-side pagination** — `/api/devices` принимает `page`/`offset`/`limit`/`sort` и фильтры; лента грузит только текущую страницу. `filter_meta` для UI фильтров.
- [x] **Job queue** — in-process очередь (`job-queue.ts` / `scan-jobs.ts`), без Redis: Kimovil prefetch после скана (топ-20 моделей), Allegro prefetch по каталогу.
- [x] **Kimovil L2 в hot path** — `getKimovilScoresFromCacheOnly` в `finalizeDevices` (без сети во время скана).
- [x] **Unit-тесты** — `npm test` (vitest): delta-scan, prefilter, job-queue, feed-query, confidence, recommended-repair, market prices, listing heuristics, deal-economics.

### Волна 3 — продукт
- [x] **Справочник б/у цен 2026** — `model-market-price-hints.ts` хранит реальные OLX used (128 GB), без коэффициента 0.72. Redmi ≠ Mi 13, iPhone 17 Pro отдельно от 17. Ручные цены каталога (в т.ч. по памяти) дополняют справочник.
- [x] **Логистика на фронте** — `deal-economics.ts`: сервер считает сделку без доставок, UI добавляет shipping из настроек без рескана.
- [x] **Админ-каталог** — список с фильтрами и пагинацией как в ленте → `/admin/catalog/[id]` (цены по GB, плоский список запчастей с фильтрами, TermHint на терминах).
### Playwright e2e (2026-08-15)

- [x] Прогон: **25 passed / 3 skipped** (`npm run test:e2e`, desktop + Pixel 7). Skip: round-trip избранного (карточка не появилась в `/favorites` сразу после клика), галерея на mobile если нет `[data-testid=card-photo-gallery]` в момент проверки.
- [x] **Качество скана / шум предупреждений** — не пишем в журнал ожидаемые заглушки: пустое описание (текст с GraphQL/деталки), iFixit stub, ★-цены lightweight. Реальные: timeout/ошибка анализа, нет ремонтопригодности, нет запчастей, нет фото, нет рыночной цены.
- [x] **Бесперебойный скан (2026-08-19)** — partial fetch OLX (пропуск страницы, не обрыв штата), запрет пустой замены ленты, abort по таймауту лота без ретрая, L2-кеш после save, `scan_health` уведомления, `outcome_status` в API/дашборде. Формулы прибыли/цен не менялись.
- [x] **Каталог stale при sync** — `syncCatalogFromLatestDevices` больше не ставит всем `enrichment_status: "stale"` (счётчик объявлений по-прежнему из последнего скана).
- [x] **Админ-каталог: стейты / пакетный скан / антибот** — живой прогресс заполнения, ручная загрузка на карточке модели, сохранение прежней ремонтопригодности, автоскан каталога + паузы антибота, выбор пачкой с поиском по названию/бренду/линейке/модели.
- [ ] **Шум в запчастях каталога** — для iPhone 13 в кэше чехлы, iPhone 4/11/12, объявления сервисов («NAPRAWA TELEFONÓW») как `water_damage`/`software`. Ужесточить `isRelevantProduct` / junk для parts-store.
- [x] **Продавец/описание на деталке** — HTML OLX отдаёт CloudFront 403; берём `description` + `user` из GraphQL `clientCompatibleListings` (в поиске и точечно по id).
- [x] **Источники запчастей / админка** — волны Allegro → Ceneo → магазины (parts-store + mobilepart.pl + m9parts.pl) → OLX, max 4; иконки источников; ручной скан по источнику с merge; OLX `data-src` + `{width}x{height}` + `referrerPolicy=no-referrer`.
- [ ] E2E избранного: дождаться ответа `POST /api/user/listings`, не сразу `goto /favorites`.

- [ ] **CRM / SoldDeal / watchlist**
- [ ] **Price history UI** — график тренда на деталке устройства
- [x] **Ручной prefetch запчастей по источникам** в карточке модели каталога (Allegro / Ceneo / магазины / OLX / все)
- [ ] **Damage keyword v2** (без LLM)

- PWA-поддержка (manifest + service worker)
- Страница сравнения нескольких устройств
- Экспорт в CSV
- Watchdog/TTL для "зависших" `ScanRun` — **реализовано (волна 1)**, см. `ScanCoordinator` + `expireStaleScanRuns`
- Мультипользовательские Telegram-подписки (сейчас один общий чат из `.env`, см. "Уведомления о хороших позициях" выше)
- Лидер-election или внешний scheduler вместо `node-cron` внутри процесса — для горизонтального масштабирования авто-скана на несколько инстансов

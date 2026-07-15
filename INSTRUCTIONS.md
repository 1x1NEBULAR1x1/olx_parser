# Instructions (шпаргалка)

Объединённая шпаргалка после миграции отдельных `frontend/` (React Router SPA) и
`backend/` (Express) в единое Next.js 15 приложение. Старые `backend/INSTRUCTIONS.md`
и `frontend/INSTRUCTIONS.md` слиты сюда перед удалением папок.

## Стек

- **Next.js 15** (App Router) — единый процесс для UI и API, порт 3000
- **React 19**, **Tailwind CSS 4** (утилитарные классы) + **SCSS Modules** (компонент-специфичные стили)
- **Prisma 7** + **SQLite** (`@prisma/adapter-better-sqlite3` — driver adapter, обязателен в v7)
- **node-cache** — in-memory TTL-кэш для iFixit/Ceneo (не персистентный, сбрасывается при рестарте)
- **TypeScript 5**, snake_case для переменных, camelCase для функций/методов (см. правило проекта)

## Структура проекта (FSD)

Проект организован по **Feature-Sliced Design**. Next.js `app/` — только тонкий роутинг; логика страниц — в `views/` (алиас `@/pages/*`).

```
src/
  app/                          — Next.js App Router (тонкие page.tsx → import из @/pages/*)
    api/                        — REST route handlers → @/server/*
    layout.tsx, globals.scss
  views/                        — FSD Pages (папка views, алиас @/pages/* — без конфликта с Next.js)
    home/, device-detail/, favorites/, settings/
    notifications/, notification-settings/
    admin-users/, admin-scan-log/, login/, pending/
  widgets/                      — крупные UI-блоки
    header/                     — HeaderActions
    admin-shell/                — AdminShell + навигация админки
  features/                     — пользовательские сценарии
    device-filter/              — FilterBar, filters-store, sort-and-filter
    feed-scroll/                — scroll-store (позиция ленты)
    scan-control/               — ScanBanner, useDevicesFeed
    notifications/              — NotificationBell, useUnreadNotificationsCount
    preferences/                — ThemeSwitcher, LanguageSwitcher, PreferencesMenu
    auth/                       — UserMenu
  entities/                     — бизнес-сущности
    device/                     — DeviceCard, DamageTag, PhotoGallery, scoring lib
  shared/                       — переиспользуемое без доменного контекста
    ui/                         — CheckboxGroup, RangeSlider, Pagination, StatBar
    api/                        — client.ts (fetch к /api/*, re-export типов)
    types/                      — domain.ts, api-contracts.ts — единый источник типов
    lib/                        — theme, listing-flags, part-utils, model-line-sort-key
    providers/                  — AuthProvider, MuiProvider, ThemeInit
    config/i18n/                — config, request, locales/{ru,en,pl}
    db/                         — Prisma singleton
  server/                       — backend (Node.js only, не импортировать в client)
    auth/                       — auth-options, auth-guards
    repositories/               — Prisma-доступ (devices, scan-issues, user-*)
    fetchers/                   — внешние источники (OLX, Allegro, Ceneo, parts-store…)
    scan/                       — pipeline, scan-manager, parts-chain, concurrency
    domain/                     — бизнес-логика (profitability, brand, liquidity…)
    shared/                     — config, cache, logger, concurrency-limiter
    types.ts                    — re-export из @/shared/types
  i18n/                         — stubs для next-intl plugin (re-export из shared/config/i18n)
```

### Правила импортов (слои сверху вниз)

`app` → `pages` (views) → `widgets` → `features` → `entities` → `shared`

- **Запрещено**: `shared` → `features`, `entities` → `pages`, client → `server`
- **Public API**: импортировать через `index.ts` слайса (`@/entities/device`, `@/features/device-filter`)
- **Исключение**: `getModelLineSortKey` в `@/shared/lib/model-line-sort-key` (чистая функция, без server deps)
- **ESLint**: `npm run lint` — `eslint-plugin-boundaries` v7, правило `boundaries/dependencies` (см. `eslint.config.mjs`)

### tsconfig aliases

`@/shared/*`, `@/entities/*`, `@/features/*`, `@/widgets/*`, `@/pages/*` → `src/views/*`, `@/server/*`, `@/*`

> **Важно:** папка на диске — `src/views/`, не `src/pages/`. Имя `pages` зарезервировано Next.js для Pages Router.

### Старые пути (удалены)

`components/`, `hooks/`, `store/`, `lib/`, `db/`, `types/` — мигрированы в FSD-слои (скрипт `scripts/fsd-migrate.mjs`).

## Структура server/ (backend)

```
src/server/
  auth/
    auth-options.ts           — NextAuth конфиг
    auth-guards.ts            — requireAuth, requireAdmin
  repositories/
    devices-repository.ts     — Device, ScanRun, Part, AppSettings, ModelCache, PartsCostCache, Notification*
    scan-issues-repository.ts — ScanIssueCollector, лог битых объявлений
    user-listings-repository.ts
    user-display-settings-repository.ts
  fetchers/
    allegro-api-client.ts, allegro-parts-fetcher.ts
    ceneo-fetcher.ts
    olx-parts-fetcher.ts, olx-market-price-fetcher.ts
    parts-store-fetcher.ts, parts-store-prefetch.ts
    olx-fetcher/              — fetcher, fix-parser, parser, guards
  scan/
    pipeline.ts               — runFullPipeline (оркестратор скана)
    parts-chain.ts            — цепочка Allegro → OLX → parts-store → Ceneo → stub + L1/L2 кэш
    run-with-concurrency.ts   — runWithConcurrency, withTimeout
    scan-manager.ts           — triggerScan, getScanStatus, isScanningEffective
    scan-scheduler.ts         — node-cron авто-рескан
    scan-issue-detector.ts    — classifyListingError, detectDeviceWarnings
  domain/
    brand-extractor.ts, model-normalizer.ts, model-key-clusterer.ts, model-line-extractor.ts
    profitability.ts, junk-filter.ts, parts-shared.ts, repair-parts-stubs.ts, static-parts-prices.ts
    notifier.ts               — checkAndNotify (Telegram + in-app)
    liquidity-calculator/     — calculator, kimovil-fetcher, release-year-hints, constants
  shared/
    config.ts                 — env-настройки (pipeline, telegram, cache TTL)
    cache.ts                  — L1 in-memory (ifixit, allegro)
    logger.ts, concurrency-limiter.ts
  types.ts                    — re-export @/shared/types (тонкая обёртка для server-импортов)
```

### Единый источник типов

- `src/shared/types/domain.ts` — `AnalyzedDevice`, `AllegroPart`, `ScanStage`, `DevicesFilterMeta`
- `src/shared/types/api-contracts.ts` — `DevicesListResponse`, `ScanStatusResponse`, API settings
- `src/shared/api/client.ts` — только fetch-функции + re-export типов
- `src/server/types.ts` — re-export для backend-модулей

### Паттерн parts-chain (pipeline)

`parts-chain.ts#fetchPartsData` — единая точка поиска запчастей:
1. L1 кэш (node-cache) → L2 БД (`PartsCostCache`)
2. Allegro → OLX parts → parts-store.pl → Ceneo → static stub
3. Медианный фильтр выбросов (`parts-shared.ts`)

### Паттерн concurrency

`run-with-concurrency.ts` — пул воркеров со скользящим окном (не фиксированные батчи).
`concurrency-limiter.ts` — per-source лимитеры (OLX, Ceneo, parts-store, iFixit).

prisma/
  schema.prisma
  migrations/
prisma.config.ts
src/instrumentation.ts        — авто-скан при старте + rescheduleAutoScan
src/shared/db/client.ts       — Prisma singleton (driver adapter)
```

## Паттерны

### Создание компонента
```tsx
// entities/device/ui/device-card/DeviceCard.tsx (или features/*/ui)
import styles from "./DeviceCard.module.scss";
import { useTranslations } from "next-intl";

export function ComponentName({ prop }: Props) {
  const { t } = useTranslations("namespace_key");
  return <div className={styles.component_name}>{t("key")}</div>;
}
```
Если компоненту нужны React-хуки/события (useState, onClick и т.п.) — добавляй `"use client"` в начало файла (см. `ScanBanner.tsx`, `FilterBar.tsx`). Страницы/компоненты без интерактивности остаются Server Components по умолчанию.

### SCSS Module — BEM-like с `&_`
```scss
.card {
  // базовые стили
  &_title { font-size: 16px; }  // → .card_title
  &_metric {
    &_label { ... }             // → .card_metric_label (вложенность допустима)
  }
}
```

### useTranslations
```tsx
const { t } = useTranslations("device_card");
t("buy_price")  // → "Cena kupna"

// Или без namespace:
const { t } = useTranslations();
t("common.loading")  // → "Ładowanie..."
```

### Добавление нового перевода
1. Добавить ключ в `src/lib/intl/locales/pl.ts` в нужный namespace (или создать новый).
2. Использовать в компоненте через `useTranslations("namespace")`.

### Добавление нового маршрута (страницы)
1. Создать `src/app/<path>/page.tsx` (App Router: путь = структура папок).
2. Для API — `src/app/api/<path>/route.ts` с `export const runtime = "nodejs"` (нужен для Prisma/better-sqlite3) и `export const dynamic = "force-dynamic"` (данные не должны кэшироваться статически).

### Добавление нового поля к AnalyzedDevice
1. `prisma/schema.prisma` — добавить колонку в модель `Device` (или `Part`), затем `npx prisma migrate dev --name <имя>`.
2. `src/server/types.ts` — добавить поле в интерфейс `AnalyzedDevice`.
3. `src/server/pipeline.ts` — вычислить и включить в возвращаемый объект.
4. `src/server/devices-repository.ts` — добавить маппинг в `mapDeviceToAnalyzedDevice` и в `saveDevices`.
5. `src/lib/api.ts` — обновить тип `AnalyzedDevice` (клиентская копия типа).

### Prisma repository / singleton client
- Единственная точка доступа к БД — `src/db/client.ts` (singleton через `globalThis`, переиспользуется между hot-reload в dev).
- Prisma v7 не читает `datasource url` из схемы для клиента — обязателен driver adapter (`new PrismaClient({ adapter })`), см. `src/db/client.ts`.
- Весь SQL/Prisma-специфичный код инкапсулирован в `src/server/devices-repository.ts` — остальной код (`pipeline.ts`, route handlers) работает через типы `AnalyzedDevice`, не через Prisma-модели напрямую.

### Добавление нового in-memory кэша
```typescript
// В cache.ts — создать new NodeCache({ stdTTL: config.cache.YOUR_TTL_sec })
// Добавить getter/setter функции
// Использовать в pipeline.ts
// TTL всегда брать из config.ts (который читает .env), не хардкодить
```

### Паттерн scan-manager (важно!)
`triggerScan()` запускается автоматически при старте сервера (`instrumentation.ts`, dynamic import) и вручную через `POST /api/scan/start`. Для проверки "не идёт ли уже скан" **нельзя полагаться только на in-memory флаг** — в dev-режиме Next.js `instrumentation.ts` и Route Handlers могут исполняться в разных инстансах модуля (разные бандлы/воркеры), из-за чего in-memory `is_scanning` не всегда синхронизирован между ними.

Решение: источник истины — БД (`ScanRun.status === "running"`), in-memory флаг — доп. защита внутри одного инстанса модуля.
- `isScanningEffective()` — асинхронная проверка "OR" из обоих источников; использовать её в API-роутах и перед запуском нового скана.
- `isScanning()` — синхронная, только in-memory, использовать только внутри `scan-manager.ts` для быстрой защиты от повторного вызова в том же процессе.
- `getScanStatus()` учитывает оба источника при формировании `is_scanning` в ответе.

### Паттерн concurrency-limiter (важно! читать перед добавлением нового внешнего источника)
Раньше каждый скрапер (`ceneo-fetcher.ts`, `olx-parts-fetcher.ts`) реализовывал throttle сам — строго последовательная промис-очередь ("жди слот -> fetch -> жди ответ -> следующий слот"), из-за чего даже при большом `PIPELINE_CONCURRENCY` реальные сетевые запросы к одному сайту шли по факту один за одним, а не параллельно.

Теперь throttle вынесен в общий `concurrency-limiter.ts`:
- `createConcurrencyLimiter(max_concurrent, min_interval_ms)` — возвращает функцию `schedule(fn)`. Пускает до `max_concurrent` запросов ОДНОВРЕМЕННО, разнося только МОМЕНТЫ СТАРТА не чаще `min_interval_ms`. Т.е. время ответа сайта больше не блокирует остальные слоты.
- `fetchWithTimeout(url, init, timeout_ms)` — обычный `fetch` с `AbortSignal.timeout()`, чтобы одна подвисшая анти-бот страница не держала лимитер/пайплайн бесконечно.

Текущие лимиты (подбирались по "чем агрессивнее анти-бот у источника — тем строже"):
- OLX (`olx-parts-fetcher.ts`, `fix-parser.ts#olx_page_limiter`) — 6 конкурентных, старт не чаще раза в 80-100ms. OLX не показал анти-бот защиты даже на реальных прогонах.
- iFixit (`fix-parser.ts#ifixit_limiter`) — 4 конкурентных, 100ms.
- Ceneo (`ceneo-fetcher.ts#ceneo_limiter`) — 2 конкурентных, 500ms (строже — реально банит/показывает заглушку при агрессивном опросе).

**Правило:** добавляя новый внешний источник — заводи для него отдельный `createConcurrencyLimiter(...)` здесь же в модуле-скрапере (module-level singleton), не плоди свои реализации throttle.

### Параллелизация внутри одного объявления (`pipeline.ts#analyzeSingleListing`)
Единственная реальная последовательная зависимость на объявление: сначала нужно получить `post_summary` + `damage_types` + `device_query` (`extractOlxListingSignals`, один запрос к странице объявления OLX). После этого **iFixit-поиск и поиск/оценка цен на запчасти запускаются параллельно** (`Promise.all`) — раньше шли строго по очереди (запчасти ждали iFixit впустую). Внутри `fetchPartsData` типы повреждений одного объявления тоже обрабатываются параллельно (`Promise.all` вместо `for...of`).

`runWithConcurrency` (пул воркеров со скользящим окном, а не фиксированными батчами) держит до `PIPELINE_CONCURRENCY` объявлений "в полёте" одновременно — как только воркер освобождается, сразу берёт следующее объявление, не дожидаясь остальных из "батча".

### Прогресс скана в процентах (`ScanRun.stage/total_listings/processed_listings`)
`runFullPipeline(on_progress)` зовёт `on_progress({stage, total_listings?, processed_listings?})` на реальных стадиях: `fetching_listings` → `analyzing` (с тиками на каждое обработанное объявление) → (в `scan-manager.ts` отдельно) `saving`. `scan-manager.ts#createThrottledProgressWriter` пишет это в БД не чаще раза в 400ms (иначе при `PIPELINE_CONCURRENCY=8` и сотнях объявлений — поток мелких UPDATE в SQLite), но переходы стадии и финальный тик проходят без пропуска.

`getScanStatus()#calculateScanPercent` переводит стадию в % через веса (`fetching_listings`: 0-3%, `analyzing`: 3-68% пропорционально `processed/total`, `finalizing`: 68-82%, `saving`: 82-99%, `completed`: 100%). Веса подобраны под wall-time, а не «анализ = 95%». Логи: `src/server/logger.ts` (`createLogger`, `StageTimer`, ETA в `scan-manager.ts`). `LOG_LEVEL=debug` для подробностей. `journalctl -u smartflip -f` на сервере.

### Паттерн двухфазного расчёта цены/ликвидности (`pipeline.ts`)
`analyzeSingleListing` (фаза 1) считает всё, что можно посчитать по ОДНОМУ объявлению независимо от остальных — бренд, `model_key`/`model_label` (`model-normalizer.ts`), `damage_types`, `has_box`, `battery_health_percent`, iFixit, запчасти. Возвращает `RawAnalyzedListing`, **без** `market_sell_price`/`profitability`/`liquidity`.

`finalizeDevices` (фаза 2) вызывается ОДИН раз на весь скан, когда все объявления уже проанализированы:
1. `buildMedianPriceByModelKey` — группирует объявления по `model_key`, берёт `price_buy` только у объявлений с `damage_types.length === 0`, считает медиану (требует минимум `MIN_COMPARABLE_LISTINGS_FOR_MEDIAN=2` объявлений в группе).
2. Для каждого объявления: `market_sell_price` = медиана группы (+`BOX_AND_ACCESSORIES_BONUS_SCORE`% если `has_box`) **или** `estimateMarketSellPrice(brand, price_buy)` (fallback), если сравнимых объявлений мало. Метод сохраняется в `market_sell_price_source`.
3. `getLiquidityScore` вызывается с реальными `release_year` (из `release-year-hints.ts`), `has_box`, `battery_health_percent`, `market_median_price` — раньше сюда передавался хардкод `release_year: 2022` для всех устройств.
4. `calculateProfitability` считается уже с финальным `market_sell_price`.

**Правило:** добавляя новое поле, которое зависит от ВСЕХ объявлений скана (не только текущего) — считай его в `finalizeDevices`, а не в `analyzeSingleListing`, иначе оно будет неполным/некорректным (объявления обрабатываются параллельно, порядок завершения не гарантирован).

### Паттерн AppSettings (настройки приложения)
Синглтон-модель Prisma (`AppSettings`, фиксированный `id=1`) — `getAppSettings()`/`updateAppSettings()` в `devices-repository.ts` используют `upsert`, поэтому строка создаётся лениво при первом обращении (без seed-скрипта). `runFullPipeline()` читает настройки ОДИН раз в начале скана — изменение настройки применяется только к СЛЕДУЮЩЕМУ запуску, не к уже сохранённым данным. Добавляя новую настройку: 1) поле в `AppSettings` + миграция, 2) `AppSettingsData` в `devices-repository.ts`, 3) прочитать в `runFullPipeline()`/там, где нужно, 4) прокинуть в UI `/settings` + `lib/api.ts#AppSettings`.

### Паттерн UserDisplaySettings (персональные фильтры ленты)
Модель Prisma `UserDisplaySettings` (1:1 с `User`) — `getUserDisplaySettings(user_id)`/`updateUserDisplaySettings()` в `user-display-settings-repository.ts` (upsert по `user_id`). Поля: `exclude_junk_listings`, `junk_min_release_year`, `exclude_iphone`, `exclude_android`. Применяются в `getLatestDevicesPage()` через `applyUserDisplayFilters()` — **на лету**, без перескана. Скан (`runFullPipeline`) сохраняет ВСЕ объявления; мусор/платформы не отсекаются в `analyzeSingleListing`.

**Правило:** `junk_min_release_year` — ЧАСТЬ режима `exclude_junk_listings` (см. `junk-filter.ts`). UI `/settings` — секция "Ваша лента" (доступна всем approved), отдельная кнопка "Сохранить фильтры". Глобальные настройки (`AppSettings`: battery, auto_scan, cache_ttl) — только admin, секция "Система".

### Паттерн "режим исключения мусора" (`junk-filter.ts`)
`evaluateJunkStatus(input, settings)` — чистая функция, вызывается в `devices-repository.ts#applyUserDisplayFilters` при отдаче ленты (если у пользователя включён `exclude_junk_listings`). Скан больше не отбрасывает мусор на этапе анализа.

### Паттерн дедупликации model_key (`model-normalizer.ts` + `model-key-clusterer.ts`)
Два независимых уровня защиты от дублей одной модели с разным написанием:
1. **На входе** (`model-normalizer.ts`) — `SeriesPattern.canonical_prefix`: когда родовое слово серии продавцы часто пропускают ("Samsung S23" без "Galaxy", "Motorola G15" без "Moto"), regex делает это слово ОПЦИОНАЛЬНЫМ во входном тексте, но `canonical_prefix` гарантирует, что на ВЫХОДЕ оно всегда одинаковое, независимо от факта совпадения. Захваченная группа (`match[1]`) должна включать саму букву/цифру серии ("s23 ultra", не "23 ultra") — иначе при склейке с `canonical_prefix` появляется лишний пробел между буквой и цифрой, ломающий поиск по `release-year-hints.ts` (там ключи вида "galaxy s23", без пробела после "s"). Пустая строка `""` — валидное значение `canonical_prefix` (означает "у этой серии нет отдельного родового слова, только сам бренд") — код различает `undefined` (старое поведение, `match[0]` целиком) и `""` через `!== undefined`, а НЕ через truthy-проверку.
2. **На выходе, после скана** (`model-key-clusterer.ts`) — пост-обработка ВСЕХ `model_key` скана сразу: буквенный "отпечаток" (диакритика/регистр/пробелы убраны) должен совпасть точно ИЛИ быть в пределах расстояния Левенштейна (защита от опечаток), а цифровая сигнатура (номера модели) — ТОЛЬКО точное совпадение (иначе "s23"/"s24" — разные годы выпуска и разная цена — слились бы в одну группу). Канонический вариант кластера = самый частый в этом скане. Вызывается в `pipeline.ts#finalizeDevices` ДО построения медианы цены — важно не менять порядок, иначе дедуп не подействует на расчёт цены.

**Правило:** добавляя новый бренд/серию в `model-normalizer.ts` — сначала проверяй, действительно ли продавцы иногда пропускают родовое слово серии (тогда нужен `canonical_prefix`), или оно и так обязательно в тексте объявления (тогда `canonical_prefix` не нужен, старое поведение через `match[0]` корректно).

### Паттерн CheckboxGroup + RangeSlider (`FilterBar.tsx`)
`FilterValues` использует `T[] | null` для диапазонов (`price_range`, `profitability_range`, `liquidity_range`) — `null` означает "без фильтра" (весь доступный диапазон), а НЕ замороженное значение. `RangeSlider` рисуется с `value={filters.x_range ?? x_bounds}`, где `x_bounds` вычисляются в `page.tsx` из ТЕКУЩЕЙ выдачи (`useMemo` по `data.devices`). Так слайдер всегда показывает актуальные границы, даже если данные обновились между сканами, без необходимости синхронизировать state вручную. `RangeSlider` поддерживает `single` (один ползунок, для "минимальный год выпуска") — тот же компонент/стили, что и для диапазонов.

Модели во `FilterBar` — второй уровень чекбоксов, показывается ТОЛЬКО для брендов, отмеченных чекбоксом в `filters.brands` (пока бренд не выбран — секция моделей не рисуется вообще, вместо неё подсказка `t("select_brand_hint")`). Список моделей и счётчики вычисляются в `page.tsx#models_by_brand` из полного `data.devices` (аналогично `brand_options`), группировка по `model_key` (НЕ по `model_query`, который почти уникален на каждое объявление).

### Паттерн zustand + persist (`src/store/filters-store.ts`)
Состояние фильтров главной страницы (`FilterValues`) хранится в zustand-сторе с middleware `persist` (localStorage, ключ `smartflip-filters`) — фильтры переживают перезагрузку страницы/повторный визит. `page.tsx` читает/пишет через `useFiltersStore((state) => state.filters)` / `state.set_filters` вместо `useState`, `FilterBar` не знает о сторе (получает `filters`/`onChange` как props, как раньше) — стор подключён только в `page.tsx`, чтобы `FilterBar` оставался переиспользуемым/тестируемым без зависимости от глобального состояния. Сортировка/страница пагинации НЕ персистятся (осознанно, обычный `useState`) — только сами значения фильтров.

**Правило:** добавляя новый zustand-стор с `persist` — указывай `version` в опциях (см. `filters-store.ts`), чтобы при несовместимом изменении формы стейта можно было добавить `migrate` вместо краша на старых сохранённых данных у пользователей.

### Паттерн авто-скана по таймеру (`scan-scheduler.ts`)
`rescheduleAutoScan(minutes)` — module-level singleton (`active_task`), при вызове сначала останавливает предыдущую cron-задачу (`active_task?.stop()`), затем, если `minutes !== 0`, создаёт новую по карте `CRON_EXPRESSION_BY_MINUTES` (15/30/60/180/360 → cron-выражение), вызывающую `triggerScan()` (уже защищён от параллельного запуска через `isScanningEffective()`, повторный вызов cron во время активного скана просто no-op). Вызывается в двух местах: `instrumentation.ts` при старте сервера (читает текущее значение из `AppSettings`) и `PATCH /api/settings` при изменении `auto_scan_interval_minutes` (мгновенно применяет новый интервал без перезапуска сервера).

**Правило:** добавляя новый интервал в UI (`AUTO_SCAN_OPTIONS` в `settings/page.tsx`) — обязательно добавь соответствующий cron-паттерн в `CRON_EXPRESSION_BY_MINUTES`, иначе `rescheduleAutoScan` тихо не создаст задачу для неизвестного значения.

### Паттерн уведомлений о "хороших позициях" (`notifier.ts`)
`checkAndNotify(devices)` вызывается из `scan-manager.ts` СРАЗУ после `saveDevices`/`finishScanRun` (в `try/catch`, ошибка уведомлений не должна валить весь скан). Логика:
1. `getNotificationSettings()` — если `enabled === false`, выходит немедленно.
2. Фильтрует `devices` по `brands`/`model_keys`/`regions` (пустой массив = "любой", не "ничего") и диапазонам `min/max_profitability_pct`/`min/max_price` (`null` = без ограничения с этой стороны).
3. `filterUnnotifiedListingIds` — отсекает `olx_listing_id`, которые уже есть в `NotifiedListing` (дедуп — одно и то же объявление не должно спамить повторно на каждом следующем скане, даже если оно снова попадает в выборку).
4. Для оставшихся — `createNotification` (денормализованный снэпшот полей объявления, БЕЗ FK на `Device`, т.к. `Device` полностью перезаписывается на каждом скане — см. `saveDevices`) + `markListingsNotified`.
5. Если `config.telegram.bot_token`/`chat_id` заданы — отправляет `sendMessage` на каждое совпадение через `https://api.telegram.org/bot<token>/sendMessage`; если не заданы — просто пропускает отправку (in-app уведомления работают независимо от Telegram).

**Правило:** `NotifiedListing` — это ЕДИНСТВЕННЫЙ механизм дедупа, не завязанный на `Device` (та таблица пересоздаётся каждый скан) — не удаляй/не очищай её при обычных операциях со сканами, иначе получишь повторный спам уведомлениями по старым объявлениям.

### Паттерн двухуровневого TTL-кэша (L1 in-memory + L2 БД) для ремонтопригодности/цены/запчастей
Помимо старого `cache.ts` (in-memory `node-cache`, живёт только в рамках процесса, TTL из `.env`), теперь есть персистентный L2-слой в БД — `ModelCache` (unique `[brand, model_key]`: `repairability_*`, `ifixit_*`, `avg_market_price`) и `PartsCostCache` (unique `[brand, model_key, damage_signature]`: `parts_cost_estimate`, `allegro_search_url`, `parts_json`). Порядок резолва в `pipeline.ts` (`resolveIfixitDataForQuery`/`fetchPartsData`): L1 (in-memory, дедуп внутри ОДНОГО скана) → L2 (БД, переживает рестарт сервера, `expires_at > now`) → реальный сетевой вызов (iFixit/OLX/Ceneo) → запись результата в L1 И L2 (`expires_at = now + cache_ttl_hours`).

`cache_ttl_hours` (`AppSettings`, диапазон 6-2160ч/3мес, дефолт 72ч) читается ОДИН раз в начале `runFullPipeline()` (как и другие настройки) — изменение в `/settings` применяется к следующему скану. `damage_signature` (`buildDamageSignature`) — отсортированный список `damage_types`, объединённый в строку — ключ учитывает именно КОМБИНАЦИЮ повреждений, а не только бренд/модель (стоимость ремонта разных повреждений не складывается линейно и кэшируется отдельно на каждую уникальную комбинацию).

`avg_market_price` в `ModelCache` — третий, кросс-скановый источник `market_sell_price` (между "медианой текущего скана" и грубым `estimateMarketSellPrice`-fallback): если в ТЕКУЩЕМ скане для модели недостаточно сравнимых объявлений для медианы (`MIN_COMPARABLE_LISTINGS_FOR_MEDIAN`), но в БД есть свежий `avg_market_price` с прошлого скана — используется он (`market_sell_price_source: "cached_median"`). После расчёта медианы в `finalizeDevices` свежая медиана каждой модели ОБНОВЛЯЕТ `ModelCache.avg_market_price` — так кэш "дозревает" по мере накопления сканов.

**Правило:** добавляя новое поле для кэширования по модели — решай, относится ли оно к "статичным характеристикам устройства" (→ `ModelCache`, без привязки к повреждениям) или "зависит от состояния конкретного объявления" (→ `PartsCostCache`, с `damage_signature`).

### Паттерн формул рыночной цены и condition_score (`brand-extractor.ts`, `model-market-price-hints.ts`, `pipeline.ts`)
`getModelMarketPrice(model_key, storage_gb)` — справочник `MODEL_MARKET_PRICE_HINTS` (база `MARKET_REFERENCE_STORAGE_GB=128`), нормализация объёма памяти `price × mult(storage) / mult(REFERENCE)`, затем `× OLX_USED_MARKET_FACTOR (0.72)` — реальные сделки OLX.pl ниже «витринных» оценок.

`estimateDamagedResalePrice(working_price, damage_types, buy_price, parts_cost)` — цена продажи **после ремонта**: `working_price × (1 − post_repair_discount)` с потолком `0.92 × working`. Скидки по типам повреждения (экран ~10%, вода ~22%…), суммируются с убывающей отдачей (cap 38%). Пол `buy + parts×1.12 + 80` только если есть оценка запчастей, но не выше `0.95 × working`. **Не** использует `buy_price / 0.38`.

`estimateMarketSellPrice(brand, model_key, buy_price, is_damaged, storage_gb, damage_types, parts_cost)` — fallback:
- **Неповреждённое**: `buy × 1.04`, зажатое в `[working × 0.5, working × 1.08]`.
- **Повреждённое**: делегирует в `estimateDamagedResalePrice` с `working = getModelMarketPrice ?? brand_median`.

В `finalizeDevices` для `is_damaged` приоритет: `anchor_price` (медиана/хинт/кэш) → `estimateDamagedResalePrice`; иначе полный fallback `estimateMarketSellPrice`. Передавать `raw.damage_types` и `estimatePartsCost(raw.allegro_parts)`.

`computeConditionScore(damage_types, battery_health_percent)` в `pipeline.ts` заменил хардкод `condition_score: 45` (который был одинаковым для ВСЕХ объявлений независимо от состояния) — база 88, минус штраф за каждый тип повреждения, минус штраф за низкую батарею, `clamp(15, 95)`. Используется в `getLiquidityScore` — теперь состояние объявления реально влияет на `liquidity_score`.

### Паттерн тёмной темы (CSS-переменные + Tailwind `dark:`)
Единый источник цвета — семантические CSS-переменные в `globals.scss` (`--color-bg`, `--color-surface`, `--color-text`, `--color-primary`, `--color-positive/negative/warning` и т.д.), светлые значения в `:root`, тёмные — в `.dark { ... }`. `@custom-variant dark (&:where(.dark, .dark *));` включает у Tailwind v4 class-based тёмную тему (без этой строки `dark:`-классы реагировали бы только на `prefers-color-scheme`, игнорируя класс `.dark`, который ставит `ThemeSwitcher`).

Два места, где живёт цвет, — используй правильное для контекста:
- **SCSS Modules компонентов** (`DeviceCard.module.scss`, `FilterBar.module.scss` и т.д.) — ТОЛЬКО `var(--color-*)`, никаких хардкод-хексов (кроме намеренно декоративных — цвета `DamageTag` по типу повреждения и фиксированный градиент `StatBar`, у них СВОИ явные `:global(.dark) &` оверрайды внутри модуля).
- **Tailwind-утилиты прямо в `page.tsx`/`settings/page.tsx`/`devices/[id]/page.tsx`** — парный `dark:`-класс на каждый цветовой класс (`bg-white dark:bg-slate-900`, `text-slate-900 dark:text-slate-100` и т.п.), т.к. эти страницы не используют CSS-переменные напрямую.

Анти-FOUC: `layout.tsx` вставляет `buildAntiFoucScript()` (`lib/theme.ts`) как инлайн-`<script>` в `<head>` — читает `localStorage`/`prefers-color-scheme` СИНХРОННО до гидратации React и сразу ставит класс `dark` на `<html>`, чтобы пользователь с сохранённой тёмной темой не увидел вспышку светлой вёрстки. `<html suppressHydrationWarning>` обязателен, иначе React ругается на несовпадение класса, поставленного инлайн-скриптом, с серверным рендером.

**Правило:** добавляя новую страницу/компонент с цветом — сначала проверь, есть ли подходящая семантическая переменная, и только если реально нужен цвет, не завязанный на тему (декоративный бейдж/градиент) — добавляй хардкод с явным дарк-оверрайдом рядом, а не переменную с единственным использованием.

### Паттерн StatBar (шкалы вместо чисел)
`StatBar` — переиспользуемый примитив для ликвидности/прибыльности/ремонтопригодности на `DeviceCard` и детальной странице: принимает `value` (0-100, УЖЕ нормализованное для позиции заполнения) и отдельно `display_value` (произвольная строка для подписи, может не совпадать с `value` численно). Сама шкала — ФИКСИРОВАННЫЙ градиент красный→жёлтый→зелёный (не зависит от `value` цветом), поверх него `value`-оверлей затемняет всё СПРАВА от текущей позиции — видимым остаётся только "заполненный" участок слева. Нормализация прибыльности (диапазон значений которой не 0-100) — `normalizeProfitability` в `DeviceCard.tsx`/`devices/[id]/page.tsx` (дублируется в двух местах осознанно, чтобы не тащить лишний общий модуль под одну маленькую функцию; при появлении третьего места использования — вынести в `lib/`).

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| GET | /api/devices | Список устройств + `is_scanning`/`stage`/`total_listings`/`processed_listings`/`percent` |
| GET | /api/devices/:id | Одно устройство по OLX id |
| GET | /api/scan/status | Статус сканирования (те же поля прогресса, что и /api/devices) |
| POST | /api/scan/start | Запустить новое сканирование (409, если уже идёт) |
| GET/PATCH | /api/settings | Объединённый ответ: `AppSettings` (battery, auto_scan, cache_ttl — PATCH admin-only) + `UserDisplaySettings` (junk/iphone/android — PATCH любой approved user) + `is_admin` |
| GET/PATCH | /api/notification-settings | `NotificationSettings` (+ вычисляемый `telegram_configured` в GET, не персистится) |
| GET/PATCH/DELETE | /api/notifications | Список последних уведомлений / отметить все прочитанными / очистить всё |
| GET | /api/notifications/unread-count | `{ count }` непрочитанных — для бейджа `NotificationBell` |
| GET | /api/health | Health check |

## Кэши и pipeline (config.ts, читает .env)

| Переменная | Описание | По умолчанию |
|---|---|---|
| `IFIXIT_CACHE_TTL_SEC` | TTL L1 in-memory кэша iFixit (сек, живёт в рамках процесса) | 86400 (24ч) |
| `PARTS_CACHE_TTL_SEC` | TTL L1 in-memory кэша цен на запчасти (Ceneo/статика) | 3600 (1ч) |
| `OLX_MAX_PAGES` | Кол-во страниц OLX для скана | 5 |
| `OLX_PAGE_LIMIT` | Кол-во объявлений на странице | 40 |
| `PARTS_PER_MODEL` | Макс. вариантов запчастей на модель/тип повреждения | 5 |
| `PIPELINE_CONCURRENCY` | Кол-во объявлений "в полёте" одновременно (пул воркеров) | 8 |
| `OLX_STATE_FILTERS` | Состояния OLX для поиска, через запятую | damaged,used |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram-бота для уведомлений (опционально) | — |
| `TELEGRAM_CHAT_ID` | ID чата/канала, куда слать уведомления (опционально) | — |

L2-кэш (`ModelCache`/`PartsCostCache` в БД, переживает рестарт) настраивается через UI (`/settings` → "Срок актуальности кеша"), не через `.env` — см. `AppSettings.cache_ttl_hours` и паттерн выше.

## Pipeline Flow (реальный прогон ~450 объявлений ≈ 1.5-2 минуты с `PIPELINE_CONCURRENCY=8`, было ~11 минут до оптимизации)

1. `fetchOlxListingsForStates` → список объявлений по всем `OLX_STATE_FILTERS` (GraphQL, дедупликация по id) — стадия прогресса `fetching_listings`.
2. `getAppSettings()` — читает `battery_health_threshold_percent` ОДИН раз на весь скан (не на каждое объявление).
3. **Фаза 1** — `runWithConcurrency(listings, PIPELINE_CONCURRENCY, analyzeSingleListing, on_item_done)` — стадия `analyzing`, `on_item_done` тикает `processed_listings`. Внутри `analyzeSingleListing` на каждое объявление:
   a. `extractModelKey(brand, title)` → `model_key`/`model_label`; `getReleaseYear(model_key)` → `release_year` (может быть `null`); **junk-чек №1** (`evaluateJunkStatus`, до сети) — явный мусор (неизвестная модель/старый год/нереалистичная цена/лот-сервис в заголовке) отбрасывается здесь, `analyzeSingleListing` возвращает `null` СРАЗУ, не доходя до шагов ниже.
   b. `extractOlxListingSignals(listing, battery_threshold_percent)` → `damage_types` + `post_summary` + `device_query` + `has_box` + `battery_health_percent` (единственный обязательно-последовательный сетевой шаг).
   c. **Junk-чек №2** (с уже известным `post_summary`) — ловит лоты/сервисы, упомянутые только в тексте описания.
   d. **Параллельно** (`Promise.all`): `resolveIfixitDataForQuery` (iFixit repairability, с кэшем) И `fetchPartsData` (запчасти по всем `damage_types`, тоже параллельно между собой).
   e. Возвращает `RawAnalyzedListing` — БЕЗ `market_sell_price`/`profitability`/`liquidity` (см. паттерн двухфазного расчёта выше); `null`, если объявление признано мусором на шаге a/c — `runFullPipeline` отфильтровывает `null` ПЕРЕД `finalizeDevices`.
4. `fetchPartsData` на каждый `damage_type` (см. `fetchPartsForDamageType`):
   a. Allegro (`allegro-parts-fetcher.ts`) — API → HTML → Scrapfly.
   b. OLX "Części do telefonów" (`olx-parts-fetcher.ts`) — с медианным фильтром цен.
   c. parts-store.pl (`parts-store-fetcher.ts`) — GraphQL `productsTextSearch` на `/graphql/v1/` (без auth; лимитер 2 req / 450ms).
   d. Ceneo.pl (четвёртая попытка — чаще анти-бот заглушка).
   e. Fallback: статические оценки из `static-parts-prices.ts` (помечены ★ в заголовке).
5. **Фаза 2** — `finalizeDevices(raw_listings)`: `clusterModelKeys` → медиана цены по `model_key` в текущем скане → `prefetchOlxMarketPrices()` для моделей без медианы (OLX GraphQL `query`, сохранение в `ModelCache.avg_market_price`) → `market_sell_price`/`market_sell_price_source` → `calculateProfitability` (медиана запчастей по типу повреждения) → `getLiquidityScore`.
6. Стадия `saving`: `saveDevices` — сохраняет весь результат скана в Prisma (транзакция, полная замена таблицы `Device`)

### Фильтрация цен запчастей (`parts-shared.ts`, общее для OLX/Ceneo)
- `isPriceRealistic(price, damage_type)` — проверяет диапазон по типу запчасти
- `isRelevantProduct(name, brand, model)` — бренд или модель должны быть в названии
- `mentionsPartKeyword(title, keyword)` — объявление должно явно упоминать искомую запчасть (иначе OLX category search подсовывает целые телефоны)
- Throttle/конкурентность — через `concurrency-limiter.ts`, см. секцию выше.

## Запуск

```bash
npm install
npx prisma migrate dev   # если миграции ещё не накатаны
npm run dev               # http://localhost:3000 (UI + API, единый процесс)
```

Production:
```bash
npm run build
npm run start
```

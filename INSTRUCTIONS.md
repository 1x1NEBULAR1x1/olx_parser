# Instructions (шпаргалка)

Объединённая шпаргалка после миграции отдельных `frontend/` (React Router SPA) и
`backend/` (Express) в единое Next.js 15 приложение. Старые `backend/INSTRUCTIONS.md`
и `frontend/INSTRUCTIONS.md` слиты сюда перед удалением папок.

## Стек

- **Next.js 15** (App Router) — единый процесс для UI и API, порт 3000
- **React 19**, **Tailwind CSS 4** (утилитарные классы) + **SCSS Modules** (компонент-специфичные стили)
- **Prisma 7** + **PostgreSQL** (`@prisma/adapter-pg` + `pg` — driver adapter, обязателен в v7)
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
    admin-users/, admin-scan-log/, admin-notifications/, admin-catalog/, login/, pending/
  widgets/                      — крупные UI-блоки
    app-header/                 — глобальная шапка (x-kom: логотип, нав, skip-link)
    header/                     — HeaderActions (слот шапки)
    admin-shell/                — AdminShell + табы админки
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
    ui/                         — CheckboxGroup, RangeSlider, Pagination, StatBar, TermHint
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
    devices-repository.ts     — Device, ScanRun, Part, AppSettings, ModelCache, PartsCostCache
    user-notifications-repository.ts — UserNotificationSettings, Notification, NotifiedListing
    scan-issues-repository.ts — ScanIssueCollector, лог битых объявлений
                              — prune empty_description / repairability_stub / estimate_parts при чтении лога и дашборда
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
                              — timeout/ошибка полного анализа → lightweight fallback
    parts-chain.ts            — волны Allegro → Ceneo → магазины → OLX, max 4, merge ручного скана
                              — ошибка источника не валит лот
    run-with-concurrency.ts   — runWithConcurrency (порядок по индексу), withTimeout
    scan-manager.ts           — triggerScan, getScanStatus, isScanningEffective
    scan-scheduler.ts         — node-cron авто-рескан
    scan-issue-detector.ts    — classifyListingError, detectDeviceWarnings
                              — не пишет empty_description / repairability_stub / estimate_parts (ожидаемые заглушки)
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
2. Волны по приоритету (не waterfall «первый непустой»): Allegro → Ceneo → магазины (`parts-store.pl` GraphQL + `mobilepart.pl` / `m9parts.pl`) → OLX объявления. Нижнюю волну не дергаем, если уже набрано `PARTS_PER_MODEL` (дефолт 4) реальных позиций.
3. `selectRankedParts` (`src/shared/lib/parts-rank.ts`) — дедуп по URL, max 4 на `damage_type`, OLX только как добивка.
4. Ручной скан из админки: `manual_sources` + `merge_existing` — один источник не затирает остальные.
5. Медианный фильтр выбросов (`parts-shared.ts`)

### Паттерн concurrency

`run-with-concurrency.ts` — пул воркеров со скользящим окном (не фиксированные батчи).
`concurrency-limiter.ts` — per-source лимитеры (OLX, Ceneo, parts-store, iFixit).

prisma/
  schema.prisma
  migrations/
prisma.config.ts
src/instrumentation.ts        — авто-скан при старте + rescheduleAutoScan
src/shared/db/client.ts       — Prisma singleton (`@prisma/adapter-pg` + `DATABASE_URL`)
```

## База данных (PostgreSQL)

- `provider = "postgresql"` в `prisma/schema.prisma`
- Клиент: `src/shared/db/client.ts` → `new PrismaPg({ connectionString })` + `new PrismaClient({ adapter })`
- CLI URL — в `prisma.config.ts` через `env("DATABASE_URL")`
- Baseline-миграция: `prisma/migrations/20261110220000_postgres_baseline` (история SQLite сброшена — новый деплой с `migrate deploy` на пустой Postgres)
- Локально: `cp .env.example .env`, поднять Postgres, затем `npx prisma migrate dev` / `npm run prisma:migrate:deploy`

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
2. Для API — `src/app/api/<path>/route.ts` с `export const runtime = "nodejs"` (нужен для Prisma/`pg`) и `export const dynamic = "force-dynamic"` (данные не должны кэшироваться статически).

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
- PostgreSQL: клиент через `@prisma/adapter-pg` (`src/shared/db/client.ts`). `saveDevices` пишет `createMany` чанками (не N вложенных `create` в одной короткой транзакции). `DATABASE_URL=postgresql://...`.

### Добавление нового in-memory кэша
```typescript
// В cache.ts — создать new NodeCache({ stdTTL: config.cache.YOUR_TTL_sec })
// Добавить getter/setter функции
// Использовать в pipeline.ts
// TTL всегда брать из config.ts (который читает .env), не хардкодить
```

### Паттерн scan-manager (важно!)
`triggerScan()` запускается автоматически при старте сервера (`instrumentation.ts`, dynamic import) и вручную через `POST /api/scan/start`. Для проверки "не идёт ли уже скан" **нельзя полагаться только на in-memory флаг** — в dev-режиме Next.js `instrumentation.ts` и Route Handlers могут исполняться в разных инстансах модуля (разные бандлы/воркеры), из-за чего in-memory `is_scanning` не всегда синхронизирован между ними.

Решение: источник истины — БД (`ScanRun.status === "running"`), in-memory флаг — доп. защита внутри одного инстанса модуля. `ScanCoordinator` lock считается активным **только** пока связанный `ScanRun` в статусе `running`. После Ctrl+C / рестарта `reconcileStaleScanRuns()` помечает running-сканы failed **и** снимает lock (`forceReleaseScanLock`), иначе UI idle, а `triggerScan()` пишет «Скан уже идёт (ScanCoordinator lock)».
- `isScanningEffective()` — асинхронная проверка "OR" из обоих источников; использовать её в API-роутах и перед запуском нового скана.
- `isScanning()` — синхронная, только in-memory, использовать только внутри `scan-manager.ts` для быстрой защиты от повторного вызова в том же процессе.
- `getScanStatus()` учитывает оба источника при формировании `is_scanning` в ответе.

### Паттерн concurrency-limiter (важно! читать перед добавлением нового внешнего источника)
Раньше каждый скрапер (`ceneo-fetcher.ts`, `olx-parts-fetcher.ts`) реализовывал throttle сам — строго последовательная промис-очередь ("жди слот -> fetch -> жди ответ -> следующий слот"), из-за чего даже при большом `PIPELINE_CONCURRENCY` реальные сетевые запросы к одному сайту шли по факту один за одним, а не параллельно.

Теперь throttle вынесен в общий `concurrency-limiter.ts`:
- `createConcurrencyLimiter(max_concurrent, min_interval_ms)` — возвращает функцию `schedule(fn)`. Пускает до `max_concurrent` запросов ОДНОВРЕМЕННО, разнося только МОМЕНТЫ СТАРТА не чаще `min_interval_ms`. Слот очереди снимается **только когда можно стартовать** (иначе при `wait > 0` следующие `schedule` пробивали лимит).
- `fetchWithTimeout(url, init, timeout_ms)` — `fetch` с `AbortSignal.timeout()`, сигнал из `init` объединяется через `AbortSignal.any`.

Текущие лимиты (подбирались по "чем агрессивнее анти-бот у источника — тем строже"):
- OLX (`olx-parts-fetcher.ts`, `fix-parser.ts#olx_page_limiter`) — 6 конкурентных, старт не чаще раза в 80-100ms. OLX не показал анти-бот защиты даже на реальных прогонах.
- iFixit (`fix-parser.ts#ifixit_limiter`) — 4 конкурентных, 100ms.
- Ceneo (`ceneo-fetcher.ts#ceneo_limiter`) — 2 конкурентных, 500ms (строже — реально банит/показывает заглушку при агрессивном опросе).

**Правило:** добавляя новый внешний источник — заводи для него отдельный `createConcurrencyLimiter(...)` здесь же в модуле-скрапере (module-level singleton), не плоди свои реализации throttle.

### Параллелизация внутри одного объявления (`pipeline.ts#analyzeSingleListing`)
Единственная реальная последовательная зависимость на объявление: сначала нужно получить `post_summary` + `damage_types` + `device_query` (`extractOlxListingSignals` — описание/продавец из GraphQL поиска, без HTML-страницы). После этого **iFixit-поиск и поиск/оценка цен на запчасти запускаются параллельно** (`Promise.all`) — раньше шли строго по очереди (запчасти ждали iFixit впустую). Внутри `fetchPartsData` типы повреждений одного объявления тоже обрабатываются параллельно (`Promise.all` вместо `for...of`).

`runWithConcurrency` (пул воркеров со скользящим окном, а не фиксированными батчами) держит до `PIPELINE_CONCURRENCY` объявлений "в полёте" одновременно — как только воркер освобождается, сразу берёт следующее объявление, не дожидаясь остальных из "батча". Результаты пишутся по исходному индексу.

Если полный анализ лота упал/таймаутнулся — `analyzeFullWithFallback` делает lightweight по данным GraphQL (лот не выпадает из выдачи) и пишет warning `degraded_to_lightweight`. Падение одного источника запчастей не валит лот: `parts-chain` ловит ошибку, идёт к следующему источнику/заглушке и один раз за скан пишет `parts_source_failed`. `withTimeout` абортит `AbortController`, сигнал уходит в fetch запчастей.

### Паттерн ScanOutcome (бесперебойная лента)
Формулы оценки не меняются — меняется оболочка прогона (`scan-outcome.ts`).

1. `fetchOlxListingsForStates` больше не throw'ит весь скан: упавшая страница/штат → issue + уже собранные лоты. После внутренних ретраев страница пропускается (offset += limit), цикл останавливается после двух подряд неудач — не теряем хвост штата из-за одной дыры.
2. `shouldReplaceFeed` запрещает `saveDevices`, если новый набор пустой или <15% прошлой ленты (при ≥20 лотах). Тогда `ScanRun.status=failed`, лента **не** затирается, UI показывает предыдущие карточки.
3. Иначе скан `completed`; если были частичный fetch / lightweight-fallback / пропуски — `error_message` + `outcome_status=degraded`. История цен и журнал issues после успешного `saveDevices` не могут перевести скан в `failed`.
4. API `/api/scan/status` отдаёт `last_scan_status`, `last_scan_error`, `outcome_status`, `kept_previous_feed`. Дашборд берёт последний **законченный** скан, не только `completed`.
5. `notifyScanHealth` — in-app + push + один Telegram всем approved (`source: scan_health`), отдельно от сделок; ошибка одного пользователя не рвёт остальных.
6. Delta: fingerprints (`id/title/price`) + `getDevicesByIds` только для unchanged. Finalize/iFixit/каталог — snapshot в память, без N+1. L2 upsert (ifixit/parts) после save через job `l2_cache`.
7. `withTimeout` абортит `AbortController`; сигнал идёт в GraphQL лота и цепочку запчастей. Abort **не** ретраится.

**Правило:** критический сбой внешнего источника не должен оставлять пользователя с пустой лентой. Либо новый набор, либо явный предыдущий снимок + уведомление.

Пустое `description` из поиска (пустая строка, не `undefined`) раньше считалось «уже загружено» и блокировало GraphQL по id. Теперь: непустой текст → как есть; пустой → `fetchOlxListingById`; HTML только если GraphQL бросил (CloudFront 403 иначе жрёт 8с).

### Прогресс скана в процентах (`ScanRun.stage/total_listings/processed_listings`)
`runFullPipeline(on_progress)` зовёт `on_progress({stage, total_listings?, processed_listings?})` на реальных стадиях: `fetching_listings` → `analyzing` (с тиками на каждое обработанное объявление) → (в `scan-manager.ts` отдельно) `saving`. `scan-manager.ts#createThrottledProgressWriter` пишет это в БД не чаще раза в 400ms (иначе при `PIPELINE_CONCURRENCY=8` и сотнях объявлений — поток мелких UPDATE), но переходы стадии и финальный тик проходят без пропуска.

`calculateScanPercent` (`scan-progress.ts`) переводит стадию в %: `fetching_listings` 1–10% (страницы OLX и/или время, если totals ещё нет), `analyzing` 10–74%, `finalizing` 74–88%, `saving` 88–99%, `completed` 100%. Между тиками пайплайна % чуть ползёт (`item_elapsed_ms`), чтобы полоска не замирала. Живой прогресс держится in-memory (`live_progress` в `scan-manager.ts`); UI держит **один** `GET /api/scan/status?light=1&wait=1&cursor=…` (long-poll до 25с, прокси `/api/` — `proxy_read_timeout 600s`). Смена стадии/прогресса будит waiters (throttle 1с); в покое — тихий reconnect после timeout. Логи: `src/server/logger.ts` (`createLogger`, `StageTimer`, ETA в `scan-manager.ts`). `LOG_LEVEL=debug` для подробностей. `journalctl -u smartflip -f` на сервере.

### Паттерн двухфазного расчёта цены/ликвидности (`pipeline.ts`)
`analyzeSingleListing` (фаза 1) считает всё, что можно посчитать по ОДНОМУ объявлению независимо от остальных — бренд, `model_key`/`model_label` (`model-normalizer.ts`), `damage_types`, `has_box`, `battery_health_percent`, iFixit, запчасти. Возвращает `RawAnalyzedListing`, **без** `market_sell_price`/`profitability`/`liquidity`.

`detectDamageTypes` (`fix-parser.ts`): keyword запчасти (`ekran`, `kamera`…) сам по себе ещё не поломка. Если в окне ±40 нет `STRONG_DAMAGE_MARKERS` (`uszkodzon`, `pęknięt`…) и есть `HEALTH_MARKERS` или `PROTECTION_MARKERS` (`zabezpieczon`, `hartowan`, `3mk`, `folia`, `zadbany`) — тип не ставится. «ekran pęknięty mimo szkła 3mk» остаётся screen. Тесты: `listing-heuristics.test.ts`. Изменение действует после перескана (или refresh listing-signals).

`finalizeDevices` (фаза 2) вызывается ОДИН раз на весь скан, когда все объявления уже проанализированы:
1. `buildMedianPriceByModelKey` — группирует объявления по `model_key`, берёт `price_buy` только у объявлений с `damage_types.length === 0`, считает медиану (требует минимум `MIN_COMPARABLE_LISTINGS_FOR_MEDIAN=2` объявлений в группе).
2. Для каждого объявления: `market_sell_price` = медиана группы (+`BOX_AND_ACCESSORIES_BONUS_SCORE`% если `has_box`) **или** `estimateMarketSellPrice(brand, price_buy)` (fallback), если сравнимых объявлений мало. Метод сохраняется в `market_sell_price_source`.
3. `getLiquidityScore` вызывается с реальными `release_year` (из `release-year-hints.ts`), `has_box`, `battery_health_percent`, `market_median_price` — раньше сюда передавался хардкод `release_year: 2022` для всех устройств.
4. `calculateProfitability` считается уже с финальным `market_sell_price`.

**Правило:** добавляя новое поле, которое зависит от ВСЕХ объявлений скана (не только текущего) — считай его в `finalizeDevices`, а не в `analyzeSingleListing`, иначе оно будет неполным/некорректным (объявления обрабатываются параллельно, порядок завершения не гарантирован).

### Паттерн AppSettings (настройки приложения)
Синглтон-модель Prisma (`AppSettings`, фиксированный `id=1`) — `getAppSettings()`/`updateAppSettings()` в `devices-repository.ts` используют `upsert`, поэтому строка создаётся лениво при первом обращении (без seed-скрипта). `runFullPipeline()` читает настройки ОДИН раз в начале скана — изменение настройки применяется только к СЛЕДУЮЩЕМУ запуску, не к уже сохранённым данным. Добавляя новую настройку: 1) поле в `AppSettings` + миграция, 2) `AppSettingsData` в `devices-repository.ts`, 3) прочитать в `runFullPipeline()`/там, где нужно, 4) прокинуть в UI `/settings` + `lib/api.ts#AppSettings`.

### Паттерн UserDisplaySettings (персональные фильтры ленты)
Модель Prisma `UserDisplaySettings` (1:1 с `User`) — `getUserDisplaySettings(user_id)`/`updateUserDisplaySettings()` в `user-display-settings-repository.ts` (upsert по `user_id`). Поля: `exclude_junk_listings`, `junk_min_release_year`, `exclude_iphone`, `exclude_android`, `exclude_unprofitable`, `min_profit_pln`, `min_profit_pct_of_price`. Применяются в `getLatestDevicesPage()` через `applyUserDisplayFilters()` — **на лету**, без перескана. Скан (`runFullPipeline`) сохраняет ВСЕ объявления; мусор/платформы/убыточность не отсекаются в `analyzeSingleListing`. Порог прибыли — `profit-floor.ts`: при включённом тоггле скрываются сделки ниже суммы (zł) **и** ниже % от цены покупки.

**Правило:** `junk_min_release_year` — ЧАСТЬ режима `exclude_junk_listings` (см. `junk-filter.ts`). UI `/settings` — секция "Ваша лента" (доступна всем approved), отдельная кнопка "Сохранить фильтры". Глобальные настройки (`AppSettings`: battery, auto_scan, cache_ttl) — только admin, секция "Система". Оценочные ★-запчасти при отдаче карточки пересчитываются в `applyUserDeviceView` через `refreshEstimatePartPrices` — смена ориентира (S25 FE и т.п.) видна сразу, без нового скана.

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

### Паттерн delta-scan + two-phase (`delta-scan.ts`, `listing-prefilter.ts`)
После `fetchOlxListingsForStates` пайплайн не анализирует все объявления заново:
1. `partitionDeltaScan(incoming, previous)` — reuse если id+title+цена совпали (±0.5 zł); changed/new идут дальше; dropped пропадают вместе с полной заменой `Device`.
2. `scoreListingCandidate` — бренд/модель/damage из заголовка + `getModelMarketPrice` − static parts → `priority_score`.
3. `selectListingsForFullAnalysis` — сначала лоты с `estimated_profit >= TWO_PHASE_MIN_PROFIT_PLN`, затем добивка топом до `TWO_PHASE_FULL_ANALYZE_LIMIT`. Остальные — `analyzeListingLightweight` (без HTTP на страницу OLX).
4. Reused + full + light сливаются и идут в `finalizeDevices` (медианы считаются по всему набору).

Выключить: `DELTA_SCAN=0`, `TWO_PHASE=0`.

### Паттерн in-process job queue (`job-queue.ts`)
Нет Redis — однопроцессный деплой на PostgreSQL. `createJobQueue(handlers)` — FIFO, последовательно, ошибки одной задачи не стопают очередь. `scan-jobs.ts` после скана (когда лента уже сохранена и `ScanRun` completed):
- `enqueueMedianCacheWrites` — пакетный upsert `ModelCache.avg_market_price` по медианам ЭТОГО скана;
- `enqueueOlxMarketPrefetch` — сетевой сбор медиан OLX для моделей без своей выборки (cap 40), кэш на следующий скан;
- `enqueueKimovilPrefetch` — уникальные модели, cap 20, L2 `ModelCache`;
- `enqueueAllegroPrefetch(catalog_entry_id)` — ручной prefetch из админки.

Не ждать эти задачи в `finalizeDevices`: запись медиан раньше блокировала стадию «сводим результаты» на минуты (сотни upsert + OLX). Текущий скан считает рентабельность по медиане скана / каталогу / хинту; фоновый кэш дозревает к следующему прогону.

**Правило:** не добавляй BullMQ/Redis, пока деплой однопроцессный. Новые фоновые задачи — новый `JobName` + handler в `scan-jobs.ts`.

### Паттерн server-side ленты (`device-feed-query.ts`)
Фильтры/сортировка/страница живут в `src/shared/lib/device-feed-query.ts` (и клиент, и сервер). `/api/devices` парсит query (`parseDeviceFeedPageQuery`), режет `DeviceFilterSelectRow` → `filterDeviceFeed` → `sortDeviceFeed` → `paginateDeviceFeed`, затем грузит полные `Device` только для id страницы. `useDevicesFeed({ filters, sort, page, page_size })` больше не докачивает весь список чанками. `filter_meta` строится по всей видимой выдаче (после user display filters), не по текущей странице.

**Правило:** новый фильтр ленты = поле в `DeviceFeedFilters` + parse/append в `device-feed-query.ts` + колонка в `DEVICE_FILTER_SELECT`. Не фильтровать повторно на клиенте главной.

Дерево марка → серия → модель: при выборе модели/серии родители выбираются автоматически (`brand-tree-selection.ts`). В `filterDeviceFeed` конкретная модель важнее серии (серия не должна обнулять выдачу).

### Паттерн уведомлений о "хороших позициях" (`notifier.ts`)
### Паттерн уведомлений о "хороших позициях" (`notifier.ts`)
`checkAndNotify(devices)` вызывается из `scan-manager.ts` СРАЗУ после `saveDevices`/`finishScanRun` (в `try/catch`, ошибка уведомлений не должна валить весь скан). Логика:
1. `listEnabledNotificationSettings()` — все пользователи с `UserNotificationSettings.enabled === true` (персональные критерии, 1:1 с User).
2. Для каждого пользователя фильтрует `devices` по его `brands`/`model_keys`/`regions` (пустой массив = "любой") и диапазонам `min/max_profitability_pct`/`min/max_price` (`null` = без ограничения).
3. `filterUnnotifiedListingIds(user_id, …)` — дедуп **per-user** через `NotifiedListing` (`@@unique([user_id, olx_listing_id])`).
4. `createNotification` — денормализованный снэпшот + `user_id` + `source: "scan"` + `telegram_status` (БЕЗ FK на `Device`).
5. Telegram: общий чат из env (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`); одно объявление → одно Telegram-сообщение за скан (даже если критерии сработали у нескольких пользователей). In-app — каждому подходящему пользователю отдельно.

**Доставка:**
- **Онлайн** (вкладка видима): `NotificationToastHost` — попап сверху (смах вверх / крестик), через SW `postMessage` или long-poll.
- **Офлайн / фон**: Web Push (`public/sw.js` + `PushSubscription` + VAPID env). Включение в `/notifications/settings`.
- Telegram: опциональный общий чат из env.

**Правило:** `NotifiedListing` — ЕДИНСТВЕННЫЙ механизм дедупа, не завязанный на `Device`. Не очищай при обычных операциях со сканами. Настройки — только через `UserNotificationSettings` (старый синглтон `NotificationSettings` удалён).

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

### Паттерн кнопок шапки
Контролы в `HeaderActions` копируют `NotificationBell`: 36×36, `border: 1px solid var(--color-border)`, `border-radius: 8px`, `background: var(--color-surface)`, `color: var(--color-text-muted)`, hover — `color: var(--color-primary-text)` и `border-color: var(--color-primary-border-strong)`. Нативные `Link`/`button` + `*.module.scss`, без MUI `IconButton`. Переключатели темы/языка — та же рамка высотой 36px, активный сегмент `var(--color-primary-bg)`.

Адаптив шапки:
- `<360px` — только логотип, без названия;
- `<600px` — колокольчик + аватар + меню (настройки/тема/язык внутри);
- `600–899` — плюс кнопка настроек;
- `≥900px` — десктоп-навигация и переключатели темы/языка, меню скрыто;
- `<900px` — вторая строка навигации (Лента / Избранное / Админка) и те же ссылки в `PreferencesMenu`.

### Паттерн глобальной шапки + SSR ленты
`AppHeader` живёт в `src/app/layout.tsx` (не дублировать `StickyHeader`/`HeaderActions` на страницах). Скрывается на `/login` и `/pending`. Skip-link ведёт на `#main-content` (`PageContainer`).

Лента и деталка — SSR: `app/page.tsx` / `app/devices/[id]/page.tsx` / `app/favorites/page.tsx` зовут `src/server/domain/feed-loader.ts` и передают `initial_feed` / `initial` в view. Хуки (`useHomePage`, `useDevicesFeed`, `useDeviceDetail`, `useDeviceCardActions`) вынесены из JSX. `useDevicesFeed({ initial_feed })` не делает лишний первый fetch. Статус скана — long-poll `fetchScanStatus({ light: true, wait: true, cursor })`, без интервала раз в 1с.

### Паттерн long-poll (скан + каталог + уведомления)
Один висящий GET вместо спама коротких запросов. Общий примитив: `src/server/shared/long-poll.ts#waitUntil` + `live-hub.ts` (in-memory EventEmitter). Timeout по умолчанию 25с (`maxDuration = 30` на route), клиент сразу переподключается. Скрытая вкладка не дергает API (`waitForDocumentVisible`).

- **Скан:** `GET /api/scan/status?light=1&wait=1&cursor=`. Пустой cursor → сразу снимок. Дальше сервер ждёт смену `buildScanCursor` (стадия / processed / tick) или timeout. `publishScanUpdate` из `scan-manager` (старт/финиш сразу, прогресс не чаще 1с). `ScanDashboard` **не** прячет три кольца на время скана: карточки остаются, `%`/`processed` обновляются с long-poll, справочники/прибыльность — с `getScanDashboardStats` не чаще 8с (и сразу после финиша). Кнопка «Обновить данные» крутит иконку, `RingChart is_busy` — орбитальная дуга.
- **Каталог:** `GET /api/admin/catalog/enrich/status?wait=1&cursor=`. Пустой cursor → сразу снимок. Дальше сервер ждёт смену `buildCatalogCursor` (processed / модель / набор / manual job) или timeout. Клиент: `useCatalogEnrichmentLive` (список и карточка модели), без `setInterval`.
- **Уведомления:** `GET /api/notifications/unread-count?wait=1&cursor=&count=`. Без `wait` — как раньше `{ count }` (совместимость). С `wait` — `{ count, cursor, items, timed_out }`. Первый запрос `count=-1` отдаёт снимок без тостов; дальше будит `createNotification` / mark-read / clear. Колокольчик, меню и тосты делят **один** цикл (`useNotificationsLive`, retain-count).
- Клиент: `src/shared/lib/long-poll-client.ts`. Abort при размонтировании → 499.

**Правило:** не добавляй `setInterval` на `/api/scan/status`, `/api/admin/catalog/enrich/status` и unread-count. Новый live-сигнал = `publish*` в hub + cursor в ответе.

### Паттерн тёмной темы (CSS-переменные)
Единый источник цвета — семантические CSS-переменные в `globals.scss` (`--color-bg`, `--color-surface`, `--color-text`, `--color-primary`, `--color-positive/negative/warning` и т.д.), светлые значения в `:root`, тёмные — в `.dark { ... }`.

**Стартовые цены каталога:** `seedCatalogStartingData()` проставляет каждой модели `market_sell_price` (справочник / медиана бренда) и ★-запчасти по `CATALOG_PREFETCH_DAMAGE_SETS`. Реальные Allegro/OLX/Ceneo не затираются. Запускается перед обогащением и после sync из скана.

**Стартовые цены каталога:** `seedCatalogStartingData()` проставляет каждой модели `market_sell_price` (справочник / медиана бренда) и ★-запчасти. Реальные Allegro/OLX/Ceneo не затираются. Запускается перед обогащением и после sync из скана.

**Палитра** (витрина): тёплый фон + голубой CTA + зеленоватая прибыль.
- Light: bg `#f3f2ef`, surface `#fff`, primary `#2f8fd6`, positive `#2a9d6e`
- Dark: bg `#1a1916`, surface `#242320`, primary `#5eb6e8`
- Motion: `--motion-fast/base/slow`, `--ease-out`; `prefers-reduced-motion` в `globals.scss`
При правке синхронизируй: `globals.scss` → `MuiProvider.tsx` → `DamageTag` `:global(.dark)`.

Два места, где живёт цвет, — используй правильное для контекста:
- **SCSS Modules компонентов** (`DeviceCard.module.scss`, `FilterBar.module.scss` и т.д.) — ТОЛЬКО `var(--color-*)`, никаких хардкод-хексов (кроме намеренно декоративных — цвета `DamageTag` по типу повреждения и фиксированный градиент `StatBar`, у них СВОИ явные `:global(.dark) &` оверрайды внутри модуля).
- **Tailwind-утилиты прямо в `page.tsx`/`settings/page.tsx`/`devices/[id]/page.tsx`** — парный `dark:`-класс на каждый цветовой класс (`bg-white dark:bg-slate-900`, `text-slate-900 dark:text-slate-100` и т.п.), т.к. эти страницы не используют CSS-переменные напрямую.

Анти-FOUC: `layout.tsx` вставляет `buildAntiFoucScript()` (`lib/theme.ts`) как инлайн-`<script>` в `<head>` — читает `localStorage`/`prefers-color-scheme` СИНХРОННО до гидратации React и сразу ставит класс `dark` на `<html>`, чтобы пользователь с сохранённой тёмной темой не увидел вспышку светлой вёрстки. `<html suppressHydrationWarning>` обязателен, иначе React ругается на несовпадение класса, поставленного инлайн-скриптом, с серверным рендером.

**Правило:** добавляя новую страницу/компонент с цветом — сначала проверь, есть ли подходящая семантическая переменная, и только если реально нужен цвет, не завязанный на тему (декоративный бейдж/градиент) — добавляй хардкод с явным дарк-оверрайдом рядом, а не переменную с единственным использованием.

### Паттерн ошибок API (клиент + UI)
Сервер отдаёт `{ error: string, code: ApiErrorCode }` через `jsonError()` (`src/server/shared/api-response.ts`). Клиент: `readJsonOrThrow` → `ApiRequestError`. UI переводит `code` через `getErrorCopy(error, t)` (`errors.*` в локалях), не показывает сырой `HTTP 503`. Состояния: `ErrorState` (пусто + ошибка + retry), `LoadingCenter` (CSS-спиннер), `EmptyState`. Лента: ошибка при пустом списке — `ErrorState`; если данные уже есть — алерт в `ScanDashboard`, список не стирается.

### Паттерн pending UI (`useTransition` / `useDeferredValue`)
Пагинация ленты и переходы админки — `startTransition` (не блокирует ввод). Список карточек — `useDeferredValue(devices)`, пока React догоняет рендер старый список чуть тусклее (`DeviceGrid is_pending`). Полоска `.pending_bar` сверху. Не оборачивать в transition стейт, который сразу рисует контрол (Select сортировки, чекбоксы фильтров).

### Паттерн TermHint (подсказки к терминам)
`src/shared/ui/term-hint/TermHint.tsx` — подпись с пунктиром + иконка `CircleHelp`, MUI `Tooltip` (hover / focus / tap, `enterTouchDelay={0}`). `compact` — для мелких подписей (`StatBar`, кольца дашборда). Где использовать: колонки каталога, фильтры рентабельность/ликвидность/ремонтопригодность, шкалы карточки и деталки, заголовки обзора рынка. Длинные пояснения в формах — `helperText` / caption, не TermHint.

### Паттерн админ-навигации
`AdminShell` — sticky pill-табы с иконками (не MUI Tabs), горизонтальный скролл на мобилке. Заголовок «Админка» не дублируется: заголовок страницы остаётся у view. Переход между разделами — `useTransition` + `.pending_bar`.

### Паттерн визуала 2026
Шапка: `backdrop-filter` glass. Карточки/фильтры/дашборд: `--radius-lg` (16px). Лоадеры — CSS-спиннер и `FeedSkeleton`, не MUI `CircularProgress`. Motion: `--motion-*` + `prefers-reduced-motion`.

### Паттерн админ-каталога
- Список `/admin/catalog`: поиск по названию/бренду/линейке/модели, фильтры бренд + линейка + статус, чекбоксы и пакетный скан выбранных (`POST /api/admin/catalog/enrich` с `entry_ids`). `Pagination` как в ленте. Query URL: `page`/`limit`/`search`/`brand`/`model_line`/`status` (`catalog-list-query.ts`). Смена номера — `history.pushState`, фильтры/поиск — `replaceState`. Таблица не размонтируется при смене страницы (`is_pending`). `ids_only=1` возвращает id под текущий фильтр (до 500).
- Живой прогресс заполнения: `GET /api/admin/catalog/enrich/status?wait=1&cursor=` (long-poll до 25с, как скан). Снимок в БД `CatalogJobState`, иначе next dev держит прогресс в другом инстансе модуля и UI залипает на `0/434`. `processed` = max(live, snapshot, `CatalogEnrichmentRun`); пока идёт модель — показываем `current+1` и % с учётом набора повреждений. Зависший `running` без снимка сбрасывается (90с / рестарт процесса).
- Карточка `/admin/catalog/[id]?…`: «К списку» сохраняет query списка. Соседи той же выборки — `GET` с фильтрами, `neighbors: { prev_id, next_id, index, total }` (`getCatalogNeighbors`, порядок как в списке). Ручная загрузка запчастей показывает стадию набора и паузу антибота (`CatalogManualJobBanner`). Цены продажи **только по GB** (`manual_storage_prices` + `lock_market_price`). Глобального `manual_market_sell_price` в UI нет — при save уходит `null`.
- Ремонтопригодность: если iFixit пуст/упал — **оставляем прежние баллы** (`keep-repairability.ts`), заглушку бренда ставим только если баллов ещё не было.
- Настройки скана каталога на странице списка: `catalog_auto_enrich_interval_minutes` (0/60/180/360/720/1440, cron `catalog-enrich-scheduler.ts`), `catalog_antibot_wait_seconds`, `catalog_antibot_retries`, `catalog_source_delay_ms`. Пауза антибота действует только в каталоге/ручной загрузке, не в скане ленты.
- Запчасти — один плоский список (дедуп по URL) с фильтрами тип / цена / источник. Не группировать по `damage_signature`.
- Ручной скан запчастей: кнопки Allegro / Ceneo / Магазины / OLX / Все. Иконки — `PartSourceBadge` (favicon хоста + lucide fallback). Картинка — `PartImage` (`referrerPolicy=no-referrer`, lazy `data-src`).
- Приоритет выдачи (и на деталке объявления): Allegro → Ceneo → магазины → OLX, не больше 4 на тип повреждения. Новый магазин: `SHOP_CONFIGS` в `polish-shop-fetcher.ts` + хост в `SHOP_HOST_MARKERS` (`part-utils.ts`).
- `syncCatalogFromLatestDevices` обновляет `listings_seen_count` из последнего скана и **не** помечает все модели `stale`.

### Паттерн StatBar (шкалы вместо чисел)
`StatBar` — переиспользуемый примитив для ликвидности/прибыльности/ремонтопригодности на `DeviceCard` и детальной странице: принимает `value` (0-100, УЖЕ нормализованное для позиции заполнения) и отдельно `display_value` (произвольная строка для подписи, может не совпадать с `value` численно). Сама шкала — ФИКСИРОВАННЫЙ градиент красный→жёлтый→зелёный (не зависит от `value` цветом), поверх него `value`-оверлей затемняет всё СПРАВА от текущей позиции — видимым остаётся только "заполненный" участок слева. Нормализация прибыльности (диапазон значений которой не 0-100) — `normalizeProfitability` в `DeviceCard.tsx`/`devices/[id]/page.tsx` (дублируется в двух местах осознанно, чтобы не тащить лишний общий модуль под одну маленькую функцию; при появлении третьего места использования — вынести в `lib/`).

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| GET | /api/devices | Страница устройств: `offset`/`limit`/`page`/`sort` + фильтры (`brands`,`models`,`price_min`…). `meta=1` → `filter_meta`. `total_count` — после фильтров. |
| GET | /api/devices/:id | Одно устройство по OLX id |
| GET | /api/scan/status | Статус сканирования (те же поля прогресса, что и /api/devices) |
| POST | /api/scan/start | Запустить новое сканирование (409, если уже идёт) |
| GET/PATCH | /api/settings | Объединённый ответ: `AppSettings` (battery, auto_scan, cache_ttl — PATCH admin-only) + `UserDisplaySettings` (junk/iphone/android — PATCH любой approved user) + `is_admin` |
| GET/PATCH | /api/notification-settings | Персональные `UserNotificationSettings` (+ `telegram_configured` в ответе) |
| GET/PATCH/DELETE | /api/notifications | Лента текущего пользователя / отметить прочитанными / очистить |
| GET | /api/notifications/unread-count | `{ count }` непрочитанных текущего пользователя |
| GET | /api/admin/notifications | Админ-лог уведомлений (`items`, `total_count`; query: offset/limit/user_id/source) |
| POST | /api/admin/notifications/test | Тест: `{ user_id, send_telegram? }` → in-app (+ опционально Telegram) |
| GET | /api/health | Health check |

## Кэши и pipeline (config.ts, читает .env)

| Переменная | Описание | По умолчанию |
|---|---|---|
| `IFIXIT_CACHE_TTL_SEC` | TTL L1 in-memory кэша iFixit (сек, живёт в рамках процесса) | 86400 (24ч) |
| `PARTS_CACHE_TTL_SEC` | TTL L1 in-memory кэша цен на запчасти (Ceneo/статика) | 3600 (1ч) |
| `OLX_MAX_PAGES` | Кол-во страниц OLX для скана | 5 |
| `OLX_PAGE_LIMIT` | Кол-во объявлений на странице | 40 |
| `PARTS_PER_MODEL` | Макс. вариантов запчастей на тип повреждения (после ранжирования источников) | 4 |
| `PIPELINE_CONCURRENCY` | Кол-во объявлений "в полёте" одновременно (пул воркеров) | 8 |
| `SKIP_CENEO` | `1` = не дергать Ceneo в авто-скане | 1 |
| `DELTA_SCAN` | `0` = всегда полный анализ всех объявлений | 1 |
| `TWO_PHASE` | `0` = полный анализ всех новых/изменённых | 1 |
| `TWO_PHASE_FULL_ANALYZE_LIMIT` | Сколько лотов идут в полный анализ | 80 |
| `TWO_PHASE_MIN_PROFIT_PLN` | Порог оценочной прибыли для полного анализа | 80 |
| `SCAN_STALE_TIMEOUT_MINUTES` | Watchdog: running ScanRun старше N минут → failed | 90 |
| `OLX_STATE_FILTERS` | Состояния OLX для поиска, через запятую | damaged,used |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram-бота для уведомлений (опционально) | — |
| `TELEGRAM_CHAT_ID` | ID чата/канала, куда слать уведомления (опционально) | — |

L2-кэш (`ModelCache`/`PartsCostCache` в БД, переживает рестарт) настраивается через UI (`/settings` → "Срок актуальности кеша"), не через `.env` — см. `AppSettings.cache_ttl_hours` и паттерн выше.

## Pipeline Flow (реальный прогон ~450 объявлений ≈ 1.5-2 минуты с `PIPELINE_CONCURRENCY=8`, было ~11 минут до оптимизации)

1. `fetchOlxListingsForStates` → список объявлений по всем `OLX_STATE_FILTERS` (GraphQL, дедупликация по id) — стадия прогресса `fetching_listings`.
2. `getAppSettings()` — читает `battery_health_threshold_percent` ОДИН раз на весь скан (не на каждое объявление).
3. **Delta-scan + two-phase** — `partitionDeltaScan` сравнивает incoming с прошлым сканом (id+title+цена). Неизменённые reuse как `RawAnalyzedListing`. Новые/изменённые: `scoreListingCandidate` → `selectListingsForFullAnalysis` (топ-N полный анализ, остальные `analyzeListingLightweight` без страницы OLX).
4. **Полный анализ** (`analyzeSingleListing`) — GraphQL уже содержит `description` + `user`; iFixit ∥ запчасти. HTML-страница OLX часто 403 (CloudFront), поэтому не источник описания.
5. **Lightweight** — damage/АКБ/коробка из заголовка **и описания GraphQL**, iFixit только из кэша/каталога, запчасти = static stubs. Если описание пустое (старые сканы) — догрузка на странице объявления (`POST /api/devices/:id/listing-signals` → GraphQL по id).
6. **Фаза finalize** — `finalizeDevices`: кластер model_key, медианы, Kimovil L2 (`getKimovilScoresFromCacheOnly`, без сети), profitability **без логистики**.
7. Стадия `saving`: `saveDevices` — полная замена таблицы `Device`. После save — in-process очередь `enqueueKimovilPrefetch` (топ-20 моделей).

### Рыночные цены б/у
`model-market-price-hints.ts` — справочник **уже used OLX PLN на 128 GB**. `getModelMarketPrice` только масштабирует память (`adjustPriceForStorage`). Ручные `manual_storage_prices` в каталоге перекрывают справочник.

### Логистика на клиенте
`src/shared/lib/deal-economics.ts` — общая формула прибыли. Скан/API отдают сделку без доставок; `useDevicesFeed` и страница объявления вызывают `applyDealLogistics` с `AppSettings.shipping_*`.

### Фильтры ленты
Состояние фильтров/сортировки/страницы пишется в query string (`appendDeviceFeedQuery` / `parseDeviceFeedPageQuery`) через `history.replaceState` на `HomePage`.

`fetchPartsData` в полном анализе: Allegro (если включён) → OLX parts → parts-store → Ceneo (если `SKIP_CENEO=0`) → static stub.

### Фильтрация цен запчастей (`parts-shared.ts`, общее для OLX/Ceneo)
- `isPriceRealistic(price, damage_type)` — проверяет диапазон по типу запчасти
- `isRelevantProduct(name, brand, model)` — бренд или модель должны быть в названии
- `mentionsPartKeyword(title, keyword)` — объявление должно явно упоминать искомую запчасть (иначе OLX category search подсовывает целые телефоны)
- Throttle/конкурентность — через `concurrency-limiter.ts`, см. секцию выше.

## Запуск

```bash
npm install
npx prisma migrate dev   # если миграции ещё не накатаны
npm run dev               # http://localhost:8080 (UI + API, единый процесс)
npm test                  # vitest, src/**/*.test.ts
npm run test:e2e          # Playwright: API + UI (desktop + Pixel 7)
```

### Playwright e2e

- Спеки: `e2e/api-contracts.spec.ts`, `e2e/app-flows.spec.ts`, `e2e/mobile-visual.spec.ts`.
- Сервер тестов: порт **3100**, `E2E_SKIP_AUTH=true` (middleware + `auth-guards` → пользователь `e2e@localhost`, admin). Сборка в `.next-e2e`, чтобы не трогать `npm run dev` на 8080.
- Перед первым прогоном: `E2E_SKIP_AUTH=true npx next build`, затем `npx playwright install chromium`.
- Не кликать «Обновить данные» в e2e — это живой скан OLX.

Production:
```bash
npm run build
npm run start
```

### Mac: три функции в консоли (`scripts/mac.sh`)

Скрипт для локальной машины (не `deploy/build.sh` — тот только Linux-сервер).

**С рабочего стола:** двойной клик по `SmartFlip.command` → Terminal с меню:

1. Проверка обновлений  
2. Пересборка  
3. Запуск — сайт на http://127.0.0.1:8080 и вкладка в браузере. Google-вход работает только с localhost (так прописано в Google OAuth). Control+C выключает сайт.  

Первый раз macOS может спросить разрешение (ПКМ → Открыть). То же меню: `./scripts/mac.sh` или `scripts/mac-console.command`.

- SSH берётся из `~/.ssh/config` (`Host github.com` → `~/.ssh/id_rsa_github`). Другой ключ: `OLX_SSH_KEY=/path/to/key`.
- Если папка скачана zip'ом (нет `.git`) — `olx_check` делает `git init` и вешает `origin`.
- Приватные ключи в корне (`1` / `1.pub`) в git не класть.

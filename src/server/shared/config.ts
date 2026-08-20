export const config = {
  cache: {
    // TTL в секундах
    ifixit_repairability_ttl_sec: Number(process.env.IFIXIT_CACHE_TTL_SEC ?? 86400),  // 24 ч
    // Кэш цен на запчасти (Ceneo.pl + статические оценки). Переменная называлась
    // ALLEGRO_PARTS_CACHE_TTL_SEC до отказа от Allegro API — переименована в
    // честное PARTS_CACHE_TTL_SEC.
    allegro_parts_ttl_sec: Number(process.env.PARTS_CACHE_TTL_SEC ?? 3600),   // 1 ч
  },

  pipeline: {
    olx_max_pages: Number(process.env.OLX_MAX_PAGES ?? 5),
    olx_page_limit: Number(process.env.OLX_PAGE_LIMIT ?? 40),
    // Состояния объявлений OLX для поиска (через запятую): "damaged" (на
    // częsci/uszkodzone) даёт мало объявлений (~2-3 тыс. по Польше) — большая
    // часть реальных арбитражных находок сидит среди "used" (б/у, ~40 тыс.),
    // где дефект часто просто упомянут в описании, а не выставлен тегом.
    olx_state_filters: (process.env.OLX_STATE_FILTERS ?? "damaged,used")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    /** OLX GraphQL listings: анти-бот чувствителен к частым запросам */
    olx_listings_concurrency: Number(process.env.OLX_LISTINGS_CONCURRENCY ?? 1),
    olx_listings_min_interval_ms: Number(process.env.OLX_LISTINGS_MIN_INTERVAL_MS ?? 900),
    olx_listings_page_delay_ms: Number(process.env.OLX_LISTINGS_PAGE_DELAY_MS ?? 500),
    olx_listings_state_delay_ms: Number(process.env.OLX_LISTINGS_STATE_DELAY_MS ?? 1200),
    olx_listings_retry_count: Number(process.env.OLX_LISTINGS_RETRY_COUNT ?? 3),
    olx_cookie: process.env.OLX_COOKIE ?? "",
    allegro_parts_per_model: Number(process.env.PARTS_PER_MODEL ?? 4),
    /** parts-store.pl GraphQL: параллельность и пауза между стартами */
    parts_store_concurrency: Number(process.env.PARTS_STORE_CONCURRENCY ?? 2),
    parts_store_min_interval_ms: Number(process.env.PARTS_STORE_MIN_INTERVAL_MS ?? 450),
    parts_store_search_limit: Number(process.env.PARTS_STORE_SEARCH_LIMIT ?? 8),
    parts_store_prefetch_chunk_size: Number(process.env.PARTS_STORE_PREFETCH_CHUNK_SIZE ?? 8),
    parts_store_prefetch_chunk_delay_ms: Number(process.env.PARTS_STORE_PREFETCH_CHUNK_DELAY_MS ?? 1200),
    // Внутренняя работа по одному объявлению теперь сама неплохо параллелится
    // (iFixit и запчасти — конкурентно, а не строго по очереди), а реальные
    // ограничения скорости — в лимитерах на уровне источника
    // (concurrency-limiter.ts), а не здесь. Поэтому можно держать заметно
    // больше объявлений "в полёте" одновременно, чем раньше.
    concurrency: Number(process.env.PIPELINE_CONCURRENCY ?? 8),
    /** Таймаут анализа одного объявления (OLX + iFixit + запчасти), мс */
    listing_analyze_timeout_ms: Number(process.env.LISTING_ANALYZE_TIMEOUT_MS ?? 90_000),
    /** Минимальная пауза между полными сканами (сек) — защита от OLX HTTP 403 */
    scan_min_interval_sec: Number(process.env.SCAN_MIN_INTERVAL_SEC ?? 120),
    /** Не дергать Ceneo в hot path (часто анти-бот). */
    skip_ceneo_parts: process.env.SKIP_CENEO !== "0",
    /** Watchdog: running ScanRun старше N минут → failed. */
    scan_stale_timeout_minutes: Number(process.env.SCAN_STALE_TIMEOUT_MINUTES ?? 90),
    /** Повторно не анализировать объявления с тем же title+ценой. */
    delta_scan_enabled: process.env.DELTA_SCAN !== "0",
    /** Полный анализ только топ-N кандидатов, остальные — lightweight. */
    two_phase_enabled: process.env.TWO_PHASE !== "0",
    two_phase_full_analyze_limit: Number(process.env.TWO_PHASE_FULL_ANALYZE_LIMIT ?? 80),
    two_phase_min_profit_pln: Number(process.env.TWO_PHASE_MIN_PROFIT_PLN ?? 80),
  },

  telegram: {
    // Опционально: если оба не заданы — notifier.ts просто не отправляет
    // сообщения в Telegram (уведомления всё равно создаются "в приложении").
    bot_token: process.env.TELEGRAM_BOT_TOKEN ?? null,
    chat_id: process.env.TELEGRAM_CHAT_ID ?? null,
  },

  web_push: {
    // VAPID-ключи: npx web-push generate-vapid-keys
    // Без них Web Push не отправляется; in-app тосты — long-poll `/api/notifications/unread-count?wait=1`.
    public_key: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null,
    private_key: process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? null,
    subject: process.env.WEB_PUSH_VAPID_SUBJECT ?? "mailto:admin@smartflip.local",
  },
} as const;

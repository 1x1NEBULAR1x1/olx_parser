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
    allegro_parts_per_model: Number(process.env.PARTS_PER_MODEL ?? 5),
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
  },

  telegram: {
    // Опционально: если оба не заданы — notifier.ts просто не отправляет
    // сообщения в Telegram (уведомления всё равно создаются "в приложении").
    bot_token: process.env.TELEGRAM_BOT_TOKEN ?? null,
    chat_id: process.env.TELEGRAM_CHAT_ID ?? null,
  },
} as const;

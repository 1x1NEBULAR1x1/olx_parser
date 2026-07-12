# SmartFlip — Rentowne smartfony do naprawy

Aplikacja webowa do wyszukiwania najbardziej opłacalnych uszkodzonych smartfonów do naprawy i odsprzedaży.

## Jak działa

1. **Pipeline** (`src/server`) skanuje ogłoszenia z OLX.pl (uszkodzone smartfony) przez GraphQL API.
2. Dla każdego urządzenia analizuje naprawialność przez **iFixit** (Algolia API, wynik cache'owany in-memory).
3. Wyszukuje ceny części na **Ceneo.pl** (HTML scraper przez `cheerio`, throttle 800ms), z fallbackiem do statycznych szacunków (`static-parts-prices.ts`, oznaczone ★), gdy Ceneo nie zwróci trafnych wyników.
4. Oblicza **rentowność** = szacowana cena sprzedaży − cena kupna − koszt części, oraz **płynność** (liquidity) na podstawie migawki rynku OLX.
5. Wyniki zapisywane są w **SQLite przez Prisma** (`prisma/schema.prisma`) — każdy skan tworzy `ScanRun`, a urządzenia (`Device` + `Part`) są powiązane z konkretnym skanem.
6. Jedna aplikacja **Next.js 15 (App Router)** obsługuje jednocześnie UI (Server/Client Components) i API (Route Handlers) na tym samym porcie/origin — bez osobnego backendu i bez CORS.

## Architektura

- **Next.js 15 App Router** — `src/app` (strony + `src/app/api/**/route.ts` — API endpoints).
- **Prisma 7 + SQLite** — persystentne хранение устройств и истории сканирований (`prisma/schema.prisma`, `src/db/client.ts`). Prisma v7 требует driver adapter — используется `@prisma/adapter-better-sqlite3`.
- **iFixit / Ceneo** — не хранятся в БД, это транзиентные in-memory кэши (`node-cache`, TTL из `.env`), пересчитываются заново при перезапуске процесса.
- **`src/server/scan-manager.ts`** — управляет запуском сканирования; источник истины "идёт ли скан" — запись `ScanRun.status === "running"` в БД (плюс in-memory флаг как доп. защита от гонки в рамках одного процесса).

## Struktura projektu

```
olx_parser/
├── .env                        # Zmienne środowiskowe (lokalne, nie w git)
├── .env.example                # Szablon zmiennych środowiskowych
├── prisma/
│   ├── schema.prisma           # Modele ScanRun, Device, Part
│   └── migrations/
├── prisma.config.ts            # Konfiguracja Prisma CLI (driver adapter, dotenv)
│
└── src/
    ├── app/                    # Next.js App Router
    │   ├── page.tsx             # Strona główna (lista urządzeń)
    │   ├── devices/[id]/page.tsx  # Strona szczegółów urządzenia
    │   ├── layout.tsx, error.tsx, not-found.tsx
    │   └── api/
    │       ├── devices/route.ts        # GET lista urządzeń
    │       ├── devices/[id]/route.ts   # GET jedno urządzenie
    │       ├── scan/status/route.ts    # GET status skanowania
    │       ├── scan/start/route.ts     # POST uruchomienie skanowania
    │       └── health/route.ts         # GET health check
    ├── components/              # DeviceCard, FilterBar, DamageTag, ScanBanner
    ├── lib/
    │   ├── api.ts                # Typy + fetch funkcje (client-side)
    │   └── intl/                 # useTranslations + locales/pl.ts
    ├── server/                   # Logika biznesowa (Node.js runtime only)
    │   ├── config.ts             # Ustawienia z env (cache TTL, pipeline)
    │   ├── pipeline.ts           # runFullPipeline() → AnalyzedDevice[]
    │   ├── scan-manager.ts       # triggerScan / getScanStatus
    │   ├── devices-repository.ts # Prisma queries (CRUD dla Device/ScanRun)
    │   ├── olx-fetcher/          # Parser OLX GraphQL API
    │   ├── liquidity-calculator/ # Kalkulator płynności urządzeń
    │   ├── ceneo-fetcher.ts      # Scraper cen części z Ceneo.pl
    │   ├── static-parts-prices.ts, brand-extractor.ts, profitability.ts, cache.ts
    ├── db/client.ts               # Prisma client singleton (z driver adapter)
    └── instrumentation.ts         # Next.js hook — auto-start skanowania przy starcie serwera
```

## Uruchomienie

### 1. Zmienne środowiskowe
```bash
cp .env.example .env
# Domyślne wartości działają "od razu", edycja opcjonalna
```

### 2. Instalacja i baza danych
```bash
npm install
npx prisma migrate dev   # nakłada migracje (jeśli jeszcze nie nałożone)
```

### 3. Start aplikacji
```bash
npm run dev
# Aplikacja (UI + API): http://localhost:8080
# Skanowanie OLX startuje automatycznie przy starcie serwera (instrumentation.ts)
```

Produkcyjny build:
```bash
npm run build
npm run start
```

## API (Route Handlers)

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| GET | /api/devices | Lista przeanalizowanych urządzeń |
| GET | /api/devices/:id | Szczegóły urządzenia |
| GET | /api/scan/status | Status skanowania |
| POST | /api/scan/start | Uruchom nowe skanowanie (409, jeśli już trwa) |
| GET | /api/health | Health check |

## Konfiguracja cache i pipeline (w .env)

| Zmienna | Domyślnie | Opis |
|---------|-----------|------|
| `DATABASE_URL` | `file:./prisma/dev.db` | Połączenie SQLite dla Prisma |
| `IFIXIT_CACHE_TTL_SEC` | 86400 | Cache naprawialności iFixit (24h, in-memory) |
| `PARTS_CACHE_TTL_SEC` | 3600 | Cache cen części Ceneo/statycznych (1h, in-memory) |
| `OLX_MAX_PAGES` | 5 | Liczba stron OLX do skanowania |
| `OLX_PAGE_LIMIT` | 40 | Liczba ogłoszeń na stronę |
| `PARTS_PER_MODEL` | 5 | Maks. liczba wariantów części na model/typ uszkodzenia |
| `PIPELINE_CONCURRENCY` | 3 | Równoległa analiza urządzeń w pipeline |

## Technologie

- **Framework**: Next.js 15 (App Router, Route Handlers, instrumentation hook)
- **Baza danych**: Prisma 7 (driver adapter `@prisma/adapter-better-sqlite3`) + SQLite
- **Parsing**: OLX GraphQL, Ceneo.pl HTML scraper (`cheerio`), iFixit Algolia API
- **UI**: React 19, SCSS Modules, Tailwind CSS 4
- **Cache**: `node-cache` (in-memory, TTL z `.env`)

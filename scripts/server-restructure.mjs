#!/usr/bin/env node
/**
 * Реструктуризация server/ → repositories/, fetchers/, scan/, domain/, shared/
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

const MOVES = [
  ["server/devices-repository.ts", "server/repositories/devices-repository.ts"],
  ["server/scan-issues-repository.ts", "server/repositories/scan-issues-repository.ts"],
  ["server/user-listings-repository.ts", "server/repositories/user-listings-repository.ts"],
  ["server/user-display-settings-repository.ts", "server/repositories/user-display-settings-repository.ts"],
  ["server/allegro-api-client.ts", "server/fetchers/allegro-api-client.ts"],
  ["server/allegro-parts-fetcher.ts", "server/fetchers/allegro-parts-fetcher.ts"],
  ["server/ceneo-fetcher.ts", "server/fetchers/ceneo-fetcher.ts"],
  ["server/olx-parts-fetcher.ts", "server/fetchers/olx-parts-fetcher.ts"],
  ["server/olx-market-price-fetcher.ts", "server/fetchers/olx-market-price-fetcher.ts"],
  ["server/parts-store-fetcher.ts", "server/fetchers/parts-store-fetcher.ts"],
  ["server/parts-store-prefetch.ts", "server/fetchers/parts-store-prefetch.ts"],
  ["server/olx-fetcher", "server/fetchers/olx-fetcher"],
  ["server/pipeline.ts", "server/scan/pipeline.ts"],
  ["server/scan-manager.ts", "server/scan/scan-manager.ts"],
  ["server/scan-scheduler.ts", "server/scan/scan-scheduler.ts"],
  ["server/scan-issue-detector.ts", "server/scan/scan-issue-detector.ts"],
  ["server/config.ts", "server/shared/config.ts"],
  ["server/cache.ts", "server/shared/cache.ts"],
  ["server/logger.ts", "server/shared/logger.ts"],
  ["server/concurrency-limiter.ts", "server/shared/concurrency-limiter.ts"],
  ["server/profitability.ts", "server/domain/profitability.ts"],
  ["server/brand-extractor.ts", "server/domain/brand-extractor.ts"],
  ["server/model-line-extractor.ts", "server/domain/model-line-extractor.ts"],
  ["server/model-normalizer.ts", "server/domain/model-normalizer.ts"],
  ["server/model-key-clusterer.ts", "server/domain/model-key-clusterer.ts"],
  ["server/model-market-price-hints.ts", "server/domain/model-market-price-hints.ts"],
  ["server/model-sort-key.ts", "server/domain/model-sort-key.ts"],
  ["server/junk-filter.ts", "server/domain/junk-filter.ts"],
  ["server/repair-parts-stubs.ts", "server/domain/repair-parts-stubs.ts"],
  ["server/static-parts-prices.ts", "server/domain/static-parts-prices.ts"],
  ["server/parts-shared.ts", "server/domain/parts-shared.ts"],
  ["server/notifier.ts", "server/domain/notifier.ts"],
  ["server/user-device-view.ts", "server/domain/user-device-view.ts"],
  ["server/devices-filter-meta.ts", "server/domain/devices-filter-meta.ts"],
  ["server/platform-filter.ts", "server/domain/platform-filter.ts"],
  ["server/listing-flags.ts", "server/domain/listing-flags.ts"],
  ["server/text-match.ts", "server/domain/text-match.ts"],
  ["server/liquidity-calculator", "server/domain/liquidity-calculator"],
];

const IMPORT_REPLACEMENTS = [
  ["@/server/devices-repository", "@/server/repositories/devices-repository"],
  ["@/server/scan-issues-repository", "@/server/repositories/scan-issues-repository"],
  ["@/server/user-listings-repository", "@/server/repositories/user-listings-repository"],
  ["@/server/user-display-settings-repository", "@/server/repositories/user-display-settings-repository"],
  ["@/server/allegro-api-client", "@/server/fetchers/allegro-api-client"],
  ["@/server/allegro-parts-fetcher", "@/server/fetchers/allegro-parts-fetcher"],
  ["@/server/ceneo-fetcher", "@/server/fetchers/ceneo-fetcher"],
  ["@/server/olx-parts-fetcher", "@/server/fetchers/olx-parts-fetcher"],
  ["@/server/olx-market-price-fetcher", "@/server/fetchers/olx-market-price-fetcher"],
  ["@/server/parts-store-fetcher", "@/server/fetchers/parts-store-fetcher"],
  ["@/server/parts-store-prefetch", "@/server/fetchers/parts-store-prefetch"],
  ["@/server/olx-fetcher/", "@/server/fetchers/olx-fetcher/"],
  ["@/server/pipeline", "@/server/scan/pipeline"],
  ["@/server/scan-manager", "@/server/scan/scan-manager"],
  ["@/server/scan-scheduler", "@/server/scan/scan-scheduler"],
  ["@/server/scan-issue-detector", "@/server/scan/scan-issue-detector"],
  ["@/server/config", "@/server/shared/config"],
  ["@/server/cache", "@/server/shared/cache"],
  ["@/server/logger", "@/server/shared/logger"],
  ["@/server/concurrency-limiter", "@/server/shared/concurrency-limiter"],
  ["@/server/profitability", "@/server/domain/profitability"],
  ["@/server/brand-extractor", "@/server/domain/brand-extractor"],
  ["@/server/model-line-extractor", "@/server/domain/model-line-extractor"],
  ["@/server/model-normalizer", "@/server/domain/model-normalizer"],
  ["@/server/model-key-clusterer", "@/server/domain/model-key-clusterer"],
  ["@/server/model-market-price-hints", "@/server/domain/model-market-price-hints"],
  ["@/server/model-sort-key", "@/server/domain/model-sort-key"],
  ["@/server/junk-filter", "@/server/domain/junk-filter"],
  ["@/server/repair-parts-stubs", "@/server/domain/repair-parts-stubs"],
  ["@/server/static-parts-prices", "@/server/domain/static-parts-prices"],
  ["@/server/parts-shared", "@/server/domain/parts-shared"],
  ["@/server/notifier", "@/server/domain/notifier"],
  ["@/server/user-device-view", "@/server/domain/user-device-view"],
  ["@/server/devices-filter-meta", "@/server/domain/devices-filter-meta"],
  ["@/server/platform-filter", "@/server/domain/platform-filter"],
  ["@/server/listing-flags", "@/server/domain/listing-flags"],
  ["@/server/text-match", "@/server/domain/text-match"],
  ["@/server/liquidity-calculator/", "@/server/domain/liquidity-calculator/"],
  ['from "./types"', 'from "@/shared/types/domain"'],
  ['from "../types"', 'from "@/shared/types/domain"'],
  ['from "../../types"', 'from "@/shared/types/domain"'],
];

function ensureDir(file_path) {
  fs.mkdirSync(path.dirname(file_path), { recursive: true });
}

function moveEntry(rel_from, rel_to) {
  const from = path.join(SRC, rel_from);
  const to = path.join(SRC, rel_to);
  if (!fs.existsSync(from)) {
    console.warn(`skip (missing): ${rel_from}`);
    return;
  }
  ensureDir(to);
  fs.renameSync(from, to);
  console.log(`moved: ${rel_from} -> ${rel_to}`);
}

function walk(dir, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, callback);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      callback(full);
    }
  }
}

function rewriteImports() {
  let changed = 0;
  walk(SRC, (file_path) => {
    let content = fs.readFileSync(file_path, "utf8");
    let updated = content;
    for (const [from, to] of IMPORT_REPLACEMENTS) {
      updated = updated.split(from).join(to);
    }
    if (updated !== content) {
      fs.writeFileSync(file_path, updated);
      changed += 1;
    }
  });
  console.log(`rewrote imports in ${changed} files`);
}

for (const [from, to] of MOVES) {
  moveEntry(from, to);
}

rewriteImports();
console.log("Server restructure done.");

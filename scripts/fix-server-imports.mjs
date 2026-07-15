#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(path.resolve(import.meta.dirname, ".."), "src");

const REPLACEMENTS = [
  ["@/shared/types/domain", "./types"],
  ["from \"./types\"", "from \"@/shared/types/domain\""],
];

const GLOBAL_REPLACEMENTS = [
  ["from \"./parts-shared\"", "from \"@/server/domain/parts-shared\""],
  ["from \"./concurrency-limiter\"", "from \"@/server/shared/concurrency-limiter\""],
  ["from \"./config\"", "from \"@/server/shared/config\""],
  ["from \"./logger\"", "from \"@/server/shared/logger\""],
  ["from \"./cache\"", "from \"@/server/shared/cache\""],
  ["from \"./devices-repository\"", "from \"@/server/repositories/devices-repository\""],
  ["from \"./scan-issues-repository\"", "from \"@/server/repositories/scan-issues-repository\""],
  ["from \"./user-display-settings-repository\"", "from \"@/server/repositories/user-display-settings-repository\""],
  ["from \"./static-parts-prices\"", "from \"@/server/domain/static-parts-prices\""],
  ["from \"./model-market-price-hints\"", "from \"@/server/domain/model-market-price-hints\""],
  ["from \"./brand-extractor\"", "from \"@/server/domain/brand-extractor\""],
  ["from \"./model-normalizer\"", "from \"@/server/domain/model-normalizer\""],
  ["from \"./model-line-extractor\"", "from \"@/server/domain/model-line-extractor\""],
  ["from \"./model-key-clusterer\"", "from \"@/server/domain/model-key-clusterer\""],
  ["from \"./profitability\"", "from \"@/server/domain/profitability\""],
  ["from \"./repair-parts-stubs\"", "from \"@/server/domain/repair-parts-stubs\""],
  ["from \"./notifier\"", "from \"@/server/domain/notifier\""],
  ["from \"./devices-filter-meta\"", "from \"@/server/domain/devices-filter-meta\""],
  ["from \"./junk-filter\"", "from \"@/server/domain/junk-filter\""],
  ["from \"./platform-filter\"", "from \"@/server/domain/platform-filter\""],
  ["from \"./user-device-view\"", "from \"@/server/domain/user-device-view\""],
  ["from \"./olx-parts-fetcher\"", "from \"@/server/fetchers/olx-parts-fetcher\""],
  ["from \"./olx-market-price-fetcher\"", "from \"@/server/fetchers/olx-market-price-fetcher\""],
  ["from \"./parts-store-fetcher\"", "from \"@/server/fetchers/parts-store-fetcher\""],
  ["from \"./allegro-api-client\"", "from \"@/server/fetchers/allegro-api-client\""],
  ["from \"./olx-fetcher/", "from \"@/server/fetchers/olx-fetcher/"],
  ["from \"./liquidity-calculator/", "from \"@/server/domain/liquidity-calculator/"],
  ["from \"./scan/run-with-concurrency\"", "from \"./run-with-concurrency\""],
  ["from \"./scan/parts-chain\"", "from \"./parts-chain\""],
  ["from \"../text-match\"", "from \"@/server/domain/text-match\""],
  ["from \"../concurrency-limiter\"", "from \"@/server/shared/concurrency-limiter\""],
];

function walk(dir, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, callback);
    else if (/\.ts$/.test(entry.name)) callback(full);
  }
}

// 1. Restore olx-fetcher local types imports
for (const file of ["fetcher.ts", "parser.ts", "guards.ts"]) {
  const file_path = path.join(SRC, "server/fetchers/olx-fetcher", file);
  if (!fs.existsSync(file_path)) continue;
  let content = fs.readFileSync(file_path, "utf8");
  content = content.replace(
    /from "@\/shared\/types\/domain"/g,
    'from "./types"',
  );
  fs.writeFileSync(file_path, content);
}

// 2. Apply global replacements in server/
let changed = 0;
walk(path.join(SRC, "server"), (file_path) => {
  if (file_path.includes("/olx-fetcher/") && /from "\.\/types"/.test(fs.readFileSync(file_path, "utf8"))) {
    return;
  }
  let content = fs.readFileSync(file_path, "utf8");
  let updated = content;
  for (const [from, to] of GLOBAL_REPLACEMENTS) {
    updated = updated.split(from).join(to);
  }
  if (updated !== content) {
    fs.writeFileSync(file_path, updated);
    changed += 1;
  }
});

// 3. Fix prefetch script
const prefetch_script = path.join(SRC, "../scripts/prefetch-parts-store.ts");
if (fs.existsSync(prefetch_script)) {
  let content = fs.readFileSync(prefetch_script, "utf8");
  content = content.replace(
    "../src/server/parts-store-prefetch",
    "../src/server/fetchers/parts-store-prefetch",
  );
  fs.writeFileSync(prefetch_script, content);
}

console.log(`fixed ${changed} server files`);

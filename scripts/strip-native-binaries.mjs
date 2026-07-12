/**
 * Удаляет нативные .node бинарники, несовместимые с частью Linux VPS (Bus error).
 * Вызывается после npm ci и непосредственно перед next build.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root_dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nm = path.join(root_dir, "node_modules");

const NATIVE_DIR_PATTERNS = [
  { base: path.join(nm, "@next"), match: (name) => name.startsWith("swc-") && !name.includes("wasm") },
  { base: path.join(nm, "@tailwindcss"), match: (name) => name.startsWith("oxide-") && !name.includes("wasm") },
  { base: nm, match: (name) => name.startsWith("lightningcss-") && !name.startsWith("lightningcss-wasm") },
];

const NATIVE_FILE_GLOBS = [
  path.join(nm, "lightningcss", "lightningcss.linux-x64-gnu.node"),
  path.join(nm, "lightningcss", "lightningcss.linux-x64-musl.node"),
];

function removeDirsMatching(base_dir, predicate) {
  if (!fs.existsSync(base_dir)) return [];
  const removed = [];
  for (const entry of fs.readdirSync(base_dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!predicate(entry.name)) continue;
    const target = path.join(base_dir, entry.name);
    fs.rmSync(target, { recursive: true, force: true });
    removed.push(path.relative(root_dir, target));
  }
  return removed;
}

function walkAndStripNestedNextSwc(dir, removed) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "@next") {
        for (const removed_path of removeDirsMatching(full, (name) => name.startsWith("swc-") && !name.includes("wasm"))) {
          removed.push(removed_path);
        }
      }
      if (entry.name === "node_modules") {
        walkAndStripNestedNextSwc(full, removed);
      }
    }
  }
}

export function stripNativeBinaries() {
  const removed = [];

  for (const { base, match } of NATIVE_DIR_PATTERNS) {
    removed.push(...removeDirsMatching(base, match));
  }

  walkAndStripNestedNextSwc(nm, removed);

  for (const file_path of NATIVE_FILE_GLOBS) {
    if (fs.existsSync(file_path)) {
      fs.rmSync(file_path, { force: true });
      removed.push(path.relative(root_dir, file_path));
    }
  }

  // Next.js скачивает нативный SWC сюда, если не нашёл в node_modules — на VPS он битый.
  const next_swc_fallback = path.join(nm, "next", "next-swc-fallback");
  if (fs.existsSync(next_swc_fallback)) {
    fs.rmSync(next_swc_fallback, { recursive: true, force: true });
    removed.push(path.relative(root_dir, next_swc_fallback));
  }

  const next_swc_cache = path.join(
    process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
    "next-swc",
  );
  if (fs.existsSync(next_swc_cache)) {
    fs.rmSync(next_swc_cache, { recursive: true, force: true });
    removed.push(next_swc_cache);
  }

  return removed;
}

export function patchLightningcssToWasm() {
  const lightningcss_dir = path.join(nm, "lightningcss");
  const patch_src = path.join(root_dir, "scripts/patches/lightningcss-index-wasm.cjs");
  const patch_dst = path.join(lightningcss_dir, "node/index.js");

  if (!fs.existsSync(patch_dst)) {
    throw new Error(`lightningcss не найден: ${patch_dst}`);
  }
  if (!fs.existsSync(path.join(nm, "lightningcss-wasm"))) {
    throw new Error("lightningcss-wasm не установлен — добавьте в dependencies и npm ci");
  }

  fs.copyFileSync(patch_src, patch_dst);
}

export function ensureTailwindOxideWasm(tailwind_version = "4.3.2") {
  try {
    require.resolve("@tailwindcss/oxide-wasm32-wasi");
    return;
  } catch {
    // cpu=wasm32 — только для Linux-сервера.
  }

  console.log(`[strip-native] установка @tailwindcss/oxide-wasm32-wasi@${tailwind_version}...`);
  execSync(
    `npm install @tailwindcss/oxide-wasm32-wasi@${tailwind_version} --no-save --force --no-fund --no-audit`,
    { cwd: root_dir, stdio: "inherit" },
  );
  stripNativeBinaries();
}

export function assertWasmToolchain({ require_oxide_wasm = process.platform === "linux" } = {}) {
  const required = [
    "@next/swc-wasm-nodejs",
    "lightningcss-wasm",
  ];
  if (require_oxide_wasm) {
    required.push("@tailwindcss/oxide-wasm32-wasi");
  }

  const missing = required.filter((pkg) => {
    try {
      require.resolve(pkg);
      return false;
    } catch {
      return true;
    }
  });

  if (missing.length > 0) {
    throw new Error(
      `WASM-пакеты не установлены: ${missing.join(", ")}. `
      + "На сервере: cp deploy/npmrc.server .npmrc && rm -rf node_modules && npm ci",
    );
  }

  const forbidden = [
    path.join(nm, "@next/swc-linux-x64-gnu"),
    path.join(nm, "@tailwindcss/oxide-linux-x64-gnu"),
    path.join(nm, "lightningcss-linux-x64-gnu"),
  ].filter((p) => fs.existsSync(p));

  if (forbidden.length > 0) {
    throw new Error(
      `Нативные пакеты всё ещё на диске: ${forbidden.map((p) => path.relative(root_dir, p)).join(", ")}`,
    );
  }
}

function main() {
  if (process.platform !== "linux") return;

  const removed = stripNativeBinaries();
  if (removed.length > 0) {
    console.log("[strip-native] удалено:");
    for (const item of removed) console.log(`  - ${item}`);
  }

  ensureTailwindOxideWasm();
  patchLightningcssToWasm();
  assertWasmToolchain();
  console.log("[strip-native] WASM toolchain OK");
}

const is_main = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (is_main) {
  main();
}

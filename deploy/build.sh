#!/usr/bin/env bash
# Сборка production на Linux-сервере.
# НЕ копируйте node_modules с macOS — нативные модули должны собираться на целевой ОС.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

require_build_tools() {
  local missing=()
  command -v python3 >/dev/null 2>&1 || missing+=("python3")
  command -v g++ >/dev/null 2>&1 || missing+=("g++")
  command -v make >/dev/null 2>&1 || missing+=("make")
  if ((${#missing[@]} > 0)); then
    echo "ERROR: для сборки better-sqlite3 нужны: ${missing[*]}"
    echo "Установите: sudo apt install -y build-essential python3"
    exit 1
  fi
}

require_node_version() {
  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if (( major < 22 )); then
    echo "ERROR: Node $(node -v) — проект требует Node >=22 (Prisma 7.8 / @prisma/streams-local)."
    echo "Обновите:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
    echo "  sudo apt install -y nodejs"
    exit 1
  fi
}

warn_low_memory() {
  local mem_mb swap_active
  mem_mb="$(free -m | awk '/^Mem:/{print $2}')"
  swap_active="$(swapon --show 2>/dev/null | wc -l)"
  if (( mem_mb < 1800 && swap_active < 2 )); then
    echo "WARN: RAM ${mem_mb}MB без swap — next build может падать с Bus error / Killed."
    echo "      Добавьте swap 2GB (см. deploy/DEPLOY.md) или соберите на машине с большим RAM."
  fi
}

verify_better_sqlite3() {
  node -e "require('better-sqlite3'); console.log('better-sqlite3 OK')"
}

swc_native_ok() {
  node -e "require('@next/swc-linux-x64-gnu')" 2>/dev/null
}

enable_swc_wasm_fallback() {
  echo "==> SWC WASM fallback (нативный @next/swc-linux-x64-gnu не работает на этом VPS)..."
  npm install "@next/swc-wasm-nodejs@15.5.20" --no-save --no-fund --no-audit
  rm -rf \
    node_modules/@next/swc-linux-x64-gnu \
    node_modules/@next/swc-linux-x64-musl \
    node_modules/@next/swc-linux-arm64-gnu \
    node_modules/@next/swc-linux-arm64-musl \
    2>/dev/null || true
}

echo "==> Проверка Node.js (>=22)..."
require_node_version

echo "==> Проверка инструментов сборки (g++, make, python3)..."
require_build_tools

warn_low_memory

echo "==> Проверка уязвимостей (уровень high+)..."
npm run audit:check

echo "==> Установка зависимостей (npm ci)..."
if [[ -d node_modules ]] && ! node -e "require('better-sqlite3')" 2>/dev/null; then
  echo "    Чужие/битые бинарники — полная переустановка node_modules..."
  rm -rf node_modules
fi
npm ci

echo "==> Сборка нативного модуля better-sqlite3 под $(node -p "process.platform + '-' + process.arch")..."
npm rebuild better-sqlite3 --build-from-source

echo "==> Проверка загрузки better-sqlite3..."
verify_better_sqlite3

if [[ "${SMARTFLIP_SWC_WASM:-}" == "1" ]]; then
  enable_swc_wasm_fallback
elif ! swc_native_ok; then
  echo "WARN: нативный SWC не загружается — переключаемся на WASM..."
  enable_swc_wasm_fallback
fi

echo "==> Миграции БД..."
npm run prisma:migrate:deploy

echo "==> Сборка Next.js (ограничение RAM для малых VPS)..."
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
export NEXT_TELEMETRY_DISABLED=1
npm run build

echo "==> Финальная проверка better-sqlite3..."
verify_better_sqlite3

echo "==> Готово. Запуск: npm run start (порт ${PORT:-8080})"

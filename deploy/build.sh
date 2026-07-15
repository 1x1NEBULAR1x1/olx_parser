#!/usr/bin/env bash
# Сборка production на Linux-сервере.
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
    echo "ERROR: Node $(node -v) — проект требует Node >=22."
    echo "  nvm install 22 && nvm use 22"
    exit 1
  fi
}

warn_low_memory() {
  local mem_mb swap_kb
  mem_mb="$(free -m | awk '/^Mem:/{print $2}')"
  swap_kb="$(free -m | awk '/^Swap:/{print $2}')"
  if (( mem_mb < 2048 && swap_kb < 512 )); then
    echo "WARN: RAM ${mem_mb}MB, swap ${swap_kb}MB — next build может упасть."
    echo "      Рекомендуется swap 2GB (см. deploy/DEPLOY.md)."
  fi
}

verify_better_sqlite3() {
  node -e "require('better-sqlite3'); console.log('better-sqlite3 OK')"
}

echo "==> Проверка Node.js (>=22)..."
require_node_version

echo "==> Проверка инструментов сборки (g++, make, python3)..."
require_build_tools

warn_low_memory

echo "==> Проверка уязвимостей (уровень high+)..."
npm run audit:check

echo "==> Установка зависимостей (npm ci, включая dev — нужны для next build)..."
if [[ -d node_modules ]] && ! node -e "require('better-sqlite3')" 2>/dev/null; then
  echo "    Чужие/битые бинарники — полная переустановка node_modules..."
  rm -rf node_modules
fi
# NODE_ENV=production заставляет npm ci пропустить devDependencies (tailwind/postcss).
# На сервере переменная часто уже export из systemd/.profile — явно включаем dev.
if [[ -d node_modules/@tailwindcss/oxide-darwin-arm64 || -d node_modules/@tailwindcss/oxide-darwin-x64 ]] \
  && [[ ! -f node_modules/@tailwindcss/oxide-linux-x64-gnu/tailwindcss-oxide.linux-x64-gnu.node ]] \
  && [[ ! -f node_modules/@tailwindcss/oxide-linux-x64-musl/tailwindcss-oxide.linux-x64-musl.node ]]; then
  echo "    node_modules собраны под macOS — переустановка под Linux..."
  rm -rf node_modules
fi
npm ci --include=dev

echo "==> Сборка better-sqlite3..."
npm rebuild better-sqlite3 --build-from-source
verify_better_sqlite3

verify_tailwind_oxide() {
  node -e "
    const fs = require('fs');
    const path = require('path');
    const candidates = [
      '@tailwindcss/oxide-linux-x64-gnu/tailwindcss-oxide.linux-x64-gnu.node',
      '@tailwindcss/oxide-linux-x64-musl/tailwindcss-oxide.linux-x64-musl.node',
    ];
    const found = candidates.some((rel) => fs.existsSync(path.join('node_modules', rel)));
    if (!found) {
      console.error('ERROR: нет нативного @tailwindcss/oxide для Linux.');
      console.error('  rm -rf node_modules && npm ci --include=dev');
      process.exit(1);
    }
    require('@tailwindcss/oxide');
    console.log('@tailwindcss/oxide OK');
  "
}

echo "==> Проверка Tailwind oxide (linux native)..."
verify_tailwind_oxide

echo "==> Миграции БД..."
npm run prisma:migrate:deploy

echo "==> Сборка Next.js (webpack)..."
npm run build

echo "==> Финальная проверка better-sqlite3..."
verify_better_sqlite3

echo "==> Готово. Запуск: npm run start (порт ${PORT:-8080})"

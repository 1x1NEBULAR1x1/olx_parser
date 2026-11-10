#!/usr/bin/env bash
# Сборка production на Linux-сервере.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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

require_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    if [[ -f .env ]]; then
      # shellcheck disable=SC1091
      set -a
      # shellcheck disable=SC1091
      source .env
      set +a
    fi
  fi
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: DATABASE_URL не задан (postgresql://...)."
    echo "Скопируйте .env.example → .env и укажите Postgres."
    exit 1
  fi
  if [[ "$DATABASE_URL" == file:* ]]; then
    echo "ERROR: DATABASE_URL указывает на SQLite (file:...). Нужен PostgreSQL."
    exit 1
  fi
}

echo "==> Проверка Node.js (>=22)..."
require_node_version

warn_low_memory

echo "==> Проверка DATABASE_URL (PostgreSQL)..."
require_database_url

echo "==> Проверка уязвимостей (уровень high+)..."
npm run audit:check

echo "==> Установка зависимостей (npm ci, включая dev — нужны для next build)..."
# NODE_ENV=production заставляет npm ci пропустить devDependencies (tailwind/postcss).
# На сервере переменная часто уже export из systemd/.profile — явно включаем dev.
if [[ -d node_modules/@tailwindcss/oxide-darwin-arm64 || -d node_modules/@tailwindcss/oxide-darwin-x64 ]] \
  && [[ ! -f node_modules/@tailwindcss/oxide-linux-x64-gnu/tailwindcss-oxide.linux-x64-gnu.node ]] \
  && [[ ! -f node_modules/@tailwindcss/oxide-linux-x64-musl/tailwindcss-oxide.linux-x64-musl.node ]]; then
  echo "    node_modules собраны под macOS — переустановка под Linux..."
  rm -rf node_modules
fi
npm ci --include=dev

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

echo "==> Миграции БД (PostgreSQL)..."
npm run prisma:migrate:deploy

echo "==> Сборка Next.js (webpack)..."
npm run build

echo "==> Готово. Запуск: npm run start (порт ${PORT:-8080})"

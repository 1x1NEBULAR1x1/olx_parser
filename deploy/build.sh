#!/usr/bin/env bash
# Сборка и запуск production на сервере (Linux x64).
# НЕ копируйте node_modules с macOS — better-sqlite3 должен собираться на целевой ОС.
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

verify_better_sqlite3() {
  node -e "require('better-sqlite3'); console.log('better-sqlite3 OK')"
}

echo "==> Проверка инструментов сборки (g++, make, python3)..."
require_build_tools

echo "==> Проверка уязвимостей (уровень high+)..."
npm run audit:check

echo "==> Установка зависимостей (npm ci)..."
# Удаляем node_modules, если их принесли с другой ОС (darwin-бинарники не работают на linux).
if [[ -d node_modules/better-sqlite3/build ]]; then
  if ! node -e "require('better-sqlite3')" 2>/dev/null; then
    echo "    Старые/чужие бинарники better-sqlite3 — переустановка node_modules..."
    rm -rf node_modules
  fi
fi
npm ci

echo "==> Сборка нативного модуля better-sqlite3 под $(node -p "process.platform + '-' + process.arch")..."
npm rebuild better-sqlite3 --build-from-source

echo "==> Проверка загрузки better-sqlite3..."
verify_better_sqlite3

echo "==> Миграции БД..."
npm run prisma:migrate:deploy

echo "==> Сборка Next.js..."
npm run build

echo "==> Проверка better-sqlite3 после сборки..."
verify_better_sqlite3

echo "==> Готово. Запуск: npm run start (порт ${PORT:-8080})"

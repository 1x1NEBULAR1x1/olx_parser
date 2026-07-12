#!/usr/bin/env bash
# Сборка и запуск production на сервере
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Проверка уязвимостей (уровень high+)..."
npm run audit:check

echo "==> Установка зависимостей..."
npm ci

echo "==> Миграции БД..."
npm run prisma:migrate:deploy

echo "==> Сборка Next.js..."
npm run build

echo "==> Готово. Запуск: npm run start (порт ${PORT:-8080})"

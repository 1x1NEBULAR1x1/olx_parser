#!/usr/bin/env bash
# Сборка Next.js на Linux VPS — ТОЛЬКО через npm run build, не npx next build.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Принудительно WASM SWC до загрузки next (иначе Next скачает swc-linux-x64-gnu в кэш).
export NEXT_TEST_WASM=1
export LD_PRELOAD=""
export NAPI_RS_FORCE_WASI=true
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

echo "[next-build] финальная очистка нативных бинарников и кэша next-swc..."
node scripts/strip-native-binaries.mjs

echo "[next-build] preflight WASM..."
node -e "require('@next/swc-wasm-nodejs'); console.log('  @next/swc-wasm-nodejs OK')"
node -e "process.env.NAPI_RS_FORCE_WASI='true'; require('@tailwindcss/oxide'); console.log('  @tailwindcss/oxide WASI OK')"
node -e "require('lightningcss-wasm').transform({filename:'t.css',code:Buffer.from('a{}'),minify:false}); console.log('  lightningcss-wasm OK')"

if [[ -d node_modules/@next/swc-linux-x64-gnu ]]; then
  echo "[next-build] ОШИБКА: swc-linux всё ещё установлен. Запустите:"
  echo "  cp deploy/npmrc.server .npmrc && rm -rf node_modules && npm ci"
  exit 1
fi

echo "[next-build] запуск next build (NEXT_TEST_WASM=1)..."
exec node ./node_modules/next/dist/bin/next build "$@"

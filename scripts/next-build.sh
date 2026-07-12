#!/usr/bin/env bash
# next build с WASM toolchain на Linux VPS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export LD_PRELOAD=""
export NAPI_RS_FORCE_WASI=true
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

echo "[next-build] финальная очистка нативных бинарников..."
node scripts/strip-native-binaries.mjs

echo "[next-build] preflight WASM..."
node -e "require('@next/swc-wasm-nodejs'); console.log('  @next/swc-wasm-nodejs OK')"
node -e "process.env.NAPI_RS_FORCE_WASI='true'; require('@tailwindcss/oxide'); console.log('  @tailwindcss/oxide WASI OK')"
node -e "require('lightningcss-wasm').transform({filename:'t.css',code:Buffer.from('a{}'),minify:false}); console.log('  lightningcss-wasm OK')"

echo "[next-build] запуск next build..."
exec node ./node_modules/next/dist/bin/next build "$@"

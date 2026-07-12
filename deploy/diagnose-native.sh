#!/usr/bin/env bash
# Диагностика нативных модулей на Linux-сервере.
# ВАЖНО: не вызываем require('@next/swc-linux-x64-gnu') / require('lightningcss') напрямую —
# на проблемных VPS это Bus error и убивает shell.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Система ==="
uname -a
echo "Node: $(node -v 2>/dev/null || echo 'не установлен')"
echo "npm:  $(npm -v 2>/dev/null || echo 'не установлен')"
echo "RAM:  $(free -h | awk '/^Mem:/{print $2 " total, " $7 " available"}')"
echo "Swap: $(free -h | awk '/^Swap:/{print $2 " total, " $3 " used"}')"
swapon --show 2>/dev/null || echo "(swap не настроен)"
echo "LD_PRELOAD: ${LD_PRELOAD:-<пусто>}"

echo ""
echo "=== Файлы fallback (без загрузки нативных .node) ==="

check_path() {
  local label="$1"
  local rel_path="$2"
  printf "  %-30s " "$label"
  if [[ -e "$rel_path" ]]; then
    echo "OK ($rel_path)"
  else
    echo "НЕТ ($rel_path)"
  fi
}

check_path "better-sqlite3 .node" "node_modules/better-sqlite3/build/Release/better_sqlite3.node"
check_path "НЕТ swc-linux (хорошо)" "node_modules/@next/swc-linux-x64-gnu"
check_path "@next/swc-wasm-nodejs" "node_modules/@next/swc-wasm-nodejs/wasm.js"
check_path "@tailwindcss/oxide-wasm32-wasi" "node_modules/@tailwindcss/oxide-wasm32-wasi"
check_path "lightningcss-wasm" "node_modules/lightningcss-wasm/lightningcss_node.wasm"
check_path "lightningcss WASM patch" "scripts/patches/lightningcss-index-wasm.cjs"

echo ""
echo "=== Безопасные проверки (WASM/WASI) ==="

safe_check() {
  local label="$1"
  local code="$2"
  printf "  %-30s " "$label"
  if node -e "$code" 2>/tmp/diag-native.err; then
    echo "OK"
  else
    echo "FAIL"
    sed 's/^/    /' /tmp/diag-native.err
  fi
}

safe_check "better-sqlite3" "require('better-sqlite3')"
safe_check "lightningcss-wasm" "require('lightningcss-wasm').transform({filename:'t.css',code:Buffer.from('a{}'),minify:false})"
safe_check "tailwind oxide WASI" "process.env.NAPI_RS_FORCE_WASI='true'; require('@tailwindcss/oxide')"

echo ""
echo "=== Рекомендации ==="
node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if (( node_major < 22 )); then
  echo "  • Node $(node -v) — нужен Node >=22"
fi

mem_mb="$(free -m | awk '/^Mem:/{print $2}')"
swap_kb="$(free -m | awk '/^Swap:/{print $2}')"
if (( mem_mb < 2048 && swap_kb < 512 )); then
  echo "  • RAM ${mem_mb}MB, swap ${swap_kb}MB — добавьте swap 2GB перед next build"
fi

if [[ -d node_modules/@next/swc-linux-x64-gnu ]]; then
  echo "  • ОШИБКА: swc-linux установлен — npm ci снова подтянул native optional deps"
  echo "    cp deploy/npmrc.server .npmrc && rm -rf node_modules && npm ci"
fi

echo "  • Сборка: npm run build  (или ./deploy/build.sh)"
echo "  • Не тестируйте @next/swc-linux-x64-gnu / lightningcss native — Bus error на этом VPS"

rm -f /tmp/diag-native.err

#!/usr/bin/env bash
# Диагностика нативных модулей на Linux-сервере.
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

echo ""
echo "=== Нативные модули ==="

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
check_path "tailwind oxide gnu" "node_modules/@tailwindcss/oxide-linux-x64-gnu/tailwindcss-oxide.linux-x64-gnu.node"
check_path "tailwind oxide musl" "node_modules/@tailwindcss/oxide-linux-x64-musl/tailwindcss-oxide.linux-x64-musl.node"
check_path "НЕТ oxide-darwin (хорошо на Linux)" "node_modules/@tailwindcss/oxide-darwin-arm64"

echo ""
echo "=== Проверки загрузки ==="

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
safe_check "@tailwindcss/oxide" "require('@tailwindcss/oxide')"

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

if [[ ! -f node_modules/better-sqlite3/build/Release/better_sqlite3.node ]]; then
  echo "  • better-sqlite3 не собран: npm rebuild better-sqlite3 --build-from-source"
  echo "    Нужны: sudo apt install -y build-essential python3"
fi

if [[ ! -f node_modules/@tailwindcss/oxide-linux-x64-gnu/tailwindcss-oxide.linux-x64-gnu.node ]] \
  && [[ ! -f node_modules/@tailwindcss/oxide-linux-x64-musl/tailwindcss-oxide.linux-x64-musl.node ]]; then
  echo "  • @tailwindcss/oxide для Linux не установлен"
  echo "    rm -rf node_modules && npm ci --include=dev"
fi

echo "  • Сборка: npm run build  (или ./deploy/build.sh)"

rm -f /tmp/diag-native.err

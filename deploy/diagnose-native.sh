#!/usr/bin/env bash
# Диагностика нативных модулей на Linux-сервере (SWC, better-sqlite3, lightningcss).
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
echo "=== Проверка модулей (по одному) ==="

check_module() {
  local label="$1"
  local code="$2"
  printf "  %-28s " "$label"
  if node -e "$code" 2>/tmp/diag-native.err; then
    echo "OK"
  else
    echo "FAIL"
    sed 's/^/    /' /tmp/diag-native.err
  fi
}

check_module "better-sqlite3" "require('better-sqlite3')"
check_module "@next/swc-linux-x64-gnu" "require('@next/swc-linux-x64-gnu')"
check_module "lightningcss" "require('lightningcss')"
check_module "next (import)" "import('next').then(()=>{})"

echo ""
echo "=== Рекомендации ==="
node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if (( node_major < 22 )); then
  echo "  • Node $(node -v): Prisma 7.8 рекомендует Node >=22. Обновите:"
  echo "    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
  echo "    sudo apt install -y nodejs"
fi

mem_mb="$(free -m | awk '/^Mem:/{print $2}')"
if (( mem_mb < 1800 )); then
  echo "  • RAM ${mem_mb}MB — для next build нужен swap ≥2GB:"
  echo "    sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile"
  echo "    sudo mkswap /swapfile && sudo swapon /swapfile"
fi

if ! node -e "require('@next/swc-linux-x64-gnu')" 2>/dev/null; then
  echo "  • SWC native не грузится — соберите с WASM:"
  echo "    SMARTFLIP_SWC_WASM=1 ./deploy/build.sh"
fi

rm -f /tmp/diag-native.err

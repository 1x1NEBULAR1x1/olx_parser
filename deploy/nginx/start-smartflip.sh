#!/usr/bin/env bash
# Сборка и запуск SmartFlip на 127.0.0.1:8080 (без systemd).
# На сервере: bash deploy/nginx/start-smartflip.sh

set -euo pipefail

APP_DIR="${SMARTFLIP_APP_DIR:-/home/olx_parser-main}"
HOST="${SMARTFLIP_HOST:-v915607.hosted-by-vdsina.com}"
LOG_FILE="${SMARTFLIP_LOG:-/tmp/smartflip.log}"

cd "$APP_DIR"

echo "=== build ==="
npm run build

echo "=== stop old ==="
pkill -f 'next-server' 2>/dev/null || true
fuser -k 8080/tcp 2>/dev/null || true
sleep 1

echo "=== start :8080 ==="
nohup ./node_modules/.bin/next start -H 127.0.0.1 -p 8080 </dev/null >>"$LOG_FILE" 2>&1 &
disown 2>/dev/null || true

for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    echo "OK: http://127.0.0.1:8080/api/health"
    curl -sf http://127.0.0.1:8080/api/health
    echo
    echo "=== nginx Location ==="
    curl -sI -H "Host: $HOST" http://127.0.0.1/ | grep -iE '^(HTTP|location):' || true
    exit 0
  fi
  sleep 2
done

echo "FAIL: SmartFlip не поднялся за 30с. Лог:"
tail -30 "$LOG_FILE"
exit 1

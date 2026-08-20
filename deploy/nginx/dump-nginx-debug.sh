#!/usr/bin/env bash
# Сбор всей диагностики nginx + SmartFlip для отладки.
# На сервере:
#   bash deploy/nginx/dump-nginx-debug.sh
#   bash deploy/nginx/dump-nginx-debug.sh v915607.hosted-by-vdsina.com > /tmp/nginx-debug.txt
#   bash deploy/nginx/dump-nginx-debug.sh --save   # сохранит в /tmp/nginx-debug-*.txt

set -uo pipefail

HOST="${SMARTFLIP_HOST:-v915607.hosted-by-vdsina.com}"
SAVE=false
OUT_FILE=""

for arg in "$@"; do
  case "$arg" in
    --save) SAVE=true ;;
    --help|-h)
      echo "Usage: bash $0 [HOST] [--save]"
      exit 0
      ;;
    *)
      if [[ "$arg" != --* ]]; then
        HOST="$arg"
      fi
      ;;
  esac
done

if [[ "$SAVE" == true ]]; then
  OUT_FILE="/tmp/nginx-debug-$(date +%Y%m%d-%H%M%S).txt"
  exec > >(tee "$OUT_FILE") 2>&1
  echo ">>> Сохранение в: $OUT_FILE"
  echo
fi

section() {
  echo
  echo "================================================================================"
  echo "=== $1"
  echo "================================================================================"
}

run() {
  echo
  echo "--- \$ $*"
  "$@" 2>&1 || echo "(exit $?)"
}

section "META"
echo "date: $(date -Is 2>/dev/null || date)"
echo "hostname: $(hostname -f 2>/dev/null || hostname)"
echo "user: $(whoami)"
echo "host: $HOST"
echo "pwd: $(pwd)"

section "DNS"
run getent ahosts "$HOST"
run dig +short A "$HOST" @8.8.8.8
run dig +short CAA "$HOST" @8.8.8.8

section "NGINX VERSION / TEST"
run nginx -v
run nginx -t

section "NGINX sites-enabled"
run ls -la /etc/nginx/sites-enabled/

section "NGINX sites-available (список)"
run ls -la /etc/nginx/sites-available/

section "NGINX listen / server_name / default_server / ssl"
if command -v nginx >/dev/null 2>&1; then
  nginx -T 2>/dev/null | grep -nE 'listen |server_name |default_server|ssl_certificate|proxy_pass|upstream ' || true
else
  echo "nginx не найден"
fi

section "FILE: /etc/nginx/sites-available/smartflip"
if [[ -f /etc/nginx/sites-available/smartflip ]]; then
  cat -n /etc/nginx/sites-available/smartflip
else
  echo "НЕТ ФАЙЛА"
fi

section "FILE: /etc/nginx/sites-enabled/* (содержимое)"
for f in /etc/nginx/sites-enabled/*; do
  [[ -e "$f" ]] || continue
  echo
  echo ">>> $f -> $(readlink -f "$f" 2>/dev/null || echo '?')"
  if [[ -f "$f" ]]; then
    cat -n "$f"
  fi
done

section "NGINX -T (полный дамп)"
nginx -T 2>/dev/null || echo "nginx -T недоступен (нужен root?)"

section "CURL HTTP :80 (Host=$HOST)"
run curl -sI -H "Host: $HOST" "http://127.0.0.1/"
echo
echo "--- location / host ---"
curl -sI -H "Host: $HOST" "http://127.0.0.1/" 2>/dev/null | grep -iE '^(HTTP|location|host|server):' || true

section "CURL HTTPS :443 (SNI=$HOST)"
run curl -sI --resolve "${HOST}:443:127.0.0.1" "https://${HOST}/"

section "CURL SmartFlip :8080 /api/health"
run curl -sS "http://127.0.0.1:8080/api/health"
run curl -sI -H "Host: $HOST" "http://127.0.0.1:8080/"

section "LISTEN PORTS (80, 443, 8080)"
if command -v ss >/dev/null 2>&1; then
  ss -tlnp | grep -E ':80 |:443 |:8080 ' || ss -tlnp | head -20
elif command -v netstat >/dev/null 2>&1; then
  netstat -tlnp | grep -E ':80 |:443 |:8080 ' || true
else
  echo "ss/netstat недоступны"
fi

section "SYSTEMD smartflip"
if systemctl list-unit-files smartflip.service &>/dev/null; then
  run systemctl status smartflip --no-pager -l
  echo
  systemctl cat smartflip 2>/dev/null || true
else
  echo "unit smartflip.service не найден"
fi

section "PROCESS node / next (8080)"
if command -v ss >/dev/null 2>&1; then
  ss -tlnp | grep ':8080' || true
fi
ps aux | grep -E '[n]ode|[n]ext|[n]pm' | head -15 || true

section "PROJECT DIRS"
for dir in /home/olx_parser-main /var/www/smartflip "$(pwd)"; do
  [[ -d "$dir" ]] || continue
  echo
  echo ">>> $dir"
  ls -la "$dir" 2>/dev/null | head -15
  [[ -f "$dir/.env" ]] && echo "  .env: есть" || echo "  .env: нет"
  [[ -f "$dir/deploy/nginx/smartflip.conf" ]] && echo "  deploy/nginx/smartflip.conf: есть" || true
done

section ".env (секреты замаскированы)"
mask_env() {
  sed -E \
    -e 's/^(AUTH_SECRET=).*/\1***MASKED***/' \
    -e 's/^(GOOGLE_CLIENT_SECRET=).*/\1***MASKED***/' \
    -e 's/^(GOOGLE_CLIENT_ID=).*/\1***MASKED***/' \
    -e 's/^(DATABASE_URL=).*/\1***MASKED***/' \
    -e 's/^(ADMIN_EMAIL=).*/\1***MASKED***/'
}

for env_file in \
  /home/olx_parser-main/.env \
  /var/www/smartflip/.env \
  "$(systemctl show smartflip -p EnvironmentFiles --value 2>/dev/null | tr ' ' '\n' | grep -E '\.env$' | head -1)"; do
  [[ -n "$env_file" && -f "$env_file" ]] || continue
  echo
  echo ">>> $env_file"
  mask_env < "$env_file"
done

section "middleware.ts (redirectTo?)"
for mf in /home/olx_parser-main/src/middleware.ts /var/www/smartflip/src/middleware.ts; do
  [[ -f "$mf" ]] || continue
  echo ">>> $mf"
  grep -n 'redirectTo\|req\.url\|x-forwarded-host' "$mf" || echo "(нет redirectTo / forwarded headers)"
done

section "CERTBOT / LETSENCRYPT"
run ls -la "/etc/letsencrypt/live/${HOST}/" 2>/dev/null
[[ -f /var/log/letsencrypt/letsencrypt.log ]] && tail -30 /var/log/letsencrypt/letsencrypt.log || true

section "DONE"
if [[ -n "$OUT_FILE" ]]; then
  echo "Файл: $OUT_FILE"
  echo "Скопировать: cat $OUT_FILE"
fi

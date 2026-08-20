#!/usr/bin/env bash
# Полный фикс SmartFlip на VPS: nginx + SSL redirect + build + start.
# sudo bash deploy/nginx/fix-smartflip-all.sh

set -euo pipefail

HOST="${SMARTFLIP_HOST:-v915607.hosted-by-vdsina.com}"
APP="${SMARTFLIP_APP_DIR:-/home/olx_parser-main}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "sudo bash $0"
  exit 1
fi

echo "=== 1. nginx smartflip ==="
cp "${APP}/deploy/nginx/smartflip.conf" /etc/nginx/sites-available/smartflip
sed -i -E \
  -e "s/v[0-9]+\\.hosted-by-vdsina\\.com/${HOST}/g" \
  -e "s/server_name[[:space:]]+[^;]+;/server_name ${HOST};/" \
  /etc/nginx/sites-available/smartflip
ln -sf /etc/nginx/sites-available/smartflip /etc/nginx/sites-enabled/smartflip
rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/relpen.org.bootstrap.conf

echo "=== 2. self-signed SSL (HTTPS → HTTP) ==="
bash "${APP}/deploy/nginx/gen-smartflip-selfsigned.sh" "$HOST"

echo "=== 3. .env ==="
ENV_FILE="${APP}/.env"
grep -q '^NEXTAUTH_URL=' "$ENV_FILE" && sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=http://${HOST}|" "$ENV_FILE" \
  || echo "NEXTAUTH_URL=http://${HOST}" >> "$ENV_FILE"
grep -q '^AUTH_TRUST_HOST=' "$ENV_FILE" && sed -i 's|^AUTH_TRUST_HOST=.*|AUTH_TRUST_HOST=true|' "$ENV_FILE" \
  || echo 'AUTH_TRUST_HOST=true' >> "$ENV_FILE"

nginx -t
systemctl reload nginx

echo "=== 4. build + start ==="
pkill -f 'next-server' 2>/dev/null || true
fuser -k 8080/tcp 2>/dev/null || true
cd "$APP"
npm run build
nohup ./node_modules/.bin/next start -H 127.0.0.1 -p 8080 </dev/null >>/tmp/smartflip.log 2>&1 &
disown 2>/dev/null || true
sleep 8

echo "=== 5. проверка ==="
curl -sf http://127.0.0.1:8080/api/health && echo
echo "--- HTTP ---"
curl -sI -H "Host: ${HOST}" http://127.0.0.1/ | grep -iE '^(HTTP|location):'
echo "--- HTTPS (self-signed) ---"
curl -skI --resolve "${HOST}:443:127.0.0.1" "https://${HOST}/" | grep -iE '^(HTTP|location):'

cat <<EOF

Открывайте: http://${HOST}/
(HTTPS редиректит на HTTP, браузер может ругаться на self-signed — это нормально)

EOF

#!/usr/bin/env bash
# Установка nginx-конфига SmartFlip на VPS (рядом с relpen.org).
# Запуск из корня проекта: sudo bash deploy/nginx/install-smartflip-nginx.sh

set -euo pipefail

HOST="${SMARTFLIP_HOST:-v915607.hosted-by-vdsina.com}"
PROJECT_DIR="${SMARTFLIP_PROJECT_DIR:-/var/www/smartflip}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Запустите с sudo"
  exit 1
fi

if [[ ! -f "${PROJECT_DIR}/deploy/nginx/smartflip.conf" ]]; then
  PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
fi

CONF_SRC="${PROJECT_DIR}/deploy/nginx/smartflip.conf"
if [[ ! -f "${CONF_SRC}" ]]; then
  echo "Не найден ${CONF_SRC}"
  exit 1
fi

cp "${CONF_SRC}" /etc/nginx/sites-available/smartflip
sed -i "s/v915607.hosted-by-vdsina.com/${HOST}/g" /etc/nginx/sites-available/smartflip

ln -sf /etc/nginx/sites-available/smartflip /etc/nginx/sites-enabled/smartflip
rm -f /etc/nginx/sites-enabled/default

echo "=== sites-enabled ==="
ls -la /etc/nginx/sites-enabled/

echo
echo "=== Проверка HTTP для ${HOST} (до reload) ==="
nginx -t

systemctl reload nginx

echo
echo "=== curl HTTP ==="
curl -sI -H "Host: ${HOST}" http://127.0.0.1/ | head -8

echo
echo "=== SmartFlip app ==="
curl -sf http://127.0.0.1:8080/api/health && echo || echo "WARN: :8080/api/health недоступен — systemctl status smartflip"

cat <<EOF

Готово. Проверьте в браузере: http://${HOST}/

HTTPS (отдельно, иначе relpen перехватит :443):
  certbot --nginx -d ${HOST}

В .env:
  NEXTAUTH_URL=https://${HOST}
  AUTH_TRUST_HOST=true
  systemctl restart smartflip
EOF

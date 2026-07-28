#!/usr/bin/env bash
# relpen перехватывает v915607.hosted-by-vdsina.com — диагностика и фикс nginx.
# На сервере: sudo bash deploy/nginx/fix-relpen-capture.sh

set -euo pipefail

HOST="${SMARTFLIP_HOST:-v915607.hosted-by-vdsina.com}"
PROJECT_DIR="${SMARTFLIP_PROJECT_DIR:-/var/www/smartflip}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Запустите: sudo bash $0"
  exit 1
fi

echo "=== 1. sites-enabled ==="
ls -la /etc/nginx/sites-enabled/ || true
echo

echo "=== 2. default_server в конфигах ==="
grep -rn "default_server" /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ 2>/dev/null || echo "(нет)"
echo

echo "=== 3. server_name smartflip / ${HOST} ==="
grep -rn "server_name" /etc/nginx/sites-available/smartflip 2>/dev/null || echo "ФАЙЛ smartflip НЕ НАЙДЕН"
grep -rn "${HOST}" /etc/nginx/sites-available/ 2>/dev/null || echo "HOST нигде не указан"
echo

echo "=== 4. curl ДО фикса ==="
curl -sI -H "Host: ${HOST}" http://127.0.0.1/ | head -6 || true
echo

echo "=== 5. Фикс ==="

# bootstrap и default часто ловят все чужие Host
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/relpen.org.bootstrap.conf

# убрать default_server у relpen (не трогаем server_name)
for f in /etc/nginx/sites-available/relpen.org*; do
  [[ -f "$f" ]] || continue
  sed -i 's/ default_server;/;/g; s/ default_server//g; s/default_server //g' "$f"
done

# установить smartflip из репозитория, если есть
if [[ -f "${PROJECT_DIR}/deploy/nginx/smartflip.conf" ]]; then
  cp "${PROJECT_DIR}/deploy/nginx/smartflip.conf" /etc/nginx/sites-available/smartflip
  sed -i "s/v915607.hosted-by-vdsina.com/${HOST}/g" /etc/nginx/sites-available/smartflip
  echo "Скопирован ${PROJECT_DIR}/deploy/nginx/smartflip.conf"
elif [[ ! -f /etc/nginx/sites-available/smartflip ]]; then
  echo "ОШИБКА: нет smartflip.conf — скопируйте deploy/nginx/smartflip.conf вручную"
  exit 1
fi

ln -sf /etc/nginx/sites-available/smartflip /etc/nginx/sites-enabled/smartflip

# не держать два symlink relpen (relpen.org + relpen.org.conf)
if [[ -L /etc/nginx/sites-enabled/relpen.org && -L /etc/nginx/sites-enabled/relpen.org.conf ]]; then
  rm -f /etc/nginx/sites-enabled/relpen.org
  echo "Удалён дубликат sites-enabled/relpen.org (оставлен relpen.org.conf)"
fi

nginx -t
systemctl reload nginx

echo
echo "=== 6. curl ПОСЛЕ фикса ==="
curl -sI -H "Host: ${HOST}" http://127.0.0.1/ | head -8

echo
echo "=== 7. SmartFlip :8080 ==="
curl -sf http://127.0.0.1:8080/api/health && echo || echo "WARN: smartflip не слушает :8080 — systemctl status smartflip"

cat <<EOF

Ожидание: Location: /login или HTTP 200, НЕ relpen.org

Если всё ещё relpen — пришлите вывод:
  nginx -T 2>/dev/null | grep -E "listen 80|server_name|default_server"

HTTPS:
  certbot --nginx -d ${HOST}

.env:
  NEXTAUTH_URL=https://${HOST}
  AUTH_TRUST_HOST=true
EOF

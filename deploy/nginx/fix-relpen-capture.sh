#!/usr/bin/env bash
# relpen перехватывает v915607.hosted-by-vdsina.com — диагностика и фикс nginx.
# На сервере: sudo bash deploy/nginx/fix-relpen-capture.sh

set -euo pipefail

HOST="${SMARTFLIP_HOST:-v915607.hosted-by-vdsina.com}"
if [[ -d /home/olx_parser-main/deploy/nginx ]]; then
  PROJECT_DIR="${SMARTFLIP_PROJECT_DIR:-/home/olx_parser-main}"
else
  PROJECT_DIR="${SMARTFLIP_PROJECT_DIR:-/var/www/smartflip}"
fi
APP_DIR="${SMARTFLIP_APP_DIR:-$PROJECT_DIR}"

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
  # любой старый VDSina-поддомен или example → актуальный HOST
  sed -i -E \
    -e "s/v[0-9]+\\.hosted-by-vdsina\\.com/${HOST}/g" \
    -e "s/smartflip\\.example\\.com//g" \
    -e "s/server_name[[:space:]]+[^;]+;/server_name ${HOST};/" \
    /etc/nginx/sites-available/smartflip
  echo "Скопирован ${PROJECT_DIR}/deploy/nginx/smartflip.conf → server_name ${HOST}"
elif [[ ! -f /etc/nginx/sites-available/smartflip ]]; then
  echo "ОШИБКА: нет smartflip.conf — скопируйте deploy/nginx/smartflip.conf вручную"
  exit 1
else
  sed -i -E \
    -e "s/v[0-9]+\\.hosted-by-vdsina\\.com/${HOST}/g" \
    -e "s/server_name[[:space:]]+[^;]+;/server_name ${HOST};/" \
    /etc/nginx/sites-available/smartflip
  echo "Обновлён server_name в существующем smartflip → ${HOST}"
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
if curl -sf http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
  curl -sf http://127.0.0.1:8080/api/health && echo
else
  echo "WARN: :8080 недоступен — перезапуск приложения..."
  if [[ -f "${APP_DIR}/package.json" ]]; then
    fuser -k 8080/tcp 2>/dev/null || true
    pkill -f "next-server" 2>/dev/null || true
    sleep 1
    cd "${APP_DIR}"
    sudo -u "${SUDO_USER:-root}" env APP_BIND_HOST=127.0.0.1 PORT=8080 \
      nohup npm run start >> /tmp/smartflip.log 2>&1 &
    sleep 4
    curl -sf http://127.0.0.1:8080/api/health && echo || echo "FAIL: проверьте /tmp/smartflip.log"
  else
    echo "FAIL: нет ${APP_DIR}/package.json"
  fi
fi

echo
echo "=== 8. Location (должен быть ${HOST}, не relpen) ==="
curl -sI -H "Host: ${HOST}" http://127.0.0.1/ | grep -iE '^(HTTP|location):' || true

cat <<EOF

Ожидание: Location: /login или HTTP 200, НЕ relpen.org

Если всё ещё relpen — пришлите вывод:
  nginx -T 2>/dev/null | grep -E "listen 80|server_name|default_server"

HTTPS:
  certbot --nginx -d ${HOST}

.env:
  NEXTAUTH_URL=http://${HOST}
  AUTH_TRUST_HOST=true
  cd ${APP_DIR} && npm run build && env APP_BIND_HOST=127.0.0.1 PORT=8080 npm run start
EOF

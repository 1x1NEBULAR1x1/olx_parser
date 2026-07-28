#!/usr/bin/env bash
# Диагностика ERR_SSL_UNRECOGNIZED_NAME_ALERT на VDSina.
# Запуск на сервере: bash deploy/nginx/fix-ssl-vdsina.sh v915607.hosted-by-vdsina.com

set -euo pipefail

HOST="${1:-v915607.hosted-by-vdsina.com}"

echo "=== SmartFlip SSL diagnose: ${HOST} ==="
echo

echo "1) DNS A-record:"
getent ahosts "${HOST}" 2>/dev/null | head -3 || echo "  (getent недоступен)"
echo

echo "2) HTTP локально (должен быть 200/302 SmartFlip, не relpen):"
curl -sI -H "Host: ${HOST}" "http://127.0.0.1/" | head -8 || true
echo

echo "3) HTTPS локально (SNI=${HOST}):"
curl -sI --resolve "${HOST}:443:127.0.0.1" "https://${HOST}/" 2>&1 | head -8 || true
echo

echo "4) nginx server_name + default_server:"
sudo nginx -T 2>/dev/null | grep -E "listen|server_name|default_server|ssl_certificate" | head -40 || true
echo

echo "5) Let's Encrypt certs:"
sudo ls -la "/etc/letsencrypt/live/${HOST}/" 2>/dev/null || echo "  нет сертификата для ${HOST}"
echo

echo "=== Что делать ==="
cat <<EOF
A) Пока нет HTTPS — открывайте http://${HOST}/ (не https).
B) В /etc/nginx/sites-available/smartflip замените server_name на ${HOST}.
C) У relpen уберите default_server на 80/443 (см. deploy/nginx/MULTI-SITE.md).
D) Выпустите сертификат:
   sudo certbot --nginx -d ${HOST}
E) В .env SmartFlip:
   NEXTAUTH_URL=http://${HOST}
   # после успешного certbot:
   # NEXTAUTH_URL=https://${HOST}
   AUTH_TRUST_HOST=true
   sudo systemctl restart smartflip
F) Редирект на localhost:8080 — обновите код (middleware redirectTo),
   скопируйте smartflip.conf с X-Forwarded-Host, пересоберите и restart smartflip.
G) certbot CAA SERVFAIL — DNS VDSina; пока используйте HTTP или свой домен.
EOF

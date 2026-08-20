#!/usr/bin/env bash
# Выпуск SSL для SmartFlip: Let's Encrypt → fallback self-signed.
# На сервере:
#   sudo CERTBOT_EMAIL=you@mail.com bash deploy/nginx/setup-smartflip-ssl.sh
#   sudo bash deploy/nginx/setup-smartflip-ssl.sh v915607.hosted-by-vdsina.com

set -euo pipefail

HOST="${1:-${SMARTFLIP_HOST:-v915607.hosted-by-vdsina.com}}"
APP="${SMARTFLIP_APP_DIR:-/home/olx_parser-main}"
EMAIL="${CERTBOT_EMAIL:-}"
WEBROOT="/var/www/certbot"
SSL_DIR="/etc/nginx/ssl"
SELF_CRT="${SSL_DIR}/smartflip-v915607.crt"
SELF_KEY="${SSL_DIR}/smartflip-v915607.key"
LE_CRT="/etc/letsencrypt/live/${HOST}/fullchain.pem"
LE_KEY="/etc/letsencrypt/live/${HOST}/privkey.pem"
NGINX_SITE="/etc/nginx/sites-available/smartflip"
SNIPPET="/etc/nginx/snippets/smartflip-locations.inc"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Запустите: sudo bash $0"
  exit 1
fi

if [[ ! -d "$APP/deploy/nginx" ]]; then
  echo "Не найден $APP/deploy/nginx"
  exit 1
fi

echo "=== SmartFlip SSL: ${HOST} ==="
echo

echo "=== 1. DNS ==="
dig +short A "$HOST" @8.8.8.8 || true
CAA=$(dig +short CAA "$HOST" @8.8.8.8 2>&1 || true)
if echo "$CAA" | grep -qi servfail; then
  echo "WARN: CAA SERVFAIL — Let's Encrypt может отказать (DNS VDSina)"
fi
echo

echo "=== 2. nginx base ==="
mkdir -p "$WEBROOT" /etc/nginx/snippets "$SSL_DIR"
cp "${APP}/deploy/nginx/smartflip-locations.inc" "$SNIPPET"

# HTTP: ACME + proxy (до редиректа на HTTPS)
cat > "$NGINX_SITE" <<EOF
upstream smartflip_upstream {
    server 127.0.0.1:8080;
    keepalive 32;
}

limit_req_zone \$binary_remote_addr zone=smartflip_auth:10m rate=30r/m;
limit_req_zone \$binary_remote_addr zone=smartflip_api:10m rate=120r/m;

server {
    listen 80;
    listen [::]:80;
    server_name ${HOST};

    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
        allow all;
    }

    include ${SNIPPET};
}
EOF

ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/smartflip
rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/relpen.org.bootstrap.conf
nginx -t
systemctl reload nginx

echo "=== 3. certbot (Let's Encrypt) ==="
CERT_TYPE="selfsigned"
CRT_PATH="$SELF_CRT"
KEY_PATH="$SELF_KEY"

if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y certbot python3-certbot-nginx
fi

CERTBOT_ARGS=(--non-interactive --agree-tos --no-eff-email)
if [[ -n "$EMAIL" ]]; then
  CERTBOT_ARGS+=(--email "$EMAIL")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

try_le() {
  local method="$1"
  shift
  echo "--- certbot $method ---"
  if certbot certonly "$method" "$@" -d "$HOST" "${CERTBOT_ARGS[@]}" 2>&1; then
    [[ -f "$LE_CRT" && -f "$LE_KEY" ]]
  else
    return 1
  fi
}

if try_le --webroot -w "$WEBROOT" || try_le --nginx; then
  CERT_TYPE="letsencrypt"
  CRT_PATH="$LE_CRT"
  KEY_PATH="$LE_KEY"
  echo "OK: Let's Encrypt"
else
  echo "Let's Encrypt не выдан — self-signed"
  if [[ ! -f "$SELF_CRT" ]]; then
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout "$SELF_KEY" -out "$SELF_CRT" \
      -subj "/CN=${HOST}"
    chmod 600 "$SELF_KEY"
  fi
fi

echo "=== 4. nginx HTTPS (${CERT_TYPE}) ==="

if [[ "$CERT_TYPE" == "letsencrypt" ]]; then
  HTTP_BLOCK='    location ^~ /.well-known/acme-challenge/ {
        root '"${WEBROOT}"';
        allow all;
    }

    location / {
        return 301 https://$host$request_uri;
    }'
else
  HTTP_BLOCK="    include ${SNIPPET};"
fi

cat > "$NGINX_SITE" <<EOF
upstream smartflip_upstream {
    server 127.0.0.1:8080;
    keepalive 32;
}

limit_req_zone \$binary_remote_addr zone=smartflip_auth:10m rate=30r/m;
limit_req_zone \$binary_remote_addr zone=smartflip_api:10m rate=120r/m;

server {
    listen 80;
    listen [::]:80;
    server_name ${HOST};

${HTTP_BLOCK}
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${HOST};

    ssl_certificate     ${CRT_PATH};
    ssl_certificate_key ${KEY_PATH};
    ssl_protocols       TLSv1.2 TLSv1.3;

    include ${SNIPPET};
}
EOF

nginx -t
systemctl reload nginx

echo "=== 5. .env NEXTAUTH_URL ==="
ENV_FILE="${APP}/.env"
grep -q '^NEXTAUTH_URL=' "$ENV_FILE" && sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=https://${HOST}|" "$ENV_FILE" \
  || echo "NEXTAUTH_URL=https://${HOST}" >> "$ENV_FILE"
grep -q '^AUTH_TRUST_HOST=' "$ENV_FILE" && sed -i 's|^AUTH_TRUST_HOST=.*|AUTH_TRUST_HOST=true|' "$ENV_FILE" \
  || echo 'AUTH_TRUST_HOST=true' >> "$ENV_FILE"

if pgrep -f 'next-server' >/dev/null 2>&1; then
  pkill -f 'next-server' || true
  sleep 2
  cd "$APP"
  nohup ./node_modules/.bin/next start -H 127.0.0.1 -p 8080 </dev/null >>/tmp/smartflip.log 2>&1 &
  disown 2>/dev/null || true
  sleep 5
fi

echo "=== 6. проверка ==="
curl -sf http://127.0.0.1:8080/api/health && echo || echo "WARN: :8080 не отвечает"
echo "--- HTTPS ---"
curl -skI --resolve "${HOST}:443:127.0.0.1" "https://${HOST}/" | grep -iE '^(HTTP|location):' || true

cat <<EOF

Готово: ${CERT_TYPE}
  https://${HOST}/

$(if [[ "$CERT_TYPE" == "selfsigned" ]]; then
  echo "Self-signed: браузер покажет предупреждение → «Дополнительно» → «Перейти»."
  echo "Для доверенного HTTPS нужен свой домен или починка DNS CAA у VDSina."
else
  echo "Let's Encrypt: обновление: certbot renew"
fi)

Google OAuth → добавьте:
  https://${HOST}
  https://${HOST}/api/auth/callback/google

EOF

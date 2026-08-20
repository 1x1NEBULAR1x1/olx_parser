#!/usr/bin/env bash
# Self-signed cert для HTTPS→HTTP редиректа SmartFlip (пока нет Let's Encrypt).
set -euo pipefail

HOST="${1:-v915607.hosted-by-vdsina.com}"
SSL_DIR="/etc/nginx/ssl"
CRT="${SSL_DIR}/smartflip-v915607.crt"
KEY="${SSL_DIR}/smartflip-v915607.key"

mkdir -p "$SSL_DIR"
if [[ ! -f "$CRT" ]]; then
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$KEY" -out "$CRT" \
    -subj "/CN=${HOST}"
  chmod 600 "$KEY"
  echo "Создан: $CRT"
else
  echo "Уже есть: $CRT"
fi

# Два сайта на одном VPS (SmartFlip + relpen.org)

## Симптомы

| Симптом | Причина |
|---------|---------|
| Редирект на relpen.org | nginx не находит `server_name` SmartFlip → срабатывает `default_server` / `relpen.org.bootstrap.conf` |
| `ERR_SSL_UNRECOGNIZED_NAME_ALERT` на `https://v915607.hosted-by-vdsina.com` | На 443 нет сертификата для **этого** хоста (часто отдаётся cert relpen / старый v677071) |
| HTTP работает, HTTPS — нет | Не запущен `certbot` для актуального VDSina-URL |
| `Location: http://localhost:8080/login` | Middleware/Next.js не видит публичный хост за nginx → обновите код + `.env` + nginx headers |
| certbot: `SERVFAIL looking up CAA` | DNS VDSina для `*.hosted-by-vdsina.com` — Let's Encrypt не может проверить CAA |

## Правильная схема

```
v915607.hosted-by-vdsina.com  →  nginx server_name smartflip  →  127.0.0.1:8080
relpen.org                    →  nginx server_name relpen      →  другой порт/upstream
```

Каждый домен — **отдельный** файл в `/etc/nginx/sites-enabled/`.

**Важно:** URL VDSina меняется при пересоздании VPS (`v677071` → `v915607`). Обновите `server_name`, `.env` (`NEXTAUTH_URL`) и перевыпустите certbot.

## Шаги на сервере

### 0. Быстрая диагностика и авто-фикс

```bash
cd /var/www/smartflip
sudo bash deploy/nginx/fix-relpen-capture.sh
```

Или только диагностика:

```bash
bash deploy/nginx/fix-ssl-vdsina.sh v915607.hosted-by-vdsina.com
```

**Типичная причина:** в `sites-enabled` висит `relpen.org.bootstrap.conf` или `default` с `default_server` — они перехватывают `v915607...` до smartflip.

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo rm -f /etc/nginx/sites-enabled/relpen.org.bootstrap.conf
sudo grep -r "default_server" /etc/nginx/sites-available/relpen.org*
# удалите default_server из listen-строк relpen
```

### 1. Проверить, кто сейчас default_server

```bash
sudo nginx -T 2>/dev/null | grep -E "listen|server_name|default_server"
```

Ищите блок relpen с `default_server` на `80` или `443`.

### 2. Установить конфиг SmartFlip (один файл, без include)

```bash
cd /var/www/smartflip
sudo bash deploy/nginx/install-smartflip-nginx.sh
# или вручную:
sudo cp deploy/nginx/smartflip.conf /etc/nginx/sites-available/smartflip
sudo ln -sf /etc/nginx/sites-available/smartflip /etc/nginx/sites-enabled/smartflip
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Проверьте, что в `sites-enabled` **нет дубликата relpen** (только один symlink, например `relpen.org.conf`):

```bash
ls -la /etc/nginx/sites-enabled/
# должно быть примерно: relpen.org.conf -> ...  smartflip -> ...
# НЕ должно быть одновременно relpen.org и relpen.org.conf
```

### 3. Убрать default_server у relpen (если перехватывает чужие домены)

```bash
sudo nano /etc/nginx/sites-available/relpen
```

Было:

```nginx
listen 443 ssl http2 default_server;
listen 80 default_server;
```

Должно быть:

```nginx
listen 443 ssl http2;
listen 80;
server_name relpen.org www.relpen.org;
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 4. .env SmartFlip

```env
NEXTAUTH_URL=https://v915607.hosted-by-vdsina.com
AUTH_TRUST_HOST=true
APP_BIND_HOST=127.0.0.1
PORT=8080
```

```bash
sudo systemctl restart smartflip
```

### 5. HTTPS

Сначала проверьте HTTP: `http://v915607.hosted-by-vdsina.com/` (без s).

Проверка редиректа (должен быть **публичный** хост, не localhost):

```bash
curl -sI -H "Host: v915607.hosted-by-vdsina.com" http://127.0.0.1/ | grep -i location
# ожидается: location: http://v915607.hosted-by-vdsina.com/login
```

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d v915607.hosted-by-vdsina.com
sudo nginx -t && sudo systemctl reload nginx
```

#### certbot: `SERVFAIL looking up CAA`

Ошибка DNS на стороне VDSina — **не** nginx. Let's Encrypt всегда проверяет CAA до выдачи сертификата.

Проверка:

```bash
dig CAA v915607.hosted-by-vdsina.com @8.8.8.8
dig NS hosted-by-vdsina.com @8.8.8.8
```

Варианты:

1. **Пока работать по HTTP** — в `.env` временно `NEXTAUTH_URL=http://v915607.hosted-by-vdsina.com` (Google OAuth: добавить `http://...` в Authorized origins).
2. **Повторить certbot позже** — иногда SERVFAIL временный.
3. **Свой домен** с нормальным DNS (A-запись на IP VPS) — надёжнее, чем `*.hosted-by-vdsina.com`.
4. **Self-signed** (браузер будет ругаться): см. `deploy/nginx/fix-ssl-vdsina.sh`.
5. **Тикет в VDSina** — «DNS SERVFAIL on CAA for subdomain».

Certbot сам добавит блок `listen 443 ssl` с правильным сертификатом для **этого** хоста.

### 6. Проверка

```bash
curl -sI -H "Host: v915607.hosted-by-vdsina.com" http://127.0.0.1/ | head -5
curl -sI --resolve "v915607.hosted-by-vdsina.com:443:127.0.0.1" https://v915607.hosted-by-vdsina.com/ | head -5
curl -s http://127.0.0.1:8080/api/health
```

Ожидание: `200` или редирект на `/login` с **публичным** хостом (`v915607...`), **не** `localhost:8080` и **не** `https://relpen.org`.

## Исправленные ошибки в smartflip.conf

| Было | Должно быть |
|------|-------------|
| `upstream … 144.124.255.183:8080` | `127.0.0.1:8080` |
| `listen 8080` на nginx | `listen 80` / `443` |
| `server_name smartflipasdasdasd.com` | `server_name v915607.hosted-by-vdsina.com` |

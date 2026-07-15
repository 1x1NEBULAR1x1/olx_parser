# Два сайта на одном VPS (SmartFlip + relpen.org)

## Симптом

`https://v677071.hosted-by-vdsina.com/` редиректит на relpen.org — nginx не находит
`server_name` для SmartFlip и отдаёт **default_server** (конфиг relpen).

## Правильная схема

```
v677071.hosted-by-vdsina.com  →  nginx server_name smartflip  →  127.0.0.1:8080
relpen.org                    →  nginx server_name relpen      →  другой порт/upstream
```

Каждый домен — **отдельный** файл в `/etc/nginx/sites-enabled/`.

## Шаги на сервере

### 1. Проверить, кто сейчас default_server

```bash
sudo nginx -T 2>/dev/null | grep -E "listen|server_name|default_server"
```

Ищите блок relpen с `default_server` на `80` или `443`.

### 2. Установить конфиг SmartFlip

```bash
cd /var/www/smartflip
sudo cp deploy/nginx/smartflip.conf /etc/nginx/sites-available/smartflip
sudo ln -sf /etc/nginx/sites-available/smartflip /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
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
NEXTAUTH_URL=https://v677071.hosted-by-vdsina.com
AUTH_TRUST_HOST=true
APP_BIND_HOST=127.0.0.1
PORT=8080
```

```bash
sudo systemctl restart smartflip
```

### 5. HTTPS

```bash
sudo certbot --nginx -d v677071.hosted-by-vdsina.com
```

### 6. Проверка

```bash
curl -sI -H "Host: v677071.hosted-by-vdsina.com" http://127.0.0.1/ | head -5
curl -s http://127.0.0.1:8080/api/health
```

Ожидание: `200` или редирект на `/login`, **не** `Location: https://relpen.org`.

## Исправленные ошибки в smartflip.conf

| Было | Должно быть |
|------|-------------|
| `upstream … 144.124.255.183:8080` | `127.0.0.1:8080` |
| `listen 8080` на nginx | `listen 80` / `443` |
| `server_name smartflipasdasdasd.com` | `server_name v677071.hosted-by-vdsina.com` |

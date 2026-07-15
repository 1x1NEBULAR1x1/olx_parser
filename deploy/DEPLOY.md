# Деплой SmartFlip (Next.js + nginx + systemd)

## Архитектура

```
Интернет → nginx :80/:443 → 127.0.0.1:8080 (Next.js)
```

Приложение слушает только localhost — снаружи доступен только через nginx.

## Порт 8080

| Скрипт | Команда |
|--------|---------|
| dev | `npm run dev` → `:8080` |
| production | `npm run start` → `127.0.0.1:8080` |
| Docker / без nginx | `npm run start:public` → `0.0.0.0:8080` |

Переменные в `.env`:

```env
PORT=8080
APP_BIND_HOST=127.0.0.1
NEXTAUTH_URL=https://your-domain.example
AUTH_TRUST_HOST=true
```

## Чеклист перед продакшеном

1. Скопировать `.env.example` → `.env`, заполнить секреты
2. `AUTH_SECRET` — `openssl rand -base64 32`
3. **Не задавать** `E2E_SKIP_AUTH` в production
4. Google OAuth:
   - JavaScript origins: `https://your-domain.example`
   - Redirect URI: `https://your-domain.example/api/auth/callback/google`
5. `DATABASE_URL` — абсолютный путь к SQLite на сервере, например `file:/var/lib/smartflip/data.db`
6. `npm run audit:check` — блокирует только **high/critical**
7. На сервере: **Node.js >= 22**, `build-essential`, `python3`, swap ≥2GB на малых VPS
8. `./deploy/build.sh` — **только на Linux-сервере**; при Bus error: `SMARTFLIP_SWC_WASM=1 ./deploy/build.sh`

## Безопасность npm (аудит)

```bash
npm run audit:check   # fail только при high/critical
npm audit             # полный отчёт
```

Известные **moderate** (транзитивные, без патча без breaking changes):

| Пакет | Источник | Риск в runtime |
|-------|----------|----------------|
| `postcss` | `next` | dev/build only |
| `uuid` | `next-auth` | низкий, не user-controlled |
| `@hono/node-server` | `prisma` CLI | только dev/migrate |

`npm audit fix --force` откатывает `next-auth` / `prisma` — **не использовать**.

Заголовки безопасности заданы в `next.config.ts` (`poweredByHeader: false`, X-Frame-Options и др.).

## Два сайта на одном VPS (SmartFlip + relpen.org)

Если `v677071.hosted-by-vdsina.com` редиректит на relpen — см. **`deploy/nginx/MULTI-SITE.md`**.
Кратко: в `smartflip.conf` должен быть правильный `server_name`, upstream `127.0.0.1:8080`,
у relpen убрать `default_server`, в `.env` указать `NEXTAUTH_URL` на VDSina-домен.

## Установка на VPS (Ubuntu/Debian)

### Системные зависимости (обязательно до npm ci)

`better-sqlite3` и `@next/swc-linux-x64-gnu` — нативные модули. Их **нельзя** переносить
с macOS: бинарники должны ставиться/собираться на Linux-сервере.

**Node.js >= 22** обязателен (Prisma 7.8 / `@prisma/streams-local`).

```bash
sudo apt update
sudo apt install -y curl git build-essential python3
# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.x
npm -v
```

### Bus error при `next build`

Типичные причины на дешёвых VPS:

| Причина | Решение |
|---------|---------|
| Node 20 вместо 22 | Обновить до Node 22 (см. выше) |
| Мало RAM (<2 GB) без swap | Добавить swap 2 GB (ниже) |
| `node_modules` с другой ОС / `npm i` вместо `npm ci` | `rm -rf node_modules .next && npm ci` |
| Нативный SWC падает на CPU VPS | `SMARTFLIP_SWC_WASM=1 ./deploy/build.sh` |

**Swap (если RAM 512MB–1GB):**

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Диагностика:**

```bash
chmod +x deploy/diagnose-native.sh
./deploy/diagnose-native.sh
```

**Полная пересборка на сервере:**

```bash
cd /var/www/smartflip
nvm use 22   # или системный Node >=22
node -v      # v22.x

# swap если RAM < 2GB
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile

rm -rf node_modules .next
npm ci --include=dev
npm rebuild better-sqlite3 --build-from-source

./deploy/diagnose-native.sh

npm run build
# или: ./deploy/build.sh

sudo systemctl restart smartflip
```

### Ошибка `Cannot find module './tailwindcss-oxide.linux-x64-gnu.node'`

Tailwind 4 требует платформенный пакет `@tailwindcss/oxide-linux-x64-gnu` (devDependency).

Частые причины:

1. **`NODE_ENV=production` при `npm ci`** — devDependencies не ставятся. Решение:
   ```bash
   cd /var/www/smartflip
   rm -rf node_modules .next
   npm ci --include=dev
   npm run build
   ```
2. **`node_modules` скопированы с Mac** — переустановка на сервере:
   ```bash
   rm -rf node_modules
   npm ci --include=dev
   ```
3. Проверка:
   ```bash
   ls node_modules/@tailwindcss/oxide-linux-x64-gnu/tailwindcss-oxide.linux-x64-gnu.node
   node -e "require('@tailwindcss/oxide'); console.log('OK')"
   ```

Предпочтительно: `./deploy/build.sh` — скрипт сам ставит `--include=dev` и проверяет oxide.

**Важно:** не вызывайте `node -e "require('@next/swc-linux-x64-gnu')"` — на проблемных VPS это
даёт Bus error. Диагностика: `./deploy/diagnose-native.sh` (безопасная, без native .node).

Если при старте видите `Could not locate the bindings file` для `better_sqlite3.node`:

```bash
cd /var/www/smartflip
sudo apt install -y build-essential python3
rm -rf node_modules
npm ci
npm rebuild better-sqlite3 --build-from-source
node -e "require('better-sqlite3')"
./deploy/build.sh
sudo systemctl restart smartflip
```

```bash
# 1. Клонировать проект
sudo mkdir -p /var/www/smartflip /var/lib/smartflip
sudo chown -R $USER:$USER /var/www/smartflip /var/lib/smartflip
git clone <repo> /var/www/smartflip
cd /var/www/smartflip

# 2. Env и сборка
cp .env.example .env
# отредактировать .env
chmod +x deploy/build.sh && ./deploy/build.sh

# 3. systemd
sudo cp deploy/systemd/smartflip.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now smartflip
sudo systemctl status smartflip

# 4. nginx
sudo cp deploy/nginx/smartflip.conf /etc/nginx/sites-available/smartflip
# заменить your-domain.example
sudo ln -sf /etc/nginx/sites-available/smartflip /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. SSL (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

## Роуты nginx

Все запросы проксируются на Next.js:

| Путь | Назначение |
|------|------------|
| `/` | Главная (каталог) |
| `/login` | Вход |
| `/pending` | Ожидание одобрения |
| `/settings` | Настройки |
| `/favorites` | Избранное |
| `/admin` | Админка |
| `/notifications` | Уведомления |
| `/devices/*` | Карточка устройства |
| `/api/*` | API (scan — timeout 600s) |
| `/api/auth/*` | NextAuth (rate limit) |
| `/_next/static/*` | Статика (кэш 1 год) |
| `/api/health` | Healthcheck |

## Проверка после деплоя

```bash
curl -s http://127.0.0.1:8080/api/health
curl -s https://your-domain.example/api/health
journalctl -u smartflip -f
```

## Обновление

```bash
cd /var/www/smartflip
git pull
./deploy/build.sh
sudo systemctl restart smartflip
```

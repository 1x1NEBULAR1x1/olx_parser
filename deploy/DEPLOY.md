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
HOSTNAME=127.0.0.1
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
7. На сервере установить `build-essential` и `python3` (см. ниже)
8. `./deploy/build.sh` — **только на Linux-сервере**, не копировать `node_modules` с Mac

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

## Установка на VPS (Ubuntu/Debian)

### Системные зависимости (обязательно до npm ci)

`better-sqlite3` — нативный модуль Node.js. Его **нельзя** переносить с macOS: бинарник должен
собираться на Linux-сервере.

```bash
sudo apt update
sudo apt install -y curl git build-essential python3
# Node.js 20 LTS (пример через NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
npm -v
```

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

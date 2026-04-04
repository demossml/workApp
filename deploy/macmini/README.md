# Деплой на Mac mini (локальный режим Workers)

Эта конфигурация запускает проект на Mac mini через Docker, при этом backend продолжает работать в рантайме Cloudflare Workers в локальном режиме (`wrangler dev --local`).

## Что входит в конфигурацию

- `backend` в локальном Worker-режиме на порту `8787` с персистентным `.wrangler/state`
- `frontend` через `vite preview` на порту `4173`
- `scheduler` контейнер для cron-запусков внутренних задач backend
- `evotor-proxy` контейнер для запросов к Evotor API (обход TLS-проблем `workerd`)
- `caddy` как reverse proxy с TLS для поддоменов `app` и `api`

## 1) Подготовка `.env` для Docker Compose

Создай файл окружения:

```bash
cp deploy/macmini/.env.example deploy/macmini/.env
```

Заполни `deploy/macmini/.env`:

- `APP_DOMAIN` (пример: `app.gimolost2.ru`)
- `API_DOMAIN` (пример: `api.gimolost2.ru`)
- `CRON_TOKEN` (длинный случайный токен)

Как сгенерировать `CRON_TOKEN`:

```bash
openssl rand -hex 32
```

или:

```bash
head -c 32 /dev/urandom | xxd -p -c 32
```

## 2) Подготовка локальных секретов backend

Убедись, что существует файл `packages/backend/.dev.vars` и в нем заполнены нужные секреты.

Добавь в него:

```dotenv
CRON_TOKEN=93dab926c603bb037381430152fcf6272260535d8bd493053a58d796ae97443f
EVOTOR_PROXY_URL=http://evotor-proxy:3000/proxy
```

Важно: `CRON_TOKEN` в `packages/backend/.dev.vars` должен совпадать с `CRON_TOKEN` в `deploy/macmini/.env`.

## 3) Запуск контейнеров

Одна команда:

```bash
./deploy/macmini/start.sh
```

Скрипт делает:
- сборку и запуск контейнеров
- применение локальных миграций D1

Альтернатива (вручную):

```bash
docker compose --env-file deploy/macmini/.env -f deploy/macmini/docker-compose.yml up -d --build
pnpm -C packages/backend db:apply-local
```

## 4) Проверка сервисов

```bash
docker compose --env-file deploy/macmini/.env -f deploy/macmini/docker-compose.yml ps
docker compose --env-file deploy/macmini/.env -f deploy/macmini/docker-compose.yml logs --tail=120 backend
docker compose --env-file deploy/macmini/.env -f deploy/macmini/docker-compose.yml logs --tail=120 scheduler
docker compose --env-file deploy/macmini/.env -f deploy/macmini/docker-compose.yml logs --tail=120 caddy
```

## 5) DNS и домены

- Направь DNS-записи `APP_DOMAIN` и `API_DOMAIN` на внешний IP Mac mini.
- Домен `www.gimolost2.ru` оставь на Rocket.Chat как есть.
- `caddy` слушает стандартные порты `80` и `443`.

## Примечания

- Локальное состояние `D1/KV/R2` хранится в Docker volume `wrangler_state`.
- `scheduler` вызывает cron-выражения:
- `*/3 * * * *`
- `0 8 * * *`
- `0 11 * * *`
- Внутренний endpoint cron: `POST /internal/cron/run`, защита через заголовок `x-cron-token`.

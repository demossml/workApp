# 🔐 Настройка секретных переменных

## ⚠️ ВАЖНО: Безопасность

Все секретные токены и API ключи **НЕ ДОЛЖНЫ** храниться в коде. Используйте:

- `.dev.vars` для локальной разработки
- Cloudflare Secrets для production

---

## 🛠 Локальная разработка

### 1. Создайте файл `.dev.vars` в `packages/backend/`

```bash
cd packages/backend
cp .dev.vars.example .dev.vars
```

### 2. Заполните актуальными значениями

Отредактируйте `.dev.vars`:

```env
BOT_TOKEN=8410825865:ВАШТОКЕН
EVOTOR_API_TOKEN=ваш-токен-evotor
```

**Важно:** Файл `.dev.vars` уже в `.gitignore` и НЕ будет закоммичен!

### 3. Запустите dev-сервер

```bash
pnpm run dev
```

Wrangler автоматически загрузит переменные из `.dev.vars`.

---

## 🚀 Production (Cloudflare Workers)

### 1. Установите секреты через Wrangler CLI

**Из корня проекта:**

```bash
cd packages/backend

# Установите BOT_TOKEN
wrangler secret put BOT_TOKEN
# Введите токен когда появится запрос

# Установите EVOTOR_API_TOKEN
wrangler secret put EVOTOR_API_TOKEN
# Введите токен когда появится запрос
```

### 2. Проверьте установленные секреты

```bash
wrangler secret list
```

### 3. Deploy

```bash
pnpm run deploy
```

---

## 🔄 Обновление секретов

Чтобы обновить существующий секрет:

```bash
cd packages/backend
wrangler secret put BOT_TOKEN
# Введите НОВЫЙ токен
```

---

## 📋 Список секретных переменных

| Переменная         | Описание           | Где получить                                      |
| ------------------ | ------------------ | ------------------------------------------------- |
| `BOT_TOKEN`        | Telegram Bot Token | [@BotFather](https://t.me/BotFather)              |
| `EVOTOR_API_TOKEN` | API токен Evotor   | [Личный кабинет Evotor](https://market.evotor.ru) |

---

## ⚠️ Что делать, если токены утекли

### 1. Немедленно отзовите токены

**Telegram Bot:**

- Откройте [@BotFather](https://t.me/BotFather)
- `/revoke` - отзовите старый токен
- `/newtoken` - создайте новый

**Evotor API:**

- Войдите в личный кабинет
- Создайте новый API токен
- Удалите старый

### 2. Обновите секреты

```bash
# Локально - обновите .dev.vars
# Production - обновите через wrangler:
wrangler secret put BOT_TOKEN
wrangler secret put EVOTOR_API_TOKEN
```

### 3. Удалите из истории Git (если уже закоммитили)

```bash
# ОПАСНО! Переписывает историю Git
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch packages/backend/wrangler.toml' \
  --prune-empty --tag-name-filter cat -- --all

# Принудительный push (координируйте с командой!)
git push origin --force --all
```

---

## 📚 Дополнительно

- [Документация Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/commands/)

Критические

# Проблема Где

1 Hardcoded admin IDs ("5700958253", "475039971") вместо env api.ts
2 Guest-режим — любой может передать telegram-id через header и получить полный доступ helpers.ts
3 Нет авторизации — после аутентификации любой пользователь вызывает любой endpoint Все роуты
4 Публичный R2 URL захардкожен api.ts
5 Файл utils.ts — 3172 строки, God-объект Бэкенд
Архитектурные

# Проблема

6 Два способа работы с БД: raw SQL (d1/index.ts) и Drizzle ORM (db/repositories/)
7 CREATE TABLE IF NOT EXISTS в runtime вместо миграций
8 In-memory кэш Evotor сбрасывается при каждом инвоке Worker'а
9 N+1 query в salary, get-file и других эндпоинтах
10 Нет тестов, CI/CD, rate limiting
Качество кода

# Проблема

11 Сотни строк закомментированного кода
12 Опечатки: grandTotaRefund, openStors, /staff-analysi
13 Пустые файлы: ai/prompts.ts, ai/schemas.ts
14 Нерелевантные AI-задачи (словенская грамматика, гороскопы)
15 validateRequest middleware создан, но нигде не используется
План развития
Фаза 1 — Безопасность и стабильность (2-3 недели)
Задача Приоритет Описание
Авторизация по ролям Критический Middleware requireRole('SUPERADMIN') / requireRole('ADMIN') на каждый роут. Сейчас кассир может вызвать любой endpoint
Убрать guest-mode Критический Или ограничить до read-only к минимуму. Сейчас — дыра в безопасности
Env-переменные Критический Все hardcoded ID/UUID → c.env.ADMIN_IDS, c.env.TELEGRAM_GROUP_ID, c.env.R2_PUBLIC_URL
Rate limiting Высокий Особенно /api/ai/\* — AI-запросы дорогие. Использовать Cloudflare Rate Limiting
Уменьшить TTL initData Средний С 24 часов до 1-2 часов
Фаза 2 — Рефакторинг архитектуры (3-4 недели)
Задача Описание
Разбить api.ts На модули: routes/employees.ts, routes/evotor.ts, routes/ai.ts, routes/schedules.ts, routes/stores.ts, routes/uploads.ts
Разбить utils.ts На модули: utils/dates.ts, utils/r2.ts, utils/telegram.ts, utils/formatting.ts, utils/store.ts
Разбить evotor/index.ts Декомпозировать класс Evotor на сервисы: EvotorEmployees, EvotorDocuments, EvotorProducts, EvotorShops
Мигрировать raw SQL → Drizzle Перенести все запросы из d1/index.ts в db/repositories/, удалить CREATE TABLE IF NOT EXISTS из кода
Использовать validateRequest middleware Вместо ручного вызова validate() в каждом endpoint
Очистка кода Удалить закомментированный код, пустые файлы, нерелевантные AI-задачи
Фаза 3 — Качество и DevOps (2-3 недели)
Задача Описание
Тесты Vitest для unit-тестов бизнес-логики. Miniflare для интеграционных тестов Workers
CI/CD GitHub Actions: lint → test → build → wrangler deploy
Мониторинг Sentry для ошибок, Cloudflare Analytics для метрик
Логирование Заменить все console.log на logger. Рассмотреть Cloudflare Logpush
OpenAPI документация Hono поддерживает @hono/zod-openapi — автогенерация Swagger из Zod-схем
Фаза 4 — Новые фичи (постоянно)
Направление Идеи
Уведомления Push-уведомления через Telegram Bot API: дневной план не выполнен, аномалия в продажах, магазин не открыт вовремя
Продвинутая аналитика Прогнозирование продаж (модели на Workers AI), автозаказ на основе скорости продаж, ABC/XYZ-анализ товаров
Управление персоналом Табель учёта рабочего времени, KPI-дашборд для каждого сотрудника, автоматический расчёт премий
Финансы Полноценный P&L отчёт, сравнение план/факт по месяцам, бюджетирование расходов
Кэширование Cloudflare Cache API или KV вместо in-memory Map — данные не будут теряться между инвоками
Мультитенант Возможность обслуживать несколько сетей магазинов
Telegram Bot расширение Инлайн-режим для быстрых запросов, команды /sales, /plan, /staff
Оффлайн-улучшения Кэширование отчётов в IndexedDB, работа с плохим интернетом на точках

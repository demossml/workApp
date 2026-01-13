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

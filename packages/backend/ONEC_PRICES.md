# Интеграция 1С → Бэкенд (цены)

Этот документ описывает API для приёма цен из 1С (обработка ExportPricesPro) и чтения данных.

## Аутентификация

POST запросы из 1С должны передавать заголовок:

- `X-API-Key: <ONEC_API_KEY>`

Если `ONEC_API_KEY` не задан в окружении, проверка пропускается (удобно для локальной разработки).

Для production используйте секреты Cloudflare:

- `wrangler secret put ONEC_API_KEY`

## Маршруты

- `GET /api/1c/ping` — проверка доступности
- `POST /api/1c/prices` — приём цен из 1С
- `GET /api/1c/prices` — список цен с фильтрами
- `GET /api/1c/prices/store/:store` — цены конкретного магазина
- `GET /api/1c/prices/:sku` — цена товара по артикулу
- `GET /api/1c/prices/:sku/history` — история изменений
- `GET /api/1c/import-log` — последние записи импорта
- `GET /api/1c/stats` — статистика по ценам

## Формат входящего JSON (POST /api/1c/prices)

```json
{
  "store": "STORE_001",
  "date": "2026-03-09",
  "price_type": "purchase",
  "price_type_name": "Закупочная",
  "exported_at": "2026-03-09T14:32:00",
  "items_count": 47,
  "items": [
    {
      "sku": "ART-00123",
      "barcode": "4601234567890",
      "name": "Кофе 200г",
      "price": 120.50,
      "changed_at": "2026-03-05"
    }
  ]
}
```

### Правила валидации

- `store` — обязательный, только латиница/цифры/`-`/`_`.
- `date` — обязательный, формат `YYYY-MM-DD`.
- `price_type` — `purchase | retail | wholesale`.
- `items` — 1..10000 позиций.
- `items[].price` — число > 0.
- `items[].changed_at` — `YYYY-MM-DD` (если передаётся).

## Ответ 200 OK (POST /api/1c/prices)

```json
{
  "status": "ok",
  "received": 47,
  "inserted": 12,
  "updated": 35,
  "skipped": 0,
  "store": "STORE_001",
  "price_type": "purchase",
  "processed_at": "2026-03-09T14:32:15Z"
}
```

## Параметры GET /api/1c/prices

- `store` (string) — фильтр по магазину
- `price_type` (enum) — `purchase | retail | wholesale`
- `sku` (string) — поиск по подстроке
- `name` (string) — поиск по подстроке
- `updated_since` (string) — дата/время (ISO)
- `page` (number) — по умолчанию `1`
- `limit` (number) — по умолчанию `50`, максимум `500`

### Ответ (GET /api/1c/prices)

```json
{
  "data": [
    {
      "id": 1,
      "sku": "ART-001",
      "barcode": null,
      "name": "Тест",
      "price": 100.5,
      "priceType": "purchase",
      "store": "STORE_001",
      "changedAt": null,
      "createdAt": "2026-03-10 06:15:06",
      "updatedAt": "2026-03-10 06:15:06"
    }
  ],
  "page": 1,
  "limit": 50,
  "total": 1,
  "total_pages": 1
}
```

## Примеры запросов

### Ping

```bash
curl http://localhost:8787/api/1c/ping
```

### POST /prices

```bash
curl -X POST http://localhost:8787/api/1c/prices \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: <ONEC_API_KEY>' \
  -d '{
    "store": "STORE_001",
    "date": "2026-03-09",
    "price_type": "purchase",
    "items": [
      { "sku": "ART-001", "name": "Тест", "price": 100.50 }
    ]
  }'
```

### GET /prices

```bash
curl 'http://localhost:8787/api/1c/prices?store=STORE_001'
curl 'http://localhost:8787/api/1c/prices/ART-001'
curl 'http://localhost:8787/api/1c/prices/ART-001/history'
curl 'http://localhost:8787/api/1c/stats'
```

## Локальный запуск

```bash
wrangler d1 execute work-db --local --file=drizzle/0010_onec_prices.sql
wrangler dev
```

## Примечания по UPSERT

Уникальность: `sku + store + price_type`.

- Нет записи → INSERT
- Есть запись, цена изменилась → UPDATE + запись в `onec_price_history`
- Цена не изменилась → `skipped++`

Обработка батчами по 100 записей.

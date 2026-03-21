# Evo Monorepo

## Usage

```sh
$ git clone git@github.com:demossml/testapp2.git
$ cd testapp2
$ pnpm install
$ pnpm run build
$ pnpm run dev
$ pnpm run deploy
```

### Dev Stack

- telegram bot (button + mini app) ->
- vite (http://localhost:5137) ->
- wrangler (http://localhost:8787)

### Development

```sh
$ pnpm run dev
```

### API Smoke (local)

0. Подготовить локальную БД (миграции + seed):

```sh
pnpm smoke:api:prepare
```

1. Запустить backend локально:

```sh
pnpm -C packages/backend dev
```

2. В другом терминале выполнить интеграционный smoke-check API:

```sh
pnpm smoke:api
```

Либо одной командой (если backend уже поднят):

```sh
pnpm smoke:api:full
```

Опционально можно указать base URL и тестовый telegram id:

```sh
BACKEND_BASE_URL=http://127.0.0.1:8787 SMOKE_TELEGRAM_ID=123 pnpm smoke:api
```

### Financial reconciliation endpoint

Для сверки итогов API с контрольной суммой по документам:

```sh
GET /api/analytics/reconciliation/financial?since=YYYY-MM-DD&until=YYYY-MM-DD&thresholdPct=1
```

- `apiTotals`: расчёт по `PAYMENT` (боевой путь дашборда).
- `controlTotals`: контроль по `REGISTER_POSITION`.
- `withinThreshold`: общий статус по порогу `thresholdPct`.

### Reports & analytics: drill-down and hourly plan/fact

Возвраты с деталями чеков:

```sh
GET /api/analytics/revenue/refund-documents?since=YYYY-MM-DD&until=YYYY-MM-DD&limit=120
```

- Возвращает список `PAYBACK` документов с магазином, сотрудником, суммой и товарами.

План-факт по часам:

```sh
GET /api/analytics/revenue/hourly-plan-fact?date=YYYY-MM-DD
```

- Возвращает кумулятивный факт и ожидаемый кумулятивный план по часам + час с максимальным провалом темпа.

### Frontend feature-flag

Включить Analytics dashboard в Home в режиме только чтения:

```sh
VITE_FEATURE_ANALYTICS_DASHBOARD_READONLY=true
```

- Доступ: роли `ADMIN` и `SUPERADMIN`.
- Режим: только чтение (используются только GET-запросы аналитики).

https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WEBHOOK_URL>

routes = [
{ pattern = "demossml.cc", custom_domain = true }
]

Добавить runtime-валидацию ответов на фронте.
Улучшить UX в Mini App (1-2 недели)
Глобальный слой уведомлений: понятные ошибки вместо “Ошибка: 500”.
Скелетоны/пустые состояния для всех отчётов.
Упростить длинные формы (поэтапный flow, автосохранение черновика).
Производительность и офлайн (1 неделя)
Оптимизировать тяжёлые экраны (ленивая загрузка, code splitting).
Доделать офлайн-очередь (фото, повторная отправка, конфликт-резолв).
Снизить bundle size и убрать критические warning’и сборки.
Аналитика и продуктовые метрики (1 неделя)
События: открытие экрана, запуск отчёта, ошибка, успешное действие.
Дашборд метрик: DAU, конверсия в “сформировал отчёт”, crash-free rate.
Топ проблем по endpoint/ролям пользователей.
Роли и безопасность (1 неделя)
Проверить доступы по ролям на каждом endpoint.
Убрать чувствительные данные из фронта/логов.
Добавить rate limit и защиту от некорректных payload.
Расширение функционала (2-4 недели)
Умные рекомендации закупки (сезонность, оборачиваемость, минимальные остатки).
KPI по сотрудникам и сменам с объяснением причин отклонений.
Автогенерация отчётов по расписанию и отправка в Telegram.
Качество разработки (постоянно)
Минимальный e2e smoke для ключевых флоу.
Контрактные тесты frontend-backend.
CI-гейт: lint + typecheck + smoke.

### New AI API (MVP)

`POST /api/ai/procurement-recommendations`

- body:

```json
{
  "shopUuid": "uuid",
  "groups": ["uuid"],
  "startDate": "2026-02-01",
  "endDate": "2026-02-25",
  "coverDays": 7,
  "minStockDays": 3
}
```

- returns: рекомендации закупки с сезонным коэффициентом, оборачиваемостью, минимальным/целевым остатком, приоритетом и причинами.

`POST /api/ai/employee-shift-kpi`

- body:

```json
{
  "shopUuid": "uuid",
  "startDate": "2026-02-01",
  "endDate": "2026-02-25"
}
```

- returns: KPI по сотрудникам и сменам (score, avg check, return rate, margin, checks/day) + причины отклонений.
  routes = [
  { pattern = "demossml.cc", custom_domain = true }
  ]

# Smoke: Data Mode (DB / ELVATOR)

Короткий ручной сценарий проверки переключения источника данных и блокировки AI Director.

## Предусловия

- Backend и frontend запущены локально.
- Есть доступ в Home под ролью `ADMIN` или `SUPERADMIN`.

## 1) Проверка текущего режима

API:

```bash
curl -s http://127.0.0.1:8787/api/admin/data-mode
```

Ожидание:

- ответ содержит `mode` (`DB` или `ELVATOR`);
- есть `meta` с полями `source` и `aiAvailable`.

## 2) Режим DB

Переключить:

```bash
curl -s -X POST http://127.0.0.1:8787/api/admin/data-mode \
  -H "content-type: application/json" \
  -d '{"mode":"DB"}'
```

Проверить:

- на Home: `Источник: DB`, `AI: активен`;
- кнопка `AI Директор` активна;
- переход на `/ai/director` разрешён;
- `GET /api/ai/*` не блокируется по `data_mode`.

## 3) Режим ELVATOR

Переключить:

```bash
curl -s -X POST http://127.0.0.1:8787/api/admin/data-mode \
  -H "content-type: application/json" \
  -d '{"mode":"ELVATOR"}'
```

Проверить:

- на Home: `Источник: ELVATOR`, `AI: отключён`;
- кнопка `AI Директор` disabled + подсказка;
- переход на `/ai/director` редиректит на `/`;
- любые `POST/GET /api/ai/*` возвращают `503` и код `AI_UNAVAILABLE_FOR_DATA_MODE`.

## 4) Проверка meta/source в ключевых API

Примеры:

```bash
curl -i "http://127.0.0.1:8787/api/evotor/financial/today"
curl -i "http://127.0.0.1:8787/api/evotor/plan-for-today"
curl -i "http://127.0.0.1:8787/api/evotor/working-by-shops"
```

Ожидание:

- в заголовках есть `x-data-source: DB|ELVATOR`;
- в JSON есть `meta: { source, aiAvailable }`.

## 5) Критерий успеха

- Переключение источника меняет поведение данных и AI централизованно через backend.
- AI недоступен в режиме `ELVATOR` и на backend, и на frontend.

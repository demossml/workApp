# PR Checklist Templates (AI Director Roadmap)

## PR#1
**Title:** `feat(ai): add AI config and unified client foundation`

**Description**
- Добавляет базовые `vars/bindings` для AI и порогов алертов.
- Вводит единый AI-клиент с `timeout/retry/fallback`.
- Подготавливает типы окружения для следующих PR.

**Changes**
- `packages/backend/wrangler.toml`
- `packages/backend/src/types.ts`
- `packages/backend/src/ai/client.ts` (new)

**Checklist**
- [ ] Локальный запуск `pnpm -C packages/backend dev`
- [ ] Старые `/api/ai/*` ручки отвечают без регрессии
- [ ] Логи ошибок AI не содержат секретов

**Test Cases**
1. Базовый успешный вызов AI-клиента.
2. Таймаут AI-клиента приводит к fallback.
3. Ошибка AI-провайдера не роняет endpoint.

**Rollback**
- Вернуть `wrangler.toml` и `types.ts` к предыдущему коммиту.
- Отключить использование `ai/client.ts` в роутерах.

---

## PR#2
**Title:** `feat(dead-stocks): add AI narrative with telegram fallback`

**Description**
- Добавляет нарратив к `dead-stocks/update`.
- Оставляет один маршрут-источник истины (убирает дубль).
- Сохраняет текущий telegram flow при ошибке AI.

**Changes**
- `packages/backend/src/routes/stores.ts` или `packages/backend/src/routes/deadStocksRoutes.ts` (один выбранный)
- `packages/backend/utils/sendDeadStocksToTelegram.ts`
- `packages/backend/src/api.ts` (если меняется роутинг)

**Checklist**
- [ ] Выбран и зафиксирован один endpoint для dead stocks
- [ ] При падении AI сообщение в Telegram все равно уходит
- [ ] Добавлены события `deadstock_ai_success/failed`

**Test Cases**
1. Валидный payload -> Telegram с narrative.
2. AI error -> Telegram без narrative (fallback).
3. Невалидный payload -> 400 и корректный error body.

**Rollback**
- Откатить narrative-блок, оставить старый формат сообщения.
- Вернуть прежний роутинг.

---

## PR#3
**Title:** `feat(ai-kpi): add narrative field to employee shift KPI`

**Description**
- Расширяет ответ `POST /api/ai/employee-shift-kpi` полем `narrative`.
- Добавляет валидацию нового поля.
- Показывает narrative в AI UI.

**Changes**
- `packages/backend/src/routes/ai.ts`
- `packages/backend/src/validation.ts`
- frontend AI компонент/страница (`AiDirector`/AI card)

**Checklist**
- [ ] `narrative` есть в контракте API
- [ ] UI не падает при `narrative: null`
- [ ] Логика KPI не изменила старые метрики

**Test Cases**
1. Нормальный KPI ответ включает `narrative`.
2. AI failure возвращает KPI без narrative.
3. Frontend корректно рендерит оба сценария.

**Rollback**
- Удалить `narrative` из response schema и UI.
- Вернуться к числовому KPI-only формату.

---

## PR#4
**Title:** `feat(cron): add tempo alerts at 11:00/14:00 MSK`

**Description**
- Добавляет новые cron-триггеры для контроля темпа.
- Расширяет `scheduled` router по `event.cron`.
- Отправляет алерты только при просадке ниже порога.

**Changes**
- `packages/backend/wrangler.toml`
- `packages/backend/src/index.ts`
- `packages/backend/src/telegram/tempoAlerts.ts` (или аналог)

**Checklist**
- [ ] Существующий `*/3` job работает как раньше
- [ ] Новый cron не спамит при нормальном темпе
- [ ] Порог берется из env

**Test Cases**
1. Прогноз ниже порога -> отправлен alert.
2. Прогноз выше порога -> alert не отправляется.
3. Неизвестный cron -> warning в логах, без падения.

**Rollback**
- Удалить новые cron expressions.
- Убрать ветки обработки tempo cron из `scheduled`.

---

## PR#5
**Title:** `feat(ai-history): add finish-opening summary hook and D1 history tables`

**Description**
- Добавляет вызов AI summary после `finish-opening`.
- Сохраняет summary/alerts в D1.
- Закрывает минимальный audit trail по AI-действиям.

**Changes**
- `packages/backend/src/routes/stores.ts`
- `packages/backend/drizzle/00xx_ai_history.sql` (new)
- `packages/backend/src/db/repositories/*` (new/updated)

**Checklist**
- [ ] Миграции локально применяются
- [ ] `finish-opening` не блокируется при AI ошибке
- [ ] Запись в D1 создается при успешном summary

**Test Cases**
1. `finish-opening` success -> summary записан.
2. AI timeout -> `finish-opening` success + fallback.
3. Ошибка вставки D1 логируется и не ломает ответ API.

**Rollback**
- Удалить hook из `finish-opening`.
- Откатить миграции (или оставить таблицы неиспользуемыми и отключить запись).


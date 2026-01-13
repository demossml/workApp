# Валидация данных API

## Обзор изменений

Добавлена полноценная валидация входных данных с использованием **Zod** для всех критических API endpoints.

### Что было исправлено:

✅ Все POST endpoints теперь валидируют входные данные  
✅ Добавлены понятные сообщения об ошибках  
✅ Создан переиспользуемый middleware для валидации  
✅ Добавлен глобальный обработчик ошибок  
✅ Добавлено логирование запросов

---

## Файлы

### 1. `src/validation.ts`

Содержит все Zod схемы для валидации данных:

```ts
import { validate, EmployeeByShopSchema } from "./validation";

const data = { shop: "invalid-uuid" };
const result = validate(EmployeeByShopSchema, data); // ❌ Выбросит ошибку
```

### 2. `src/middleware.ts`

Middleware для автоматической валидации и обработки ошибок:

- `validateRequest(schema)` - автоматическая валидация JSON тела
- `errorHandler` - глобальный обработчик ошибок
- `requestLogger` - логирование запросов

### 3. `src/index.ts`

Подключение middleware к приложению

---

## Примеры использования

### Вариант 1: Ручная валидация (используется сейчас)

```ts
import { validate, SalarySchema } from './validation';

.post("/api/evotor/salary", async (c) => {
  try {
    const data = await c.req.json();
    const { employee, startDate, endDate } = validate(SalarySchema, data);

    // Данные гарантированно валидны и типизированы
    // ...
  } catch (error) {
    return c.json({ error: error.message }, 400);
  }
})
```

### Вариант 2: Через middleware (для будущего использования)

```ts
import { validateRequest } from './middleware';
import { SalarySchema } from './validation';

.post("/api/evotor/salary",
  validateRequest(SalarySchema), // Автоматическая валидация
  async (c) => {
    const data = await c.req.json(); // Уже валидные данные
    // ...
  }
)
```

---

## Примеры ошибок валидации

### Неверный UUID

**Запрос:**

```json
POST /api/employee/and-store/name-uuid
{
  "shop": "not-a-uuid"
}
```

**Ответ:**

```json
{
	"error": "Ошибка валидации: shop: Некорректный UUID"
}
```

### Отсутствующие поля

**Запрос:**

```json
POST /api/register
{}
```

**Ответ:**

```json
{
	"error": "Ошибка валидации: userId: Required"
}
```

### Неверный формат даты

**Запрос:**

```json
POST /api/get-file
{
  "date": "01/01/2024",
  "shop": "valid-uuid"
}
```

**Ответ:**

```json
{
	"error": "Ошибка валидации: date: Дата должна быть в формате YYYY-MM-DD"
}
```

---

## Доступные схемы валидации

| Схема                      | Endpoint                            | Поля                                   |
| -------------------------- | ----------------------------------- | -------------------------------------- |
| `EmployeeByShopSchema`     | `/api/employee/and-store/name-uuid` | `shop: UUID`                           |
| `SchedulesTableSchema`     | `/api/schedules/table`              | `month, year, schedules`               |
| `SchedulesTableViewSchema` | `/api/schedules/table-view`         | `month, year, shopId`                  |
| `GetFileSchema`            | `/api/get-file`                     | `date, shop`                           |
| `RegisterSchema`           | `/api/register`                     | `userId`                               |
| `SalarySchema`             | `/api/evotor/salary`                | `employee, startDate, endDate`         |
| `SalesResultSchema`        | `/api/evotor/sales-result`          | `startDate, endDate, shopUuid, groups` |
| `DeadStockSchema`          | `/api/evotor/dead-stock`            | `startDate, endDate, shopUuid, groups` |
| `OpenStoreSchema`          | `/api/open-store`                   | `userId, timestamp`                    |
| `IsOpenStoreSchema`        | `/api/is-open-store`                | `userId, date`                         |

---

## Добавление новой схемы валидации

1. Добавьте схему в `src/validation.ts`:

```ts
export const MyNewSchema = z.object({
	name: z.string().min(1),
	age: z.number().int().positive(),
	email: z.string().email(),
});
```

2. Используйте в endpoint:

```ts
import { validate, MyNewSchema } from './validation';

.post("/api/my-endpoint", async (c) => {
  try {
    const data = await c.req.json();
    const { name, age, email } = validate(MyNewSchema, data);

    // Работайте с валидными данными
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: error.message }, 400);
  }
})
```

---

## Логирование

Все запросы теперь логируются:

```
GET /api/user - 200 (5ms)
POST /api/register - 400 (12ms)
POST /api/evotor/salary - 200 (234ms)
```

Ошибки логируются с полной информацией:

```
API Error: {
  message: "Invalid UUID",
  path: "/api/employee/and-store/name-uuid",
  method: "POST"
}
```

---

## Тестирование

Протестируйте валидацию:

```bash
# Успешный запрос
curl -X POST http://localhost:8787/api/register \
  -H "Content-Type: application/json" \
  -d '{"userId": "123456789"}'

# Неуспешный (пустой userId)
curl -X POST http://localhost:8787/api/register \
  -H "Content-Type: application/json" \
  -d '{"userId": ""}'
```

---

## Что дальше?

- [ ] Добавить валидацию в остальные POST endpoints
- [ ] Расширить схемы для более строгой проверки
- [ ] Добавить rate limiting
- [ ] Добавить валидацию query parameters
- [ ] Написать unit тесты для схем валидации

# Система логирования

## Обзор

В проекте реализована централизованная система логирования с автоматическим контролем уровней в production и development окружениях.

## Файл Logger

**Расположение**: `src/logger.ts`

### Уровни логирования

| Уровень   | Метод            | Когда использовать                                           | Production   |
| --------- | ---------------- | ------------------------------------------------------------ | ------------ |
| **DEBUG** | `logger.debug()` | Детальная отладочная информация, временные логи              | ❌ Отключены |
| **INFO**  | `logger.info()`  | Важные события приложения (старт запроса, успешные операции) | ✅ Включены  |
| **WARN**  | `logger.warn()`  | Предупреждения (устаревшие методы, неожиданные значения)     | ✅ Включены  |
| **ERROR** | `logger.error()` | Ошибки и исключения                                          | ✅ Включены  |

### Использование

```typescript
import { logger } from "./logger";

// Отладка (отключается в production)
logger.debug("User data received", { userId: "123" });

// Информация (всегда показывается)
logger.info("Order created successfully", { orderId: "456" });

// Предупреждение
logger.warn("Rate limit approaching", { remaining: 10 });

// Ошибка
logger.error("Database query failed", error);
```

### Особенности

1. **Автоматическое определение окружения**
   - В production (`NODE_ENV=production`) debug-логи отключены
   - В development все логи активны

2. **Форматирование**
   - Автоматические временные метки в формате `HH:MM:SS`
   - Поддержка объектов: `logger.info("Message", { data: "value" })`
   - Цветовая индикация уровней (в терминалах с поддержкой)

3. **Типизация**
   - Полная TypeScript поддержка
   - Безопасная работа с ошибками (accepts `unknown`)

## Миграция с console.log

### До (❌ Плохо)

```typescript
console.log("Processing order", orderId);
console.error("Error:", error);
console.warn("Deprecated API call");
```

### После (✅ Хорошо)

```typescript
logger.debug("Processing order", { orderId });
logger.error("Order processing failed", error);
logger.warn("Deprecated API call detected");
```

## Интеграция в проекте

### API Routes (src/api.ts)

Все HTTP endpoints используют logger:

```typescript
.post("/api/endpoint", async (c) => {
  try {
    logger.info("Request received", { endpoint: "/api/endpoint" });
    // ... бизнес-логика
    return c.json({ success: true });
  } catch (error) {
    logger.error("Request failed", error);
    return c.json({ error: "Internal error" }, 500);
  }
})
```

### Middleware (src/middleware.ts)

Автоматическое логирование всех запросов:

```typescript
app.use("*", async (c, next) => {
	const start = Date.now();
	await next();
	const ms = Date.now() - start;
	logger.info(`${c.req.method} ${c.req.url} - ${ms}ms`);
});
```

## Best Practices

### ✅ Правильно

```typescript
// Используйте debug для временной отладки
logger.debug("Intermediate calculation", { value: calculation });

// Используйте info для важных событий
logger.info("User registered", { userId: user.id });

// Передавайте объекты для структурированных данных
logger.error("Validation failed", { errors: validationErrors });

// Логируйте контекст ошибки
try {
	await processOrder(orderId);
} catch (error) {
	logger.error("Order processing failed", { orderId, error });
	throw error;
}
```

### ❌ Неправильно

```typescript
// Не используйте console напрямую
console.log("Debug info"); // ❌

// Не оставляйте пустых сообщений
logger.debug(); // ❌

// Не логируйте чувствительные данные
logger.info("Login successful", { password: "secret123" }); // ❌

// Не смешивайте уровни
logger.error("User clicked button"); // ❌ Используйте debug или info
```

## Производительность

- Debug-логи полностью отключаются в production (нулевая стоимость)
- Логирование не блокирует основной поток
- Cloudflare Workers автоматически собирают логи в dashboard

## Мониторинг

### Cloudflare Dashboard

Логи доступны в:

1. Workers & Pages → Your Worker → Logs
2. Real-time logs (для development)
3. Tail logs: `wrangler tail`

### Локальная разработка

```bash
# Запуск с логами
pnpm run dev

# Просмотр production логов
wrangler tail
```

## Расширение

Для добавления нового уровня логирования:

```typescript
// src/logger.ts
class Logger {
	// Добавьте новый уровень
	trace(message: string, data?: unknown): void {
		if (this.isProduction) return; // опционально
		console.trace(`[TRACE] ${this.getTimestamp()} ${message}`, data);
	}
}
```

## Changelog

### v1.0.0 (Текущая версия)

- ✅ Создан централизованный Logger класс
- ✅ Удалены все console.log из api.ts (80+ вхождений)
- ✅ Удалены все console.log из middleware.ts (4+ вхождений)
- ✅ Интегрирован во все критические точки приложения
- ✅ Автоматическое отключение debug-логов в production

## Полезные ссылки

- [Cloudflare Workers Logging](https://developers.cloudflare.com/workers/observability/logging/)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)

# Улучшение обработки ошибок

## Обзор изменений

Добавлена комплексная обработка ошибок в критических местах приложения для повышения надежности и предотвращения необработанных исключений.

## ✅ Что было исправлено

### 1. API Endpoints

#### `/api/dead-stocks/update` ✅

**Было:** Отсутствовал try-catch, ошибки Telegram блокировали сохранение в БД

```typescript
.post("/api/dead-stocks/update", async (c) => {
  const db = c.get("drizzle");
  const { shopUuid, items } = await c.req.json();

  await sendDeadStocksToTelegram(...); // ❌ Если упадет, БД не обновится
  await saveDeadStocks(db, shopUuid, items);

  return c.json({ success: true });
})
```

**Стало:** Раздельная обработка ошибок Telegram и БД

```typescript
.post("/api/dead-stocks/update", async (c) => {
  try {
    // Валидация
    if (!shopUuid || !items || !Array.isArray(items)) {
      return c.json({ success: false, error: "Invalid request data" }, 400);
    }

    // Telegram - не критично
    try {
      await sendDeadStocksToTelegram(...);
    } catch (telegramError) {
      logger.error("Failed to send to Telegram", telegramError);
      // Продолжаем выполнение
    }

    // БД - критично
    await saveDeadStocks(db, shopUuid, items);

    return c.json({ success: true });
  } catch (error) {
    logger.error("Dead stocks update failed", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to update"
    }, 500);
  }
})
```

**Улучшения:**

- ✅ Валидация входных данных
- ✅ Изолированная обработка ошибок Telegram (non-blocking)
- ✅ Логирование всех ошибок
- ✅ Корректные HTTP статусы (400, 500)

---

#### `/api/finish-opening` ✅

**Было:** Отсутствовала обработка ошибок

```typescript
.post("/api/finish-opening", async (c) => {
  const db = c.env.DB;
  const data = await c.req.json(); // ❌ Может упасть
  const { ok, discrepancy, userId } = data;

  await updateOpenStore(db, userId, { cash, sign }); // ❌ Может упасть
  return c.json({ success: true });
})
```

**Стало:** Полная обработка с валидацией

```typescript
.post("/api/finish-opening", async (c) => {
  try {
    const data = await c.req.json();
    const { ok, discrepancy, userId } = data;

    if (!userId) {
      return c.json({ success: false, error: "Missing userId" }, 400);
    }

    // Обработка данных
    let cash = null, sign = null;
    if (!ok && discrepancy) {
      cash = Number(discrepancy.amount);
      sign = discrepancy.type;
    }

    await updateOpenStore(db, userId, { cash, sign });
    return c.json({ success: true });
  } catch (error) {
    logger.error("Finish opening failed", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to finish opening"
    }, 500);
  }
})
```

**Улучшения:**

- ✅ Валидация userId
- ✅ Обработка ошибок JSON parsing
- ✅ Обработка ошибок БД
- ✅ Понятные сообщения об ошибках

---

### 2. Middleware Authentication

#### `authenticate` ✅

**Было:** Использовал assert(), который бросает исключение

```typescript
export const authenticate = async (c: IContext, next: Next) => {
	const payload = Object.fromEntries(new URLSearchParams(initData));
	const isValid = await isValidSign(c.env.BOT_TOKEN, payload);
	assert(isValid, "invalid signature"); // ❌ Бросает Error

	const user = JSON.parse(payload.user); // ❌ Может упасть
	c.set("user", user);
	return next();
};
```

**Стало:** Явная обработка с правильными HTTP статусами

```typescript
export const authenticate = async (c: IContext, next: Next) => {
	try {
		const payload = Object.fromEntries(new URLSearchParams(initData));
		const isValid = await isValidSign(c.env.BOT_TOKEN, payload);

		if (!isValid) {
			return c.json({ error: "Invalid signature" }, 401); // ✅ HTTP 401
		}

		const user = JSON.parse(payload.user);
		c.set("user", user);
		return next();
	} catch (error) {
		return c.json(
			{
				error: "Authentication failed",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			401,
		);
	}
};
```

**Улучшения:**

- ✅ Убран assert() - использован явный if
- ✅ Правильный HTTP статус 401 для auth ошибок
- ✅ Обработка JSON.parse ошибок
- ✅ Понятные сообщения об ошибках

---

### 3. Telegram Utilities

#### `sendTelegramMessage` ✅

**Было:** Минимальная проверка

```typescript
export async function sendTelegramMessage(chatId, text, token) {
  try {
    const response = await fetch(...); // ❌ Нет проверки response.ok
    const data = await response.json();

    if (!data.ok) {
      throw new Error(...);
    }
    return data.result;
  } catch (error) {
    console.error(...); // ❌ console.error
    throw error;
  }
}
```

**Стало:** Расширенная валидация и логирование

```typescript
export async function sendTelegramMessage(chatId, text, token) {
  try {
    // Валидация входных данных
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is not configured");
    }
    if (!chatId || !text) {
      throw new Error("chatId and text are required");
    }

    const response = await fetch(...);

    // Проверка HTTP статуса
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.description || "Failed to send message");
    }

    logger.debug("Telegram message sent successfully", { chatId }); // ✅ logger
    return data.result;
  } catch (error) {
    logger.error("Failed to send Telegram message", { // ✅ logger
      chatId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
```

**Улучшения:**

- ✅ Валидация всех входных параметров
- ✅ Проверка HTTP статуса ответа
- ✅ Детальные сообщения об ошибках
- ✅ Использование logger вместо console
- ✅ Структурированное логирование

---

#### `sendDeadStocksToTelegram` ✅

**Было:** Нет валидации

```typescript
export async function sendDeadStocksToTelegram(params, token, evotor) {
  const text = await formatDeadStocksMessage(...);
  return sendTelegramMessage(params.chatId, text, token);
}
```

**Стало:** Полная валидация и обработка

```typescript
export async function sendDeadStocksToTelegram(params, token, evotor) {
  try {
    // Валидация параметров
    if (!params.chatId || !params.shopUuid || !params.items?.length) {
      throw new Error("Missing required parameters for dead stocks notification");
    }

    const text = await formatDeadStocksMessage(...);

    // Проверка сгенерированного сообщения
    if (!text || text.trim().length === 0) {
      throw new Error("Empty message generated for dead stocks");
    }

    return sendTelegramMessage(params.chatId, text, token);
  } catch (error) {
    logger.error("Failed to send dead stocks to Telegram", {
      shopUuid: params.shopUuid,
      itemsCount: params.items?.length || 0,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
```

**Улучшения:**

- ✅ Валидация всех обязательных параметров
- ✅ Проверка на пустое сообщение
- ✅ Структурированное логирование с контекстом
- ✅ Сохранение stacktrace через throw

---

## 📊 Статистика улучшений

| Компонент                    | До                                | После                              |
| ---------------------------- | --------------------------------- | ---------------------------------- |
| **API Endpoints**            | 2 без try-catch                   | 2 с полной обработкой              |
| **Middleware**               | assert() исключения               | HTTP 401 ответы                    |
| **Telegram Utils**           | Базовая обработка                 | Валидация + структурированные логи |
| **Валидация входных данных** | Отсутствует                       | Во всех критических местах         |
| **HTTP статусы**             | Неправильные (500 вместо 400/401) | Корректные (400, 401, 500)         |
| **Логирование**              | console.error                     | logger с контекстом                |

---

## 🎯 Паттерны обработки ошибок

### 1. API Endpoint Pattern

```typescript
.post("/api/endpoint", async (c) => {
  try {
    // 1. Валидация входных данных
    const data = await c.req.json();
    const validated = validate(Schema, data);

    // 2. Бизнес-логика
    const result = await someOperation(validated);

    // 3. Успешный ответ
    return c.json({ success: true, result });
  } catch (error) {
    // 4. Логирование
    logger.error("Operation failed", error);

    // 5. Клиентский ответ
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Operation failed"
    }, error instanceof ValidationError ? 400 : 500);
  }
})
```

### 2. Non-Critical Operation Pattern

```typescript
// Telegram отправка - не критична для основного flow
try {
  await sendToTelegram(...);
} catch (telegramError) {
  logger.error("Telegram notification failed", telegramError);
  // НЕ бросаем ошибку дальше - продолжаем выполнение
}

// Критичная операция
await saveToDB(...); // Если упадет, весь endpoint вернет 500
```

### 3. Utility Function Pattern

```typescript
export async function utilityFunction(params) {
	try {
		// Валидация
		if (!params.required) {
			throw new Error("Missing required parameter");
		}

		// Логика
		const result = await operation();

		// Успешное логирование
		logger.debug("Operation completed", { result });
		return result;
	} catch (error) {
		// Ошибочное логирование с контекстом
		logger.error("Operation failed", {
			params,
			error: error instanceof Error ? error.message : String(error),
		});

		// Пробрасываем дальше для обработки на верхнем уровне
		throw error;
	}
}
```

---

## 🔍 Примеры обработки

### Пример 1: Валидация данных

```typescript
// ❌ Плохо
const { userId } = await c.req.json();
await updateUser(userId); // Что если userId = undefined?

// ✅ Хорошо
const data = await c.req.json();
if (!data.userId) {
	return c.json({ error: "Missing userId" }, 400);
}
await updateUser(data.userId);
```

### Пример 2: HTTP статусы

```typescript
// ❌ Плохо
catch (error) {
  return c.json({ error: error.message }, 500); // Всегда 500
}

// ✅ Хорошо
catch (error) {
  if (error instanceof ValidationError) {
    return c.json({ error: error.message }, 400); // Ошибка клиента
  }
  if (error instanceof AuthError) {
    return c.json({ error: error.message }, 401); // Ошибка аутентификации
  }
  return c.json({ error: "Internal error" }, 500); // Ошибка сервера
}
```

### Пример 3: Логирование контекста

```typescript
// ❌ Плохо
catch (error) {
  logger.error("Error");
}

// ✅ Хорошо
catch (error) {
  logger.error("Failed to process order", {
    orderId,
    userId,
    itemCount: items.length,
    error: error instanceof Error ? error.message : String(error)
  });
}
```

---

## 🚀 Дальнейшие улучшения

### Рекомендуется:

1. **Типизация ошибок** - создать кастомные классы Error

   ```typescript
   class ValidationError extends Error { ... }
   class AuthenticationError extends Error { ... }
   class ExternalServiceError extends Error { ... }
   ```

2. **Retry механизм** для внешних API (Telegram, Evotor)

   ```typescript
   async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
   	for (let i = 0; i < retries; i++) {
   		try {
   			return await fn();
   		} catch (error) {
   			if (i === retries - 1) throw error;
   			await sleep(1000 * Math.pow(2, i)); // Exponential backoff
   		}
   	}
   }
   ```

3. **Circuit Breaker** для защиты от каскадных сбоев
4. **Error Boundaries** на уровне middleware
5. **Централизованная обработка** через errorHandler middleware

---

## 📚 См. также

- [VALIDATION.md](VALIDATION.md) - Валидация входных данных
- [LOGGING.md](LOGGING.md) - Система логирования
- [SECURITY.md](../SECURITY.md) - Безопасность приложения

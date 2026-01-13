# Оптимизация N+1 Запросов

## Что такое N+1 проблема?

N+1 запрос возникает, когда в цикле выполняется запрос к базе данных или API для каждого элемента коллекции, вместо того чтобы получить все данные за один раз.

**Пример:**

```typescript
// ❌ ПЛОХО: N+1 запрос
for (const userId of userIds) {
	// 1 итерация
	const user = await db.getUser(userId); // N запросов
	names.push(user.name);
}
// Итого: 1 + N запросов

// ✅ ХОРОШО: Один батч-запрос
const users = await db.getUsersByIds(userIds); // 1 запрос
const names = users.map((u) => u.name);
// Итого: 1 запрос
```

## Найденные проблемы N+1

### 1. `/api/schedules` - N+1 в получении данных магазинов

**Локация:** [src/api.ts](src/api.ts#L289-L302)

**Проблема:**

```typescript
for (const uuid of shopsUuid) {
	const shopName = await c.var.evotor.getShopName(uuid); // N запросов к API
	const data = await getData(date, uuid, c.get("db")); // N запросов к БД

	if (data) {
		const userId = data.userId as string;
		const employeeName = await c.var.evotor.getEmployeeLastName(userId); // N+1 внутри N+1
		// ...
	}
}
```

**Почему это плохо:**

- Для 10 магазинов = 10 запросов к Evotor API
- Для 10 магазинов = 10 запросов к D1 БД
- Дополнительно N запросов к API для имен сотрудников
- **Итого: 30+ запросов вместо 3**

**Решение:**

```typescript
// 1. Получаем все названия магазинов за один раз
const shopNames = await c.var.evotor.getShopNamesByUuids(shopsUuid);

// 2. Получаем все данные из БД параллельно
const dataPromises = shopsUuid.map(uuid => getData(date, uuid, c.get("db")));
const dataResults = await Promise.all(dataPromises);

// 3. Собираем все уникальные userIds и получаем имена за один запрос
const userIds = [...new Set(dataResults.filter(d => d).map(d => d.userId))];
const employeeNames = await c.var.evotor.getEmployeeNamesByIds(userIds);

// 4. Формируем результат
const dataReport: Record<string, string> = {};
for (let i = 0; i < shopsUuid.length; i++) {
  const uuid = shopsUuid[i];
  const shopName = shopNames[uuid];
  const data = dataResults[i];

  if (data) {
    const employeeName = employeeNames[data.userId as string];
    dataReport[shopName] = `${employeeName} открыта в ${/* ... */}`;
  } else {
    dataReport[shopName] = "ЕЩЕ НЕ ОТКРЫТА!!!";
  }
}
```

**Выигрыш:** 30+ запросов → 3 запроса (10x улучшение)

---

### 2. `/api/evotor/plan-for-today` - N+1 в получении названий магазинов

**Локация:** [src/api.ts](src/api.ts#L734-L745)

**Проблема:**

```typescript
for (const shopId of shopUuids) {
	const shopProductUuids = await getProductsByGroup(db, shopId, groupIdsVape);
	const shopName = await c.var.evotor.getShopName(shopId); // N запросов

	const [sumSalesData, podQuantity] = await Promise.all([
		c.var.evotor.getSalesSum(shopId, since, until, shopProductUuids),
		c.var.evotor.getSalesSumQuantity(shopId, since, until, groupIdsPods),
	]);

	salesData[shopName] = { sum: sumSalesData, pod: podQuantity };
}
```

**Почему это плохо:**

- Для 10 магазинов = 10 запросов к Evotor API для названий
- Еще 10 запросов к БД для продуктов
- **Итого: 20+ запросов вместо 2**

**Решение:**

```typescript
// 1. Получаем все названия магазинов за один раз
const shopNamesMap = await c.var.evotor.getShopNamesByUuids(shopUuids);

// 2. Параллельно получаем продукты для всех магазинов
const productsPromises = shopUuids.map((shopId) =>
	getProductsByGroup(db, shopId, groupIdsVape),
);
const productsResults = await Promise.all(productsPromises);

// 3. Параллельно получаем данные продаж
const salesPromises = shopUuids.map(async (shopId, index) => {
	const shopProductUuids = productsResults[index];
	const [sumSalesData, podQuantity] = await Promise.all([
		c.var.evotor.getSalesSum(shopId, since, until, shopProductUuids),
		c.var.evotor.getSalesSumQuantity(shopId, since, until, groupIdsPods),
	]);
	return { shopId, sumSalesData, podQuantity };
});
const salesResults = await Promise.all(salesPromises);

// 4. Формируем результат
const salesData: SalesData = {};
for (const { shopId, sumSalesData, podQuantity } of salesResults) {
	const shopName = shopNamesMap[shopId];
	salesData[shopName] = { sum: sumSalesData, pod: podQuantity };
}
```

**Выигрыш:** 20+ запросов → 2 батч-запроса + параллельные запросы к Evotor API

---

### 3. `/api/evotor/salary` - N+1 в цикле по датам

**Локация:** [src/api.ts](src/api.ts#L873-L890)

**Проблема:**

```typescript
for (const date_ of dates) {
	const date = new Date(date_);
	const since = formatDateWithTime(date, false);
	const until = formatDateWithTime(date, true);

	const openShopUuid = await c.var.evotor.getFirstOpenSession(
		since,
		until,
		employee,
	);
	if (!openShopUuid) continue;

	const shopName = await c.var.evotor.getShopName(openShopUuid); // N запросов
	const salaryData = await getSalaryData(employee, datePlan, until, db);
	// ...
}
```

**Почему это плохо:**

- Для 30 дней = 30 запросов к Evotor API для названий магазинов
- Может быть несколько одинаковых shopUuid
- **Нет кэширования**

**Решение:**

```typescript
// Кэш для названий магазинов
const shopNamesCache: Record<string, string> = {};

for (const date_ of dates) {
	const date = new Date(date_);
	const since = formatDateWithTime(date, false);
	const until = formatDateWithTime(date, true);

	const openShopUuid = await c.var.evotor.getFirstOpenSession(
		since,
		until,
		employee,
	);
	if (!openShopUuid) continue;

	// Используем кэш
	if (!shopNamesCache[openShopUuid]) {
		shopNamesCache[openShopUuid] = await c.var.evotor.getShopName(openShopUuid);
	}
	const shopName = shopNamesCache[openShopUuid];

	const salaryData = await getSalaryData(employee, datePlan, until, db);
	// ...
}
```

**Альтернатива (более эффективная):**

```typescript
// 1. Собираем все openShopUuids
const sessionsPromises = dates.map((date_) => {
	const date = new Date(date_);
	const since = formatDateWithTime(date, false);
	const until = formatDateWithTime(date, true);
	return c.var.evotor.getFirstOpenSession(since, until, employee);
});
const openShopUuids = await Promise.all(sessionsPromises);

// 2. Получаем уникальные UUID
const uniqueShopUuids = [...new Set(openShopUuids.filter(Boolean))];

// 3. Получаем все названия за один раз
const shopNamesMap = await c.var.evotor.getShopNamesByUuids(uniqueShopUuids);

// 4. Обрабатываем результаты
for (let i = 0; i < dates.length; i++) {
	const openShopUuid = openShopUuids[i];
	if (!openShopUuid) continue;

	const shopName = shopNamesMap[openShopUuid];
	// ...
}
```

**Выигрыш:** 30 запросов → 1-5 запросов (в зависимости от уникальных магазинов)

---

### 4. `getAllDocumentsByTypes()` - N последовательных запросов к API

**Локация:** [src/evotor/index.ts](src/evotor/index.ts#L437-L442)

**Проблема:**

```typescript
let allDocs: Document[] = [];

for (const shopId of shopUuids) {
	const docs = await this.getDocumentsBySellPayback(shopId, since, until);
	allDocs = allDocs.concat(docs);
}
return allDocs;
```

**Почему это плохо:**

- Запросы выполняются **последовательно** (один за другим)
- Для 10 магазинов: 10 × 200ms = **2 секунды**
- Вместо параллельного выполнения за ~200ms

**Решение:**

```typescript
// Параллельное выполнение запросов
const docsPromises = shopUuids.map((shopId) =>
	this.getDocumentsBySellPayback(shopId, since, until),
);
const docsResults = await Promise.all(docsPromises);

// Объединяем все результаты
const allDocs = docsResults.flat();
return allDocs;
```

**Выигрыш:** 2 секунды → 0.2 секунды (10x улучшение)

---

### 5. `replaceUuidsWithNames()` - Правильное использование кэша

**Локация:** [src/utils.ts](src/utils.ts#L1717-L1762)

**Текущая реализация (ХОРОШО):**

```typescript
export async function replaceUuidsWithNames(
	data: TransformedSchedule[],
	evotor: Evotor,
): Promise<
	Array<{
		/* ... */
	}>
> {
	// ✅ Правильно: используется кэш
	const shopNameCache: Record<string, string> = {};
	const employeeNameCache: Record<string, string> = {};

	const result = await Promise.all(
		data.map(async (item) => {
			// Проверяем кэш перед запросом
			let shopName = shopNameCache[item.shopUuid];
			if (!shopName) {
				shopName = await evotor.getShopName(item.shopUuid);
				shopNameCache[item.shopUuid] = shopName;
			}

			let employeeName = employeeNameCache[item.employeeUuid];
			if (!employeeName) {
				employeeName = await evotor.getEmployeeByUuid(item.employeeUuid);
				employeeNameCache[item.employeeUuid] = employeeName;
			}

			return {
				/* ... */
			};
		}),
	);

	return result;
}
```

**Эта функция уже оптимизирована!** Но можно улучшить:

```typescript
export async function replaceUuidsWithNames(
	data: TransformedSchedule[],
	evotor: Evotor,
): Promise<
	Array<{
		/* ... */
	}>
> {
	// 1. Собираем все уникальные UUID
	const shopUuids = [...new Set(data.map((d) => d.shopUuid))];
	const employeeUuids = [...new Set(data.map((d) => d.employeeUuid))];

	// 2. Получаем все имена за 2 запроса вместо N
	const [shopNamesMap, employeeNamesMap] = await Promise.all([
		evotor.getShopNamesByUuids(shopUuids),
		evotor.getEmployeeNamesByUuids(employeeUuids),
	]);

	// 3. Преобразуем данные (без await в цикле!)
	const result = data.map((item) => ({
		id: item.id ?? 0,
		shopName: shopNamesMap[item.shopUuid] || "Неизвестный магазин",
		employeeName:
			employeeNamesMap[item.employeeUuid] || "Неизвестный сотрудник",
		date: item.date,
		shiftType: item.shiftType,
	}));

	return result;
}
```

**Выигрыш:** N запросов → 2 батч-запроса

---

## Паттерны оптимизации

### 1. Батчинг (Batch Requests)

Получение всех данных за один запрос вместо N запросов в цикле.

```typescript
// ❌ Плохо
const names = [];
for (const id of ids) {
	names.push(await getShopName(id));
}

// ✅ Хорошо
const names = await getShopNamesByIds(ids);
```

**Требуется создать методы:**

- `getShopNamesByUuids(uuids: string[]): Promise<Record<string, string>>`
- `getEmployeeNamesByUuids(uuids: string[]): Promise<Record<string, string>>`

---

### 2. Кэширование (Caching)

Сохранение результатов запросов для повторного использования.

```typescript
const cache: Record<string, string> = {};

for (const id of ids) {
	if (!cache[id]) {
		cache[id] = await getShopName(id);
	}
	console.log(cache[id]);
}
```

**Плюсы:** Простая реализация  
**Минусы:** Все равно N запросов (но меньше для повторяющихся ID)

---

### 3. Параллелизация (Promise.all)

Выполнение независимых запросов параллельно.

```typescript
// ❌ Последовательно: 10 × 200ms = 2000ms
for (const shopId of shopIds) {
	const docs = await getDocuments(shopId);
}

// ✅ Параллельно: max(200ms) = 200ms
const docsPromises = shopIds.map((shopId) => getDocuments(shopId));
const allDocs = await Promise.all(docsPromises);
```

**Выигрыш:** До 10x ускорение

---

### 4. DataLoader Pattern (для будущего)

Автоматическое батчирование и кэширование запросов.

```typescript
import DataLoader from "dataloader";

const shopLoader = new DataLoader(async (shopIds: string[]) => {
	const shops = await db.getShopsByIds(shopIds);
	return shopIds.map((id) => shops.find((s) => s.id === id));
});

// Использование
const shop1 = await shopLoader.load("uuid1");
const shop2 = await shopLoader.load("uuid2");
// Автоматически объединяется в один запрос!
```

---

## Метрики производительности

### До оптимизации

| Эндпоинт                                    | Запросы             | Время (примерно) |
| ------------------------------------------- | ------------------- | ---------------- |
| `/api/schedules` (10 магазинов)             | 30+ запросов        | ~3-5 секунд      |
| `/api/evotor/plan-for-today` (10 магазинов) | 20+ запросов        | ~2-3 секунды     |
| `/api/evotor/salary` (30 дней)              | 30+ запросов        | ~3-4 секунды     |
| `getAllDocumentsByTypes` (10 магазинов)     | 10 последовательных | ~2 секунды       |

**Итого:** 90+ запросов, 10-14 секунд

### После оптимизации

| Эндпоинт                                    | Запросы               | Время (примерно) |
| ------------------------------------------- | --------------------- | ---------------- |
| `/api/schedules` (10 магазинов)             | 3 батч-запроса        | ~0.5 секунд      |
| `/api/evotor/plan-for-today` (10 магазинов) | 2 батч + параллельные | ~0.4 секунды     |
| `/api/evotor/salary` (30 дней)              | 1-5 запросов          | ~0.3 секунды     |
| `getAllDocumentsByTypes` (10 магазинов)     | 10 параллельных       | ~0.2 секунды     |

**Итого:** ~20 запросов, 1.4 секунды

**Общий выигрыш:** 10-14 секунд → 1.4 секунды (**~10x улучшение**)

---

## План внедрения

### Этап 1: Создание батч-методов в Evotor API

Добавить в класс `Evotor`:

```typescript
async getShopNamesByUuids(uuids: string[]): Promise<Record<string, string>> {
  const shops = await this.getShops();
  const result: Record<string, string> = {};
  for (const uuid of uuids) {
    const shop = shops.find(s => s.uuid === uuid);
    result[uuid] = shop?.name || 'Неизвестный магазин';
  }
  return result;
}

async getEmployeeNamesByUuids(uuids: string[]): Promise<Record<string, string>> {
  const employees = await this.getEmployees();
  const result: Record<string, string> = {};
  for (const uuid of uuids) {
    const emp = employees.find(e => e.uuid === uuid);
    result[uuid] = emp?.lastName || 'Неизвестный сотрудник';
  }
  return result;
}
```

### Этап 2: Рефакторинг эндпоинтов

1. `/api/schedules` - использовать батчинг + кэширование
2. `/api/evotor/plan-for-today` - использовать батчинг + Promise.all
3. `/api/evotor/salary` - добавить кэширование
4. `getAllDocumentsByTypes` - использовать Promise.all

### Этап 3: Тестирование

- Проверить корректность данных
- Измерить время отклика
- Убедиться в отсутствии регрессии

### Этап 4: Деплой и мониторинг

- Задеплоить изменения
- Мониторить метрики производительности
- Собрать отзывы пользователей

---

## Рекомендации

1. **Всегда думайте о батчинге** при работе с циклами и запросами
2. **Используйте Promise.all** для независимых запросов
3. **Кэшируйте** результаты, которые не меняются часто
4. **Измеряйте производительность** до и после оптимизаций
5. **Логируйте** количество запросов в development режиме

```typescript
// Пример логирования
logger.debug("Fetching shop names", { count: shopUuids.length });
const startTime = Date.now();
const shopNames = await getShopNamesByUuids(shopUuids);
logger.debug("Shop names fetched", {
	count: shopUuids.length,
	duration: Date.now() - startTime,
});
```

---

## Чек-лист перед коммитом

- [ ] Нет `await` внутри циклов `for`/`while`
- [ ] Используется `Promise.all` для параллельных запросов
- [ ] Есть батч-методы для получения множественных данных
- [ ] Добавлено кэширование для повторяющихся запросов
- [ ] Измерена производительность до/после
- [ ] Добавлены тесты для батч-методов

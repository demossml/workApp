# Frontend Style Guide

## Общий образец: SaleRepor.tsx

Все страницы должны следовать единому стилю, использованному в [SaleRepor.tsx](src/pages/reports/SaleRepor.tsx).

## Ключевые паттерны

### 1. Импорты

```typescript
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { telegram, isTelegramMiniApp } from "../../helpers/telegram";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
// ... остальные компоненты
```

### 2. Состояния для модальных окон

```typescript
const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
const [isShopSelectorOpen, setIsShopSelectorOpen] = useState(false);
const [isGroupSelectorOpen, setIsGroupSelectorOpen] = useState(false);

const isMiniApp = isTelegramMiniApp();
const areAllModalsClosed =
  !isDatePickerOpen && !isShopSelectorOpen && !isGroupSelectorOpen;
```

### 3. Использование useCallback для функций отправки

```typescript
const submitForecast = useCallback(
  async () => {
    if (!isFormValid) {
      if (isMiniApp) {
        telegram.WebApp.HapticFeedback.impactOccurred("light");
      } else {
        alert("Пожалуйста, выберите все параметры для формирования отчёта.");
      }
      return;
    }

    setIsLoadingReport(true);
    if (isMiniApp) {
      telegram.WebApp.MainButton.showProgress(true);
    }

    try {
      // API call
    } catch (err) {
      console.error(err);
      setError("Не удалось получить отчёт");
      if (isMiniApp) {
        telegram.WebApp.HapticFeedback.impactOccurred("light");
      }
    } finally {
      setIsLoadingReport(false);
      if (isMiniApp) {
        telegram.WebApp.MainButton.showProgress(false);
      }
    }
  },
  [
    /* dependencies */
  ]
);
```

### 4. Telegram MainButton Integration

```typescript
// Инициализация Telegram Mini App
useEffect(() => {
  if (!isMiniApp) return;

  // Настройка темы
  const theme = telegram.WebApp.colorScheme;
  document.documentElement.classList.toggle("dark", theme === "dark");

  // Установка цвета фона
  telegram.WebApp.setBackgroundColor(theme === "dark" ? "#111827" : "#f9fafb");

  // Настройка главной кнопки
  telegram.WebApp.MainButton.setText("Сгенерировать отчёт");
  telegram.WebApp.MainButton.setParams({
    color: "#0088cc",
    text_color: "#ffffff",
  });

  const handleGenerate = () => {
    telegram.WebApp.HapticFeedback.impactOccurred("light");
    submitForecast();
  };

  telegram.WebApp.MainButton.onClick(handleGenerate);

  return () => {
    telegram.WebApp.MainButton.offClick(handleGenerate);
  };
}, [isMiniApp, submitForecast]);

// Управление видимостью MainButton с учётом модальных окон
useEffect(() => {
  if (!isMiniApp) return;

  if (
    isFormValid &&
    !error &&
    !isLoadingReport &&
    !reportData &&
    areAllModalsClosed
  ) {
    telegram.WebApp.MainButton.show();
  } else {
    telegram.WebApp.MainButton.hide();
  }
}, [
  isMiniApp,
  isFormValid,
  error,
  isLoadingReport,
  reportData,
  areAllModalsClosed,
]);
```

### 5. Анимации с Framer Motion

```typescript
// Основной контейнер
<motion.div
  initial={{ opacity: 0, y: 15 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: "easeOut" }}
  className="min-h-screen w-full px-4 sm:px-6 py-10 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex flex-col items-center"
>
  {/* Заголовок */}
  <motion.h1
    className="text-xl sm:text-2xl font-semibold mb-6"
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
  >
    📊 Заголовок отчёта
  </motion.h1>

  {/* Форма */}
  <motion.div
    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg p-4 sm:p-6 w-full max-w-3xl space-y-5"
    initial={{ opacity: 0, scale: 0.97 }}
    animate={{ opacity: 1, scale: 1 }}
  >
    {/* Компоненты формы */}
  </motion.div>
</motion.div>
```

### 6. Страница с результатами

```typescript
if (reportData) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex flex-col items-center"
      style={{
        minHeight: "calc(100vh - 130px)",
        paddingTop: "calc(env(safe-area-inset-top) + 70px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)",
      }}
    >
      <motion.div
        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-none shadow-lg p-4 w-full"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        style={{
          height: "100%",
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Контент результатов */}
      </motion.div>
    </motion.div>
  );
}
```

### 7. Tailwind CSS классы

**Используйте всегда:**

- `dark:` варианты для темной темы
- Responsive классы: `sm:`, `md:`, `lg:`
- Правильные отступы с учетом safe-area

**Цветовая схема:**

- Фон: `bg-gray-50 dark:bg-gray-900`
- Карточки: `bg-white dark:bg-gray-800`
- Текст: `text-gray-800 dark:text-gray-200`
- Границы: `border-gray-200 dark:border-gray-700`
- Кнопки (активные): `bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600`
- Кнопки (неактивные): `bg-gray-300 dark:bg-gray-700`

### 8. Компоненты с onOpenChange

```typescript
<DateRangePicker
  onDateChange={(start, end) => {
    setStartDate(start);
    setEndDate(end);
  }}
  onOpenChange={setIsDatePickerOpen}
/>

<ShopSelector
  shopOptions={shopOptions}
  isLoadingShops={isLoadingShops}
  fetchGroups={fetchGroups}
  selectedShop={selectedShop}
  setSelectedShop={setSelectedShop}
  onOpenChange={setIsShopSelectorOpen}
/>

<GroupSelector
  groupOptions={groupOptions}
  selectedGroups={selectedGroups}
  setSelectedGroups={setSelectedGroups}
  isLoadingGroups={isLoadingGroups}
  onOpenChange={setIsGroupSelectorOpen}
/>
```

### 9. Кнопка генерации для не-Telegram окружения

```typescript
{!isMiniApp && (
  <motion.button
    onClick={submitForecast}
    className={`w-full py-3 rounded-xl font-medium text-white transition ${
      isFormValid
        ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        : "bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
    }`}
    disabled={!isFormValid}
    whileHover={{ scale: isFormValid ? 1.03 : 1 }}
    whileTap={{ scale: isFormValid ? 0.97 : 1 }}
  >
    Сгенерировать отчёт
  </motion.button>
)}
```

### 10. Состояния загрузки и ошибок

```typescript
if (isLoadingReport) return <LoadingSpinner />;
if (error) return <ErrorDisplay error={error} />;

if (!Object.keys(shopOptions).length) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <LoadingSpinner />
    </div>
  );
}
```

## Страницы, требующие обновления

### Высокий приоритет:

1. ✅ **SaleRepor.tsx** - образец, полностью соответствует стилю
2. ✅ **DeadStock.tsx** - полностью соответствует стилю
3. ⚠️ **Orders.tsx** - требуется полное обновление:
   - Добавить motion.div
   - Добавить useCallback
   - Добавить Telegram MainButton интеграцию
   - Обновить стили с dark: вариантами
   - Убрать кастомные календари, заменить на DateRangePicker

4. ⚠️ **QuantityTable.tsx** - требуется частичное обновление:
   - Добавить motion.div
   - Добавить useCallback
   - Добавить Telegram MainButton интеграцию
   - Добавить onOpenChange для селекторов

5. ⚠️ **SalarysReport.tsx** - требуется обновление:
   - Использует ui/card компоненты вместо motion.div
   - Добавить Telegram MainButton интеграцию
   - Унифицировать стили

### Средний приоритет:

6. **PlanSalesReport.tsx**
7. **SalestReportForThePeriod.tsx**
8. **StoreOpeningReport.tsx**
9. **ProfitReportPage.tsx**

### Низкий приоритет (служебные):

10. **Settings.tsx**
11. **ScheduleTable.tsx**
12. **SchedulesReport.tsx**
13. **Home.tsx**

## Чеклист для каждой страницы

- [ ] Импорт `motion` из `framer-motion`
- [ ] Импорт `telegram, isTelegramMiniApp` из `helpers/telegram`
- [ ] Состояния для `isXXXOpen` модальных окон
- [ ] Переменная `isMiniApp = isTelegramMiniApp()`
- [ ] Переменная `areAllModalsClosed`
- [ ] `useCallback` для функции отправки
- [ ] useEffect для инициализации Telegram MainButton
- [ ] useEffect для управления видимостью MainButton
- [ ] `motion.div` для основного контейнера
- [ ] `motion.h1` для заголовка
- [ ] `motion.div` для карточки формы
- [ ] `onOpenChange` prop для всех селекторов
- [ ] Правильные Tailwind классы с `dark:` вариантами
- [ ] `whileHover` и `whileTap` для кнопок
- [ ] Telegram HapticFeedback при ошибках
- [ ] `showProgress(true/false)` для MainButton

## Примеры рефакторинга

### До (старый стиль):

```typescript
return (
  <div className="p-4 flex flex-col items-start bg-custom-gray dark:bg-gray-900">
    <h1 className="text-xl dark:text-gray-400 font-bold">Отчёт</h1>
    <div className="w-full">
      <button onClick={submitForecast} className="w-full p-2 rounded-md">
        Сгенерировать
      </button>
    </div>
  </div>
);
```

### После (новый стиль):

```typescript
return (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, ease: "easeOut" }}
    className="min-h-screen w-full px-4 sm:px-6 py-10 bg-gray-50 dark:bg-gray-900"
  >
    <motion.h1
      className="text-xl sm:text-2xl font-semibold mb-6"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      📊 Отчёт
    </motion.h1>
    <motion.div
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 sm:p-6 w-full max-w-3xl"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {!isMiniApp && (
        <motion.button
          onClick={submitForecast}
          className={`w-full py-3 rounded-xl font-medium text-white ${
            isFormValid ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-300"
          }`}
          whileHover={{ scale: isFormValid ? 1.03 : 1 }}
          whileTap={{ scale: isFormValid ? 0.97 : 1 }}
        >
          Сгенерировать отчёт
        </motion.button>
      )}
    </motion.div>
  </motion.div>
);
```

## Компоненты, которые нужно обновить

### DateRangePicker, ShopSelector, GroupSelector

Добавить prop `onOpenChange`:

```typescript
interface Props {
  // ... existing props
  onOpenChange?: (isOpen: boolean) => void;
}

// В компоненте при открытии/закрытии:
onOpenChange?.(true); // при открытии
onOpenChange?.(false); // при закрытии
```

## Дополнительные рекомендации

1. **Всегда используйте safe-area-inset** для правильного отображения в Telegram Mini App:

   ```typescript
   paddingTop: "calc(env(safe-area-inset-top) + 70px)";
   paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)";
   ```

2. **HapticFeedback** для улучшения UX:
   - При ошибках: `telegram.WebApp.HapticFeedback.impactOccurred("light")`
   - При успешных действиях: `telegram.WebApp.HapticFeedback.notificationOccurred("success")`

3. **Прогресс для длительных операций**:

   ```typescript
   telegram.WebApp.MainButton.showProgress(true);
   // ... API call
   telegram.WebApp.MainButton.showProgress(false);
   ```

4. **Responsive дизайн**:
   - Используйте `max-w-3xl` для форм
   - Используйте `sm:`, `md:` префиксы для адаптивности
   - Тестируйте на мобильных устройствах

5. **Темная тема**:
   - Всегда добавляйте `dark:` варианты
   - Проверяйте контрастность текста
   - Используйте `telegram.WebApp.colorScheme` для определения темы

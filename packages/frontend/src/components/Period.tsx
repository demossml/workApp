import { useState } from "react";

type PeriodSelectorProps = {
  onPeriodChange: (period: number | null) => void; // Пропс для передачи выбранного периода
};

export const PeriodSelector = ({ onPeriodChange }: PeriodSelectorProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null); // Хранит выбранный период

  // Обработчик выбора периода
  const selectPeriod = (period: number) => {
    setSelectedPeriod(period);
    onPeriodChange(period); // Передаем значение в родительский компонент?
  };

  return (
    <div className="flex flex-col w-full justify-between">
      {/* Поясняющий текст над кнопками */}
      <p className="text-gray-700 dark:text-gray-400 mb-2 text-center">
        Выберите количество периодов для расчета
      </p>

      {/* Контейнер с кнопками */}
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => i + 1).map((period) => (
          <button
            key={period}
            onClick={() => selectPeriod(period)} // Обработчик выбора периода
            className={`p-2 rounded-md border ${
              selectedPeriod === period // Проверка, является ли кнопка выбранной
                ? "bg-blue-500 dark:bg-blue-400 dark:border-blue-400 text-white dark:text-gray-400" // Выбранный стиль
                : "bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400" // Невыбранный стиль
            }`}
          >
            <span className="text-sm">{period}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

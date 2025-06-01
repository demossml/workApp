import type React from "react";
import { useState, useEffect } from "react";

interface DateRangePickerProps {
  onDateChange: (start: string, end: string) => void; // Callback function to send the selected dates to parent
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  onDateChange,
}) => {
  const today = new Date().toISOString().split("T")[0]; // Получаем сегодняшнюю дату в формате YYYY-MM-DD

  const [startDate, setStartDate] = useState<string>(today); // Устанавливаем сегодняшнюю дату как начальную
  const [endDate, setEndDate] = useState<string>(today); // Устанавливаем сегодняшнюю дату как конечную

  // Форматирование даты
  const formatDate = (date: string): string => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    return new Date(date).toLocaleDateString("ru-RU", options);
  };

  // UseEffect to call onDateChange whenever dates are updated
  useEffect(() => {
    onDateChange(startDate, endDate); // Update the parent with the selected dates
  }, [startDate, endDate, onDateChange]);

  return (
    <div className="max-w-screen-md mx-auto p-1 w-full  bg-custom-gray  dark:text-gray-400 dark:bg-gray-900 ">
      {/* Блок для отображения выбранного периода */}
      <div className="flex items-center justify-between w-full mb-4">
        <span className="font-semibold  dark:text-gray-400 text-lg">
          {startDate && endDate
            ? `${formatDate(startDate)} → ${formatDate(endDate)}`
            : "Выберите период"}
        </span>
      </div>

      {/* Блок выбора дат */}
      <div className="flex   dark:text-gray-400 w-full gap-4">
        {/* Выбор начальной даты */}
        <div className="flex w-full   flex-col">
          <label
            htmlFor="start-date"
            className="text-gray-700  dark:text-gray-400 text-sm mb-1"
          >
            Начало периода
          </label>
          <input
            type="date"
            id="start-date"
            name="startDate"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border-2 dark:border-gray-700 dark:bg-gray-900 rounded-md p-2 w-full"
            max={today} // Ограничиваем максимальную дату на сегодняшний день
          />
        </div>

        {/* Выбор конечной даты */}
        <div className="flex  w-full flex-col">
          <label
            htmlFor="end-date"
            className="text-gray-700  dark:text-gray-400 text-sm mb-1"
          >
            Конец периода
          </label>
          <input
            type="date"
            id="end-date"
            name="endDate"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border-2 dark:border-gray-700 dark:bg-gray-900 rounded-md p-2 w-full"
            min={startDate} // Ограничиваем минимальную дату для конечного периода
          />
        </div>
      </div>
    </div>
  );
};

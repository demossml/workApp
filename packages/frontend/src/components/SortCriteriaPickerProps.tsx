import React, { useState } from "react";

interface SortCriteriaPickerProps {
  onSortChange: (criteria: string) => void;
}

export const SortCriteriaPicker: React.FC<SortCriteriaPickerProps> = ({
  onSortChange,
}) => {
  const [sortCriteria, setSortCriteria] = useState<string>("sum"); // Новый стейт для критерия сортировки

  // Определяем доступные критерии сортировки
  const criteriaOptions = [
    { value: "sum", label: "₽" },
    { value: "quantity", label: "количеству" },
    { value: "name", label: "наименованию" },
  ];

  // Обработчик нажатия на плитку
  const handleClick = (value: string) => {
    setSortCriteria(value); // Устанавливаем выбранный критерий
    onSortChange(value); // Сообщаем родителю об изменении
  };

  return (
    <div>
      <div className="flex items-center justify-between w-full mb-4">
        <span className="text-gray-700 dark:text-gray-400 text-sm">
          Критерий сортировки
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {criteriaOptions.map((option) => (
          <button
            key={option.value}
            className={`
             flex 
                items-center 
                justify-center 
                px-3 
                py-2 
                rounded-md 
                text-center
                dark:text-gray-400 
                border-2 
            ${
              sortCriteria === option.value
                ? "border-blue-500 dark:border-blue-400"
                : "border-gray-300 dark:border-gray-700"
            } 
            transition-colors 
                duration-300 
                ease-in-out
                min-w-max
                h-7
                whitespace-nowrap
          `}
            onClick={() => handleClick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

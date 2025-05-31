import React from "react";
import { GoBackButton } from "../components/GoBackButton"; // Импортируем компонент "Назад"

// Компонент отображения ошибки
type ErrorDisplayProps = {
  error: string;
};

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error }) => {
  return (
    <div className="relative min-h-screen p-4">
      {/* Контейнер для кнопки "Назад", расположенной в верхнем левом углу */}
      <div className="absolute top-4 left-4">
        <GoBackButton />
      </div>

      {/* Основной контент */}
      <div className="flex flex-col items-center justify-center min-h-screen">
        {/* Сообщение об ошибке */}
        <div className="text-red-500 text-center font-semibold mt-4 dark:text-red-400">
          Ошибка: {error}
        </div>
      </div>
    </div>
  );
};

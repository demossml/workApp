import React from "react";

type GoBackButtonProps = {
  error?: string; // Ошибка, которая будет отображаться (опционально)
};

export const GoBackButton: React.FC<GoBackButtonProps> = ({ error }) => {
  // Функция для возврата назад
  const goBack = () => {
    window.history.back(); // Возврат на предыдущую страницу через историю браузера
  };

  return (
    <div>
      {/* Кнопка "Назад" */}
      <button
        type="button"
        onClick={goBack} // Обработчик для возврата назад
        className="text-blue-500  dark:text-blue-400 text-sm font-semibold flex items-center"
      >
        <span className="mr-2">←</span> Назад
      </button>

      {/* Отображение ошибки, если она передана */}
      {error && (
        <div className="text-red-500 dark:text-red-400 text-center mt-4">
          Ошибка: {error}
        </div>
      )}
    </div>
  );
};

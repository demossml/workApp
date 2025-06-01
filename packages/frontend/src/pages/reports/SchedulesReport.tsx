import { GoBackButton } from "../../components/GoBackButton";
import { useSchedules } from "../../hooks/useApi";

export default function SchedulesReport() {
  const { data, error, isLoading } = useSchedules(); // Получаем данные из хука useSchedules

  // Если данные загружаются, отображаем индикатор загрузки
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-custom-gray p-4">
        <div className="flex items-center mb-4">
          {/* Loading spinner */}
          <div className="w-24 h-24 border-8 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
          <h1 className="ml-4 text-xl sm:text-2xl text-gray-800 font-bold" />
        </div>
      </div>
    );
  }

  // Если есть ошибка при загрузке данных
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-custom-gray p-4">
        <h1 className="mb-4 text-xl sm:text-2xl text-gray-800 font-bold">
          Ошибка: {error.message}
        </h1>
      </div>
    );
  }

  // Если данных нет, показываем сообщение
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-custom-gray p-4">
        <h1 className="mb-4 text-xl sm:text-2xl text-gray-800 font-bold">
          Нет данных для отображения.
        </h1>
        <div className="text-left mt-6">
          <a
            href="/"
            className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 active:bg-blue-700 transition duration-300"
          >
            На главную
          </a>
        </div>
      </div>
    );
  }

  // Отображаем данные из dataReport
  const { dataReport } = data;

  return (
    <div className="fixed  w-screen h-screen px-4 bg-custom-gray dark:text-gray-400 dark:bg-gray-900">
      <div className="mb-4 ">
        <GoBackButton />
      </div>
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-300 mb-4">
        Отчет о времени открытия
      </h2>
      <div className="space-y-4">
        {Object.entries(dataReport).map(([key, value]) => (
          <div
            key={key}
            className="p-4 bg-custom-gray dark:bg-gray-700 rounded-lg shadow-md"
          >
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              {key}:
            </p>
            <p className="text-base text-gray-800 dark:text-gray-200">
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

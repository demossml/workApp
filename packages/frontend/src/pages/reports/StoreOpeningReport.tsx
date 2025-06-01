import { GoBackButton } from "../../components/GoBackButton";
import { useGetShops } from "../../hooks/useApi";
import { useEffect, useState } from "react";

// Определяем тип данных, которые мы ожидаем от сервера
interface ResponseData {
  dataReport?: Record<string, string>;
  dataUrlPhoto?: string[];
  [key: string]: unknown; // Прочие свойства, которые могут быть в ответе
}

export default function StoreOpeningReport() {
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [date, setDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [responseData, setResponseData] = useState<ResponseData>({});
  const [isLoading, setIsLoading] = useState<boolean>(false); // Состояние загрузки
  const [isReportGenerated, setIsReportGenerated] = useState<boolean>(false); // Состояние, которое определяет, был ли сформирован отчет

  const { data, error } = useGetShops();

  useEffect(() => {
    // Можно проверить, если нужно что-то делать с полученными данными
  }, [data]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResponseData({}); // Очистка предыдущих данных
    setIsLoading(true); // Устанавливаем флаг загрузки в true
    setIsReportGenerated(false); // Пока отчет не сформирован, скрываем форму

    if (!selectedShop) {
      alert("Выберите магазин");
      setIsLoading(false); // Останавливаем загрузку, если не выбран магазин
      return;
    }

    const requestData = { shop: selectedShop, date };

    try {
      const response = await fetch("/api/get-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });

      if (response.ok) {
        const data = await response.json();
        setResponseData(data); // Сохраняем данные в состоянии
        setIsReportGenerated(true); // Отчет сформирован, показываем его
      } else {
        alert(`Ошибка при запросе данных: ${response.statusText}`);
      }
    } catch (err: unknown) {
      console.error("Ошибка при выполнении запроса:", err);
      alert("Произошла ошибка. Попробуйте снова.");
    } finally {
      setIsLoading(false); // После завершения загрузки сбрасываем флаг
    }
  };

  // Если данные загружаются, показываем экран загрузки
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="flex items-center mb-4">
          {/* Loading spinner */}
          <div className="w-24 h-24 border-8 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
          <h1 className="ml-4 text-xl sm:text-2xl text-gray-800 font-bold" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <h1 className="mb-4 text-xl sm:text-2xl text-gray-800 font-bold">
          Ошибка: {error.message}
        </h1>
      </div>
    );
  }

  if (!data || !data.shopsNameAndUuid.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
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

  return (
    <div className="bg-custom-gray shadow-md rounded-lg p-4 mt-4">
      <div className="mb-4">
        <GoBackButton />
      </div>
      {/* Если отчет еще не сформирован, показываем форму */}
      {!isReportGenerated && (
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="shop"
              className="block text-sm font-medium text-gray-700"
            >
              Выберите магазин:
            </label>
            <select
              id="shop"
              name="shop"
              value={selectedShop || ""}
              onChange={(e) => setSelectedShop(e.target.value)}
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="">Выберите магазин</option>
              {data.shopsNameAndUuid.map((shop) => (
                <option key={shop.uuid} value={shop.uuid}>
                  {shop.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label
              htmlFor="date"
              className="block text-sm font-medium text-gray-700"
            >
              Выберите дату:
            </label>
            <input
              type="date"
              id="date"
              name="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600"
          >
            Получить отчет
          </button>
        </form>
      )}

      {/* Если отчет сформирован, выводим данные */}
      {isReportGenerated && (
        <>
          <div className="mt-6 bg-custom-gray p-4 rounded-md">
            <h3 className="text-xl font-semibold">Информация о магазине:</h3>
            <ul className="mt-4">
              {Object.entries(responseData.dataReport || {}).map(
                ([key, value]) => (
                  <li key={key} className="flex justify-between py-2 border-b">
                    <span className="font-medium">{key}:</span>
                    <span>{value}</span>
                  </li>
                )
              )}
            </ul>
          </div>

          {responseData.dataUrlPhoto &&
            responseData.dataUrlPhoto.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xl font-semibold">Фотографии:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  {responseData.dataUrlPhoto.map((url, index) => (
                    <div key={index} className="bg-gray-200 rounded-md p-2">
                      <img
                        src={url}
                        alt={`Фото ${index + 1}`}
                        className="w-full h-auto rounded-md"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
        </>
      )}

      <div className="text-left mt-4">
        <a
          href="/"
          className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-700 active:bg-blue-800 transition duration-300"
        >
          На главную
        </a>
      </div>
    </div>
  );
}

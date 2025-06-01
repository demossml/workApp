import { useEffect, useState } from "react";
import { GoBackButton } from "../../components/GoBackButton";

interface EmployeeOptions {
  uuid: string;
  name: string;
}

interface TotalReport {
  employeeName: string | null; // Имя сотрудника
  startDate: string; // Начальная дата
  endDate: string; // Конечная дата
  totalBonusAccessories: number; // Общая сумма бонусов по аксессуарам
  totalBonusPlan: number; // Общая сумма плановых бонусов
  totalBonus: number; // Общая сумма бонусов
}

interface ResponseData {
  status: string;
  message: string;
  result?: Array<{
    date: string; // Дата
    shopName: string; // Имя магазина
    bonusAccessories: number; // Бонус за аксессуары
    dataPlan: number; // План на сегодня
    salesDataVape: number; // Продажи Vape
    bonusPlan: number; // Бонус за продажу Vape
    totalBonus: number; // Итоговый бонус
  }>;
  totalReport?: TotalReport; // Общий отчет
}

export default function SalaryReports() {
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOptions[]>([]);
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responseData, setResponseData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState<boolean>(false); // Состояние загрузки

  const calculateDate = (date: string, days: number): string => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result.toISOString().split("T")[0];
  };

  useEffect(() => {
    const fetchEmployeesData = async () => {
      try {
        const response = await fetch("/api/employee/name-uuid");
        if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
        const data = await response.json();

        if (data.employeeNameAndUuid) {
          setEmployeeOptions(data.employeeNameAndUuid);
        } else {
          setError("Список сотрудников не найден в ответе");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Неизвестная ошибка";
        console.error(errorMessage);
        setError("Не удалось загрузить данные сотрудников");
      }
    };
    fetchEmployeesData();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedEmployee) {
      setError("Пожалуйста, выберите сотрудника");
      return;
    }

    const data = {
      employee: selectedEmployee,
      startDate,
      endDate,
    };

    setLoading(true); // Устанавливаем состояние загрузки в true
    setError(null); // Сбрасываем ошибку перед новым запросом
    setResponseData(null); // Очищаем предыдущий отчет

    try {
      const response = await fetch("/api/evotor/salary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result: ResponseData = await response.json();
        setResponseData(result);
      } else {
        setError("Не удалось отправить данные");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Неизвестная ошибка";
      console.error("Ошибка при отправке формы:", errorMessage);
      setError("Не удалось отправить данные");
    } finally {
      setLoading(false); // Сбрасываем состояние загрузки
    }
  };

  return (
    <div className="w-screen h-screen px-4 bg-custom-gray dark:text-gray-400 dark:bg-gray-900">
      <GoBackButton />
      <h2 className="text-2xl font-bold text-center mt-4">Отчет по зарплате</h2>
      {error && (
        <div className="text-red-500 text-center mt-4">Ошибка: {error}</div>
      )}

      {loading ? ( // Если идет загрузка, показываем только сообщение о загрузке
        <div className="flex flex-col items-center justify-center min-h-screen bg-custom-gray p-4">
          <div className="flex items-center mb-4">
            {/* Loading spinner */}
            <div className="w-24 h-24 border-8 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
            <h1 className="ml-4 text-xl sm:text-2xl text-gray-800 font-bold" />
          </div>
        </div>
      ) : responseData ? ( // Если отчет получен, отображаем его
        <div className="mt-4">
          <h3 className="text-xl font-bold text-center">Результат:</h3>
          <div className="mt-4">
            <h4 className="font-semibold">Начало периода:</h4>
            <p>{responseData.totalReport?.startDate || startDate}</p>
            <h4 className="font-semibold">Конец периода:</h4>
            <p>{responseData.totalReport?.endDate || endDate}</p>
          </div>
          <ul className="mt-4 space-y-4">
            {responseData.result?.map((item, index) => (
              <li
                key={index}
                className="bg-custom-gray shadow-md rounded-lg p-4"
              >
                <ul className="mt-2">
                  <li className="flex justify-between text-gray-700 mt-1">
                    <span>Дата:</span>
                    <span className="font-bold">{item.date}</span>
                  </li>
                  <li className="flex justify-between text-gray-700 mt-1">
                    <span>Имя магазина:</span>
                    <span className="font-bold">{item.shopName}</span>
                  </li>
                  <li className="flex justify-between text-gray-700 mt-1">
                    <span>Бонус за аксессуары:</span>
                    <span className="font-bold">{item.bonusAccessories} ₽</span>
                  </li>
                  <li className="flex justify-between text-gray-700 mt-1">
                    <span>План Vape:</span>
                    <span className="font-bold">{item.dataPlan} ₽</span>
                  </li>
                  <li className="flex justify-between text-gray-700 mt-1">
                    <span>Продажи Vape:</span>
                    <span className="font-bold">{item.salesDataVape} ₽</span>
                  </li>
                  <li className="flex justify-between text-gray-700 mt-1">
                    <span>Бонус за продажу Vape:</span>
                    <span className="font-bold">{item.bonusPlan} ₽</span>
                  </li>
                </ul>
                <div className="mt-2 flex justify-between text-gray-700 font-bold">
                  <span>Итоговый бонус:</span>
                  <span className="bg-blue-500 text-white rounded-full px-3 py-1 text-xs font-semibold">
                    {item.totalBonus} ₽
                  </span>{" "}
                  {/* Total bonus at the bottom */}
                </div>
                <hr className="my-2" /> {/* Separator between records */}
              </li>
            ))}
          </ul>

          {responseData.totalReport && (
            <div className="mt-6">
              <h4 className="font-semibold">Общий отчет:</h4>
              <ul className="bg-custom-gray shadow-md rounded-lg p-4 mt-4 space-y-2">
                <li className="flex justify-between text-gray-700 mt-1">
                  <span>Имя сотрудника:</span>
                  <span className="font-bold">
                    {responseData.totalReport.employeeName || "Не указано"}
                  </span>
                </li>
                <li className="flex justify-between text-gray-700 mt-1">
                  <span>Итого по аксессуарам:</span>
                  <span className="font-bold">
                    {responseData.totalReport.totalBonusAccessories} ₽
                  </span>
                </li>
                <li className="flex justify-between text-gray-700 mt-1">
                  <span>Итого бонус по план Vape:</span>
                  <span className="font-bold">
                    {responseData.totalReport.totalBonusPlan} ₽
                  </span>
                </li>
                <li className="flex justify-between text-gray-700 mt-1">
                  <span>Итого бонус:</span>
                  <span className="font-bold">
                    {responseData.totalReport.totalBonus} ₽
                  </span>
                </li>
              </ul>
            </div>
          )}
        </div>
      ) : (
        // Если ни загрузка, ни данные, показываем форму для выбора
        <form
          onSubmit={handleSubmit}
          className="bg-custom-gray shadow-md rounded-lg p-4 mt-4"
        >
          <label htmlFor="start-date" className="block text-lg font-semibold">
            Начало периода:
          </label>
          <input
            type="date"
            id="start-date"
            name="startDate"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              // Устанавливаем новую дату окончания, если текущая выходит за пределы допустимого диапазона
              if (
                new Date(endDate) > new Date(calculateDate(e.target.value, 7))
              ) {
                setEndDate(calculateDate(e.target.value, 7));
              }
              if (new Date(endDate) < new Date(e.target.value)) {
                setEndDate(e.target.value);
              }
            }}
            className="border rounded-md p-2 mt-1 w-full"
          />

          <label
            htmlFor="end-date"
            className="block text-lg font-semibold mt-2"
          >
            Конец периода:
          </label>
          <input
            type="date"
            id="end-date"
            name="endDate"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded-md p-2 mt-1 w-full"
            min={startDate} // Минимальная дата - начало периода
            max={calculateDate(startDate, 7)} // Максимальная дата - +7 дней от начала
          />

          <label
            htmlFor="employee"
            className="block text-lg font-semibold mt-2"
          >
            Выберите сотрудника:
          </label>
          <select
            id="employee"
            value={selectedEmployee || ""}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="border rounded-md p-2 mt-1 w-full"
          >
            <option value="">Выберите сотрудника</option>
            {employeeOptions.map((option) => (
              <option key={option.uuid} value={option.uuid}>
                {option.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="bg-blue-500 text-white rounded-md px-4 py-2 mt-4"
          >
            Получить отчет
          </button>
        </form>
      )}
    </div>
  );
}

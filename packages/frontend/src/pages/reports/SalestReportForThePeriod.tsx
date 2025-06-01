import { useState } from "react";
import { DateRangePicker } from "../../components/DateRangePicker";
import { GoBackButton } from "../../components/GoBackButton";

type PaymentData = {
  sell: Record<string, number>;
  refund: Record<string, number>;
  totalSell: number;
};

type ReportData = {
  salesDataByShopName: Record<string, PaymentData>;
  grandTotalSell: number;
  grandTotaRefund: number;
  grandTotaCashOutcome: number;
  startDate: string;
  endDate: string;
  cashOutcomeData: Record<string, Record<string, number>>;
  cash: Record<string, number>;
};

const formatAmount = (amount: number): number | string => {
  const roundedSum = amount.toFixed(2);

  // Проверка на целое число
  if (Number.parseFloat(roundedSum) % 1 === 0) {
    return Number.parseInt(roundedSum, 10); // Возвращаем целое число
  }

  return Number.parseFloat(roundedSum); // Возвращаем с двумя знаками после запятой
};

export default function SalesTodayReport() {
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const submitForecast = async () => {
    // Проверяем, что все необходимые данные выбраны
    if (!startDate || !endDate) {
      alert("Пожалуйста, выберите все параметры для формирования прогноза.");
      return;
    }
    const data = {
      startDate: startDate, // Устанавливаем начало дня
      endDate: endDate,
    };

    setLoading(true); // Устанавливаем состояние загрузки
    setError(null); // Сбрасываем предыдущую ошибку

    try {
      const response = await fetch("/api/evotor/sales-garden-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }
      const report: ReportData = await response.json();
      setReportData(report);
    } catch (err) {
      console.error(err);
      setError("Не удалось получить отчет");
    } finally {
      setLoading(false); // Сбрасываем состояние загрузки
    }
  };

  if (loading) {
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
    return <div className="text-red-500 text-center mt-4">Ошибка: {error}</div>;
  }

  if (reportData) {
    const {
      salesDataByShopName,
      grandTotalSell,
      grandTotaRefund,
      grandTotaCashOutcome,
      startDate,
      endDate,
      cashOutcomeData,
      cash,
    } = reportData;

    const totalPayments: Record<string, number> = {};

    // Агрегируем данные по платежам
    Object.values(salesDataByShopName).forEach((data) => {
      Object.entries(data.sell).forEach(([paymentType, amount]) => {
        totalPayments[paymentType] = (totalPayments[paymentType] || 0) + amount;
      });

      Object.entries(data.refund).forEach(([paymentType, amount]) => {
        totalPayments[paymentType] = (totalPayments[paymentType] || 0) + amount;
      });
    });

    return (
      <div className="fixed  w-screen h-screen px-4 bg-custom-gray dark:text-gray-400 dark:bg-gray-900 overflow-y-auto">
        <GoBackButton />
        <h2 className="text-xl font-bold">Сводный финансовый отчет</h2>

        <div className="mt-4">
          <h3 className="text-xl font-bold">
            За период с {startDate} по {endDate}
          </h3>
        </div>

        <ul className="mt-4 space-y-4">
          {Object.entries(salesDataByShopName).map(([shopName, data]) => {
            const shopCashData = cashOutcomeData[shopName] || {}; // Данные о выплатах для магазина
            const shopCash = cash[shopName] || 0; // Остаток денежных средств для магазина

            // Логика для вычисления totalShopPayments с округлением
            const totalShopPayments = Object.values(shopCashData).reduce(
              (total, amount) => total + amount,
              0
            );
            const formattedShopPayments = formatAmount(totalShopPayments);

            return (
              <li key={shopName} className="bg-white shadow-md rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <strong className="text-lg">{shopName}</strong>
                </div>

                <div className="mt-2">
                  <h4 className="font-semibold">Продажи:</h4>
                  <ul>
                    {Object.entries(data.sell).map(([paymentType, amount]) => (
                      <li
                        key={paymentType}
                        className="flex justify-between text-gray-700 mt-1"
                      >
                        <span>{paymentType}</span>
                        <span className="font-bold">{amount} ₽</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex justify-between text-gray-700 mt-1">
                    <span className="font-semibold">Всего продажи:</span>
                    <span className="font-bold">{data.totalSell} ₽</span>
                  </div>
                </div>

                {Object.keys(data.refund).length > 0 && (
                  <div className="mt-2">
                    <h4 className="font-semibold">Возвраты:</h4>
                    <ul>
                      {Object.entries(data.refund).map(
                        ([paymentType, amount]) => (
                          <li
                            key={paymentType}
                            className="flex justify-between text-gray-700 mt-1"
                          >
                            <span>{paymentType}</span>
                            <span className="font-bold">{amount} ₽</span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {/* Добавляем блок с данными о выплатах */}
                {Object.keys(shopCashData).length > 0 && (
                  <div className="mt-2">
                    <h4 className="font-semibold">Выплаты:</h4>
                    <ul>
                      {Object.entries(shopCashData).map(
                        ([paymentType, amount]) => (
                          <li
                            key={paymentType}
                            className="flex justify-between text-gray-700 mt-1"
                          >
                            <span>{paymentType}</span>
                            <span className="font-bold">
                              {formatAmount(amount)} ₽
                            </span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {Object.keys(shopCashData).length > 0 && (
                  <div className="flex justify-between text-gray-700 mt-1">
                    <span className="font-semibold">Всего выплаты:</span>
                    <span className="font-bold">{formattedShopPayments} ₽</span>
                  </div>
                )}

                {/* Добавляем блок с остатком денежных средств */}
                <div className="flex justify-between text-gray-700 mt-1">
                  <span className="font-semibold">Нал. в кассе:</span>
                  <span className="font-bold">{formatAmount(shopCash)} ₽</span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 space-y-4">
          <h3 className="text-xl font-semibold">Общий итог:</h3>
          <div className="bg-white shadow-md rounded-lg p-4">
            <ul>
              <li className="flex font-bold justify-between text-gray-700 mt-1">
                <span>Итого выплаты:</span>
                <span className="font-bold">
                  {formatAmount(grandTotaCashOutcome || 0)} ₽
                </span>
              </li>
              <li className="flex font-bold justify-between text-gray-700 mt-1">
                <span>Итого возвраты:</span>
                <span className="font-bold">
                  {formatAmount(grandTotaRefund)} ₽
                </span>
              </li>
              <li className="flex font-bold justify-between text-gray-700 mt-1">
                <span>Итого прод. банк. картой:</span>
                <span className="font-bold">
                  {formatAmount(totalPayments["Банковской картой:"] || 0)} ₽
                </span>
              </li>
              <li className="flex font-bold justify-between text-gray-700 mt-1">
                <span>Итого продажи нал. сред.:</span>
                <span className="font-bold">
                  {formatAmount(totalPayments["Нал. средствами:"] || 0)} ₽
                </span>
              </li>

              <li className="flex font-bold justify-between text-gray-700 mt-1">
                <span>Итого продажи:</span>
                <span className="font-bold">
                  {formatAmount(grandTotalSell)} ₽
                </span>
              </li>

              {/* Добавляем общий остаток денежных средств */}
              <li className="flex font-bold justify-between text-gray-700 mt-1">
                <span>Итого нал. в кассе:</span>
                <span className="font-bold">
                  {formatAmount(
                    Object.values(cash).reduce((sum, c) => sum + c, 0)
                  )}{" "}
                  ₽
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed  w-screen h-screen px-4 bg-custom-gray dark:text-gray-400 dark:bg-gray-900">
      <h1 className="text-xl font-bold"> Сводный финансовый отчет</h1>
      <GoBackButton />
      <div className="w-full">
        <DateRangePicker
          onDateChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
        />{" "}
      </div>

      {/* Кнопка "Сформировать прогноз" */}
      <button
        onClick={submitForecast} // Вызываем функцию отправки данных
        className={`w-full p-2 rounded-md  dark:text-gray-400 mt-8 ${
          startDate && endDate
            ? " bg-blue-400 dark:hover:bg-blue-500"
            : "bg-gray-700"
        }`}
        disabled={
          !(startDate && endDate) // Блокируем кнопку, если не выбраны все параметры
        }
      >
        Сгенерировать отчет
      </button>
    </div>
  );
}

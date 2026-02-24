import { useState } from "react";
import { motion } from "framer-motion";
import { useGetShops } from "../../hooks/useApi";
import { DateRangePicker } from "../../components/DateRangePicker";
import { DynamicTableProfit } from "../../components/DynamicTableProfit"; // поправь путь, если нужно
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";

interface ReportData {
  byCategory: Record<string, number>;
  totalEvoExpenses: number;
  expenses1C: number;
  grossProfit: number;
  netProfit: number;
}

interface ProfitReport {
  period: { since: string; until: string };
  report: Record<string, ReportData>;
}

export default function ProfitReportPage() {
  const { data, isLoading, error } = useGetShops();
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [formData, setFormData] = useState<
    Record<string, { expenses: number; grossProfit: number }>
  >({});
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  useTelegramBackButton();

  const handleChange = (
    shopUuid: string,
    field: "expenses" | "grossProfit",
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [shopUuid]: {
        ...prev[shopUuid],
        [field]: Number(value) || 0,
      },
    }));
  };

  const handleSubmit = async () => {
    if (!startDate || !endDate) {
      alert("Заполните даты");
      return;
    }

    setLoadingReport(true);
    try {
      const response = await client.api.evotor["profit-report"].$post({
        json: {
          shopUuids: data?.shopsNameAndUuid.map((shop) => shop.uuid) || [],
          since: startDate,
          until: endDate,
          dataFrom1C: formData,
        },
      });

      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }

      const result = await response.json();
      setReport(result);
    } catch (err) {
      console.error("Ошибка при получении отчета:", err);
    } finally {
      setLoadingReport(false);
    }
  };

  const isFormValid =
    startDate !== null &&
    endDate !== null &&
    data?.shopsNameAndUuid.every((shop) => {
      const shopData = formData[shop.uuid];
      return (
        shopData !== undefined &&
        shopData.expenses !== undefined &&
        shopData.grossProfit !== undefined &&
        shopData.expenses !== null &&
        shopData.grossProfit !== null &&
        (shopData.expenses > 0 || shopData.grossProfit > 0)
      );
    });

  if (isLoading)
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100 dark:bg-gray-900">
        <div className="w-10 h-10 border-4 border-t-transparent border-blue-500 dark:border-blue-400 border-solid rounded-full animate-spin" />
      </div>
    );

  if (error)
    return (
      <p className="text-red-600 dark:text-red-400 text-center p-4">
        Ошибка загрузки магазинов: {error.message}
      </p>
    );

  return (
    <motion.div
      className="min-h-screen p-4 bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 overflow-y-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <h1 className="text-2xl font-bold text-center mb-4">Отчет по прибыли</h1>

      {!report && (
        <>
          {/* Фильтр по датам */}
          <div className="w-full mb-6">
            <DateRangePicker
              onDateChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
            />
          </div>

          {/* Таблица ввода данных 1С */}
          <div className="w-full mb-8">
            <div className="space-y-4">
              {data?.shopsNameAndUuid.map((shop) => (
                <div
                  key={shop.uuid}
                  className="bg-white dark:bg-gray-800 p-4 rounded-md shadow-sm"
                >
                  <h3 className="font-semibold text-lg mb-2">{shop.name}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Расходы (1С)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData[shop.uuid]?.expenses ?? ""}
                        onChange={(e) =>
                          handleChange(shop.uuid, "expenses", e.target.value)
                        }
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Валовая прибыль (1С)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData[shop.uuid]?.grossProfit ?? ""}
                        onChange={(e) =>
                          handleChange(shop.uuid, "grossProfit", e.target.value)
                        }
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <motion.button
                onClick={handleSubmit}
                disabled={!isFormValid || loadingReport}
                className={`w-full p-3 rounded-md text-white mt-4 ${
                  !isFormValid || loadingReport
                    ? "bg-blue-400 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-500"
                } transition-colors duration-200 ease-in-out`}
                whileHover={{ scale: !isFormValid || loadingReport ? 1 : 1.04 }}
                whileTap={{ scale: !isFormValid || loadingReport ? 1 : 0.97 }}
              >
                {loadingReport ? "Формируем отчет..." : "Сформировать отчет"}
              </motion.button>
            </div>
          </div>
        </>
      )}

      {/* Если отчет сформирован — показываем только его */}
      {report && (
        <DynamicTableProfit report={report} shops={data?.shopsNameAndUuid} />
      )}

      {/* Добавь CSS для скрытия спиннеров */}
      <style>{`
        /* Chrome, Safari, Edge, Opera */
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
        /* Firefox */
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>
    </motion.div>
  );
}

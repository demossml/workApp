import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ShopSalesMiniChart from "./ShopSalesMiniChart";
import { useGetReportAndPlan } from "../hooks/useReportData";
import { useShopCharts } from "../hooks/useShopCharts";
import { useGetShopNames } from "../hooks/useGetShopNames";
import { useOpenTimes } from "../hooks/useOpenTimes";
import { isTelegramMiniApp, telegram } from "../helpers/telegram";

// Форматирование суммы
const formatAmount = (amount: number): number | string => {
  const roundedSum = amount.toFixed(2);
  if (Number.parseFloat(roundedSum) % 1 === 0) {
    return Number.parseInt(roundedSum, 10);
  }
  return Number.parseFloat(roundedSum);
};

// Компонент списка ключ-значение
const renderKeyValueList = (
  data: Record<string, number> | null | undefined,
  loading: boolean,
  emptyMessage = "Данные отсутствуют"
) => {
  if (loading) {
    return (
      <div className="space-y-2">
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="w-2/3 h-2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }
  if (!data || Object.keys(data).length === 0) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">{emptyMessage}</p>
    );
  }
  return (
    <ul className="space-y-1">
      {Object.entries(data).map(([key, value]) => (
        <li
          key={key}
          className="flex justify-between text-gray-800 dark:text-gray-200 text-xs"
        >
          <span>{key}</span>
          <span className="font-semibold">{formatAmount(value)} ₽</span>
        </li>
      ))}
    </ul>
  );
};

export default function PlanSalesFinancialReport() {
  const {
    data: shopNames = [],
    isLoading: shopsLoading,
    error: shopsError,
  } = useGetShopNames();
  const {
    data,
    isLoading: loading,
    error,
  } = useGetReportAndPlan(shopNames.length > 0);
  const [openedShop, setOpenedShop] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const chartData = useShopCharts(openedShop);
  const openTimes = useOpenTimes();

  const isMiniApp = isTelegramMiniApp();

  // Инициализация Telegram WebApp
  useEffect(() => {
    if (isMiniApp) {
      // Устанавливаем цвет фона
      const theme = telegram.WebApp.colorScheme;
      telegram.WebApp.setBackgroundColor(
        theme === "dark" ? "#1f2937" : "#2563eb"
      );

      // Включаем подтверждение закрытия
      telegram.WebApp.enableClosingConfirmation();

      // Отслеживаем изменение размера окна
      const handleViewportChanged = () => {
        setIsExpanded(telegram.WebApp.isExpanded);
      };

      telegram.WebApp.onEvent("viewportChanged", handleViewportChanged);
      setIsExpanded(telegram.WebApp.isExpanded);

      return () => {
        telegram.WebApp.offEvent("viewportChanged", handleViewportChanged);
        telegram.WebApp.disableClosingConfirmation();
      };
    }
  }, []);

  // Управление кнопкой "Назад" при открытии деталей магазина
  useEffect(() => {
    if (isMiniApp) {
      if (openedShop) {
        telegram.WebApp.BackButton.show();
        telegram.WebApp.BackButton.onClick(closeShopDetails);
      } else {
        telegram.WebApp.BackButton.hide();
        telegram.WebApp.BackButton.offClick(closeShopDetails);
      }

      return () => {
        telegram.WebApp.BackButton.hide();
        telegram.WebApp.BackButton.offClick(closeShopDetails);
      };
    }
  }, [openedShop]);

  // Функция для разворачивания окна
  const expandApp = useCallback(() => {
    if (isMiniApp && !isExpanded) {
      telegram.WebApp.expand();
      telegram.WebApp.HapticFeedback.impactOccurred("medium");
    }
  }, [isExpanded]);

  // Функция закрытия деталей магазина с тактильной отдачей
  const closeShopDetails = useCallback(() => {
    setOpenedShop(null);
    if (isMiniApp) {
      telegram.WebApp.HapticFeedback.impactOccurred("light");
    }
  }, []);

  // Функция переключения деталей магазина с тактильной отдачей
  const toggleShopDetails = useCallback(
    (shopName: string) => {
      const willOpen = openedShop !== shopName;
      setOpenedShop(willOpen ? shopName : null);

      if (isMiniApp) {
        telegram.WebApp.HapticFeedback.impactOccurred("light");

        // Разворачиваем окно при открытии деталей для лучшего отображения
        if (willOpen && !isExpanded) {
          telegram.WebApp.expand();
        }
      }
    },
    [openedShop, isExpanded]
  );

  // Функция для показа уведомления о загрузке
  const showLoadingNotification = useCallback(() => {
    if (isMiniApp && loading) {
      telegram.WebApp.showPopup({
        title: "Загрузка данных",
        message: "Пожалуйста, подождите...",
        buttons: [{ type: "close" }],
      });
    }
  }, [loading]);

  if (shopsError) {
    // Показываем уведомление об ошибке в Telegram
    if (isMiniApp) {
      telegram.WebApp.showAlert(
        `Ошибка загрузки магазинов: ${shopsError.message}`
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-red-500 text-center mt-4 text-sm"
      >
        Ошибка загрузки магазинов: {shopsError.message}
      </motion.div>
    );
  }

  const reportData = error ? null : (data?.reportData ?? null);
  const planData = error ? null : (data?.planData ?? null);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
      {/* Кнопка разворачивания для Telegram */}
      {isMiniApp && !isExpanded && (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={expandApp}
          className="w-full max-w-md mx-auto mb-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
        >
          <span>📱</span>
          Развернуть на весь экран для лучшего обзора
        </motion.button>
      )}

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {shopNames.map((shopName) => {
          const data = reportData?.salesDataByShopName[shopName] || {
            sell: {},
            refund: {},
            totalSell: 0,
          };
          const plan = planData?.[shopName]?.datePlan ?? null;
          const planSales = planData?.[shopName]?.dataSales ?? null;
          const planQuantity = planData?.[shopName]?.dataQuantity ?? null;

          const isPlanMet =
            plan !== null && planSales !== null ? planSales >= plan : null;

          const colorClass =
            isPlanMet === null
              ? "border-blue-400"
              : isPlanMet
                ? "border-green-400"
                : "border-red-400";

          const statusText =
            isPlanMet === null
              ? "Нет данных"
              : isPlanMet
                ? "✅ План выполнен"
                : "❌ План не выполнен";

          const statusClass =
            isPlanMet === null
              ? "text-blue-500"
              : isPlanMet
                ? "text-green-500"
                : "text-red-500";

          const planQuantityArray = planQuantity
            ? Object.entries(planQuantity).map(([productName, quantity]) => ({
                productName,
                quantity,
              }))
            : [];

          return (
            <motion.li
              key={shopName}
              className={`bg-white dark:bg-gray-800 border-l-4 ${colorClass} rounded-2xl shadow-md hover:shadow-lg transition-all duration-200`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <button
                onClick={() => toggleShopDetails(shopName)}
                className="w-full text-left p-4"
              >
                <div className="flex justify-between items-center">
                  <strong className="text-sm sm:text-base text-gray-900 dark:text-white truncate">
                    {shopName}
                  </strong>
                  <span
                    className={`text-xs sm:text-sm font-medium ${statusClass}`}
                  >
                    {statusText}
                  </span>
                </div>

                {openTimes.data?.[shopName] && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {openTimes.data[shopName]}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-3 mt-3 text-gray-600 dark:text-gray-300">
                  <div>
                    <p className="text-xs">План:</p>
                    {loading || shopsLoading ? (
                      <div className="w-16 h-2 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                    ) : (
                      <p className="font-semibold text-xs">
                        {plan !== null ? formatAmount(plan) : "-"} ₽
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs">Продажи:</p>
                    {loading ? (
                      <div className="w-16 h-2 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                    ) : (
                      <p className="font-semibold text-xs">
                        {planSales !== null
                          ? `${formatAmount(planSales)} ₽`
                          : "Нет данных"}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs">Выручка:</p>
                    {loading ? (
                      <div className="w-16 h-2 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                    ) : (
                      <p className="font-semibold text-xs">
                        {formatAmount(data.totalSell)} ₽
                      </p>
                    )}
                  </div>
                </div>
              </button>

              <AnimatePresence>
                {openedShop === shopName && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.2 }}
                    className="bg-gray-100 dark:bg-gray-700 p-4 rounded-b-2xl space-y-4"
                  >
                    {/* Кнопка закрытия для мобильных устройств
                    {isTelegramMiniApp && (
                      <div className="flex justify-end">
                        <button
                          onClick={closeShopDetails}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 bg-white dark:bg-gray-600 px-2 py-1 rounded-md transition-colors"
                        >
                          Закрыть ✕
                        </button>
                      </div>
                    )} */}

                    <section>
                      <h4 className="text-xs font-semibold mb-1">
                        Продажи по типам оплаты:
                      </h4>
                      {renderKeyValueList(data.sell, loading)}
                    </section>

                    <section>
                      <h4 className="text-xs font-semibold mb-1">Выплаты:</h4>
                      {renderKeyValueList(
                        reportData?.cashOutcomeData?.[shopName],
                        loading
                      )}
                    </section>

                    {Object.keys(data.refund).length > 0 && (
                      <section>
                        <h4 className="text-xs font-semibold mb-1">
                          Возвраты:
                        </h4>
                        {renderKeyValueList(data.refund, loading)}
                      </section>
                    )}

                    <section>
                      <h4 className="text-xs font-semibold mb-1">
                        План по товарам:
                      </h4>
                      {planQuantityArray.length > 0 ? (
                        <ul className="space-y-1">
                          {planQuantityArray.map((item, idx) => (
                            <li
                              key={idx}
                              className="flex justify-between text-gray-800 dark:text-gray-200 text-xs"
                            >
                              <span>{item.productName}</span>
                              <span className="font-semibold">
                                {item.quantity as string} шт.
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Данные отсутствуют
                        </p>
                      )}
                    </section>

                    <section>
                      <h4 className="text-xs font-semibold mb-1">
                        График продаж:
                      </h4>
                      {chartData.isLoading ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Загрузка...
                        </p>
                      ) : chartData.error ? (
                        <p className="text-xs text-red-500">
                          Ошибка загрузки: {chartData.error.message}
                        </p>
                      ) : chartData.data?.[shopName] ? (
                        <div className="w-full overflow-x-auto">
                          <ShopSalesMiniChart
                            todayData={chartData.data[shopName].nowDataSales}
                            sevenDaysAgoData={
                              chartData.data[shopName].sevenDaysDataSales
                            }
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Нет данных
                        </p>
                      )}
                    </section>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ul>

      {/* Кнопка для показа уведомления о загрузке */}
      {isMiniApp && loading && (
        <div className="fixed bottom-4 right-4">
          <button
            onClick={showLoadingNotification}
            className="bg-blue-500 text-white p-3 rounded-full shadow-lg hover:bg-blue-600 transition-colors"
          >
            ⏳
          </button>
        </div>
      )}
    </div>
  );
}

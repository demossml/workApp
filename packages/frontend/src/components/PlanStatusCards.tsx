import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Store,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
} from "lucide-react";
import { useGetReportAndPlan } from "../hooks/useReportData";
import { useGetShopNames } from "../hooks/useGetShopNames";
import { isTelegramMiniApp, telegram } from "../helpers/telegram";

// Интерфейс для данных плана
interface PlanInfo {
  datePlan: number;
  dataSales: number;
  dataQuantity?: Record<string, number | string>;
}

// Форматирование суммы
const formatAmount = (amount: number): string => {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Расчет процента выполнения плана
const calculateProgress = (actual: number, plan: number): number => {
  if (plan === 0) return 0;
  return (actual / plan) * 100;
};

export default function PlanStatusCards() {
  const { data: shopNames = [], isLoading: shopsLoading } = useGetShopNames();
  const { data, isLoading: loading } = useGetReportAndPlan(
    shopNames.length > 0
  );

  const [expandedShop, setExpandedShop] = useState<string | null>(null);
  const isMiniApp = isTelegramMiniApp();

  const toggleExpand = useCallback(
    (shopName: string) => {
      const willOpen = expandedShop !== shopName;
      setExpandedShop(willOpen ? shopName : null);

      if (isMiniApp) {
        telegram.WebApp.HapticFeedback.impactOccurred("light");
      }
    },
    [expandedShop, isMiniApp]
  );

  // Безопасное получение данных плана
  const planData = useMemo(
    () => (data?.planData || {}) as Record<string, PlanInfo>,
    [data]
  );

  if (shopsLoading || loading) {
    return (
      <div className="w-full mb-8 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 bg-gray-200 dark:bg-gray-800 rounded-2xl"
            />
          ))}
        </div>
      </div>
    );
  }

  if (Object.keys(planData).length === 0) {
    return null;
  }

  return (
    <div className="w-full mb-8">
      {/* Сетка карточек по магазинам */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {shopNames.map((shopName, index) => {
          const planInfo = planData[shopName];
          const plan = planInfo?.datePlan || 0;
          const sales = planInfo?.dataSales || 0;
          const planQuantity = planInfo?.dataQuantity ?? null;

          const progress = calculateProgress(sales, plan);
          const difference = sales - plan;
          const isPlanMet = plan > 0 ? sales >= plan : null;

          // Статус карты
          let statusColor = "gray";
          let statusText = "Нет плана";

          if (plan > 0) {
            if (isPlanMet) {
              statusColor = "green";
              statusText = "Выполнен";
            } else {
              statusColor = "red";
              statusText = "Не выполнен";
            }
          }

          const planQuantityArray = planQuantity
            ? Object.entries(planQuantity).map(([productName, quantity]) => ({
                productName,
                quantity,
              }))
            : [];

          const isExpanded = expandedShop === shopName;

          return (
            <motion.div
              key={shopName}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col"
            >
              {/* Хэдер карточки */}
              <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                <div className="flex justify-between items-center mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`p-1 rounded-md bg-${statusColor}-100 dark:bg-${statusColor}-900/20`}
                    >
                      <Store
                        className={`w-3.5 h-3.5 text-${statusColor}-600 dark:text-${statusColor}-400`}
                      />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 dark:text-white leading-none text-xs">
                        {shopName}
                      </h3>
                      <p
                        className={`text-[9px] font-medium text-${statusColor}-600 dark:text-${statusColor}-400 leading-tight mt-0.5`}
                      >
                        {statusText}
                      </p>
                    </div>
                  </div>
                  {plan > 0 && (
                    <div className="text-right">
                      <span
                        className={`text-[13px] font-bold ${isPlanMet ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {progress.toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Прогресс бар */}
                {plan > 0 && (
                  <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-0.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(progress, 100)}%` }}
                      transition={{ duration: 1, delay: 0.2 }}
                      className={`h-full rounded-full ${isPlanMet ? "bg-green-500" : "bg-red-500"}`}
                    />
                  </div>
                )}
              </div>

              {/* Тело карточки */}
              <div className="px-3 py-1.5 flex-grow">
                <div className="flex justify-between items-end mb-1.5">
                  <div>
                    <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-none mb-0.5">
                      План
                    </p>
                    <p className="font-bold text-xs text-gray-900 dark:text-white leading-none">
                      {formatAmount(plan)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-none mb-0.5">
                      Факт
                    </p>
                    <p
                      className={`font-bold text-xs leading-none ${isPlanMet ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}
                    >
                      {formatAmount(sales)}
                    </p>
                  </div>
                </div>

                <div className="flex justify-between items-center py-0.5 px-2 bg-gray-50 dark:bg-gray-700/30 rounded-md">
                  <span className="text-[9px] text-gray-500 dark:text-gray-400">
                    Откл.
                  </span>
                  <span
                    className={`text-[10px] font-bold flex items-center gap-1 ${difference >= 0 ? "text-green-600" : "text-red-500"}`}
                  >
                    {difference > 0 ? "+" : ""}
                    {formatAmount(difference)}
                    {difference >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                  </span>
                </div>
              </div>

              {/* Футер с планом по товарам */}
              {planQuantityArray.length > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => toggleExpand(shopName)}
                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <ShoppingBag className="w-3 h-3 text-blue-500" />
                      <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">
                        Товары ({planQuantityArray.length})
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    )}
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-gray-50/50 dark:bg-gray-800/50"
                      >
                        <div className="px-3 py-1.5 space-y-1">
                          {planQuantityArray.map((item) => (
                            <div
                              key={item.productName}
                              className="flex justify-between items-center text-[10px] py-0.5 border-b border-gray-200 dark:border-gray-700 last:border-0"
                            >
                              <span className="text-gray-600 dark:text-gray-300 font-medium truncate max-w-[120px]">
                                {item.productName}
                              </span>
                              <span className="text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/30 px-1 py-0.5 rounded whitespace-nowrap ml-2">
                                {item.quantity as string} шт.
                              </span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

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
import { useWorkingByShops } from "../hooks/useApi";
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
  const { data, isLoading: loading } = useGetReportAndPlan(true);
  const { data: workingByShopsData } = useWorkingByShops();

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

  const renderShopNames = useMemo(() => {
    if (shopNames.length > 0) return shopNames;
    return Object.keys(planData);
  }, [shopNames, planData]);

  const sellerByShop = useMemo(() => {
    const byShop = (workingByShopsData as {
      byShop?: Record<string, { employeeName?: string | null }>;
    } | undefined)?.byShop;
    if (!byShop) return {} as Record<string, string | null>;
    const result: Record<string, string | null> = {};
    for (const [shopName, data] of Object.entries(byShop)) {
      result[shopName] = data.employeeName || null;
    }
    return result;
  }, [workingByShopsData]);

  const cards = useMemo(() => {
    return renderShopNames.map((shopName) => {
      const planInfo = planData[shopName];
      const plan = planInfo?.datePlan || 0;
      const sales = planInfo?.dataSales || 0;
      const planQuantity = planInfo?.dataQuantity ?? null;
      const progress = calculateProgress(sales, plan);
      const difference = sales - plan;
      const isPlanMet = plan > 0 ? sales >= plan : null;
      const remainingToPlan = plan > sales ? plan - sales : 0;

      let statusColor = "gray";
      let statusText = "Нет плана";
      if (plan > 0) {
        if (isPlanMet) {
          statusColor = "green";
          statusText = "Выполнен";
        } else if (progress >= 70) {
          statusColor = "yellow";
          statusText = "Риск";
        } else {
          statusColor = "red";
          statusText = "Критично";
        }
      }

      const planQuantityArray = planQuantity
        ? Object.entries(planQuantity).map(([productName, quantity]) => ({
            productName,
            quantity,
          }))
        : [];

      return {
        shopName,
        plan,
        sales,
        progress,
        difference,
        isPlanMet,
        remainingToPlan,
        statusColor,
        statusText,
        planQuantityArray,
      };
    });
  }, [renderShopNames, planData]);

  if (shopsLoading && renderShopNames.length === 0) {
    return (
      <div className="w-full mb-8 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 bg-gray-200 dark:bg-gray-800 rounded-xl"
            />
          ))}
        </div>
      </div>
    );
  }

  if (renderShopNames.length === 0) {
    return null;
  }

  return (
    <div className="w-full mb-8">
      {/* Сетка карточек по магазинам */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.map((card, index) => {
          const isExpanded = expandedShop === card.shopName;
          const isCardLoading = loading && !planData[card.shopName];
          const sellerName = sellerByShop[card.shopName];

          return (
            <motion.div
              key={card.shopName}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col cursor-pointer transition-all ${
                isExpanded ? "ring-2 ring-blue-500" : "hover:shadow-lg"
              }`}
              onClick={() => toggleExpand(card.shopName)}
            >
              {/* Хэдер карточки */}
              <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                <div className="flex justify-between items-center mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`p-1 rounded-md bg-${card.statusColor}-100 dark:bg-${card.statusColor}-900/20`}
                    >
                      <Store
                        className={`w-3.5 h-3.5 text-${card.statusColor}-600 dark:text-${card.statusColor}-400`}
                      />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 dark:text-white leading-none text-xs">
                        {card.shopName}
                      </h3>
                      <p
                        className={`text-[9px] font-medium text-${card.statusColor}-600 dark:text-${card.statusColor}-400 leading-tight mt-0.5`}
                      >
                        {isCardLoading ? "Загрузка..." : card.statusText}
                      </p>
                      <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">
                        {sellerName ? `В смене: ${sellerName}` : "Смена не открыта"}
                      </p>
                    </div>
                  </div>
                  {isCardLoading ? (
                    <div className="h-4 w-10 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  ) : card.plan > 0 ? (
                    <div className="text-right">
                      <span
                        className={`text-[13px] font-bold ${card.isPlanMet ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {card.progress.toFixed(0)}%
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Прогресс бар */}
                {isCardLoading ? (
                  <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-0.5 animate-pulse" />
                ) : card.plan > 0 ? (
                  <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-0.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(card.progress, 100)}%` }}
                      transition={{ duration: 1, delay: 0.2 }}
                      className={`h-full rounded-full ${card.isPlanMet ? "bg-green-500" : "bg-red-500"}`}
                    />
                  </div>
                ) : null}
              </div>

              {/* Тело карточки */}
              <div className="px-3 py-1.5 flex-grow">
                <div className="flex justify-between items-end mb-1.5">
                  <div>
                    <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-none mb-0.5">
                      План
                    </p>
                    {isCardLoading ? (
                      <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                    ) : (
                      <p className="font-bold text-xs text-gray-900 dark:text-white leading-none">
                        {formatAmount(card.plan)} ₽
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-none mb-0.5">
                      Факт
                    </p>
                    {isCardLoading ? (
                      <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse ml-auto" />
                    ) : (
                      <p
                        className={`font-bold text-xs leading-none ${card.isPlanMet ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}
                      >
                        {formatAmount(card.sales)} ₽
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center py-0.5 px-2 bg-gray-50 dark:bg-gray-700/30 rounded-md">
                  <span className="text-[9px] text-gray-500 dark:text-gray-400">
                    Откл. ₽
                  </span>
                  {isCardLoading ? (
                    <div className="h-4 w-14 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  ) : (
                    <span
                      className={`text-[10px] font-bold flex items-center gap-1 ${card.difference >= 0 ? "text-green-600" : "text-red-500"}`}
                    >
                      {card.difference > 0 ? "+" : ""}
                      {formatAmount(card.difference)}
                      {card.difference >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                    </span>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50"
                  >
                    <div className="px-3 py-2 space-y-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-gray-500 dark:text-gray-400">
                          До плана
                        </span>
                        <span
                          className={`font-bold ${card.remainingToPlan > 0 ? "text-red-500" : "text-green-600"}`}
                        >
                          {card.remainingToPlan > 0
                            ? `${formatAmount(card.remainingToPlan)} ₽`
                            : "План закрыт"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                          <ShoppingBag className="w-3 h-3 text-blue-500" />
                          <span>Товаров в плане</span>
                        </div>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {card.planQuantityArray.length}
                        </span>
                      </div>
                      {card.planQuantityArray.length > 0 && (
                        <div className="space-y-1 max-h-28 overflow-auto pr-1">
                          {card.planQuantityArray.map((item) => (
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
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="px-3 py-1 border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-500 dark:text-gray-400 flex items-center justify-end gap-1">
                {isExpanded ? (
                  <>
                    Свернуть <ChevronUp className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    Детали <ChevronDown className="w-3 h-3" />
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

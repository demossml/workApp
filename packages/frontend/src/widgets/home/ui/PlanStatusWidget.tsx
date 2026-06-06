import { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Store,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  Truck,
  ArrowRight,
  Loader2,
  Clock,
  User,
} from "lucide-react";
import { useGetReportAndPlan } from "@/hooks/useReportData";
import { useGetShopNames } from "@/hooks/useGetShopNames";
import { useWorkingByShops } from "@/hooks/useApi";
import { isTelegramMiniApp, telegram } from "@/helpers/telegram";
import {
  buildPlanCards,
  buildSellerByShop,
  formatPlanAmount,
  getRenderShopNames,
  type PlanInfo,
} from "@features/dashboard/model/planStatusModel";
import {
  fetchPosSessions,
  type PosSession,
} from "@features/opening/api";

// Статический маппинг Tailwind-классов (JIT не видит динамические)
const statusStyles: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  green:  { bg: "bg-green-100",  text: "text-green-600",  darkBg: "dark:bg-green-900/20",  darkText: "dark:text-green-400" },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-600", darkBg: "dark:bg-yellow-900/20", darkText: "dark:text-yellow-400" },
  red:    { bg: "bg-red-100",    text: "text-red-600",    darkBg: "dark:bg-red-900/20",    darkText: "dark:text-red-400" },
  gray:   { bg: "bg-gray-100",   text: "text-gray-600",   darkBg: "dark:bg-gray-900/20",   darkText: "dark:text-gray-400" },
};

function statusClass(color: string) {
  return statusStyles[color] || statusStyles.gray;
}

export function PlanStatusWidget() {
  const { data: shopNames = [], isLoading: shopsLoading } = useGetShopNames();
  const { data, isLoading: loading, isError, error, refetch } = useGetReportAndPlan(true);
  const { data: workingByShopsData } = useWorkingByShops();

  const [expandedShop, setExpandedShop] = useState<string | null>(null);
  const [transferShop, setTransferShop] = useState<string | null>(null);
  const [transferData, setTransferData] = useState<Array<{
    productName: string; fromShop: string; fromShopName: string;
    deadQuantity: number; toShop: string; toShopName: string;
    soldQty14d: number; velocity: number;
  }> | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const isMiniApp = isTelegramMiniApp();

  // Opening status for today (from POS sessions)
  const [openingShops, setOpeningShops] = useState<PosSession[]>([]);
  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchPosSessions();
        setOpeningShops(data);
      } catch { /* silent */ }
    };
    void load();
  }, []);

  const openingByShop = useMemo(() => {
    const map: Record<string, PosSession> = {};
    for (const shop of openingShops) {
      map[shop.shopName] = shop;
    }
    return map;
  }, [openingShops]);

  const toggleExpand = useCallback(
    (shopName: string) => {
      const willOpen = expandedShop !== shopName;
      setExpandedShop(willOpen ? shopName : null);
      if (!willOpen) {
        setTransferShop(null);
        setTransferData(null);
      }

      if (isMiniApp) {
        telegram.WebApp.HapticFeedback.impactOccurred("light");
      }
    },
    [expandedShop, isMiniApp]
  );

  const handleTransferClick = useCallback(async (shopName: string) => {
    if (transferShop === shopName) {
      setTransferShop(null);
      return;
    }
    setTransferShop(shopName);
    setTransferLoading(true);
    try {
      const resp = await fetch("/api/ai/director/stock-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (resp.ok) {
        const json = await resp.json();
        setTransferData(json.recommendations || []);
      }
    } catch (err) { console.warn("PlanStatusWidget: transfer fetch failed:", err) }
    setTransferLoading(false);
  }, [transferShop]);

  // Безопасное получение данных плана
  const planData = useMemo(
    () => (data?.planData || {}) as Record<string, PlanInfo>,
    [data]
  );

  const renderShopNames = useMemo(() => {
    return getRenderShopNames(shopNames, planData);
  }, [shopNames, planData]);

  const sellerByShop = useMemo(() => {
    return buildSellerByShop(workingByShopsData as {
      byShop?: Record<string, { employeeName?: string | null }>;
    } | undefined);
  }, [workingByShopsData]);

  const cards = useMemo(() => buildPlanCards(renderShopNames, planData), [renderShopNames, planData]);

  // ── Sales pace summary ── (moved to DashboardSummary RevenueTempoCard)
  const _pace = useMemo(() => {
    let totalPlan = 0, totalFact = 0;
    for (const v of Object.values(planData)) {
      totalPlan += v.datePlan || 0;
      totalFact += v.dataSales || 0;
    }
    const now = new Date();
    const open = new Date(now); open.setHours(7, 50, 0, 0);
    const close = new Date(now); close.setHours(22, 0, 0, 0);
    const elapsed = Math.max(0, (now.getTime() - open.getTime()) / 3600000);
    const remain = Math.max(0, (close.getTime() - now.getTime()) / 3600000);
    const pct = totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0;
    const rate = elapsed > 0 ? totalFact / elapsed : 0;
    const projected = elapsed > 0 ? (totalFact / elapsed) * (elapsed + remain) : 0;
    const needPct = 22 - 7.833 > 0 ? (elapsed / (22 - 7.833)) * 100 : 50;
    const status = pct >= needPct + 5 ? "ahead" : pct >= needPct - 5 ? "on-track" : totalPlan > 0 ? "behind" : "no-data";
    return { totalPlan, totalFact, pct, rate, projected, remain, status };
  }, [planData]);

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

  // Error state
  if (isError) {
    return (
      <div className="w-full mb-8">
        <div className="bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800 p-6 text-center">
          <p className="text-sm text-red-700 dark:text-red-300 mb-3">
            Не удалось загрузить данные плана
          </p>
          <p className="text-[10px] text-red-500 dark:text-red-400 mb-3">
            {error?.message || "Проверьте подключение"}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  // Loading skeleton grid
  if (loading) {
    return (
      <div className="w-full mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {renderShopNames.map((shop) => (
            <div
              key={shop}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden animate-pulse"
            >
              <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <div className="w-7 h-7 rounded-md bg-gray-200 dark:bg-gray-700" />
                    <div className="space-y-1">
                      <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
                      <div className="h-2 w-12 bg-gray-100 dark:bg-gray-600 rounded" />
                    </div>
                  </div>
                  <div className="h-4 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </div>
              <div className="px-3 py-4 space-y-2">
                <div className="flex justify-between">
                  <div className="space-y-1">
                    <div className="h-2 w-8 bg-gray-100 dark:bg-gray-600 rounded" />
                    <div className="h-5 w-14 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="h-2 w-8 bg-gray-100 dark:bg-gray-600 rounded ml-auto" />
                    <div className="h-5 w-14 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                </div>
                <div className="h-6 w-full bg-gray-100 dark:bg-gray-600 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mb-8">
      {/* Сетка карточек по магазинам */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.map((card, index) => {
          const isExpanded = expandedShop === card.shopName;
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
                      className={`p-1 rounded-md ${statusClass(card.statusColor).bg} ${statusClass(card.statusColor).darkBg}`}
                    >
                      <Store
                        className={`w-3.5 h-3.5 ${statusClass(card.statusColor).text} ${statusClass(card.statusColor).darkText}`}
                      />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 dark:text-white leading-none text-xs">
                        {card.shopName}
                      </h3>
                      {/* Статус открытия (из POS OPEN_SESSION) */}
                      {(() => {
                        const opening = openingByShop[card.shopName];
                        if (!opening) {
                          return (
                            <p className="text-[9px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              Не открыт
                            </p>
                          );
                        }
                        const isLate = opening.isLate === true;
                        return (
                          <p
                            className={`text-[9px] font-semibold leading-tight mt-0.5 flex items-center gap-0.5 ${
                              isLate
                                ? "text-red-600 dark:text-red-400"
                                : "text-green-600 dark:text-green-400"
                            }`}
                          >
                            <Clock className="w-2.5 h-2.5" />
                            {opening.openedTime || "—"}
                            {opening.openedByName && (
                              <>
                                <User className="w-2.5 h-2.5 ml-0.5" />
                                {opening.openedByName.split(" ")[0]}
                              </>
                            )}
                            {isLate && " ⚠️"}
                          </p>
                        );
                      })()}
                      <p
                        className={`text-[9px] font-medium ${statusClass(card.statusColor).text} ${statusClass(card.statusColor).darkText} leading-tight mt-0.5`}
                      >
                        {sellerName
                            ? `${card.statusText} — ${sellerName}`
                            : card.statusText}
                      </p>
                    </div>
                  </div>
                  {card.plan > 0 ? (
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
                {card.plan > 0 ? (
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
                      <p className="font-bold text-xs text-gray-900 dark:text-white leading-none">
                        {formatPlanAmount(card.plan)} ₽
                      </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-none mb-0.5">
                      Факт
                    </p>
                      <p
                        className={`font-bold text-xs leading-none ${card.isPlanMet ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}
                      >
                        {formatPlanAmount(card.sales)} ₽
                      </p>
                  </div>
                </div>

                <div className="flex justify-between items-center py-0.5 px-2 bg-gray-50 dark:bg-gray-700/30 rounded-md">
                  <span className="text-[9px] text-gray-500 dark:text-gray-400">
                    Откл. ₽
                  </span>
                    <span
                      className={`text-[10px] font-bold flex items-center gap-1 ${card.difference >= 0 ? "text-green-600" : "text-red-500"}`}
                    >
                      {card.difference > 0 ? "+" : ""}
                      {formatPlanAmount(card.difference)}
                      {card.difference >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                    </span>
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
                            ? `${formatPlanAmount(card.remainingToPlan)} ₽`
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

                      {/* Transfer recommendations button */}
                      <button
                        type="button"
                        className="w-full flex items-center justify-center gap-1.5 rounded-md bg-purple-50 dark:bg-purple-900/20 px-2 py-1.5 text-[10px] font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleTransferClick(card.shopName);
                        }}
                      >
                        <Truck className="w-3 h-3" />
                        Рекомендации по перемещению
                      </button>

                      {/* Transfer list */}
                      {transferShop === card.shopName && (
                        <div className="space-y-1 max-h-40 overflow-auto pr-1">
                          {transferLoading ? (
                            <div className="flex items-center justify-center py-2 text-[10px] text-gray-400">
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              Загрузка...
                            </div>
                          ) : (transferData || []).filter(
                              (r) => r.fromShopName === card.shopName
                            ).length === 0 ? (
                            <div className="text-[10px] text-gray-400 py-1">
                              Нет рекомендаций для этого магазина
                            </div>
                          ) : (
                            (transferData || [])
                              .filter((r) => r.fromShopName === card.shopName)
                              .map((rec, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-1.5 text-[10px] py-1 border-b border-gray-100 dark:border-gray-700 last:border-0"
                                >
                                  <ArrowRight className="w-3 h-3 text-purple-500 shrink-0" />
                                  <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
                                    {rec.productName}
                                  </span>
                                  <span className="text-purple-600 dark:text-purple-400 font-semibold shrink-0 text-right leading-tight">
                                    → {rec.toShopName}
                                    <br />
                                    <span className="text-[9px] text-gray-400 font-normal">
                                      {rec.deadQuantity} шт / {rec.soldQty14d} шт за 14д
                                    </span>
                                  </span>
                                </div>
                              ))
                          )}
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

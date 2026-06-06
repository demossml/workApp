import { motion } from "framer-motion";
import { Clock, TrendingUp, ShoppingCart, Target } from "lucide-react";
import { useMyShift } from "@/hooks/dashboard/useMyShift";

function fmtRub(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)} ${(n % 1000).toString().padStart(3, "0")}`.replace(/^(\d+) (\d{3})$/, "$1 $2 ₽");
  return `${Math.round(n)} ₽`;
}

function trendPct(current: number, prev: number): string {
  if (!prev) return "";
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `${pct}%`;
  return "0%";
}

export function MyShiftCard() {
  const { data, isLoading } = useMyShift();

  if (isLoading || !data) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 animate-pulse">
        <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="h-12 bg-gray-100 dark:bg-gray-750 rounded-lg" />
          <div className="h-12 bg-gray-100 dark:bg-gray-750 rounded-lg" />
          <div className="h-12 bg-gray-100 dark:bg-gray-750 rounded-lg" />
        </div>
        <div className="h-4 bg-gray-100 dark:bg-gray-750 rounded-full" />
      </div>
    );
  }

  const vapePct = data.vapePlan > 0 ? Math.min(Math.round((data.vapeFact / data.vapePlan) * 100), 100) : 0;
  const vsYesterday = trendPct(data.revenue, data.yesterdayRevenue);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
    >
      {/* Shift status bar */}
      <div
        className={`px-4 py-2 flex items-center gap-2 text-sm font-medium ${
          data.shiftOpen
            ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
            : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
        }`}
      >
        <Clock className="w-4 h-4" />
        {data.shiftOpen
          ? `Смена открыта · ${data.shiftOpenTime} · ${data.shiftShopName}`
          : "Смена не открыта"}
      </div>

      <div className="p-4">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center">
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
              Выручка
            </div>
            <div className="text-lg font-bold text-gray-800 dark:text-gray-100">
              {fmtRub(data.revenue)}
            </div>
            {vsYesterday && (
              <div
                className={`text-[10px] font-medium ${
                  vsYesterday.startsWith("+")
                    ? "text-emerald-500"
                    : "text-red-500"
                }`}
              >
                {vsYesterday} к вчера
              </div>
            )}
          </div>
          <div className="text-center">
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
              Чеков
            </div>
            <div className="text-lg font-bold text-gray-800 dark:text-gray-100">
              {data.checks}
            </div>
            <div className="text-[10px] text-gray-400">
              ср. {data.avgCheck} ₽
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
              Вейпы
            </div>
            <div className="text-lg font-bold text-gray-800 dark:text-gray-100">
              {data.vapeFact} ₽
            </div>
            <div className="text-[10px] text-gray-400">
              план {data.vapePlan} ₽
            </div>
          </div>
        </div>

        {/* Vape progress bar */}
        <div>
          <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
            <span>План по вейпам</span>
            <span>{vapePct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${vapePct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={`h-full rounded-full ${
                vapePct >= 80
                  ? "bg-emerald-500"
                  : vapePct >= 50
                  ? "bg-amber-500"
                  : "bg-red-500"
              }`}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

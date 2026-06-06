import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Package, Wallet, TrendingUp } from "lucide-react";

// ── types ──

interface AccessoryRow {
  storeName: string;
  productName: string;
  quantity: number;
  revenue: number;
}

interface TodayPulseData {
  accessories: AccessoryRow[];
  cashByShop: Record<string, number>;
  totalCash: number;
}

// ── fetch ──

async function fetchTodayPulse(): Promise<TodayPulseData> {
  const r = await fetch("/api/evotor/today-pulse");
  return r.json();
}

function useTodayPulse() {
  return useQuery({
    queryKey: ["today-pulse"],
    queryFn: fetchTodayPulse,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

// ── helpers ──

function fmtRub(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}K ₽`;
  return `${Math.round(n)} ₽`;
}

function fmtCash(n: number): string {
  if (n >= 1000) {
    const k = Math.round(n / 1000);
    const rest = Math.round(n % 1000).toString().padStart(3, "0");
    return `${k} ${rest} ₽`;
  }
  return `${Math.round(n)} ₽`;
}

// ── component ──

export function TodayPulse() {
  const { data, isLoading } = useTodayPulse();

  if (isLoading || !data) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 animate-pulse">
        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        <div className="flex gap-3">
          <div className="flex-1 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-gray-100 dark:bg-gray-750 rounded" />
            ))}
          </div>
          <div className="w-32 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-gray-100 dark:bg-gray-750 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const top5 = data.accessories.slice(0, 5);
  const totalAccRevenue = data.accessories.reduce((s, a) => s + a.revenue, 0);
  const cashEntries = Object.entries(data.cashByShop).sort(
    ([, a], [, b]) => b - a
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
    >
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-750 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        <TrendingUp className="w-3.5 h-3.5" />
        Пульс сегодня
      </div>

      <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-700">
        {/* Левая колонка: топ аксессуаров */}
        <div className="flex-1 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Package className="w-3 h-3 text-gray-400" />
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
              Топ аксессуаров
            </span>
            <span className="text-[10px] text-gray-400 ml-auto">
              {fmtRub(totalAccRevenue)}
            </span>
          </div>
          <div className="space-y-1">
            {top5.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-[11px]"
              >
                <span className="text-gray-300 dark:text-gray-600 w-3 text-right text-[10px]">
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-gray-700 dark:text-gray-300">
                  {item.productName}
                </span>
                <span className="text-[10px] text-gray-400 shrink-0">
                  {item.quantity} шт
                </span>
                <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 w-14 text-right shrink-0">
                  {fmtRub(item.revenue)}
                </span>
              </div>
            ))}
            {top5.length === 0 && (
              <div className="text-[10px] text-gray-400 py-2">
                Нет продаж аксессуаров сегодня
              </div>
            )}
          </div>
        </div>

        {/* Правая колонка: остаток кассы */}
        <div className="p-3 sm:w-44 shrink-0">
          <div className="flex items-center gap-1.5 mb-2">
            <Wallet className="w-3 h-3 text-gray-400" />
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
              Касса
            </span>
          </div>
          <div className="space-y-1.5">
            {cashEntries.map(([shop, bal]) => (
              <div key={shop} className="flex justify-between items-baseline text-[11px]">
                <span className="text-gray-500 dark:text-gray-400 truncate mr-2">
                  {shop}
                </span>
                <span className="font-medium text-gray-800 dark:text-gray-200 shrink-0">
                  {fmtCash(bal)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between text-[10px]">
            <span className="text-gray-400">Сеть</span>
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {fmtCash(data.totalCash)}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

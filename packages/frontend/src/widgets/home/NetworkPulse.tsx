import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Building2, Clock } from "lucide-react";

// ── types ──

interface ShopRow {
  uuid: string;
  name: string;
  revenue: number;
  checks: number;
  vapePlan: number;
  vapeFact: number;
  vapePct: number;
  openedAt: string | null;
  isLate: boolean;
}

interface NetworkPulseData {
  shops: ShopRow[];
  totalRevenue: number;
  totalChecks: number;
}

// ── fetch ──

async function fetchNetworkPulse(): Promise<NetworkPulseData> {
  const today = new Date().toISOString().slice(0, 10);

  const [summaryRes, planRes, sessionsRes] = await Promise.all([
    fetch("/api/ai/director/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today }),
    }).then((r) => r.json()),
    fetch("/api/evotor/plan-for-today").then((r) => r.json()),
    fetch("/api/stores/pos-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today }),
    }).then((r) => r.json()),
  ]);

  const sessions = sessionsRes?.sessions ?? [];
  const shops = (planRes?.shops ?? []).map((shop: any) => {
    const session = sessions.find(
      (s: any) => s.shopUuid === shop.shopUuid || s.shopName === shop.shopName
    );
    const vapePct =
      shop.dailyPlan > 0
        ? Math.min(Math.round((shop.vapeFact / shop.dailyPlan) * 100), 100)
        : 0;
    return {
      uuid: shop.shopUuid,
      name: shop.shopName,
      revenue: shop.vapeFact ?? 0, // rough — заменю на реальную выручку
      checks: 0,
      vapePlan: shop.dailyPlan ?? 0,
      vapeFact: shop.vapeFact ?? 0,
      vapePct,
      openedAt: session?.openedAt ?? null,
      isLate: session?.isLate ?? false,
    };
  });

  // Merge real revenue from summary
  // (summary doesn't give per-shop breakdown in this endpoint)
  const totalRevenue = shops.reduce((s: number, sh: ShopRow) => s + sh.revenue, 0);

  return { shops, totalRevenue, totalChecks: 0 };
}

// ── hook ──

function useNetworkPulse() {
  return useQuery({
    queryKey: ["network-pulse"],
    queryFn: fetchNetworkPulse,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

// ── helpers ──

function fmtRub(n: number): string {
  if (n >= 1000) {
    const k = Math.round(n / 1000);
    return `${k}K ₽`;
  }
  return `${Math.round(n)} ₽`;
}

// ── component ──

export function NetworkPulse() {
  const { data, isLoading } = useNetworkPulse();

  if (isLoading || !data) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 animate-pulse">
        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-8 bg-gray-100 dark:bg-gray-750 rounded-lg mb-2"
          />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
    >
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-750 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        <Building2 className="w-3.5 h-3.5" />
        Сеть сегодня
      </div>

      <div className="p-3 space-y-1">
        {data.shops.map((shop) => (
          <div
            key={shop.uuid}
            className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
          >
            {/* Status dot */}
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                shop.openedAt
                  ? shop.isLate
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                  : "bg-red-500"
              }`}
            />

            {/* Name + time */}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">
                {shop.name}
              </div>
              <div className="text-[10px] text-gray-400">
                {shop.openedAt
                  ? `${shop.openedAt}${shop.isLate ? " ⚠️" : ""}`
                  : "Не открыт"}
              </div>
            </div>

            {/* Revenue */}
            <div className="text-right shrink-0">
              <div className="text-xs font-bold text-gray-800 dark:text-gray-100">
                {fmtRub(shop.revenue)}
              </div>
              <div className="text-[10px] text-gray-400">вейпы</div>
            </div>

            {/* Plan progress bar */}
            <div className="w-16 shrink-0">
              <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    shop.vapePct >= 80
                      ? "bg-emerald-500"
                      : shop.vapePct >= 50
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${shop.vapePct}%` }}
                />
              </div>
              <div className="text-[9px] text-gray-400 text-right mt-0.5">
                {shop.vapePct}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
        <span>Итого вейпы: {fmtRub(data.totalRevenue)}</span>
        <span>{data.shops.length} магазина</span>
      </div>
    </motion.div>
  );
}

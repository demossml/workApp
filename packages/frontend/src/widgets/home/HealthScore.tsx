import { useMemo } from "react";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { useGetReportAndPlan } from "@/hooks/useReportData";
import { useWorkingByShops } from "@/hooks/useApi";
import { useStockHealth } from "@/hooks/dashboard/useStockHealth";
import { buildPlanCards, getRenderShopNames } from "@features/dashboard/model/planStatusModel";
import { useGetShopNames } from "@/hooks/useGetShopNames";

// ====== Skeleton ======

function ScoreSkeleton() {
  return (
    <div className="mb-4 animate-pulse">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-2 w-40 bg-gray-100 dark:bg-gray-600 rounded" />
        </div>
      </div>
    </div>
  );
}

// ====== Helpers ======

function scoreColor(s: number): { ring: string; text: string; bg: string } {
  if (s >= 80) return { ring: "text-emerald-500", text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/20" };
  if (s >= 50) return { ring: "text-amber-500", text: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/20" };
  return { ring: "text-red-500", text: "text-red-700 dark:text-red-300", bg: "bg-red-50 dark:bg-red-950/20" };
}

function scoreLabel(s: number): string {
  if (s >= 80) return "Отлично";
  if (s >= 50) return "Есть риски";
  return "Проблемы";
}

// ====== Main widget ======

export function HealthScore() {
  const { data: shopNames = [] } = useGetShopNames();
  const { data: reportData } = useGetReportAndPlan(true);
  const { data: stockData } = useStockHealth(14);
  const { data: workingData } = useWorkingByShops();

  const score = useMemo(() => {
    const parts: { name: string; value: number; weight: number }[] = [];
    let totalWeight = 0;
    let weightedSum = 0;

    // 1. Plan fulfillment (40%)
    const planData = (reportData?.planData || {}) as Record<string, any>;
    const renderNames = getRenderShopNames(shopNames, planData);
    if (renderNames.length > 0) {
      const cards = buildPlanCards(renderNames, planData);
      const avgProgress = cards.reduce((s, c) => s + Math.min(c.progress, 100), 0) / cards.length;
      parts.push({ name: "План", value: avgProgress, weight: 40 });
    }

    // 2. Store openings (20%) — check opened flag, not just employeeName
    const byShop = (workingData as any)?.byShop as Record<string, { opened?: boolean; employeeName?: string }> | undefined;
    if (byShop && renderNames && renderNames.length > 0) {
      const opened = renderNames.filter(name => byShop[name]?.opened || byShop[name]?.employeeName).length;
      const pct = (opened / renderNames.length) * 100;
      parts.push({ name: "Открытия", value: pct, weight: 20 });
    }

    // 3. Stock health (20%) — uses backend-computed stockScore
    if (stockData && stockData.stockScore !== undefined) {
      parts.push({ name: "Стоки", value: stockData.stockScore, weight: 20 });
    }

    // 4. Revenue trend — use plan progress as proxy (20%)
    if (parts.length > 0) {
      const planVal = parts.find(p => p.name === "План")?.value ?? 50;
      parts.push({ name: "Выручка", value: planVal, weight: 20 });
    }

    for (const p of parts) {
      totalWeight += p.weight;
      weightedSum += p.value * p.weight;
    }

    return {
      score: totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0,
      parts,
    };
  }, [reportData, shopNames, stockData, workingData]);

  if (!reportData && !stockData) return <ScoreSkeleton />;

  const { score: s } = score;
  const colors = scoreColor(s);
  const label = scoreLabel(s);

  // SVG circle: radius 28, circumference 175.9
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (s / 100) * circ;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mb-4"
    >
      <div className={`rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-4 ${colors.bg}`}>
        {/* Score circle */}
        <div className="relative w-16 h-16 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
            <circle
              cx="32" cy="32" r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              className="text-gray-200 dark:text-gray-700"
            />
            <circle
              cx="32" cy="32" r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              className={colors.ring}
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-bold ${colors.ring}`}>{s}</span>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${colors.ring}`} />
            <span className={`text-sm font-bold ${colors.text}`}>
              Health Score · {label}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {score.parts.map(p => (
              <span key={p.name} className="text-[10px] text-gray-500 dark:text-gray-400">
                {p.name} {Math.round(p.value)}%
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

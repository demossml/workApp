import { useMemo } from "react";
import { motion } from "framer-motion";
import { Trophy, TrendingUp, Zap } from "lucide-react";
import { useSellerEffectiveness } from "@/hooks/dashboard/useSellerEffectiveness";

// ====== Skeleton ======

function SotdSkeleton() {
  return (
    <div className="mb-4 animate-pulse">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-2 w-24 bg-gray-100 dark:bg-gray-600 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ====== Main widget ======

export function SellerOfTheDay() {
  const { data, isLoading } = useSellerEffectiveness({ period: 1 });

  const seller = useMemo(() => {
    if (!data?.sellers?.length) return null;
    const active = data.sellers.filter(s => s.daysWorked >= 1);
    if (active.length === 0) return null;

    // Score: deltaRank improvement + avgCheck above target
    const scored = active.map(s => {
      const checkScore = s.targetAvgCheck > 0
        ? Math.min(s.avgCheck / s.targetAvgCheck, 2) * 50
        : 0;
      const trendScore = s.trendSlope > 0 ? Math.min(s.trendSlope / 100, 50) : 0;
      return { ...s, totalScore: checkScore + trendScore };
    });

    scored.sort((a, b) => b.totalScore - a.totalScore);
    return scored[0];
  }, [data]);

  if (isLoading) return <SotdSkeleton />;
  if (!seller) return null;

  const highlight =
    seller.avgCheck >= seller.targetAvgCheck
      ? `Чек ${seller.avgCheck} ₽ — выше цели`
      : seller.trendSlope > 0
        ? `Тренд +${seller.trendSlope} ₽/день`
        : `Место #${seller.rank} в сети`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4"
    >
      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 rounded-xl shadow-sm border border-amber-200 dark:border-amber-800 p-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center shrink-0 shadow">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                Продавец дня
              </span>
              <Zap className="w-3 h-3 text-amber-400" />
            </div>
            <div className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
              {seller.name.split(" ")[0]}
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              {highlight}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
              #{seller.rank}
            </div>
            <div className="text-[9px] text-gray-400">место</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

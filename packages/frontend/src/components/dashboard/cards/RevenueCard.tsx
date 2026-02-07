// components/cards/RevenueCard.tsx
import { motion } from "framer-motion";
import { formatCurrency } from "../../../utils/formatCurrency";
import { DollarSign, TrendingUp } from "lucide-react";

interface RevenueCardProps {
  value: number;
  percentPlan?: number;
  onClick?: () => void;
}

export function RevenueCard({ value, percentPlan, onClick }: RevenueCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 text-white p-4 shadow-lg relative overflow-hidden"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium opacity-90">Выручка</span>
        <DollarSign className="w-5 h-5 opacity-80" />
      </div>
      <div className="text-2xl font-bold">{formatCurrency(value)} ₽</div>
      <div className="text-xs opacity-75 mt-1 flex items-center gap-1">
        <TrendingUp className="w-3 h-3" />
        <span>
          {typeof percentPlan === "number"
            ? `${percentPlan}% от плана`
            : "70% от плана"}
        </span>
      </div>
      {/* Прогресс бар (условно 70% плана) */}
      <div className="absolute bottom-0 left-0 h-1 bg-white/30 w-full">
        <div className="h-full bg-white/60" style={{ width: "70%" }} />
      </div>
    </motion.div>
  );
}

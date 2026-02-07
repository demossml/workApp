// components/cards/BestShopCard.tsx
import { motion } from "framer-motion";
import { formatCurrency } from "../../../utils/formatCurrency";
import { Award } from "lucide-react";

interface BestShop {
  name: string;
  sales: number;
}

interface BestShopCardProps {
  shop: BestShop;
  onClick?: () => void;
}

export function BestShopCard({ shop, onClick }: BestShopCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 text-white p-4 shadow-lg relative overflow-hidden"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium opacity-90">Топ магазин</span>
        <Award className="w-5 h-5 opacity-80" />
      </div>
      <div className="text-lg font-bold truncate">{shop.name}</div>
      <div className="text-xs opacity-75 mt-1">
        {formatCurrency(shop.sales)} ₽
      </div>
    </motion.div>
  );
}

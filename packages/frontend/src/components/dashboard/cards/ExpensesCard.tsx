// components/cards/ExpensesCard.tsx
import { motion } from "framer-motion";
import { formatCurrency } from "../../../utils/formatCurrency";
import { ShoppingCart } from "lucide-react";

interface ExpensesCardProps {
  value: number;
  onClick?: () => void;
  label?: string;
  cashBalanceByShop?: Record<string, number>;
}

export function ExpensesCard({
  value: _value,
  onClick,
  label,
  cashBalanceByShop,
}: ExpensesCardProps) {
  const shopsWithCash = Object.entries(cashBalanceByShop || {})
    .sort(([, a], [, b]) => b - a);
  const previewShops = shopsWithCash.slice(0, 3);
  const hiddenCount = Math.max(0, shopsWithCash.length - previewShops.length);

  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 dark:from-orange-600 dark:to-orange-700 text-white p-4 shadow-lg relative overflow-hidden"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium opacity-90">
          {label ?? "Фин. отчет"}
        </span>
        <ShoppingCart className="w-5 h-5 opacity-80" />
      </div>
      <div className="mt-1 space-y-0.5 text-[11px] opacity-95">
        {previewShops.map(([shopName, amount]) => (
          <div key={shopName} className="flex justify-between">
            <span className="truncate pr-2">{shopName}</span>
            <span>{formatCurrency(amount)} ₽</span>
          </div>
        ))}
        {hiddenCount > 0 && (
          <div className="text-[10px] opacity-80">+ ещё {hiddenCount}</div>
        )}
        {previewShops.length === 0 && (
          <div className="text-[10px] opacity-80">Нет данных</div>
        )}
      </div>
    </motion.div>
  );
}

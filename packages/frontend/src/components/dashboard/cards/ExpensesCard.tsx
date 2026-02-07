// components/cards/ExpensesCard.tsx
import { motion } from "framer-motion";
import { formatCurrency } from "../../../utils/formatCurrency";
import { ShoppingCart } from "lucide-react";

interface ExpensesCardProps {
  value: number;
  onClick?: () => void;
  label?: string;
}

export function ExpensesCard({ value, onClick, label }: ExpensesCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 dark:from-orange-600 dark:to-orange-700 text-white p-4 shadow-lg relative overflow-hidden"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium opacity-90">
          {label ?? "Расходы"}
        </span>
        <ShoppingCart className="w-5 h-5 opacity-80" />
      </div>
      <div className="text-2xl font-bold">{formatCurrency(value)} ₽</div>
    </motion.div>
  );
}

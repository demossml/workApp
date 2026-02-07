import type React from "react";
import type { ProductData } from "../type";
import {
  BarChart3,
  Trophy,
  Medal,
  Package,
  Percent,
  Tags,
  ShoppingCart,
} from "lucide-react";
import { formatCurrency } from "../../../utils/formatCurrency";

interface TopProductsDetailsProps {
  topProducts: ProductData[];
}

export const TopProductsDetails: React.FC<TopProductsDetailsProps> = ({
  topProducts,
}) => {
  const top10 = topProducts.slice(0, 10);
  const maxRevenue = top10[0]?.netRevenue || 1;
  const totalRevenue = top10.reduce((s, p) => s + p.netRevenue, 0);
  const totalQuantity = top10.reduce((s, p) => s + p.netQuantity, 0);
  const avgPrice = totalQuantity > 0 ? totalRevenue / totalQuantity : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 mt-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
        🏆 Топ-10 продуктов по выручке
      </h3>
      <div className="flex items-center gap-2 mb-6 justify-center">
        <BarChart3 className="w-5 h-5 text-pink-500" />
        <h4 className="text-base font-bold text-gray-800 dark:text-gray-100">
          Рейтинг по выручке
        </h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {top10.map((product, index) => {
          const widthPercent = (product.netRevenue / maxRevenue) * 100;
          let rankIcon: JSX.Element;
          if (index === 0)
            rankIcon = (
              <Trophy className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            );
          else if (index === 1)
            rankIcon = (
              <Medal className="w-5 h-5 text-gray-400 fill-gray-400" />
            );
          else if (index === 2)
            rankIcon = (
              <Medal className="w-5 h-5 text-orange-400 fill-orange-400" />
            );
          else
            rankIcon = (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400">
                {index + 1}
              </span>
            );
          return (
            <div key={product.productName} className="group">
              <div className="flex items-center justify-between text-sm mb-2">
                <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                  <div className="flex-shrink-0 w-6 flex justify-center">
                    {rankIcon}
                  </div>
                  <div className="truncate">
                    <div
                      className="font-semibold text-gray-900 dark:text-white truncate"
                      title={product.productName}
                    >
                      {product.productName}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-gray-900 dark:text-white">
                    {formatCurrency(product.netRevenue)} ₽
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {product.netQuantity} шт
                  </div>
                </div>
              </div>
              <div className="relative h-2.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-pink-400 to-pink-600"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 mt-6">
        <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <Package className="w-5 h-5 text-blue-500 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {topProducts.length}
          </div>
          <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
            Всего товаров
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <Percent className="w-5 h-5 text-purple-500 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {(
              (totalRevenue /
                (topProducts.reduce((s, p) => s + p.netRevenue, 0) || 1)) *
              100
            ).toFixed(0)}
            %
          </div>
          <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
            Доля топ-10
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <Tags className="w-5 h-5 text-green-500 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {formatCurrency(avgPrice)}
          </div>
          <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
            Ср. цена
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <ShoppingCart className="w-5 h-5 text-orange-500 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {totalQuantity}
          </div>
          <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
            Продано шт
          </div>
        </div>
      </div>
    </div>
  );
};

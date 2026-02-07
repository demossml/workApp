import type React from "react";
import { formatCurrency } from "../../../utils/formatCurrency";

// ...existing code...

import {
  Store,
  Percent,
  TrendingUp,
  DollarSign,
  Trophy,
  Medal,
  BarChart3,
} from "lucide-react";

interface ShopData {
  name: string;
  netSales: number;
  checksCount: number;
}

interface BestShopDetailsProps {
  salesDataByShopName?: Record<
    string,
    {
      totalSell: number;
      refund: Record<string, number>;
      checksCount: number;
    }
  >;
  grandTotalSell?: number;
  grandTotalRefund?: number;
}

export const BestShopDetails: React.FC<BestShopDetailsProps> = ({
  salesDataByShopName = {},
  grandTotalSell = 0,
  grandTotalRefund = 0,
}) => {
  // Собираем топ-5 магазинов
  const shops: ShopData[] = Object.entries(salesDataByShopName).map(
    ([name, data]) => ({
      name,
      netSales:
        data.totalSell - Object.values(data.refund).reduce((a, b) => a + b, 0),
      checksCount: data.checksCount,
    })
  );
  const sortedShops = shops.sort((a, b) => b.netSales - a.netSales).slice(0, 5);
  const totalNetSales = grandTotalSell - grandTotalRefund;
  const maxSales = sortedShops[0]?.netSales || 1;
  const maxChecks = Math.max(...sortedShops.map((s) => s.checksCount));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 mt-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
        🏆 Топ-5 магазинов по выручке
      </h3>
      {/* Круговая диаграмма + Столбцы */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Круговая диаграмма доли выручки */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">
            📊 Распределение выручки
          </h4>
          <div className="mt-4 space-y-2">
            {sortedShops.map((shop, index) => {
              const colors = [
                "bg-yellow-400",
                "bg-gray-300",
                "bg-orange-400",
                "bg-purple-400",
                "bg-blue-400",
              ];
              const percentage =
                totalNetSales > 0 ? (shop.netSales / totalNetSales) * 100 : 0;
              return (
                <div
                  key={shop.name}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`w-3 h-3 rounded-sm ${colors[index]}`} />
                    <span className="text-gray-900 dark:text-white truncate">
                      {shop.name}
                    </span>
                  </div>
                  <span className="font-semibold text-gray-700 dark:text-gray-300 ml-2">
                    {percentage.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Анимированная столбчатая диаграмма */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-0">
          <div className="flex items-center gap-2 mb-4 justify-center">
            <BarChart3 className="w-5 h-5 text-purple-500" />
            <h4 className="text-base font-bold text-gray-800 dark:text-gray-100">
              Рейтинг по выручке
            </h4>
          </div>
          <div className="space-y-4">
            {sortedShops.map((shop, index) => {
              const widthPercent = (shop.netSales / maxSales) * 100;
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
                <div key={shop.name} className="group">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                      <div className="flex-shrink-0 w-6 flex justify-center">
                        {rankIcon}
                      </div>
                      <div className="truncate">
                        <div
                          className="font-semibold text-gray-900 dark:text-white truncate"
                          title={shop.name}
                        >
                          {shop.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-gray-900 dark:text-white">
                        {formatCurrency(shop.netSales)} ₽
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {totalNetSales > 0
                          ? ((shop.netSales / totalNetSales) * 100).toFixed(1)
                          : "0"}
                        %
                      </div>
                    </div>
                  </div>
                  <div className="relative h-2.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`absolute top-0 left-0 h-full rounded-full ${index === 0 ? "bg-gradient-to-r from-yellow-400 to-yellow-600" : index === 1 ? "bg-gradient-to-r from-gray-300 to-gray-500" : index === 2 ? "bg-gradient-to-r from-orange-300 to-orange-500" : "bg-gradient-to-r from-purple-500 to-blue-500"}`}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Многомерное сравнение метрик */}
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mt-6">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">
          🎯 Сравнение по метрикам
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Выручка */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 text-center mb-3">
              💰 Выручка
            </div>
            {sortedShops.map((shop, index) => {
              const percent = (shop.netSales / maxSales) * 100;
              const colors = [
                "bg-yellow-400",
                "bg-gray-300",
                "bg-orange-400",
                "bg-purple-400",
                "bg-blue-400",
              ];
              return (
                <div key={shop.name} className="flex items-center gap-2">
                  <div className="w-16 text-xs text-gray-600 dark:text-gray-400 truncate">
                    #{index + 1}
                  </div>
                  <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors[index]}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Средний чек */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 text-center mb-3">
              🎫 Средний чек
            </div>
            {sortedShops.map((shop, index) => {
              const avgCheck =
                shop.checksCount > 0 ? shop.netSales / shop.checksCount : 0;
              const maxAvgCheck = Math.max(
                ...sortedShops.map((s) =>
                  s.checksCount > 0 ? s.netSales / s.checksCount : 0
                )
              );
              const percent =
                maxAvgCheck > 0 ? (avgCheck / maxAvgCheck) * 100 : 0;
              const colors = [
                "bg-yellow-400",
                "bg-gray-300",
                "bg-orange-400",
                "bg-purple-400",
                "bg-blue-400",
              ];
              return (
                <div key={shop.name} className="flex items-center gap-2">
                  <div className="w-16 text-xs text-gray-600 dark:text-gray-400">
                    {formatCurrency(avgCheck)}
                  </div>
                  <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors[index]}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Количество чеков */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 text-center mb-3">
              📋 Кол-во чеков
            </div>
            {sortedShops.map((shop, index) => {
              const percent =
                maxChecks > 0 ? (shop.checksCount / maxChecks) * 100 : 0;
              const colors = [
                "bg-yellow-400",
                "bg-gray-300",
                "bg-orange-400",
                "bg-purple-400",
                "bg-blue-400",
              ];
              return (
                <div key={shop.name} className="flex items-center gap-2">
                  <div className="w-16 text-xs text-gray-600 dark:text-gray-400">
                    {shop.checksCount}
                  </div>
                  <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors[index]}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Компактная итоговая панель */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 mt-6">
        <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <Store className="w-5 h-5 text-blue-500 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {shops.length}
          </div>
          <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
            Магазинов
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <Percent className="w-5 h-5 text-purple-500 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {totalNetSales > 0
              ? (
                  (sortedShops.reduce((s, shop) => s + shop.netSales, 0) /
                    totalNetSales) *
                  100
                ).toFixed(0)
              : "0"}
            %
          </div>
          <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
            Топ-5 от сети
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <TrendingUp className="w-5 h-5 text-orange-500 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {formatCurrency(
              sortedShops.length >= 2
                ? sortedShops[0].netSales - sortedShops[1].netSales
                : 0
            )}
          </div>
          <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
            Разрыв 1-2
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <DollarSign className="w-5 h-5 text-green-500 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {formatCurrency(
              sortedShops.reduce((s, shop) => s + shop.netSales, 0) /
                sortedShops.reduce((s, shop) => s + shop.checksCount, 0)
            )}
          </div>
          <div className="text-[10px] uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400">
            Ср. чек топ-5
          </div>
        </div>
      </div>
    </div>
  );
};

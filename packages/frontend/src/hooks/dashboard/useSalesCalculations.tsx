// hooks/dashboard/useSalesCalculations.ts

import type { SalesData } from "../../components/dashboard/type";

export function useSalesCalculations(data: SalesData | null) {
  if (!data) {
    return {
      netSales: 0,
      averageCheck: 0,
      bestShop: null,
    };
  }

  const netSales = data.grandTotalSell - data.grandTotalRefund;

  const averageCheck = data.totalChecks > 0 ? netSales / data.totalChecks : 0;

  const bestShop = Object.entries(data.salesDataByShopName).reduce(
    (best, [name, shop]) =>
      !best || shop.totalSell > best.sales
        ? { name, sales: shop.totalSell }
        : best,
    null as { name: string; sales: number } | null
  );

  return { netSales, averageCheck, bestShop };
}

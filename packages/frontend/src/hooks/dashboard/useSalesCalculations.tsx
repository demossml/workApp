// hooks/dashboard/useSalesCalculations.ts

import type { SalesData } from "../../components/dashboard/type";
import { computeRevenueSummary } from "@work-appt/backend/src/contracts/revenueMath";

export function useSalesCalculations(data: SalesData | null) {
  if (!data) {
    return {
      netSales: 0,
      averageCheck: 0,
      bestShop: null,
    };
  }

  const { netRevenue: netSales, averageCheck } = computeRevenueSummary(
    data.grandTotalSell,
    data.grandTotalRefund,
    data.totalChecks
  );

  const bestShop = Object.entries(data.salesDataByShopName).reduce(
    (best, [name, shop]) =>
      !best || shop.totalSell > best.sales
        ? { name, sales: shop.totalSell }
        : best,
    null as { name: string; sales: number } | null
  );

  return { netSales, averageCheck, bestShop };
}

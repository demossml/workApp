import { useMemo } from "react";
import type { SalesData } from "../../components/dashboard/type";

export function useFilteredSalesData(
  data: SalesData | null,
  isSuperAdmin: boolean,
  currentWorkShop: { name?: string; isWorkingToday?: boolean } | null
) {
  return useMemo<SalesData | null>(() => {
    if (!data || isSuperAdmin) return data;

    const shopName = currentWorkShop?.name;
    if (!shopName) return data;

    const shopData = data.salesDataByShopName[shopName];
    if (!shopData) return null;

    return {
      salesDataByShopName: { [shopName]: shopData },
      grandTotalSell: shopData.totalSell,
      grandTotalRefund: Object.values(shopData.refund).reduce(
        (a, b) => a + b,
        0
      ),
      grandTotalCashOutcome: Object.values(
        data.cashOutcomeData[shopName] || {}
      ).reduce((a, b) => a + b, 0),
      cashOutcomeData: {
        [shopName]: data.cashOutcomeData[shopName] || {},
      },
      totalChecks: shopData.checksCount,
      topProducts: data.topProducts ?? [],
    };
  }, [data, isSuperAdmin, currentWorkShop]);
}

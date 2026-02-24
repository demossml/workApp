import { useQuery } from "@tanstack/react-query";
import { client } from "../helpers/api";

// ---------- Типы ----------
type PaymentData = {
  sell: Record<string, number>;
  refund: Record<string, number>;
  totalSell: number;
};

type TopProduct = {
  productName: string;
  revenue: number;
  quantity: number;
  refundRevenue: number;
  refundQuantity: number;
  netRevenue: number;
  netQuantity: number;
  averagePrice: number;
  refundRate: number;
};

type ReportData = {
  salesDataByShopName: Record<string, PaymentData>;
  grandTotalSell: number;
  grandTotalRefund: number;
  grandTotalCashOutcome: number;
  cashOutcomeData: Record<string, Record<string, number>>;
  totalChecks: number;
  topProducts: TopProduct[];
};

export const useGetReportAndPlan = (enabled: boolean) =>
  useQuery({
    queryKey: ["reportAndPlan"],
    queryFn: async () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const reportRes = await client.api.evotor.financial.$get({
        query: {
          since: dateStr,
          until: dateStr,
        },
      });

      const planRes = await client.api.evotor["plan-for-today"].$get();

      if (!reportRes.ok) {
        const err = await reportRes.json().catch(() => null);
        if (err && typeof err === "object" && "error" in err) {
          throw new Error(err.error || "Ошибка загрузки отчёта");
        }
        throw new Error("Ошибка загрузки отчёта");
      }

      if (!planRes.ok) {
        throw new Error("Ошибка загрузки плана");
      }

      const reportData: ReportData = await reportRes.json();
      const planJson = await planRes.json();

      return {
        reportData,
        planData: planJson?.salesData ?? {},
      };
    },
    enabled,
    retry: 2,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

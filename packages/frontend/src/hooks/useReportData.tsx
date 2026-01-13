import { useQuery } from "@tanstack/react-query";

// ---------- Типы ----------
type PaymentData = {
  sell: Record<string, number>;
  refund: Record<string, number>;
  totalSell: number;
};

type ReportData = {
  salesDataByShopName: Record<string, PaymentData>;
  grandTotalSell: number;
  grandTotaRefund: number;
  grandTotaCashOutcome: number;
  cashOutcomeData: Record<string, Record<string, number>>;
};

export const useGetReportAndPlan = (enabled: boolean) =>
  useQuery({
    queryKey: ["reportAndPlan"],
    queryFn: async () => {
      const [reportRes, planRes] = await Promise.all([
        fetch("/api/evotor/report/financial/today"),
        fetch("/api/evotor/plan-for-today"),
      ]);

      if (!reportRes.ok) throw new Error("Ошибка загрузки отчёта");
      if (!planRes.ok) throw new Error("Ошибка загрузки плана");

      const reportData: ReportData = await reportRes.json();
      const planJson = await planRes.json();

      return {
        reportData,
        planData: planJson.salesData || {},
      };
    },
    enabled,
    retry: 2,
    refetchInterval: 60_000, // обновлять данные каждые 60 секунд
    refetchOnWindowFocus: true, // при возврате фокуса окна
    refetchOnReconnect: true, // при восстановлении соединения
  });

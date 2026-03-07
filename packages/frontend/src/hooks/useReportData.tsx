import { useQuery } from "@tanstack/react-query";
import { client } from "../helpers/api";
import {
  FinancialMetricsResponseSchema,
  type FinancialMetricsResponse,
} from "@work-appt/backend/src/contracts/financialMetrics";
import { PlanForTodayResponseSchema } from "@work-appt/backend/src/contracts/planMetrics";

// ---------- Типы ----------
type ReportData = FinancialMetricsResponse;

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

      const rawReportData = await reportRes.json();
      const parsedReport = FinancialMetricsResponseSchema.safeParse(rawReportData);
      if (!parsedReport.success) {
        throw new Error("Некорректный формат финансового отчёта");
      }
      const reportData: ReportData = parsedReport.data;
      const rawPlanData = await planRes.json();
      const parsedPlan = PlanForTodayResponseSchema.safeParse(rawPlanData);
      if (!parsedPlan.success) {
        throw new Error("Некорректный формат плана на сегодня");
      }

      return {
        reportData,
        planData: parsedPlan.data.salesData ?? {},
      };
    },
    enabled,
    retry: 2,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

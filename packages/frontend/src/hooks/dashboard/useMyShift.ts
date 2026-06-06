import { useQuery } from "@tanstack/react-query";
import { client } from "@/helpers/api";

/** Данные смены для продавца — из /director/summary + /plan-for-today */
export interface MyShiftData {
  date: string;
  /** Сегодняшняя выручка */
  revenue: number;
  /** Количество чеков */
  checks: number;
  /** Средний чек */
  avgCheck: number;
  /** Вчерашняя выручка (для сравнения) */
  yesterdayRevenue: number;
  /** Выручка неделю назад */
  weekAgoRevenue: number;
  /** Средняя выручка за 7 дней */
  avgRevenue: number;
  /** План по вейпам на сегодня */
  vapePlan: number;
  /** Факт по вейпам сегодня */
  vapeFact: number;
  /** Статус смены */
  shiftOpen: boolean;
  shiftOpenTime: string | null;
  shiftShopName: string | null;
}

async function fetchMyShift(): Promise<MyShiftData> {
  const today = new Date().toISOString().slice(0, 10);

  const [summaryRes, planRes] = await Promise.all([
    client.api.ai["director/summary"].$post({ json: { date: today } }),
    client.api.evotor["plan-for-today"].$get(),
  ]);

  const summary = await summaryRes.json();
  const plan = await planRes.json();

  const todayMetrics = summary?.periods?.today?.metrics ?? {};
  const yesterdayMetrics = summary?.periods?.yesterday?.metrics ?? {};
  const weekAgoMetrics = summary?.periods?.weekAgo?.metrics ?? {};
  const avgMetrics = summary?.periods?.avg?.metrics ?? {};

  // Plan data
  const vapePlanTotal =
    plan?.shops?.reduce((sum: number, s: any) => sum + (s.dailyPlan ?? 0), 0) ?? 0;
  const vapeFactTotal =
    plan?.shops?.reduce((sum: number, s: any) => sum + (s.vapeFact ?? 0), 0) ?? 0;

  // Shift status from plan shops (first open shop)
  const openShop = plan?.shops?.find((s: any) => s.openedAt);
  
  return {
    date: today,
    revenue: todayMetrics.revenue ?? 0,
    checks: todayMetrics.checks ?? 0,
    avgCheck: todayMetrics.averageCheck ?? 0,
    yesterdayRevenue: yesterdayMetrics.revenue ?? 0,
    weekAgoRevenue: weekAgoMetrics.revenue ?? 0,
    avgRevenue: avgMetrics.revenue ?? 0,
    vapePlan: vapePlanTotal,
    vapeFact: vapeFactTotal,
    shiftOpen: !!openShop?.openedAt,
    shiftOpenTime: openShop?.openedAt
      ? new Date(openShop.openedAt).toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null,
    shiftShopName: openShop?.shopName ?? null,
  };
}

export function useMyShift() {
  return useQuery({
    queryKey: ["my-shift"],
    queryFn: fetchMyShift,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

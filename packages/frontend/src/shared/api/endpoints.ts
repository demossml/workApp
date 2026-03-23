import { WorkingByShopsResponseSchema } from "@work-appt/backend/src/contracts/workingByShops";
import {
  FinancialMetricsResponseSchema,
  type FinancialMetricsResponse,
} from "@work-appt/backend/src/contracts/financialMetrics";
import { PlanForTodayResponseSchema } from "@work-appt/backend/src/contracts/planMetrics";
import { client } from "./client";

type ShopBrief = { uuid: string; name: string };

export async function fetchMe() {
  const res = await client.api.employees.user.$get();
  return res.json();
}

export async function fetchEmployeeRole() {
  const res = await client.api.employees["employee-role"].$get();
  return res.json();
}

export async function fetchEmployeeNameAndUuid() {
  const res = await client.api.employees["by-last-name-uuid"].$get();
  return res.json();
}

export async function fetchSchedules() {
  const res = await client.api.schedules.schedule.$get();
  return res.json();
}

export async function fetchWorkingByShops() {
  const res = await (client.api.evotor as any)["working-by-shops"].$get();
  if (!res.ok) {
    throw new Error("Ошибка загрузки данных по сменам");
  }
  const raw = await res.json();
  const parsed = WorkingByShopsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Некорректный формат данных по сменам");
  }
  return parsed.data;
}

export async function fetchShops() {
  const res = await client.api.stores.shops.$get();
  const data = await res.json();
  return data as { shopsNameAndUuid: ShopBrief[] };
}

export async function fetchShopNames() {
  const res = await client.api.stores["shops-names"].$get();
  if (!res.ok) {
    throw new Error("Ошибка загрузки названий магазинов");
  }
  const data = await res.json();
  return (data.shopsName || []) as string[];
}

function getTodayDateString() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function fetchFinancialForToday(): Promise<FinancialMetricsResponse> {
  const dateStr = getTodayDateString();
  const res = await client.api.evotor.financial.$get({
    query: {
      since: dateStr,
      until: dateStr,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    if (err && typeof err === "object" && "error" in err) {
      throw new Error((err as { error?: string }).error || "Ошибка загрузки отчёта");
    }
    throw new Error("Ошибка загрузки отчёта");
  }

  const raw = await res.json();
  const parsed = FinancialMetricsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Некорректный формат финансового отчёта");
  }
  return parsed.data;
}

export async function fetchPlanForToday() {
  const res = await client.api.evotor["plan-for-today"].$get();
  if (!res.ok) {
    throw new Error("Ошибка загрузки плана");
  }
  const raw = await res.json();
  const parsed = PlanForTodayResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Некорректный формат плана на сегодня");
  }
  return parsed.data;
}

export async function fetchReportAndPlanForToday() {
  const [reportData, planData] = await Promise.all([
    fetchFinancialForToday(),
    fetchPlanForToday(),
  ]);

  return {
    reportData,
    planData: planData.salesData ?? {},
  };
}

export async function fetchEvotorShops(userId: string) {
  const response = await client.api.evotor.shops.$post({
    json: { userId },
  });
  if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
  return response.json() as Promise<{ shopOptions: Record<string, string> }>;
}

export async function fetchGroupsByShop(shopUuid: string) {
  const response = await client.api.evotor["groups-by-shop"].$post({
    json: { shopUuid },
  });
  if (!response.ok) {
    throw new Error(`Ошибка загрузки групп: ${response.status}`);
  }
  const data = await response.json();
  return data as {
    groups?: Array<{ name: string; uuid: string }>;
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export async function fetchOrderForecast(params: {
  startDate: string;
  endDate: string;
  shopUuid: string;
  groups: string[];
  period: number;
  userId: string;
}) {
  const response = await client.api.evotor.order.$post({
    json: params,
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const message =
      (typeof err?.error === "string" ? err.error : undefined) ||
      (typeof err?.message === "string" ? err.message : undefined) ||
      `Ошибка: ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

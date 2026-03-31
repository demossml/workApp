import { WorkingByShopsResponseSchema } from "@work-appt/backend/src/contracts/workingByShops";
import {
  FinancialMetricsResponseSchema,
  type FinancialMetricsResponse,
} from "@work-appt/backend/src/contracts/financialMetrics";
import {
  CurrentWorkShopResponseSchema,
  type CurrentWorkShopResponse,
} from "@work-appt/backend/src/contracts/currentWorkShop";
import { OpenTimesResponseSchema } from "@work-appt/backend/src/contracts/openTimes";
import { PlanForTodayResponseSchema } from "@work-appt/backend/src/contracts/planMetrics";
import { client } from "./client";
import {
  useDataSourceStore,
  type DataSource,
  type DataSourceMeta,
} from "@shared/model/dataSourceStore";

type ShopBrief = { uuid: string; name: string };

function applyDataSourceMeta(meta: DataSourceMeta | null | undefined) {
  if (!meta) return;
  if (meta.source !== "DB" && meta.source !== "ELVATOR") return;
  useDataSourceStore.getState().setMeta(meta);
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      throw new Error(
        (err as { error?: string }).error || "Ошибка загрузки отчёта"
      );
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

export async function fetchCurrentWorkShop(): Promise<CurrentWorkShopResponse> {
  const res = await client.api.evotor["current-work-shop"].$get();
  if (!res.ok) {
    throw new Error("Ошибка загрузки данных о текущем магазине");
  }
  const raw = await res.json();
  const parsed = CurrentWorkShopResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Некорректный формат данных текущего магазина");
  }
  return parsed.data;
}

export async function fetchOpenTimes() {
  const res = await client.api.schedules.schedule.$get();
  if (!res.ok) {
    throw new Error("Ошибка загрузки времени открытия магазинов");
  }
  const raw = await res.json();
  const parsed = OpenTimesResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Некорректный формат времени открытия магазинов");
  }
  return parsed.data.dataReport || {};
}

export async function fetchSalesTodayGraph() {
  const res = await client.api.evotor["sales-today-graf"].$get();
  if (!res.ok) {
    throw new Error("Ошибка загрузки данных графика");
  }
  return res.json();
}

export async function fetchFinancialMetrics(params?: {
  since?: string;
  until?: string;
  shopUuid?: string;
}) {
  let res: Response;

  if (params?.since && params?.until) {
    const query: { since: string; until: string; shopUuid?: string } = {
      since: params.since,
      until: params.until,
    };
    if (params.shopUuid) {
      query.shopUuid = params.shopUuid;
    }
    res = await client.api.evotor.financial.$get({ query });
  } else {
    const query = params?.shopUuid ? { shopUuid: params.shopUuid } : {};
    res = await client.api.evotor.financial.today.$get({ query });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || err?.message || "Ошибка загрузки данных");
  }

  const rawJson = await res.json();
  const parsed = FinancialMetricsResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    throw new Error("Некорректный формат финансовых данных");
  }
  return parsed.data;
}

export async function fetchDataMode() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client.api.admin as any)["data-mode"].$get();
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(
      (err as { message?: string } | null)?.message ||
        "Ошибка загрузки режима данных"
    );
  }
  const data = (await response.json()) as {
    mode: DataSource;
    meta?: DataSourceMeta;
  };
  applyDataSourceMeta(data.meta ?? null);
  return data;
}

export async function updateDataMode(mode: DataSource) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client.api.admin as any)["data-mode"].$post({
    json: { mode },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(
      (err as { message?: string } | null)?.message ||
        "Ошибка смены режима данных"
    );
  }
  const data = (await response.json()) as {
    ok: boolean;
    mode: DataSource;
    meta?: DataSourceMeta;
  };
  console.log("updateDataMode response:", data);
  applyDataSourceMeta(data.meta ?? null);
  // Directly update store if meta not provided
  if (!data.meta && data.mode) {
    useDataSourceStore.getState().setMeta({
      source: data.mode,
      aiAvailable: data.mode === "DB",
    });
  }
  return data;
}

export async function fetchFinancialTodayForUser(params: {
  telegramId?: string;
  userId?: string;
}) {
  const res = await client.api.evotor.financial.today.$get({
    query: {
      telegramId: params.telegramId || "",
      userId: params.userId || "",
    },
  });

  const json = await res.json();
  if (!res.ok) {
    const err = json as { error?: string; message?: string } | null;
    throw new Error(err?.error || err?.message || "Ошибка загрузки данных");
  }
  return json;
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
    const err = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const message =
      (typeof err?.error === "string" ? err.error : undefined) ||
      (typeof err?.message === "string" ? err.message : undefined) ||
      `Ошибка: ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

export async function fetchOrderForecastV2(params: {
  startDate: string;
  endDate: string;
  shopUuid: string;
  groups: string[];
  forecastHorizonDays?: number;
  leadTimeDays?: number;
  serviceLevel?: 0.8 | 0.9 | 0.95 | 0.98;
  budgetLimit?: number;
}) {
  const response = await client.api.evotor["order-v2"].$post({
    json: params,
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const message =
      (typeof err?.error === "string" ? err.error : undefined) ||
      (typeof err?.message === "string" ? err.message : undefined) ||
      `Ошибка: ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

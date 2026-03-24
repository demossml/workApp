import { client } from "@shared/api";

const aiDirector = client.api.ai as any;

export type DeepAnalysisDepth = "lite" | "standard" | "deep";
export type DeepRiskSensitivity = "low" | "normal" | "high";
export type DeepFocusArea =
  | "revenue_trend"
  | "avg_check"
  | "refunds"
  | "traffic"
  | "peer_comparison"
  | "stability";

export async function fetchAiDirectorDashboard(params: {
  date: string;
  deepAnalysisDepth: DeepAnalysisDepth;
  deepRiskSensitivity: DeepRiskSensitivity;
  deepFocusAreas: DeepFocusArea[];
  shiftHistoryShopFilter?: string;
  shiftHistoryDateFilter?: string;
  alertsHistoryShopFilter?: string;
  alertsHistoryTypeFilter?: "all" | "tempo_alert" | "anomaly" | "dead_stock";
  alertsHistoryDateFilter?: string;
}) {
  const dashboardRes = await aiDirector["director/dashboard"].$post({
    json: {
      date: params.date,
      deepAnalysisDepth: params.deepAnalysisDepth,
      deepRiskSensitivity: params.deepRiskSensitivity,
      deepFocusAreas: params.deepFocusAreas,
      shiftHistoryShopUuid:
        params.shiftHistoryShopFilter && params.shiftHistoryShopFilter !== "all"
          ? params.shiftHistoryShopFilter
          : undefined,
      shiftHistoryDate: params.shiftHistoryDateFilter || undefined,
      alertHistoryShopUuid:
        params.alertsHistoryShopFilter && params.alertsHistoryShopFilter !== "all"
          ? params.alertsHistoryShopFilter
          : undefined,
      alertHistoryType:
        params.alertsHistoryTypeFilter && params.alertsHistoryTypeFilter !== "all"
          ? params.alertsHistoryTypeFilter
          : undefined,
      alertHistoryDate: params.alertsHistoryDateFilter || undefined,
      historyLimit: 50,
    },
  });

  if (!dashboardRes.ok) throw new Error("Не удалось загрузить AI dashboard");

  const dashboardJson = await dashboardRes.json();
  const heatmap = dashboardJson.heatmap as {
    cells: Array<{ shopId: string; dayOfWeek: number; hour: number; revenue: number; checks: number }>;
    matrix: number[][];
    maxRevenue: number;
    dayLabels: string[];
    stops: number[];
  };

  return {
    rating: dashboardJson.rating,
    employees: dashboardJson.employees,
    deepEmployees: dashboardJson.deepEmployees,
    deepMeta: {
      analysisDepth: dashboardJson.deepMeta.analysisDepth,
      historyDays: dashboardJson.deepMeta.historyDays,
      warning: dashboardJson.deepMeta.warning,
      comparisonCoverage: dashboardJson.deepMeta.comparisonCoverage || undefined,
    } as {
      analysisDepth: DeepAnalysisDepth;
      historyDays: number;
      warning: string | null;
      comparisonCoverage?: {
        totalEmployees: number;
        comparableEmployees: number;
      };
    },
    forecast: {
      forecast: dashboardJson.forecast.forecast,
      weather: dashboardJson.forecast.weather || null,
      weatherFactor: dashboardJson.forecast.weatherFactor,
      warning: dashboardJson.forecast.warning,
      historySource: dashboardJson.forecast.historySource,
    } as {
      forecast: number;
      weather?: {
        avgTemp: number;
        minTemp: number;
        maxTemp: number;
        precipSum: number;
        timezone: string;
      } | null;
      weatherFactor?: number;
      warning?: string | null;
      historySource?: "receipts" | "index";
    },
    heatmap,
    shiftSummariesHistory: dashboardJson.shiftHistory.items,
    shiftHistoryShopOptions: dashboardJson.shiftHistory.shopOptions,
    alertsHistory: dashboardJson.alertsHistory.items,
    alertsHistoryShopOptions: dashboardJson.alertsHistory.shopOptions,
    uiSummary: dashboardJson.uiSummary,
  };
}

export async function fetchKpiNarrative(params: {
  shopUuid: string;
  startDate: string;
  endDate: string;
}) {
  const kpiRes = await aiDirector["employee-shift-kpi"].$post({
    json: params,
  });
  if (!kpiRes.ok) throw new Error("Не удалось получить KPI narrative");
  const kpiJson = await kpiRes.json();
  return {
    narrative: typeof kpiJson.narrative === "string" ? kpiJson.narrative : null,
    sections: {
      strengths: Array.isArray(kpiJson?.narrativeSections?.strengths)
        ? kpiJson.narrativeSections.strengths
        : [],
      growth: Array.isArray(kpiJson?.narrativeSections?.growth)
        ? kpiJson.narrativeSections.growth
        : [],
      actions: Array.isArray(kpiJson?.narrativeSections?.actions)
        ? kpiJson.narrativeSections.actions
        : [],
      raw:
        typeof kpiJson?.narrativeSections?.raw === "string"
          ? kpiJson.narrativeSections.raw
          : "",
    },
  };
}

export async function tryFetchKpiNarrativeForTopShop(params: {
  topShopUuid: string;
  date: string;
}) {
  try {
    return await fetchKpiNarrative({
      shopUuid: params.topShopUuid,
      startDate: params.date,
      endDate: params.date,
    });
  } catch {
    return {
      narrative: null as string | null,
      sections: { strengths: [], growth: [], actions: [], raw: "" },
    };
  }
}

export async function sendAiDirectorChat(params: { message: string; date: string }) {
  const res = await aiDirector["director/chat"].$post({
    json: params,
  });
  if (!res.ok) throw new Error("Не удалось получить ответ");
  const data = await res.json();
  return typeof data.reply === "string" ? data.reply : "";
}

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
}) {
  const [
    ratingRes,
    employeesRes,
    deepEmployeesRes,
    forecastRes,
    heatmapRes,
    shiftSummariesRes,
    alertsHistoryRes,
  ] = await Promise.all([
    aiDirector["director/store-rating"].$post({ json: { date: params.date } }),
    aiDirector["director/employee-analysis"].$post({
      json: { until: params.date },
    }),
    aiDirector["director/employee-deep-analysis"].$post({
      json: {
        until: params.date,
        limit: 20,
        analysisDepth: params.deepAnalysisDepth,
        riskSensitivity: params.deepRiskSensitivity,
        focusAreas: params.deepFocusAreas,
      },
    }),
    aiDirector["director/demand-forecast"].$post({ json: { date: params.date } }),
    aiDirector["director/heatmap"].$post({ json: {} }),
    aiDirector.history["shift-summaries"].$get({
      query: { limit: "20" },
    }),
    aiDirector.history.alerts.$get({
      query: { limit: "20" },
    }),
  ]);

  if (!ratingRes.ok) throw new Error("Не удалось загрузить рейтинг");
  if (!employeesRes.ok) throw new Error("Не удалось загрузить сотрудников");
  if (!deepEmployeesRes.ok) throw new Error("Не удалось загрузить глубокий анализ сотрудников");
  if (!forecastRes.ok) throw new Error("Не удалось загрузить прогноз");
  if (!heatmapRes.ok) throw new Error("Не удалось загрузить heatmap");
  if (!shiftSummariesRes.ok) throw new Error("Не удалось загрузить историю итогов смен");
  if (!alertsHistoryRes.ok) throw new Error("Не удалось загрузить историю алертов");

  const ratingJson = await ratingRes.json();
  const employeesJson = await employeesRes.json();
  const deepEmployeesJson = await deepEmployeesRes.json();
  const forecastJson = await forecastRes.json();
  const heatmapJson = await heatmapRes.json();
  const shiftSummariesJson = await shiftSummariesRes.json();
  const alertsHistoryJson = await alertsHistoryRes.json();

  return {
    rating: ratingJson.rating || [],
    employees: employeesJson.employees || [],
    deepEmployees: deepEmployeesJson.employees || [],
    deepMeta: {
      analysisDepth:
        deepEmployeesJson.analysisDepth === "lite" || deepEmployeesJson.analysisDepth === "deep"
          ? deepEmployeesJson.analysisDepth
          : "standard",
      historyDays: Number(deepEmployeesJson.historyDays || 0),
      warning: typeof deepEmployeesJson.warning === "string" ? deepEmployeesJson.warning : null,
      comparisonCoverage: deepEmployeesJson.comparisonCoverage || undefined,
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
      forecast: Number(forecastJson.forecast || 0),
      weather: forecastJson.weather || null,
      weatherFactor:
        typeof forecastJson.weatherFactor === "number" ? forecastJson.weatherFactor : undefined,
      warning: typeof forecastJson.warning === "string" ? forecastJson.warning : null,
      historySource: forecastJson.historySource === "index" ? "index" : "receipts",
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
    heatmapRows: heatmapJson.rows || [],
    shiftSummariesHistory: shiftSummariesJson.items || [],
    alertsHistory: alertsHistoryJson.items || [],
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
  return typeof kpiJson.narrative === "string" ? kpiJson.narrative : null;
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
    return null;
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

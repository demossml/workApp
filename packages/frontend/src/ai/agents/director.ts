import {
  fetchAiDirectorDashboard,
  fetchKpiNarrative,
  sendAiDirectorChat,
  tryFetchKpiNarrativeForTopShop,
  type DeepAnalysisDepth,
  type DeepFocusArea,
  type DeepRiskSensitivity,
} from "@features/ai/api";
import { DIRECTOR_SYSTEM_PROMPT } from "@ai/prompts/directorPrompts";
import { setDirectorChatPair, setDirectorDashboardTimestamp } from "@ai/memory/directorMemory";

export type { DeepAnalysisDepth, DeepFocusArea, DeepRiskSensitivity };

export async function loadDirectorDashboard(params: {
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
  const result = await fetchAiDirectorDashboard(params);
  setDirectorDashboardTimestamp(new Date().toISOString());
  return result;
}

export async function loadKpiNarrative(params: {
  shopUuid: string;
  startDate: string;
  endDate: string;
}) {
  return fetchKpiNarrative(params);
}

export async function loadTopShopKpiNarrative(params: {
  topShopUuid: string;
  date: string;
}) {
  return tryFetchKpiNarrativeForTopShop(params);
}

export async function askDirector(params: { message: string; date: string }) {
  const enrichedMessage = `${DIRECTOR_SYSTEM_PROMPT}\n\nЗапрос: ${params.message}`;
  const reply = await sendAiDirectorChat({
    date: params.date,
    message: enrichedMessage,
  });

  setDirectorChatPair(params.message, reply);
  return reply;
}

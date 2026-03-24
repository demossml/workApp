import {
  askDirector,
  loadDirectorDashboard,
  loadKpiNarrative,
  loadTopShopKpiNarrative,
  type DeepAnalysisDepth,
  type DeepFocusArea,
  type DeepRiskSensitivity,
} from "@ai/agents/director";
import type { AiDirectorDashboardPayload } from "@features/ai/model/aiDirectorStore";

const EMPTY_NARRATIVE = {
  narrative: null as string | null,
  sections: { strengths: [], growth: [], actions: [], raw: "" },
};

export type DirectorDashboardPipelineInput = {
  date: string;
  deepAnalysisDepth: DeepAnalysisDepth;
  deepRiskSensitivity: DeepRiskSensitivity;
  deepFocusAreas: DeepFocusArea[];
  shiftHistoryShopFilter: string;
  shiftHistoryDateFilter: string;
  alertsHistoryShopFilter: string;
  alertsHistoryTypeFilter: "all" | "tempo_alert" | "anomaly" | "dead_stock";
  alertsHistoryDateFilter: string;
};

export type DirectorDashboardPipelineOutput = {
  dashboard: AiDirectorDashboardPayload;
  topShop: AiDirectorDashboardPayload["rating"][number] | undefined;
  topShopNarrative: typeof EMPTY_NARRATIVE;
};

export async function runDirectorDashboardPipeline(
  input: DirectorDashboardPipelineInput,
): Promise<DirectorDashboardPipelineOutput> {
  const dashboard = await loadDirectorDashboard({
    date: input.date,
    deepAnalysisDepth: input.deepAnalysisDepth,
    deepRiskSensitivity: input.deepRiskSensitivity,
    deepFocusAreas: input.deepFocusAreas,
    shiftHistoryShopFilter: input.shiftHistoryShopFilter,
    shiftHistoryDateFilter: input.shiftHistoryDateFilter,
    alertsHistoryShopFilter: input.alertsHistoryShopFilter,
    alertsHistoryTypeFilter: input.alertsHistoryTypeFilter,
    alertsHistoryDateFilter: input.alertsHistoryDateFilter,
  });

  const topShop = dashboard.rating[0];
  if (!topShop?.shopUuid) {
    return {
      dashboard,
      topShop,
      topShopNarrative: EMPTY_NARRATIVE,
    };
  }

  const topShopNarrative = await loadTopShopKpiNarrative({
    topShopUuid: topShop.shopUuid,
    date: input.date,
  });

  return {
    dashboard,
    topShop,
    topShopNarrative: topShopNarrative.sections ? topShopNarrative : EMPTY_NARRATIVE,
  };
}

export async function runDirectorKpiPipeline(input: {
  shopUuid: string;
  date: string;
}) {
  return loadKpiNarrative({
    shopUuid: input.shopUuid,
    startDate: input.date,
    endDate: input.date,
  });
}

export async function runDirectorChatPipeline(input: {
  message: string;
  date: string;
}) {
  return askDirector(input);
}

import { useEffect, useMemo } from "react";
import {
  askDirector,
  loadDirectorDashboard,
  loadKpiNarrative,
  loadTopShopKpiNarrative,
} from "@ai/agents/director";
import {
  filterAlertsHistory,
  filterShiftSummaries,
} from "@features/ai/model/directorDashboardModel";
import { useAiDirectorStore } from "@features/ai/model/aiDirectorStore";

export function useAiDirectorPageModel() {
  const {
    alertsHistory,
    alertsHistoryDateFilter,
    alertsHistoryShopFilter,
    alertsHistoryShopOptions,
    alertsHistoryTypeFilter,
    applyDashboardData,
    chatError,
    chatLoading,
    chatMessage,
    chatReply,
    dayLabels,
    decisionsLog,
    deepAnalysisDepth,
    deepEmployees,
    deepFocusAreas,
    deepMeta,
    deepRiskSensitivity,
    directorDecisions,
    employees,
    error,
    focusDropdownOpen,
    focusOptions,
    forecast,
    heatmap,
    heatmapStops,
    kpiNarrative,
    kpiNarrativeError,
    kpiNarrativeLoading,
    kpiNarrativeSections,
    kpiNarrativeShopName,
    kpiSelectedShopUuid,
    loading,
    problemsSummary,
    quickActionNote,
    rating,
    setAlertsHistoryDateFilter,
    setAlertsHistoryShopFilter,
    setAlertsHistoryTypeFilter,
    setChatError,
    setChatLoading,
    setChatMessage,
    setChatReply,
    setDeepAnalysisDepth,
    setDeepRiskSensitivity,
    setError,
    setFocusDropdownOpen,
    setKpiNarrativeData,
    setKpiNarrativeError,
    setKpiNarrativeLoading,
    setKpiSelectedShopUuid,
    setLoading,
    setQuickActionNote,
    setShiftHistoryDateFilter,
    setShiftHistoryShopFilter,
    shiftHistoryDateFilter,
    shiftHistoryShopFilter,
    shiftHistoryShopOptions,
    shiftSummariesHistory,
    systemStatus,
    toggleFocus,
    topKpi,
  } = useAiDirectorStore();

  const todayStr = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const dashboard = await loadDirectorDashboard({
          date: todayStr,
          deepAnalysisDepth,
          deepRiskSensitivity,
          deepFocusAreas,
          shiftHistoryShopFilter,
          shiftHistoryDateFilter,
          alertsHistoryShopFilter,
          alertsHistoryTypeFilter,
          alertsHistoryDateFilter,
        });

        const topRatedShop = dashboard.rating[0];
        const topShopNarrative =
          topRatedShop?.shopUuid == null
            ? {
                narrative: null as string | null,
                sections: { strengths: [], growth: [], actions: [], raw: "" },
              }
            : await loadTopShopKpiNarrative({
                topShopUuid: topRatedShop.shopUuid,
                date: todayStr,
              });

        if (cancelled) return;

        applyDashboardData({
          dashboard,
          topShop: topRatedShop,
          topShopNarrative: topShopNarrative.sections
            ? topShopNarrative
            : { narrative: null, sections: { strengths: [], growth: [], actions: [], raw: "" } },
        });

        setKpiNarrativeError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    alertsHistoryDateFilter,
    alertsHistoryShopFilter,
    alertsHistoryTypeFilter,
    applyDashboardData,
    deepAnalysisDepth,
    deepFocusAreas,
    deepRiskSensitivity,
    setError,
    setKpiNarrativeError,
    setLoading,
    shiftHistoryDateFilter,
    shiftHistoryShopFilter,
    todayStr,
  ]);

  const handleChat = async () => {
    if (!chatMessage.trim()) return;

    setChatLoading(true);
    setChatError(null);

    try {
      const reply = await askDirector({
        message: chatMessage,
        date: todayStr,
      });
      setChatReply(reply);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Ошибка чата");
    } finally {
      setChatLoading(false);
    }
  };

  const handleRefreshKpiNarrative = async () => {
    if (!kpiSelectedShopUuid) return;

    setKpiNarrativeLoading(true);
    setKpiNarrativeError(null);

    try {
      const narrative = await loadKpiNarrative({
        shopUuid: kpiSelectedShopUuid,
        startDate: todayStr,
        endDate: todayStr,
      });

      const selectedShopName =
        rating.find((row) => row.shopUuid === kpiSelectedShopUuid)?.shopName ||
        kpiSelectedShopUuid;

      setKpiNarrativeData({
        narrative: narrative.narrative,
        sections: narrative.sections,
        shopName: selectedShopName,
      });
    } catch (err) {
      setKpiNarrativeError(
        err instanceof Error ? err.message : "Ошибка обновления KPI narrative",
      );
    } finally {
      setKpiNarrativeLoading(false);
    }
  };

  const handleQuickAction = (action: string) => {
    setQuickActionNote(`Действие выбрано: ${action}`);
    setChatMessage(`Подготовь план: ${action}`);
  };

  const filteredShiftSummaries = filterShiftSummaries(
    shiftSummariesHistory,
    shiftHistoryShopFilter,
    shiftHistoryDateFilter,
  );

  const filteredAlertsHistory = filterAlertsHistory(
    alertsHistory,
    alertsHistoryShopFilter,
    alertsHistoryTypeFilter,
    alertsHistoryDateFilter,
  );

  return {
    alertsHistoryDateFilter,
    alertsHistoryShopFilter,
    alertsHistoryShopOptions,
    alertsHistoryTypeFilter,
    chatError,
    chatLoading,
    chatMessage,
    chatReply,
    dayLabels,
    decisionsLog,
    deepAnalysisDepth,
    deepEmployees,
    deepFocusAreas,
    deepMeta,
    deepRiskSensitivity,
    directorDecisions,
    employees,
    error,
    filteredAlertsHistory,
    filteredShiftSummaries,
    focusDropdownOpen,
    focusOptions,
    forecast,
    handleChat,
    handleQuickAction,
    handleRefreshKpiNarrative,
    heatmap,
    heatmapStops,
    kpiNarrative,
    kpiNarrativeError,
    kpiNarrativeLoading,
    kpiNarrativeSections,
    kpiNarrativeShopName,
    kpiSelectedShopUuid,
    loading,
    problemsSummary,
    quickActionNote,
    rating,
    setAlertsHistoryDateFilter,
    setAlertsHistoryShopFilter,
    setAlertsHistoryTypeFilter,
    setChatMessage,
    setDeepAnalysisDepth,
    setDeepRiskSensitivity,
    setFocusDropdownOpen,
    setKpiSelectedShopUuid,
    setShiftHistoryDateFilter,
    setShiftHistoryShopFilter,
    shiftHistoryDateFilter,
    shiftHistoryShopFilter,
    shiftHistoryShopOptions,
    systemStatus,
    toggleFocus,
    topKpi,
  };
}

export type AiDirectorPageModel = ReturnType<typeof useAiDirectorPageModel>;

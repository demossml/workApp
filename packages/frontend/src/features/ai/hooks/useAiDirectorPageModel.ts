import { useEffect, useMemo, useState } from "react";
import {
  fetchAiDirectorDashboard,
  fetchKpiNarrative,
  sendAiDirectorChat,
  tryFetchKpiNarrativeForTopShop,
  type DeepAnalysisDepth,
  type DeepFocusArea,
  type DeepRiskSensitivity,
} from "@features/ai/api";
import {
  buildDecisionsLog,
  buildDirectorDecisions,
  buildHeatmap,
  buildProblemsSummary,
  buildSystemStatus,
  buildTopKpi,
  filterAlertsHistory,
  filterShiftSummaries,
  getUniqueShopUuids,
  parseKpiNarrativeSections,
} from "@features/ai/model/directorDashboardModel";

export function useAiDirectorPageModel() {
  const [rating, setRating] = useState<
    Array<{
      shopUuid: string;
      shopName: string;
      revenue: number;
      checks: number;
      averageCheck: number;
    }>
  >([]);
  const [employees, setEmployees] = useState<
    Array<{
      employeeUuid: string;
      name: string;
      revenue: number;
      checks: number;
      averageCheck: number;
    }>
  >([]);
  const [deepEmployees, setDeepEmployees] = useState<
    Array<{
      employeeUuid: string;
      name: string;
      revenue: number;
      checks: number;
      averageCheck: number;
      refunds: number;
      refundRatePct: number;
      revenueTrendPct: number | null;
      riskScore: number;
      reasons: string[];
      recommendations: string[];
      shopCount: number;
      comparison?: {
        primaryShopUuid: string;
        historyDays: number;
        weekdays: Array<{
          weekday: number;
          currentAvgRevenue: number;
          currentAvgChecks: number;
          ownHistoryAvgRevenue: number | null;
          peerAvgRevenue: number | null;
          vsOwnHistoryPct: number | null;
          vsPeersPct: number | null;
        }>;
        summary: {
          avgVsOwnHistoryPct: number | null;
          avgVsPeersPct: number | null;
          bestWeekday: number | null;
          weakestWeekday: number | null;
        };
      } | null;
      fairComparison?: {
        primaryShopUuid: string;
        normalizers: ["shop", "weekday", "hour_bucket"];
        segments: Array<{
          weekday: number;
          hourBucket: number;
          currentAvgRevenue: number;
          currentAvgChecks: number;
          ownHistoryAvgRevenue: number | null;
          peerAvgRevenue: number | null;
          vsOwnHistoryPct: number | null;
          vsPeersPct: number | null;
        }>;
        summary: {
          avgVsOwnHistoryPct: number | null;
          avgVsPeersPct: number | null;
          bestSegment: { weekday: number; hourBucket: number } | null;
          weakestSegment: { weekday: number; hourBucket: number } | null;
        };
      } | null;
    }>
  >([]);
  const [deepMeta, setDeepMeta] = useState<{
    analysisDepth: DeepAnalysisDepth;
    historyDays: number;
    warning: string | null;
    comparisonCoverage?: {
      totalEmployees: number;
      comparableEmployees: number;
    };
  } | null>(null);
  const [deepAnalysisDepth, setDeepAnalysisDepth] = useState<DeepAnalysisDepth>("standard");
  const [deepRiskSensitivity, setDeepRiskSensitivity] = useState<DeepRiskSensitivity>("normal");
  const [focusDropdownOpen, setFocusDropdownOpen] = useState(false);
  const focusOptions: Array<{ key: DeepFocusArea; label: string }> = [
    { key: "revenue_trend", label: "Тренд выручки" },
    { key: "avg_check", label: "Средний чек" },
    { key: "refunds", label: "Возвраты" },
    { key: "traffic", label: "Трафик чеков" },
    { key: "peer_comparison", label: "Сравнение с коллегами" },
    { key: "stability", label: "Стабильность по дням" },
  ];
  const [deepFocusAreas, setDeepFocusAreas] = useState<DeepFocusArea[]>(
    focusOptions.map((item) => item.key),
  );
  const [forecast, setForecast] = useState<{
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
  } | null>(null);
  const [heatmapRows, setHeatmapRows] = useState<
    Array<{
      shopId: string;
      dayOfWeek: number;
      hour: number;
      revenue: number;
      checks: number;
    }>
  >([]);
  const [kpiNarrative, setKpiNarrative] = useState<string | null>(null);
  const [kpiNarrativeShopName, setKpiNarrativeShopName] = useState<string | null>(null);
  const [kpiSelectedShopUuid, setKpiSelectedShopUuid] = useState("");
  const [kpiNarrativeLoading, setKpiNarrativeLoading] = useState(false);
  const [kpiNarrativeError, setKpiNarrativeError] = useState<string | null>(null);
  const [shiftSummariesHistory, setShiftSummariesHistory] = useState<
    Array<{
      id: number;
      shopUuid: string;
      date: string;
      generatedAt: string;
      summaryText: string;
      revenueActual: number | null;
      revenuePlan: number | null;
      topEmployee: string | null;
    }>
  >([]);
  const [alertsHistory, setAlertsHistory] = useState<
    Array<{
      id: number;
      shopUuid: string;
      alertType: "tempo_alert" | "anomaly" | "dead_stock";
      severity: "info" | "warning" | "critical";
      triggeredAt: string;
      message: string;
    }>
  >([]);
  const [shiftHistoryShopFilter, setShiftHistoryShopFilter] = useState("all");
  const [shiftHistoryDateFilter, setShiftHistoryDateFilter] = useState("");
  const [alertsHistoryShopFilter, setAlertsHistoryShopFilter] = useState("all");
  const [alertsHistoryTypeFilter, setAlertsHistoryTypeFilter] = useState<
    "all" | "tempo_alert" | "anomaly" | "dead_stock"
  >("all");
  const [alertsHistoryDateFilter, setAlertsHistoryDateFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatMessage, setChatMessage] = useState("");
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [quickActionNote, setQuickActionNote] = useState<string | null>(null);

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
        const data = await fetchAiDirectorDashboard({
          date: todayStr,
          deepAnalysisDepth,
          deepRiskSensitivity,
          deepFocusAreas,
        });

        const topRatedShop = (data.rating || [])[0];
        const kpiNarrativeText =
          topRatedShop?.shopUuid == null
            ? null
            : await tryFetchKpiNarrativeForTopShop({
                topShopUuid: topRatedShop.shopUuid,
                date: todayStr,
              });

        if (cancelled) return;

        setRating(data.rating);
        setEmployees(data.employees);
        setDeepEmployees(data.deepEmployees);
        setDeepMeta(data.deepMeta);
        setForecast(data.forecast);
        setHeatmapRows(data.heatmapRows);
        setShiftSummariesHistory(data.shiftSummariesHistory);
        setAlertsHistory(data.alertsHistory);
        setKpiNarrative(kpiNarrativeText);
        setKpiNarrativeShopName(
          typeof topRatedShop?.shopName === "string" ? topRatedShop.shopName : null,
        );
        setKpiSelectedShopUuid(topRatedShop?.shopUuid || "");
        setKpiNarrativeError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [todayStr, deepAnalysisDepth, deepRiskSensitivity, deepFocusAreas]);

  const handleChat = async () => {
    if (!chatMessage.trim()) return;
    setChatLoading(true);
    setChatError(null);
    try {
      const reply = await sendAiDirectorChat({
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
      const narrative = await fetchKpiNarrative({
        shopUuid: kpiSelectedShopUuid,
        startDate: todayStr,
        endDate: todayStr,
      });
      setKpiNarrative(narrative);

      const selectedShopName =
        rating.find((row) => row.shopUuid === kpiSelectedShopUuid)?.shopName ||
        kpiSelectedShopUuid;
      setKpiNarrativeShopName(selectedShopName);
    } catch (err) {
      setKpiNarrativeError(
        err instanceof Error ? err.message : "Ошибка обновления KPI narrative",
      );
    } finally {
      setKpiNarrativeLoading(false);
    }
  };

  const heatmap = useMemo(() => buildHeatmap(heatmapRows), [heatmapRows]);

  const shiftHistoryShopOptions = useMemo(
    () => getUniqueShopUuids(shiftSummariesHistory),
    [shiftSummariesHistory],
  );

  const filteredShiftSummaries = useMemo(
    () =>
      filterShiftSummaries(
        shiftSummariesHistory,
        shiftHistoryShopFilter,
        shiftHistoryDateFilter,
      ),
    [shiftSummariesHistory, shiftHistoryShopFilter, shiftHistoryDateFilter],
  );

  const alertsHistoryShopOptions = useMemo(
    () => getUniqueShopUuids(alertsHistory),
    [alertsHistory],
  );

  const filteredAlertsHistory = useMemo(
    () =>
      filterAlertsHistory(
        alertsHistory,
        alertsHistoryShopFilter,
        alertsHistoryTypeFilter,
        alertsHistoryDateFilter,
      ),
    [
      alertsHistory,
      alertsHistoryShopFilter,
      alertsHistoryTypeFilter,
      alertsHistoryDateFilter,
    ],
  );

  const dayLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const heatmapStops = [0, 25, 50, 75, 100];
  const toggleFocus = (focus: DeepFocusArea) => {
    setDeepFocusAreas((prev) => {
      if (prev.includes(focus)) {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== focus);
      }
      return [...prev, focus];
    });
  };

  const kpiNarrativeSections = useMemo(
    () => parseKpiNarrativeSections(kpiNarrative),
    [kpiNarrative],
  );
  const systemStatus = useMemo(
    () => buildSystemStatus(loading, alertsHistory, deepEmployees),
    [alertsHistory, deepEmployees, loading],
  );
  const topKpi = useMemo(() => buildTopKpi(rating), [rating]);
  const directorDecisions = useMemo(
    () => buildDirectorDecisions(deepEmployees),
    [deepEmployees],
  );
  const problemsSummary = useMemo(
    () => buildProblemsSummary(alertsHistory, deepEmployees),
    [alertsHistory, deepEmployees],
  );
  const decisionsLog = useMemo(() => buildDecisionsLog(alertsHistory), [alertsHistory]);

  const handleQuickAction = (action: string) => {
    setQuickActionNote(`Действие выбрано: ${action}`);
    setChatMessage(`Подготовь план: ${action}`);
  };

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

import { create } from "zustand";
import type {
  DeepAnalysisDepth,
  DeepFocusArea,
  DeepRiskSensitivity,
} from "@ai/agents/director";

type ShopRatingRow = {
  shopUuid: string;
  shopName: string;
  revenue: number;
  checks: number;
  averageCheck: number;
};

type EmployeeRow = {
  employeeUuid: string;
  name: string;
  revenue: number;
  checks: number;
  averageCheck: number;
};

type DeepEmployeeRow = {
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
};

type ShiftSummaryRow = {
  id: number;
  shopUuid: string;
  date: string;
  generatedAt: string;
  summaryText: string;
  revenueActual: number | null;
  revenuePlan: number | null;
  topEmployee: string | null;
};

type AlertHistoryRow = {
  id: number;
  shopUuid: string;
  alertType: "tempo_alert" | "anomaly" | "dead_stock";
  severity: "info" | "warning" | "critical";
  triggeredAt: string;
  message: string;
};

type KpiNarrativeSections = {
  strengths: string[];
  growth: string[];
  actions: string[];
  raw: string;
};

type AiDirectorDashboardPayload = {
  rating: ShopRatingRow[];
  employees: EmployeeRow[];
  deepEmployees: DeepEmployeeRow[];
  deepMeta: {
    analysisDepth: DeepAnalysisDepth;
    historyDays: number;
    warning: string | null;
    comparisonCoverage?: {
      totalEmployees: number;
      comparableEmployees: number;
    };
  } | null;
  forecast: {
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
  } | null;
  heatmap: {
    matrix: number[][];
    maxRevenue: number;
    dayLabels: string[];
    stops: number[];
  };
  shiftSummariesHistory: ShiftSummaryRow[];
  shiftHistoryShopOptions: string[];
  alertsHistory: AlertHistoryRow[];
  alertsHistoryShopOptions: string[];
  uiSummary: {
    systemStatus: {
      state: "ok" | "warning" | "critical";
      label: string;
    };
    topKpi: {
      totalRevenue: number;
      totalChecks: number;
      avgCheck: number;
      weakShops: number;
    };
    directorDecisions: Array<{
      employeeName: string;
      problem: string;
      action: string;
      risk: number;
    }>;
    decisionsLog: Array<{
      id: number;
      when: string;
      type: "tempo_alert" | "anomaly" | "dead_stock";
      severity: "info" | "warning" | "critical";
      text: string;
    }>;
    problemsSummary: {
      criticalAlerts: Array<{ id: number; message: string }>;
      warningAlerts: Array<{ id: number; message: string }>;
      riskyEmployees: Array<{ employeeUuid: string; name: string }>;
      highRefundEmployees: Array<{ employeeUuid: string; name: string }>;
    };
  };
};

type AiDirectorStoreState = {
  rating: ShopRatingRow[];
  employees: EmployeeRow[];
  deepEmployees: DeepEmployeeRow[];
  deepMeta: AiDirectorDashboardPayload["deepMeta"];
  deepAnalysisDepth: DeepAnalysisDepth;
  deepRiskSensitivity: DeepRiskSensitivity;
  focusDropdownOpen: boolean;
  focusOptions: Array<{ key: DeepFocusArea; label: string }>;
  deepFocusAreas: DeepFocusArea[];
  forecast: AiDirectorDashboardPayload["forecast"];
  heatmap: { matrix: number[][]; max: number };
  dayLabels: string[];
  heatmapStops: number[];
  shiftSummariesHistory: ShiftSummaryRow[];
  shiftHistoryShopOptions: string[];
  alertsHistory: AlertHistoryRow[];
  alertsHistoryShopOptions: string[];
  systemStatus: {
    icon: string;
    label: string;
    tone: string;
    bg: string;
  };
  topKpi: {
    totalRevenue: number;
    totalChecks: number;
    avgCheck: number;
    weakShops: number;
  };
  directorDecisions: Array<{
    employeeName: string;
    problem: string;
    action: string;
    risk: number;
  }>;
  decisionsLog: Array<{
    id: number;
    when: string;
    type: "tempo_alert" | "anomaly" | "dead_stock";
    severity: "info" | "warning" | "critical";
    text: string;
  }>;
  problemsSummary: {
    criticalAlerts: Array<{ id: number; message: string }>;
    warningAlerts: Array<{ id: number; message: string }>;
    riskyEmployees: Array<{ employeeUuid: string; name: string }>;
    highRefundEmployees: Array<{ employeeUuid: string; name: string }>;
  };
  kpiNarrative: string | null;
  kpiNarrativeSections: KpiNarrativeSections;
  kpiNarrativeShopName: string | null;
  kpiSelectedShopUuid: string;
  kpiNarrativeLoading: boolean;
  kpiNarrativeError: string | null;
  shiftHistoryShopFilter: string;
  shiftHistoryDateFilter: string;
  alertsHistoryShopFilter: string;
  alertsHistoryTypeFilter: "all" | "tempo_alert" | "anomaly" | "dead_stock";
  alertsHistoryDateFilter: string;
  loading: boolean;
  error: string | null;
  chatMessage: string;
  chatReply: string | null;
  chatLoading: boolean;
  chatError: string | null;
  quickActionNote: string | null;
  setDeepAnalysisDepth: (value: DeepAnalysisDepth) => void;
  setDeepRiskSensitivity: (value: DeepRiskSensitivity) => void;
  setFocusDropdownOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  toggleFocus: (focus: DeepFocusArea) => void;
  setShiftHistoryShopFilter: (value: string) => void;
  setShiftHistoryDateFilter: (value: string) => void;
  setAlertsHistoryShopFilter: (value: string) => void;
  setAlertsHistoryTypeFilter: (value: "all" | "tempo_alert" | "anomaly" | "dead_stock") => void;
  setAlertsHistoryDateFilter: (value: string) => void;
  setLoading: (value: boolean) => void;
  setError: (value: string | null) => void;
  setChatMessage: (value: string) => void;
  setChatReply: (value: string | null) => void;
  setChatLoading: (value: boolean) => void;
  setChatError: (value: string | null) => void;
  setQuickActionNote: (value: string | null) => void;
  setKpiSelectedShopUuid: (value: string) => void;
  setKpiNarrativeLoading: (value: boolean) => void;
  setKpiNarrativeError: (value: string | null) => void;
  setKpiNarrativeData: (payload: {
    narrative: string | null;
    sections: KpiNarrativeSections;
    shopName: string | null;
  }) => void;
  applyDashboardData: (payload: {
    dashboard: AiDirectorDashboardPayload;
    topShop: ShopRatingRow | undefined;
    topShopNarrative: {
      narrative: string | null;
      sections: KpiNarrativeSections;
    };
  }) => void;
};

const focusOptions: Array<{ key: DeepFocusArea; label: string }> = [
  { key: "revenue_trend", label: "Тренд выручки" },
  { key: "avg_check", label: "Средний чек" },
  { key: "refunds", label: "Возвраты" },
  { key: "traffic", label: "Трафик чеков" },
  { key: "peer_comparison", label: "Сравнение с коллегами" },
  { key: "stability", label: "Стабильность по дням" },
];

function mapSystemStatus(state: "ok" | "warning" | "critical", label: string) {
  return {
    icon: state === "critical" ? "🔴" : state === "warning" ? "🟡" : "🟢",
    label,
    tone:
      state === "critical"
        ? "text-red-700 dark:text-red-300"
        : state === "warning"
          ? "text-amber-700 dark:text-amber-300"
          : "text-emerald-700 dark:text-emerald-300",
    bg:
      state === "critical"
        ? "bg-red-50 dark:bg-red-950/30"
        : state === "warning"
          ? "bg-amber-50 dark:bg-amber-950/30"
          : "bg-emerald-50 dark:bg-emerald-950/30",
  };
}

export const useAiDirectorStore = create<AiDirectorStoreState>((set, get) => ({
  rating: [],
  employees: [],
  deepEmployees: [],
  deepMeta: null,
  deepAnalysisDepth: "standard",
  deepRiskSensitivity: "normal",
  focusDropdownOpen: false,
  focusOptions,
  deepFocusAreas: focusOptions.map((item) => item.key),
  forecast: null,
  heatmap: {
    matrix: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
    max: 0,
  },
  dayLabels: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
  heatmapStops: [0, 25, 50, 75, 100],
  shiftSummariesHistory: [],
  shiftHistoryShopOptions: [],
  alertsHistory: [],
  alertsHistoryShopOptions: [],
  systemStatus: {
    icon: "🟢",
    label: "Система стабильна",
    tone: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  topKpi: {
    totalRevenue: 0,
    totalChecks: 0,
    avgCheck: 0,
    weakShops: 0,
  },
  directorDecisions: [],
  decisionsLog: [],
  problemsSummary: {
    criticalAlerts: [],
    warningAlerts: [],
    riskyEmployees: [],
    highRefundEmployees: [],
  },
  kpiNarrative: null,
  kpiNarrativeSections: { strengths: [], growth: [], actions: [], raw: "" },
  kpiNarrativeShopName: null,
  kpiSelectedShopUuid: "",
  kpiNarrativeLoading: false,
  kpiNarrativeError: null,
  shiftHistoryShopFilter: "all",
  shiftHistoryDateFilter: "",
  alertsHistoryShopFilter: "all",
  alertsHistoryTypeFilter: "all",
  alertsHistoryDateFilter: "",
  loading: false,
  error: null,
  chatMessage: "",
  chatReply: null,
  chatLoading: false,
  chatError: null,
  quickActionNote: null,
  setDeepAnalysisDepth: (value) => set({ deepAnalysisDepth: value }),
  setDeepRiskSensitivity: (value) => set({ deepRiskSensitivity: value }),
  setFocusDropdownOpen: (value) => {
    if (typeof value === "function") {
      set({ focusDropdownOpen: value(get().focusDropdownOpen) });
      return;
    }
    set({ focusDropdownOpen: value });
  },
  toggleFocus: (focus) => {
    const current = get().deepFocusAreas;
    if (current.includes(focus)) {
      if (current.length <= 1) return;
      set({ deepFocusAreas: current.filter((item) => item !== focus) });
      return;
    }
    set({ deepFocusAreas: [...current, focus] });
  },
  setShiftHistoryShopFilter: (value) => set({ shiftHistoryShopFilter: value }),
  setShiftHistoryDateFilter: (value) => set({ shiftHistoryDateFilter: value }),
  setAlertsHistoryShopFilter: (value) => set({ alertsHistoryShopFilter: value }),
  setAlertsHistoryTypeFilter: (value) => set({ alertsHistoryTypeFilter: value }),
  setAlertsHistoryDateFilter: (value) => set({ alertsHistoryDateFilter: value }),
  setLoading: (value) => set({ loading: value }),
  setError: (value) => set({ error: value }),
  setChatMessage: (value) => set({ chatMessage: value }),
  setChatReply: (value) => set({ chatReply: value }),
  setChatLoading: (value) => set({ chatLoading: value }),
  setChatError: (value) => set({ chatError: value }),
  setQuickActionNote: (value) => set({ quickActionNote: value }),
  setKpiSelectedShopUuid: (value) => set({ kpiSelectedShopUuid: value }),
  setKpiNarrativeLoading: (value) => set({ kpiNarrativeLoading: value }),
  setKpiNarrativeError: (value) => set({ kpiNarrativeError: value }),
  setKpiNarrativeData: (payload) =>
    set({
      kpiNarrative: payload.narrative,
      kpiNarrativeSections: payload.sections,
      kpiNarrativeShopName: payload.shopName,
    }),
  applyDashboardData: ({ dashboard, topShop, topShopNarrative }) =>
    set({
      rating: dashboard.rating,
      employees: dashboard.employees,
      deepEmployees: dashboard.deepEmployees,
      deepMeta: dashboard.deepMeta,
      forecast: dashboard.forecast,
      heatmap: {
        matrix: dashboard.heatmap.matrix,
        max: dashboard.heatmap.maxRevenue,
      },
      dayLabels: dashboard.heatmap.dayLabels,
      heatmapStops: dashboard.heatmap.stops,
      shiftSummariesHistory: dashboard.shiftSummariesHistory,
      shiftHistoryShopOptions: dashboard.shiftHistoryShopOptions,
      alertsHistory: dashboard.alertsHistory,
      alertsHistoryShopOptions: dashboard.alertsHistoryShopOptions,
      systemStatus: mapSystemStatus(
        dashboard.uiSummary.systemStatus.state,
        dashboard.uiSummary.systemStatus.label,
      ),
      topKpi: dashboard.uiSummary.topKpi,
      directorDecisions: dashboard.uiSummary.directorDecisions,
      decisionsLog: dashboard.uiSummary.decisionsLog,
      problemsSummary: dashboard.uiSummary.problemsSummary,
      kpiNarrative: topShopNarrative.narrative,
      kpiNarrativeSections: topShopNarrative.sections,
      kpiNarrativeShopName: topShop?.shopName ?? null,
      kpiSelectedShopUuid: topShop?.shopUuid ?? "",
    }),
}));

export type {
  AiDirectorDashboardPayload,
  AiDirectorStoreState,
  AlertHistoryRow,
  DeepEmployeeRow,
  EmployeeRow,
  ShopRatingRow,
  ShiftSummaryRow,
};

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const topSectionsPath = path.resolve(__dirname, "./AiDirectorTopSections.tsx");
const dataSectionsPath = path.resolve(__dirname, "./AiDirectorDataSections.tsx");

function noop() {}

function createModel() {
  return {
    alertsHistoryDateFilter: "",
    alertsHistoryShopFilter: "all",
    alertsHistoryShopOptions: ["shop-1"],
    alertsHistoryTypeFilter: "all",
    chatError: null,
    chatLoading: false,
    chatMessage: "",
    chatReply: null,
    dayLabels: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
    decisionsLog: [
      {
        id: 1,
        when: "2026-03-23T10:00:00.000Z",
        type: "tempo_alert",
        severity: "warning",
        text: "Темп ниже плана",
      },
    ],
    deepAnalysisDepth: "standard",
    deepEmployees: [],
    deepFocusAreas: [
      "revenue_trend",
      "avg_check",
      "refunds",
      "traffic",
      "peer_comparison",
      "stability",
    ],
    deepMeta: {
      analysisDepth: "standard",
      historyDays: 14,
      warning: null,
      comparisonCoverage: { comparableEmployees: 0, totalEmployees: 0 },
    },
    deepRiskSensitivity: "normal",
    directorDecisions: [],
    employees: [],
    error: null,
    filteredAlertsHistory: [],
    filteredShiftSummaries: [],
    focusDropdownOpen: false,
    focusOptions: [
      { key: "revenue_trend", label: "Тренд выручки" },
      { key: "avg_check", label: "Средний чек" },
      { key: "refunds", label: "Возвраты" },
      { key: "traffic", label: "Трафик чеков" },
      { key: "peer_comparison", label: "Сравнение с коллегами" },
      { key: "stability", label: "Стабильность по дням" },
    ],
    forecast: { forecast: 123000, historySource: "receipts", warning: null },
    handleChat: noop,
    handleQuickAction: noop,
    handleRefreshKpiNarrative: noop,
    heatmap: { map: new Map(), max: 0 },
    heatmapStops: [0, 25, 50, 75, 100],
    kpiNarrative: null,
    kpiNarrativeError: null,
    kpiNarrativeLoading: false,
    kpiNarrativeSections: { strengths: [], growth: [], actions: [], raw: "" },
    kpiNarrativeShopName: null,
    kpiSelectedShopUuid: "",
    loading: false,
    problemsSummary: {
      criticalAlerts: [],
      warningAlerts: [],
      riskyEmployees: [],
      highRefundEmployees: [],
    },
    quickActionNote: null,
    rating: [],
    setAlertsHistoryDateFilter: noop,
    setAlertsHistoryShopFilter: noop,
    setAlertsHistoryTypeFilter: noop,
    setChatMessage: noop,
    setDeepAnalysisDepth: noop,
    setDeepRiskSensitivity: noop,
    setFocusDropdownOpen: noop,
    setKpiSelectedShopUuid: noop,
    setShiftHistoryDateFilter: noop,
    setShiftHistoryShopFilter: noop,
    shiftHistoryDateFilter: "",
    shiftHistoryShopFilter: "all",
    shiftHistoryShopOptions: [],
    systemStatus: {
      icon: "🟢",
      label: "Система стабильна",
      tone: "text-emerald-700",
      bg: "bg-emerald-50",
    },
    toggleFocus: noop,
    topKpi: { totalRevenue: 0, totalChecks: 0, avgCheck: 0, weakShops: 0 },
  };
}

test("AI director sections render without runtime errors", () => {
  const { AiDirectorTopSections } = require(topSectionsPath);
  const { AiDirectorDataSections } = require(dataSectionsPath);
  const model = createModel();

  const html = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(AiDirectorTopSections, { model }),
      React.createElement(AiDirectorDataSections, { model }),
    ),
  );

  assert.match(html, /AI-Директор/);
  assert.match(html, /KPI/);
  assert.match(html, /История решений AI/);
  assert.match(html, /Рейтинг магазинов/);
  assert.match(html, /Heatmap продаж/);
});

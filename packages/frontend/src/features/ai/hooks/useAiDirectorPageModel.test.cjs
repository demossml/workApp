const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const hookModulePath = path.resolve(__dirname, "./useAiDirectorPageModel.ts");
const modelModulePath = path.resolve(
  __dirname,
  "../model/directorDashboardModel.ts",
);

function withMockedModules(run) {
  const stubs = {
    "@features/ai/api": {
      fetchAiDirectorDashboard: async () => ({
        rating: [],
        employees: [],
        deepEmployees: [],
        deepMeta: {
          analysisDepth: "standard",
          historyDays: 0,
          warning: null,
        },
        forecast: { forecast: 0 },
        heatmapRows: [],
        shiftSummariesHistory: [],
        alertsHistory: [],
      }),
      fetchKpiNarrative: async () => null,
      sendAiDirectorChat: async () => "ok",
      tryFetchKpiNarrativeForTopShop: async () => null,
    },
    "@features/ai/model/directorDashboardModel": require(modelModulePath),
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) {
      return stubs[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[hookModulePath];
    return run();
  } finally {
    Module._load = originalLoad;
  }
}

test("useAiDirectorPageModel returns stable initial UI contract", async () => {
  await withMockedModules(async () => {
    const { useAiDirectorPageModel } = require(hookModulePath);

    function Probe() {
      const model = useAiDirectorPageModel();
      return React.createElement(
        "pre",
        null,
        JSON.stringify({
          chatMessage: model.chatMessage,
          loading: model.loading,
          alertsShopFilter: model.alertsHistoryShopFilter,
          shiftShopFilter: model.shiftHistoryShopFilter,
          topRevenue: model.topKpi.totalRevenue,
          systemLabel: model.systemStatus.label,
          focusCount: model.deepFocusAreas.length,
          hasHandlers:
            typeof model.handleChat === "function" &&
            typeof model.handleQuickAction === "function" &&
            typeof model.handleRefreshKpiNarrative === "function",
        }),
      );
    }

    const html = renderToStaticMarkup(React.createElement(Probe)).replaceAll(
      "&quot;",
      '"',
    );

    assert.match(html, /"chatMessage":""/);
    assert.match(html, /"loading":false/);
    assert.match(html, /"alertsShopFilter":"all"/);
    assert.match(html, /"shiftShopFilter":"all"/);
    assert.match(html, /"topRevenue":0/);
    assert.match(html, /"systemLabel":"Система стабильна"/);
    assert.match(html, /"focusCount":6/);
    assert.match(html, /"hasHandlers":true/);
  });
});

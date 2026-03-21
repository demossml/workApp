import { useEffect, useMemo, useState } from "react";
import DashboardSummary2 from "../../components/dashboard/DashboardSummary";
import { client } from "../../helpers/api";

export default function AiDirectorPage() {
  const aiDirector = client.api.ai as any;
  type DeepFocusArea =
    | "revenue_trend"
    | "avg_check"
    | "refunds"
    | "traffic"
    | "peer_comparison"
    | "stability";
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
    analysisDepth: "lite" | "standard" | "deep";
    historyDays: number;
    warning: string | null;
    comparisonCoverage?: {
      totalEmployees: number;
      comparableEmployees: number;
    };
  } | null>(null);
  const [deepAnalysisDepth, setDeepAnalysisDepth] = useState<
    "lite" | "standard" | "deep"
  >("standard");
  const [deepRiskSensitivity, setDeepRiskSensitivity] = useState<
    "low" | "normal" | "high"
  >("normal");
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
  const [kpiNarrativeShopName, setKpiNarrativeShopName] = useState<string | null>(
    null,
  );
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
  const [alertsHistoryTypeFilter, setAlertsHistoryTypeFilter] = useState("all");
  const [alertsHistoryDateFilter, setAlertsHistoryDateFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatMessage, setChatMessage] = useState("");
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const today = new Date();
  const todayStr = useMemo(() => {
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, [today]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [
          ratingRes,
          employeesRes,
          deepEmployeesRes,
          forecastRes,
          heatmapRes,
          shiftSummariesRes,
          alertsHistoryRes,
        ] =
          await Promise.all([
            aiDirector["director/store-rating"].$post({ json: { date: todayStr } }),
            aiDirector["director/employee-analysis"].$post({
              json: { until: todayStr },
            }),
            aiDirector["director/employee-deep-analysis"].$post({
              json: {
                until: todayStr,
                limit: 20,
                analysisDepth: deepAnalysisDepth,
                riskSensitivity: deepRiskSensitivity,
                focusAreas: deepFocusAreas,
              },
            }),
            aiDirector["director/demand-forecast"].$post({ json: { date: todayStr } }),
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
        if (!deepEmployeesRes.ok) {
          throw new Error("Не удалось загрузить глубокий анализ сотрудников");
        }
        if (!forecastRes.ok) throw new Error("Не удалось загрузить прогноз");
        if (!heatmapRes.ok) throw new Error("Не удалось загрузить heatmap");
        if (!shiftSummariesRes.ok) {
          throw new Error("Не удалось загрузить историю итогов смен");
        }
        if (!alertsHistoryRes.ok) {
          throw new Error("Не удалось загрузить историю алертов");
        }

        const ratingJson = await ratingRes.json();
        const employeesJson = await employeesRes.json();
        const deepEmployeesJson = await deepEmployeesRes.json();
        const forecastJson = await forecastRes.json();
        const heatmapJson = await heatmapRes.json();
        const shiftSummariesJson = await shiftSummariesRes.json();
        const alertsHistoryJson = await alertsHistoryRes.json();

        const topRatedShop = (ratingJson.rating || [])[0];
        let kpiNarrativeText: string | null = null;
        let kpiNarrativeTopShopName: string | null = null;

        if (topRatedShop?.shopUuid) {
          try {
            const kpiRes = await aiDirector["employee-shift-kpi"].$post({
              json: {
                shopUuid: topRatedShop.shopUuid,
                startDate: todayStr,
                endDate: todayStr,
              },
            });
            if (kpiRes.ok) {
              const kpiJson = await kpiRes.json();
              kpiNarrativeText =
                typeof kpiJson.narrative === "string" ? kpiJson.narrative : null;
              kpiNarrativeTopShopName =
                typeof topRatedShop.shopName === "string"
                  ? topRatedShop.shopName
                  : null;
            }
          } catch {
            // Fallback: narrative section останется пустым, базовый экран не ломаем.
          }
        }

        if (cancelled) return;
        setRating(ratingJson.rating || []);
        setEmployees(employeesJson.employees || []);
        setDeepEmployees(deepEmployeesJson.employees || []);
        setDeepMeta({
          analysisDepth:
            deepEmployeesJson.analysisDepth === "lite" ||
            deepEmployeesJson.analysisDepth === "deep"
              ? deepEmployeesJson.analysisDepth
              : "standard",
          historyDays: Number(deepEmployeesJson.historyDays || 0),
          warning:
            typeof deepEmployeesJson.warning === "string"
              ? deepEmployeesJson.warning
              : null,
          comparisonCoverage: deepEmployeesJson.comparisonCoverage || undefined,
        });
        setForecast({
          forecast: Number(forecastJson.forecast || 0),
          weather: forecastJson.weather || null,
          weatherFactor:
            typeof forecastJson.weatherFactor === "number"
              ? forecastJson.weatherFactor
              : undefined,
          warning: typeof forecastJson.warning === "string" ? forecastJson.warning : null,
          historySource:
            forecastJson.historySource === "index" ? "index" : "receipts",
        });
        setHeatmapRows(heatmapJson.rows || []);
        setShiftSummariesHistory(shiftSummariesJson.items || []);
        setAlertsHistory(alertsHistoryJson.items || []);
        setKpiNarrative(kpiNarrativeText);
        setKpiNarrativeShopName(kpiNarrativeTopShopName);
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
  }, [aiDirector, todayStr, deepAnalysisDepth, deepRiskSensitivity, deepFocusAreas]);

  const handleChat = async () => {
    if (!chatMessage.trim()) return;
    setChatLoading(true);
    setChatError(null);
    try {
      const res = await aiDirector["director/chat"].$post({
        json: { message: chatMessage, date: todayStr },
      });
      if (!res.ok) throw new Error("Не удалось получить ответ");
      const data = await res.json();
      setChatReply(data.reply || "");
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
      const kpiRes = await aiDirector["employee-shift-kpi"].$post({
        json: {
          shopUuid: kpiSelectedShopUuid,
          startDate: todayStr,
          endDate: todayStr,
        },
      });
      if (!kpiRes.ok) throw new Error("Не удалось получить KPI narrative");
      const kpiJson = await kpiRes.json();
      setKpiNarrative(
        typeof kpiJson.narrative === "string" ? kpiJson.narrative : null,
      );

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

  const heatmap = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;
    for (const row of heatmapRows) {
      const key = `${row.dayOfWeek}:${row.hour}`;
      const value = Number(row.revenue || 0);
      map.set(key, value);
      if (value > max) max = value;
    }
    return { map, max };
  }, [heatmapRows]);

  const shiftHistoryShopOptions = useMemo(
    () => Array.from(new Set(shiftSummariesHistory.map((row) => row.shopUuid))),
    [shiftSummariesHistory],
  );

  const filteredShiftSummaries = useMemo(
    () =>
      shiftSummariesHistory.filter((row) => {
        if (shiftHistoryShopFilter !== "all" && row.shopUuid !== shiftHistoryShopFilter) {
          return false;
        }
        if (shiftHistoryDateFilter && row.date !== shiftHistoryDateFilter) {
          return false;
        }
        return true;
      }),
    [shiftSummariesHistory, shiftHistoryShopFilter, shiftHistoryDateFilter],
  );

  const alertsHistoryShopOptions = useMemo(
    () => Array.from(new Set(alertsHistory.map((row) => row.shopUuid))),
    [alertsHistory],
  );

  const filteredAlertsHistory = useMemo(
    () =>
      alertsHistory.filter((row) => {
        if (alertsHistoryShopFilter !== "all" && row.shopUuid !== alertsHistoryShopFilter) {
          return false;
        }
        if (alertsHistoryTypeFilter !== "all" && row.alertType !== alertsHistoryTypeFilter) {
          return false;
        }
        if (alertsHistoryDateFilter && !row.triggeredAt.startsWith(alertsHistoryDateFilter)) {
          return false;
        }
        return true;
      }),
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

  const kpiNarrativeSections = useMemo(() => {
    const source = (kpiNarrative || "").trim();
    if (!source) {
      return {
        strengths: [] as string[],
        growth: [] as string[],
        actions: [] as string[],
        raw: "",
      };
    }

    const lines = source
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const normalize = (line: string) =>
      line
        .replace(/^[\d\)\.\-\s•]+/, "")
        .trim();

    const strengths: string[] = [];
    const growth: string[] = [];
    const actions: string[] = [];

    let mode: "strengths" | "growth" | "actions" | null = null;
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes("сильн")) {
        mode = "strengths";
        continue;
      }
      if (lower.includes("зон") || lower.includes("рост")) {
        mode = "growth";
        continue;
      }
      if (lower.includes("действ") || lower.includes("следующ")) {
        mode = "actions";
        continue;
      }

      const item = normalize(line);
      if (!item) continue;
      if (mode === "strengths") strengths.push(item);
      else if (mode === "growth") growth.push(item);
      else if (mode === "actions") actions.push(item);
    }

    return { strengths, growth, actions, raw: source };
  }, [kpiNarrative]);

  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-gray-100 dark:bg-gray-900 pt-20 sm:pt-24 px-2 sm:px-6 pb-24 overflow-x-hidden">
      <div className="w-full max-w-7xl min-w-0 overflow-x-hidden">
        <DashboardSummary2 showAiDirector showMainDashboard={false} />

        <div className="mt-6 sm:mt-8 grid gap-4 sm:gap-6">
          <section className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950/60">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              AI чат директора
            </h2>
            <div className="mt-3 flex flex-col gap-3">
              <textarea
                className="min-h-[90px] w-full rounded-xl border border-gray-300 p-3 text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-gray-200"
                placeholder="Например: почему упали продажи?"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleChat}
                  disabled={chatLoading}
                  className="rounded-xl bg-black px-4 py-2 text-xs sm:text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-black"
                >
                  {chatLoading ? "Думаю..." : "Спросить"}
                </button>
                {chatError && (
                  <span className="text-sm text-red-600 dark:text-red-400">
                    {chatError}
                  </span>
                )}
              </div>
              {chatReply && (
                <div className="rounded-xl bg-gray-50 p-4 text-xs sm:text-sm text-gray-800 dark:bg-gray-900 dark:text-gray-100">
                  {chatReply}
                </div>
              )}
            </div>
          </section>

          <section className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950/60">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                Рейтинг магазинов
              </h2>
              {loading && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Загрузка...
                </span>
              )}
            </div>
            {error && (
              <div className="mt-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            <div className="mt-4 w-full max-w-full overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs sm:text-sm">
                <thead className="text-[10px] sm:text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="py-2 pr-3">Магазин</th>
                    <th className="py-2 pr-3">Выручка</th>
                    <th className="py-2 pr-3">Чеки</th>
                    <th className="py-2 pr-3">Средний чек</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800 dark:text-gray-100">
                  {rating.map((row) => (
                    <tr key={row.shopUuid} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-3">{row.shopName}</td>
                      <td className="py-2 pr-3">{Math.round(row.revenue)} ₽</td>
                      <td className="py-2 pr-3">{row.checks}</td>
                      <td className="py-2 pr-3">
                        {Math.round(row.averageCheck)} ₽
                      </td>
                    </tr>
                  ))}
                  {rating.length === 0 && !loading && (
                    <tr>
                      <td className="py-3 text-gray-500 dark:text-gray-400" colSpan={4}>
                        Нет данных.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950/60">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              Анализ сотрудников
            </h2>
            <div className="mt-4 w-full max-w-full overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs sm:text-sm">
                <thead className="text-[10px] sm:text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="py-2 pr-3">Сотрудник</th>
                    <th className="py-2 pr-3">Выручка</th>
                    <th className="py-2 pr-3">Чеки</th>
                    <th className="py-2 pr-3">Средний чек</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800 dark:text-gray-100">
                  {employees.map((row) => (
                    <tr key={row.employeeUuid} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-3">{row.name}</td>
                      <td className="py-2 pr-3">{Math.round(row.revenue)} ₽</td>
                      <td className="py-2 pr-3">{row.checks}</td>
                      <td className="py-2 pr-3">
                        {Math.round(row.averageCheck)} ₽
                      </td>
                    </tr>
                  ))}
                  {employees.length === 0 && !loading && (
                    <tr>
                      <td className="py-3 text-gray-500 dark:text-gray-400" colSpan={4}>
                        Нет данных.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950/60">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              KPI Narrative
            </h2>
            <div className="mt-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
              {kpiNarrativeShopName
                ? `Сводка по магазину: ${kpiNarrativeShopName}`
                : "Сводка по KPI сотрудников"}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={kpiSelectedShopUuid}
                onChange={(e) => setKpiSelectedShopUuid(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] sm:text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="" disabled>
                  Выберите магазин
                </option>
                {rating.map((row) => (
                  <option key={row.shopUuid} value={row.shopUuid}>
                    {row.shopName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRefreshKpiNarrative}
                disabled={!kpiSelectedShopUuid || kpiNarrativeLoading}
                className="rounded-lg bg-black px-3 py-1 text-[11px] sm:text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black"
              >
                {kpiNarrativeLoading ? "Обновляю..." : "Перегенерировать"}
              </button>
              {kpiNarrativeError && (
                <span className="text-[11px] sm:text-xs text-red-600 dark:text-red-400">
                  {kpiNarrativeError}
                </span>
              )}
            </div>
            {kpiNarrative ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/70 dark:bg-emerald-950/20">
                  <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Сильные стороны
                  </div>
                  {kpiNarrativeSections.strengths.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs sm:text-sm text-emerald-900 dark:text-emerald-100">
                      {kpiNarrativeSections.strengths.map((item, idx) => (
                        <li key={`str-${idx}`}>• {item}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-2 text-xs sm:text-sm text-emerald-900 dark:text-emerald-100">
                      {kpiNarrativeSections.raw}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/70 dark:bg-amber-950/20">
                  <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Зоны роста
                  </div>
                  {kpiNarrativeSections.growth.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs sm:text-sm text-amber-900 dark:text-amber-100">
                      {kpiNarrativeSections.growth.map((item, idx) => (
                        <li key={`grw-${idx}`}>• {item}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-2 text-xs sm:text-sm text-amber-900 dark:text-amber-100">
                      Нет явных зон роста в ответе AI.
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-900/70 dark:bg-sky-950/20">
                  <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                    Действия на смену
                  </div>
                  {kpiNarrativeSections.actions.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs sm:text-sm text-sky-900 dark:text-sky-100">
                      {kpiNarrativeSections.actions.map((item, idx) => (
                        <li key={`act-${idx}`}>• {item}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-2 text-xs sm:text-sm text-sky-900 dark:text-sky-100">
                      Нет выделенных действий в ответе AI.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl bg-gray-50 p-4 text-xs sm:text-sm text-gray-800 dark:bg-gray-900 dark:text-gray-100">
                AI-нарратив пока недоступен. Числовые KPI продолжают работать в штатном режиме.
              </div>
            )}
          </section>

          <section className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950/60">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              История итогов смен
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={shiftHistoryShopFilter}
                onChange={(e) => setShiftHistoryShopFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] sm:text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="all">Все магазины</option>
                {shiftHistoryShopOptions.map((shopUuid) => (
                  <option key={shopUuid} value={shopUuid}>
                    {shopUuid}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={shiftHistoryDateFilter}
                onChange={(e) => setShiftHistoryDateFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] sm:text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => {
                  setShiftHistoryShopFilter("all");
                  setShiftHistoryDateFilter("");
                }}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] sm:text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                Сбросить
              </button>
            </div>
            <div className="mt-4 w-full max-w-full overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs sm:text-sm">
                <thead className="text-[10px] sm:text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="py-2 pr-3">Дата</th>
                    <th className="py-2 pr-3">Магазин</th>
                    <th className="py-2 pr-3">Факт</th>
                    <th className="py-2 pr-3">План</th>
                    <th className="py-2 pr-3">Топ сотрудник</th>
                    <th className="py-2 pr-3">Сводка</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800 dark:text-gray-100">
                  {filteredShiftSummaries.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-3">{row.date}</td>
                      <td className="py-2 pr-3">{row.shopUuid}</td>
                      <td className="py-2 pr-3">
                        {row.revenueActual == null ? "—" : `${Math.round(row.revenueActual)} ₽`}
                      </td>
                      <td className="py-2 pr-3">
                        {row.revenuePlan == null ? "—" : `${Math.round(row.revenuePlan)} ₽`}
                      </td>
                      <td className="py-2 pr-3">{row.topEmployee || "—"}</td>
                      <td className="py-2 pr-3 max-w-[360px]">
                        <div className="line-clamp-3 whitespace-pre-line">
                          {row.summaryText}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredShiftSummaries.length === 0 && !loading && (
                    <tr>
                      <td className="py-3 text-gray-500 dark:text-gray-400" colSpan={6}>
                        Нет данных.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950/60">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              История алертов
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={alertsHistoryShopFilter}
                onChange={(e) => setAlertsHistoryShopFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] sm:text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="all">Все магазины</option>
                {alertsHistoryShopOptions.map((shopUuid) => (
                  <option key={shopUuid} value={shopUuid}>
                    {shopUuid}
                  </option>
                ))}
              </select>
              <select
                value={alertsHistoryTypeFilter}
                onChange={(e) => setAlertsHistoryTypeFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] sm:text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="all">Все типы</option>
                <option value="tempo_alert">tempo_alert</option>
                <option value="anomaly">anomaly</option>
                <option value="dead_stock">dead_stock</option>
              </select>
              <input
                type="date"
                value={alertsHistoryDateFilter}
                onChange={(e) => setAlertsHistoryDateFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] sm:text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => {
                  setAlertsHistoryShopFilter("all");
                  setAlertsHistoryTypeFilter("all");
                  setAlertsHistoryDateFilter("");
                }}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] sm:text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                Сбросить
              </button>
            </div>
            <div className="mt-4 w-full max-w-full overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs sm:text-sm">
                <thead className="text-[10px] sm:text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="py-2 pr-3">Время</th>
                    <th className="py-2 pr-3">Магазин</th>
                    <th className="py-2 pr-3">Тип</th>
                    <th className="py-2 pr-3">Severity</th>
                    <th className="py-2 pr-3">Сообщение</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800 dark:text-gray-100">
                  {filteredAlertsHistory.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-3">{row.triggeredAt}</td>
                      <td className="py-2 pr-3">{row.shopUuid}</td>
                      <td className="py-2 pr-3">{row.alertType}</td>
                      <td className="py-2 pr-3">{row.severity}</td>
                      <td className="py-2 pr-3 max-w-[380px]">
                        <div className="line-clamp-3 whitespace-pre-line">{row.message}</div>
                      </td>
                    </tr>
                  ))}
                  {filteredAlertsHistory.length === 0 && !loading && (
                    <tr>
                      <td className="py-3 text-gray-500 dark:text-gray-400" colSpan={5}>
                        Нет данных.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                Глубокий анализ сотрудников
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-600 dark:text-gray-300">
                  Глубина:
                  <select
                    value={deepAnalysisDepth}
                    onChange={(e) =>
                      setDeepAnalysisDepth(e.target.value as "lite" | "standard" | "deep")
                    }
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] sm:text-xs text-gray-800 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  >
                    <option value="lite">Lite (4 недели)</option>
                    <option value="standard">Standard (8 недель)</option>
                    <option value="deep">Deep (16 недель)</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-600 dark:text-gray-300">
                  Чувствительность:
                  <select
                    value={deepRiskSensitivity}
                    onChange={(e) =>
                      setDeepRiskSensitivity(e.target.value as "low" | "normal" | "high")
                    }
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] sm:text-xs text-gray-800 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  >
                    <option value="low">Низкая</option>
                    <option value="normal">Нормальная</option>
                    <option value="high">Высокая</option>
                  </select>
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setFocusDropdownOpen((prev) => !prev)}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] sm:text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  >
                    Фокусы: {deepFocusAreas.length}
                  </button>
                  {focusDropdownOpen && (
                    <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                      {focusOptions.map((option) => (
                        <label
                          key={option.key}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <input
                            type="checkbox"
                            checked={deepFocusAreas.includes(option.key)}
                            onChange={() => toggleFocus(option.key)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
              Окно истории: {deepMeta?.historyDays || 0} дней. Сравнений с историей:{" "}
              {deepMeta?.comparisonCoverage?.comparableEmployees ?? 0}/
              {deepMeta?.comparisonCoverage?.totalEmployees ?? deepEmployees.length}.
            </div>
            {deepMeta?.warning === "INSUFFICIENT_HISTORY_FOR_WEEKDAY_COMPARISON" && (
              <div className="mt-1 text-[10px] sm:text-xs text-amber-600 dark:text-amber-400">
                Для выбранной глубины пока мало истории по тем же дням недели, поэтому часть
                метрик сравнения не меняется.
              </div>
            )}
            <div className="mt-4 w-full max-w-full overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-xs sm:text-sm">
                <thead className="text-[10px] sm:text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="py-2 pr-3">Сотрудник</th>
                    <th className="py-2 pr-3">Риск</th>
                    <th className="py-2 pr-3">Тренд</th>
                    <th className="py-2 pr-3">Возвраты</th>
                    <th className="py-2 pr-3">Сравнение (дни/магазин)</th>
                    <th className="py-2 pr-3">Причина</th>
                    <th className="py-2 pr-3">Рекомендация</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800 dark:text-gray-100">
                  {deepEmployees.map((row) => (
                    <tr key={row.employeeUuid} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-3">{row.name}</td>
                      <td className="py-2 pr-3 font-semibold">{Math.round(row.riskScore)}</td>
                      <td className="py-2 pr-3">
                        {row.revenueTrendPct == null
                          ? "—"
                          : `${(row.revenueTrendPct * 100).toFixed(1)}%`}
                      </td>
                      <td className="py-2 pr-3">{row.refundRatePct.toFixed(1)}%</td>
                      <td className="py-2 pr-3">
                        {(row.fairComparison?.summary.avgVsPeersPct ??
                          row.comparison?.summary.avgVsPeersPct) == null ? (
                          "—"
                        ) : (
                          <div className="leading-tight">
                            <div>
                              к похожим сменам:{" "}
                              {(
                                ((row.fairComparison?.summary.avgVsPeersPct ??
                                  row.comparison?.summary.avgVsPeersPct) as number) * 100
                              ).toFixed(1)}
                              %
                            </div>
                            <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                              слабый слот:{" "}
                              {row.fairComparison?.summary.weakestSegment
                                ? `${dayLabels[row.fairComparison.summary.weakestSegment.weekday]}, ${
                                    ["00-06", "06-12", "12-18", "18-24"][
                                      row.fairComparison.summary.weakestSegment.hourBucket
                                    ]
                                  }`
                                : row.comparison?.summary.weakestWeekday == null
                                  ? "—"
                                  : dayLabels[row.comparison.summary.weakestWeekday]}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">{row.reasons?.[0] || "—"}</td>
                      <td className="py-2 pr-3">
                        {row.recommendations?.[0] || "Продолжать текущую модель продаж"}
                      </td>
                    </tr>
                  ))}
                  {deepEmployees.length === 0 && !loading && (
                    <tr>
                      <td className="py-3 text-gray-500 dark:text-gray-400" colSpan={7}>
                        Нет данных.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950/60">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              Прогноз спроса
            </h2>
            <div className="mt-4 text-xs sm:text-sm text-gray-800 dark:text-gray-100">
              Прогноз выручки:{" "}
              <span className="font-semibold">
                {forecast ? Math.round(forecast.forecast) : 0} ₽
              </span>
            </div>
            {forecast?.weather && (
              <div className="mt-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                Погода: {forecast.weather.avgTemp}°C (мин {forecast.weather.minTemp}°C, макс{" "}
                {forecast.weather.maxTemp}°C), осадки {forecast.weather.precipSum} мм.
                Фактор спроса: {forecast.weatherFactor?.toFixed(2) ?? "1.00"}
              </div>
            )}
            {forecast?.historySource === "index" && (
              <div className="mt-1 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                Источник истории: индекс документов.
              </div>
            )}
            {forecast?.warning && (
              <div className="mt-1 text-[10px] sm:text-xs text-amber-600 dark:text-amber-400">
                {forecast.warning === "NO_HISTORY_REVENUE"
                  ? "Недостаточно исторических продаж для расчёта прогноза."
                  : forecast.warning === "SHOP_UUIDS_UNAVAILABLE"
                      ? "Не удалось определить магазины для расчёта прогноза."
                      : forecast.warning}
              </div>
            )}
          </section>

          <section className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950/60">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              Heatmap продаж
            </h2>
            <div className="mt-2 flex flex-col gap-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex flex-wrap items-center gap-3">
                <span>Меньше</span>
                <div className="h-2 w-40 rounded-full bg-gradient-to-r from-gray-100 via-amber-200 to-red-600 dark:from-gray-800 dark:via-amber-500/40 dark:to-red-500" />
                <span>Больше</span>
                <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">
                  Макс: {heatmap.max ? Math.round(heatmap.max) : 0} ₽
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500">
                {heatmapStops.map((stop) => (
                  <span key={stop}>{stop}%</span>
                ))}
              </div>
            </div>
            <div className="mt-4 w-full max-w-full overflow-x-auto">
              <div className="min-w-[700px] sm:min-w-[900px]">
                <div className="grid grid-cols-[32px_repeat(24,minmax(16px,1fr))] sm:grid-cols-[40px_repeat(24,minmax(18px,1fr))] gap-1 text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400">
                  <div />
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div key={hour} className="text-center">
                      {hour}
                    </div>
                  ))}
                </div>
                {dayLabels.map((label, dayIdx) => (
                  <div
                    key={label}
                    className="mt-1 grid grid-cols-[32px_repeat(24,minmax(16px,1fr))] sm:grid-cols-[40px_repeat(24,minmax(18px,1fr))] gap-1 text-[9px] sm:text-[10px]"
                  >
                    <div className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-300">
                      {label}
                    </div>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const value = heatmap.map.get(`${dayIdx}:${hour}`) || 0;
                      const intensity = heatmap.max
                        ? Math.min(1, value / heatmap.max)
                        : 0;
                      const low = { r: 238, g: 238, b: 238 };
                      const high = { r: 220, g: 38, b: 38 };
                      const r = Math.round(low.r + (high.r - low.r) * intensity);
                      const g = Math.round(low.g + (high.g - low.g) * intensity);
                      const b = Math.round(low.b + (high.b - low.b) * intensity);
                      const tooltip = `${label}, ${String(hour).padStart(2, "0")}:00 — ${Math.round(value)} ₽`;
                      return (
                        <div
                          key={`${dayIdx}-${hour}`}
                          title={tooltip}
                          className="h-3.5 sm:h-4 rounded-sm border border-transparent transition-colors hover:border-gray-400/80 dark:hover:border-gray-500/80"
                          style={{
                            backgroundColor: `rgb(${r}, ${g}, ${b})`,
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

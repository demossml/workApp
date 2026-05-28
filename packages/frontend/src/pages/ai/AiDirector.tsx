import { useState, useEffect, useCallback } from "react";
import { client } from "@shared/api";
import {
  Card,
  StatCard,
  Badge,
  Button,
  Select,
} from "@shared/ui";
import { DashboardSummaryWidget } from "@widgets/dashboard";
import { fetchStoreList } from "@shared/api";

// ── Types ──────────────────────────────────────────────

type ShopRating = {
  shopUuid: string;
  shopName: string;
  revenue: number;
  checks: number;
  averageCheck: number;
};

type ForecastData = {
  forecast: number;
  weather?: { avgTemp: number; minTemp: number; maxTemp: number; precipSum: number; timezone: string } | null;
  weatherFactor?: number;
  warning?: string | null;
};

type HeatmapData = {
  matrix: number[][];
  maxRevenue: number;
  dayLabels: string[];
  stops: number[];
};

type AlertItem = {
  id: number;
  shopUuid: string;
  alertType: "tempo_alert" | "anomaly" | "dead_stock";
  severity: "info" | "warning" | "critical";
  triggeredAt: string;
  message: string;
};

type BriefingData = {
  date: string;
  briefing: string;
};

type StoreInfo = { uuid: string; name: string };

// ── API helpers ─────────────────────────────────────────

const aiApi = client.api.ai as any;

async function fetchBriefing(date?: string, refresh = false): Promise<BriefingData> {
  const res = await aiApi["director/briefing"].$post({ json: { date, refresh } });
  if (!res.ok) throw new Error("Briefing failed");
  return res.json();
}

async function fetchStoreRating(date: string): Promise<ShopRating[]> {
  const res = await aiApi["director/store-rating"].$post({ json: { date } });
  if (!res.ok) return [];
  const json = await res.json();
  return json.rating || [];
}

async function fetchForecast(date: string): Promise<ForecastData> {
  const res = await aiApi["director/demand-forecast"].$post({ json: { date } });
  if (!res.ok) return { forecast: 0 };
  return res.json();
}

async function fetchHeatmap(shopUuids?: string[]): Promise<HeatmapData> {
  const res = await aiApi["director/heatmap"].$post({ json: { shopUuids } });
  if (!res.ok) return { matrix: [], maxRevenue: 0, dayLabels: [], stops: [] };
  const json = await res.json();
  const rows = json.rows || [];
  // Transform rows → 7×24 matrix
  const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let maxRevenue = 0;
  for (const row of rows) {
    const day = Number(row.dayOfWeek);
    const hour = Number(row.hour);
    const revenue = Number(row.revenue || 0);
    if (Number.isInteger(day) && day >= 0 && day <= 6 && Number.isInteger(hour) && hour >= 0 && hour <= 23) {
      matrix[day][hour] = revenue;
      if (revenue > maxRevenue) maxRevenue = revenue;
    }
  }
  return {
    matrix,
    maxRevenue,
    dayLabels: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
    stops: [0, 25, 50, 75, 100],
  };
}

async function fetchAlerts(limit = 20): Promise<AlertItem[]> {
  const res = await fetch(`/api/ai/history/alerts?limit=${limit}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.items || [];
}

// ── Page ────────────────────────────────────────────────

const toIso = (d: Date) => d.toISOString().split("T")[0];
const formatMoney = (n: number) => Math.round(n).toLocaleString("ru-RU");
const pctChange = (curr: number, prev: number) =>
  prev && prev !== 0 ? `${((curr - prev) / prev * 100).toFixed(1)}%` : "—";

export default function AiDirectorPage() {
  const today = toIso(new Date());
  const [date, setDate] = useState(today);

  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const [rating, setRating] = useState<ShopRating[]>([]);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Store filter
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [heatmapStore, setHeatmapStore] = useState<string>("");  // "" = all stores
  const [selectedCell, setSelectedCell] = useState<string>("");  // tooltip for tapped cell

  // ── Load briefing ──

  const loadBriefing = useCallback(async (d: string, refresh = false) => {
    setBriefingLoading(true);
    setBriefingError(null);
    try {
      const data = await fetchBriefing(d, refresh);
      setBriefing(data);
    } catch (err: any) {
      setBriefingError(err.message || "Ошибка брифинга");
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  // ── Load data ──

  const loadData = useCallback(async (d: string, storeUuid?: string) => {
    setLoading(true);
    const shopUuids = storeUuid ? [storeUuid] : undefined;
    const [r, f, h, a] = await Promise.all([
      fetchStoreRating(d).catch(() => [] as ShopRating[]),
      fetchForecast(d).catch(() => ({ forecast: 0 } as ForecastData)),
      fetchHeatmap(shopUuids).catch(() => ({ matrix: [], maxRevenue: 0, dayLabels: [], stops: [] } as HeatmapData)),
      fetchAlerts(20).catch(() => [] as AlertItem[]),
    ]);
    setRating(r);
    setForecast(f);
    setHeatmap(h);
    setAlerts(a);
    setLoading(false);
  }, []);

  // ── Initial load ──

  useEffect(() => {
    loadBriefing(today);
    loadData(today);
    fetchStoreList().then(setStores).catch(() => {});
  }, [today, loadBriefing, loadData]);

  const handleHeatmapStoreChange = (uuid: string) => {
    setHeatmapStore(uuid);
    loadData(date, uuid || undefined);
  };

  // ── Computed ──

  const totalRevenue = rating.reduce((s, r) => s + (r.revenue || 0), 0);
  const totalChecks = rating.reduce((s, r) => s + (r.checks || 0), 0);
  const avgCheck = totalChecks > 0 ? totalRevenue / totalChecks : 0;

  const alertBadge = (severity: string) =>
    severity === "critical" ? "danger" : severity === "warning" ? "warning" : "info";

  // ── Heatmap render ──

  const renderHeatmap = () => {
    if (!heatmap || !heatmap.matrix.length) return null;
    const { matrix, maxRevenue, dayLabels } = heatmap;
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);

    const getColor = (value: number) => {
      if (maxRevenue === 0) return "bg-gray-100 dark:bg-gray-800";
      const pct = value / maxRevenue;
      if (pct === 0) return "bg-gray-100 dark:bg-gray-800";
      if (pct < 0.25) return "bg-green-200 dark:bg-green-900";
      if (pct < 0.5) return "bg-green-400 dark:bg-green-700";
      if (pct < 0.75) return "bg-yellow-400 dark:bg-yellow-600";
      return "bg-red-400 dark:bg-red-600";
    };

    return (
      <div>
        <div 
          className="overflow-x-auto overscroll-x-contain" 
          style={{ touchAction: "pan-x", WebkitOverflowScrolling: "touch" }}
        >
          <div className="inline-grid gap-px" style={{ gridTemplateColumns: `60px repeat(24, 24px)` }}>
            <div />
            {hours.map((h) => (
              <div key={h} className="text-[9px] text-gray-500 text-center">{h.split(":")[0]}</div>
            ))}
            {matrix.map((row, di) => (
              <>
                <div key={`dl-${di}`} className="text-[10px] text-gray-600 pr-1 text-right leading-6">{dayLabels[di]}</div>
                {row.map((val, hi) => (
                  <div
                    key={`${di}-${hi}`}
                    className={`h-6 w-6 rounded-sm cursor-pointer ${getColor(val)}`}
                    title={`${dayLabels[di]} ${hi}:00 — ${formatMoney(val)} ₽`}
                    onClick={() => setSelectedCell(`${dayLabels[di]} ${hi}:00 — ${formatMoney(val)} ₽`)}
                  />
                ))}
              </>
            ))}
          </div>
        </div>
        {selectedCell && (
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 text-center">
            {selectedCell}
          </div>
        )}
      </div>
    );
  };

  // ── Render ──

  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-gray-100 dark:bg-gray-900 pt-20 sm:pt-24 px-2 sm:px-6 pb-24">
      <div className="w-full max-w-7xl min-w-0 space-y-4 sm:space-y-6">

        {/* ── Briefing ── */}
        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              📋 Утренний брифинг
            </h2>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); loadBriefing(e.target.value); loadData(e.target.value); }}
                className="h-8 px-2 text-xs border rounded dark:bg-gray-800 dark:border-gray-700"
              />
              <Button size="sm" onClick={() => loadBriefing(date, true)} disabled={briefingLoading}>
                {briefingLoading ? "..." : "Обновить"}
              </Button>
            </div>
          </div>

          {briefingError && (
            <div className="mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
              {briefingError}
            </div>
          )}

          {briefing ? (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-line text-sm text-gray-800 dark:text-gray-200">
              {briefing.briefing}
            </div>
          ) : briefingLoading ? (
            <div className="text-sm text-gray-500">Загружаю брифинг...</div>
          ) : null}
        </Card>

        {/* ── KPI Tiles ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Выручка" value={`${formatMoney(totalRevenue)} ₽`} />
          <StatCard label="Чеки" value={`${totalChecks} шт`} />
          <StatCard label="Средний чек" value={`${formatMoney(avgCheck)} ₽`} />
          <StatCard
            label="Прогноз"
            value={forecast ? `${formatMoney(forecast.forecast)} ₽` : "—"}
          />
        </div>

        {/* ── Store Rating ── */}
        <Card className="p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            🏪 Рейтинг магазинов
          </h2>
          {loading ? (
            <div className="text-sm text-gray-500">Загрузка...</div>
          ) : rating.length === 0 ? (
            <div className="text-sm text-gray-500">Нет данных</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="pb-2">Магазин</th>
                    <th className="pb-2 text-right">Выручка</th>
                    <th className="pb-2 text-right">Чеки</th>
                    <th className="pb-2 text-right">Ср. чек</th>
                  </tr>
                </thead>
                <tbody>
                  {rating.map((r) => (
                    <tr key={r.shopUuid} className="border-t dark:border-gray-700">
                      <td className="py-2 font-medium">{r.shopName}</td>
                      <td className="py-2 text-right">{formatMoney(r.revenue)} ₽</td>
                      <td className="py-2 text-right">{r.checks}</td>
                      <td className="py-2 text-right">{formatMoney(r.averageCheck)} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Heatmap + Forecast ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                🔥 Тепловая карта
              </h2>
              <Select
                value={heatmapStore}
                onChange={(e: any) => handleHeatmapStoreChange(e.target.value)}
                className="h-8 text-xs w-40"
              >
                <option value="">Все магазины</option>
                {stores.map((s) => (
                  <option key={s.uuid} value={s.uuid}>{s.name}</option>
                ))}
              </Select>
            </div>
            {renderHeatmap() || <div className="text-sm text-gray-500">Нет данных</div>}
          </Card>

          <Card className="p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              🌤 Прогноз
            </h2>
            {forecast ? (
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">Выручка:</span>{" "}
                  <span className="font-semibold">{formatMoney(forecast.forecast)} ₽</span>
                </div>
                {forecast.weather && (
                  <>
                    <div>
                      <span className="text-gray-500">Температура:</span>{" "}
                      {forecast.weather.avgTemp}°C (от {forecast.weather.minTemp} до {forecast.weather.maxTemp})
                    </div>
                    <div>
                      <span className="text-gray-500">Осадки:</span>{" "}
                      {forecast.weather.precipSum} мм
                    </div>
                  </>
                )}
                {forecast.weatherFactor && forecast.weatherFactor !== 1 && (
                  <div>
                    <span className="text-gray-500">Коэф. погоды:</span>{" "}
                    <span className={forecast.weatherFactor > 1 ? "text-green-600" : "text-red-600"}>
                      {forecast.weatherFactor > 1 ? "+" : ""}{((forecast.weatherFactor - 1) * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
                {forecast.warning && (
                  <div className="text-amber-600 dark:text-amber-400 text-xs">{forecast.warning}</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Нет данных</div>
            )}
          </Card>
        </div>

        {/* ── Alerts ── */}
        <Card className="p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            🚨 Алерты
          </h2>
          {alerts.length === 0 ? (
            <div className="text-sm text-gray-500">Алертов нет</div>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 15).map((a) => (
                <div key={a.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <Badge tone={alertBadge(a.severity)} className="shrink-0 mt-0.5 text-[10px]">
                    {a.severity}
                  </Badge>
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500">{a.triggeredAt?.slice(0, 16)} · {a.alertType}</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200">{a.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}

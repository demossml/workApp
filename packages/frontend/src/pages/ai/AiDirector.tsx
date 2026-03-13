import { useEffect, useMemo, useState } from "react";
import DashboardSummary2 from "../../components/dashboard/DashboardSummary";
import { client } from "../../helpers/api";

export default function AiDirectorPage() {
  const aiDirector = client.api.ai as any;
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
        const [ratingRes, employeesRes, forecastRes, heatmapRes] =
          await Promise.all([
            aiDirector["director/store-rating"].$post({ json: { date: todayStr } }),
            aiDirector["director/employee-analysis"].$post({
              json: { until: todayStr },
            }),
            aiDirector["director/demand-forecast"].$post({ json: { date: todayStr } }),
            aiDirector["director/heatmap"].$post({ json: {} }),
          ]);

        if (!ratingRes.ok) throw new Error("Не удалось загрузить рейтинг");
        if (!employeesRes.ok) throw new Error("Не удалось загрузить сотрудников");
        if (!forecastRes.ok) throw new Error("Не удалось загрузить прогноз");
        if (!heatmapRes.ok) throw new Error("Не удалось загрузить heatmap");

        const ratingJson = await ratingRes.json();
        const employeesJson = await employeesRes.json();
        const forecastJson = await forecastRes.json();
        const heatmapJson = await heatmapRes.json();

        if (cancelled) return;
        setRating(ratingJson.rating || []);
        setEmployees(employeesJson.employees || []);
        setForecast({
          forecast: Number(forecastJson.forecast || 0),
          weather: forecastJson.weather || null,
          weatherFactor:
            typeof forecastJson.weatherFactor === "number"
              ? forecastJson.weatherFactor
              : undefined,
        });
        setHeatmapRows(heatmapJson.rows || []);
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
  }, [aiDirector, todayStr]);

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

  const dayLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const heatmapStops = [0, 25, 50, 75, 100];

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

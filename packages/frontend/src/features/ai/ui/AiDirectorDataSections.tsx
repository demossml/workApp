import type { AiDirectorPageModel } from "@features/ai/hooks/useAiDirectorPageModel";
import { Badge, Button, Card, Input, Select } from "@shared/ui";

type Props = {
  model: AiDirectorPageModel;
};

export function AiDirectorDataSections({ model }: Props) {
  const {
    loading,
    error,
    rating,
    employees,
    shiftHistoryShopFilter,
    setShiftHistoryShopFilter,
    shiftHistoryShopOptions,
    shiftHistoryDateFilter,
    setShiftHistoryDateFilter,
    filteredShiftSummaries,
    alertsHistoryShopFilter,
    setAlertsHistoryShopFilter,
    alertsHistoryShopOptions,
    alertsHistoryTypeFilter,
    setAlertsHistoryTypeFilter,
    alertsHistoryDateFilter,
    setAlertsHistoryDateFilter,
    filteredAlertsHistory,
    deepAnalysisDepth,
    setDeepAnalysisDepth,
    deepRiskSensitivity,
    setDeepRiskSensitivity,
    focusDropdownOpen,
    setFocusDropdownOpen,
    deepFocusAreas,
    focusOptions,
    toggleFocus,
    deepMeta,
    deepEmployees,
    dayLabels,
    forecast,
    heatmap,
    heatmapStops,
  } = model;

  const getHeatCellClass = (value: number) => {
    if (!heatmap.max || value <= 0) return "bg-gray-100 dark:bg-gray-800";
    const ratio = value / heatmap.max;
    if (ratio >= 0.9) return "bg-red-600";
    if (ratio >= 0.75) return "bg-red-500";
    if (ratio >= 0.6) return "bg-orange-500";
    if (ratio >= 0.45) return "bg-amber-400";
    if (ratio >= 0.3) return "bg-amber-300";
    if (ratio >= 0.15) return "bg-gray-300 dark:bg-gray-600";
    return "bg-gray-200 dark:bg-gray-700";
  };

  return (
    <>
      <Card className="order-10 w-full min-w-0 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
            Рейтинг магазинов
          </h2>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs sm:text-sm text-gray-600 dark:text-gray-300">
            Подробнее: таблица рейтинга
          </summary>
          {loading && (
            <span className="mt-2 inline-block text-xs text-gray-500 dark:text-gray-400">
              Загрузка...
            </span>
          )}
          {error && <div className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</div>}
          <div className="mt-3 w-full max-w-full overflow-x-auto">
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
                    <td className="py-2 pr-3">{Math.round(row.averageCheck)} ₽</td>
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
        </details>
      </Card>

      <Card className="order-11 w-full min-w-0 p-4 sm:p-5">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
          Анализ сотрудников
        </h2>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs sm:text-sm text-gray-600 dark:text-gray-300">
            Подробнее: таблица сотрудников
          </summary>
          <div className="mt-3 w-full max-w-full overflow-x-auto">
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
                    <td className="py-2 pr-3">{Math.round(row.averageCheck)} ₽</td>
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
        </details>
      </Card>

      <Card className="order-12 w-full min-w-0 p-4 sm:p-5">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
          История итогов смен
        </h2>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs sm:text-sm text-gray-600 dark:text-gray-300">
            Подробнее: история итогов
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <Select
              value={shiftHistoryShopFilter}
              onChange={(e) => setShiftHistoryShopFilter(e.target.value)}
              className="h-8 w-auto px-2 text-[11px] sm:text-xs"
            >
              <option value="all">Все магазины</option>
              {shiftHistoryShopOptions.map((shopUuid) => (
                <option key={shopUuid} value={shopUuid}>
                  {shopUuid}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={shiftHistoryDateFilter}
              onChange={(e) => setShiftHistoryDateFilter(e.target.value)}
              className="h-8 w-auto px-2 text-[11px] sm:text-xs"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setShiftHistoryShopFilter("all");
                setShiftHistoryDateFilter("");
              }}
              className="text-[11px] sm:text-xs"
            >
              Сбросить
            </Button>
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
                      <div className="line-clamp-3 whitespace-pre-line">{row.summaryText}</div>
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
        </details>
      </Card>

      <Card className="order-13 w-full min-w-0 p-4 sm:p-5">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
          История алертов
        </h2>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs sm:text-sm text-gray-600 dark:text-gray-300">
            Подробнее: журнал алертов
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <Select
              value={alertsHistoryShopFilter}
              onChange={(e) => setAlertsHistoryShopFilter(e.target.value)}
              className="h-8 w-auto px-2 text-[11px] sm:text-xs"
            >
              <option value="all">Все магазины</option>
              {alertsHistoryShopOptions.map((shopUuid) => (
                <option key={shopUuid} value={shopUuid}>
                  {shopUuid}
                </option>
              ))}
            </Select>
            <Select
              value={alertsHistoryTypeFilter}
              onChange={(e) =>
                setAlertsHistoryTypeFilter(
                  e.target.value as "all" | "tempo_alert" | "anomaly" | "dead_stock",
                )
              }
              className="h-8 w-auto px-2 text-[11px] sm:text-xs"
            >
              <option value="all">Все типы</option>
              <option value="tempo_alert">tempo_alert</option>
              <option value="anomaly">anomaly</option>
              <option value="dead_stock">dead_stock</option>
            </Select>
            <Input
              type="date"
              value={alertsHistoryDateFilter}
              onChange={(e) => setAlertsHistoryDateFilter(e.target.value)}
              className="h-8 w-auto px-2 text-[11px] sm:text-xs"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setAlertsHistoryShopFilter("all");
                setAlertsHistoryTypeFilter("all");
                setAlertsHistoryDateFilter("");
              }}
              className="text-[11px] sm:text-xs"
            >
              Сбросить
            </Button>
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
                    <td className="py-2 pr-3">
                      <Badge
                        tone={
                          row.severity === "critical"
                            ? "danger"
                            : row.severity === "warning"
                              ? "warning"
                              : "info"
                        }
                      >
                        {row.severity}
                      </Badge>
                    </td>
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
        </details>
      </Card>

      <Card className="order-14 w-full min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
            Глубокий анализ сотрудников
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-600 dark:text-gray-300">
              Глубина:
              <Select
                value={deepAnalysisDepth}
                onChange={(e) => setDeepAnalysisDepth(e.target.value as "lite" | "standard" | "deep")}
                className="h-8 w-auto px-2 text-[11px] sm:text-xs"
              >
                <option value="lite">Lite (4 недели)</option>
                <option value="standard">Standard (8 недель)</option>
                <option value="deep">Deep (16 недель)</option>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-600 dark:text-gray-300">
              Чувствительность:
              <Select
                value={deepRiskSensitivity}
                onChange={(e) => setDeepRiskSensitivity(e.target.value as "low" | "normal" | "high")}
                className="h-8 w-auto px-2 text-[11px] sm:text-xs"
              >
                <option value="low">Низкая</option>
                <option value="normal">Нормальная</option>
                <option value="high">Высокая</option>
              </Select>
            </label>
            <div className="relative">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setFocusDropdownOpen((prev) => !prev)}
                className="text-[11px] sm:text-xs"
              >
                Фокусы: {deepFocusAreas.length}
              </Button>
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
        <details className="mt-2">
          <summary className="cursor-pointer text-xs sm:text-sm text-gray-600 dark:text-gray-300">
            Подробнее: аналитическая таблица по сотрудникам
          </summary>
          <div className="mt-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
            Окно истории: {deepMeta?.historyDays || 0} дней. Сравнений с историей:{" "}
            {deepMeta?.comparisonCoverage?.comparableEmployees ?? 0}/
            {deepMeta?.comparisonCoverage?.totalEmployees ?? deepEmployees.length}.
          </div>
          {deepMeta?.warning === "INSUFFICIENT_HISTORY_FOR_WEEKDAY_COMPARISON" && (
            <div className="mt-1 text-[10px] sm:text-xs text-amber-600 dark:text-amber-400">
              Для выбранной глубины пока мало истории по тем же дням недели, поэтому часть метрик
              сравнения не меняется.
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
                      {row.revenueTrendPct == null ? "—" : `${(row.revenueTrendPct * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-2 pr-3">{row.refundRatePct.toFixed(1)}%</td>
                    <td className="py-2 pr-3">
                      {(row.fairComparison?.summary.avgVsPeersPct ?? row.comparison?.summary.avgVsPeersPct) ==
                      null ? (
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
        </details>
      </Card>

      <Card className="w-full min-w-0 p-4 sm:p-5">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
          Прогноз спроса
        </h2>
        <div className="mt-4 text-xs sm:text-sm text-gray-800 dark:text-gray-100">
          Прогноз выручки: <span className="font-semibold">{forecast ? Math.round(forecast.forecast) : 0} ₽</span>
        </div>
        {forecast?.weather && (
          <div className="mt-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
            Погода: {forecast.weather.avgTemp}°C (мин {forecast.weather.minTemp}°C, макс{" "}
            {forecast.weather.maxTemp}°C), осадки {forecast.weather.precipSum} мм. Фактор спроса:{" "}
            {forecast.weatherFactor?.toFixed(2) ?? "1.00"}
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
      </Card>

      <Card className="w-full min-w-0 p-4 sm:p-5">
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
                  const value = heatmap.matrix?.[dayIdx]?.[hour] || 0;
                  const tooltip = `${label}, ${String(hour).padStart(2, "0")}:00 — ${Math.round(value)} ₽`;
                  return (
                    <div
                      key={`${dayIdx}-${hour}`}
                      title={tooltip}
                      className={`h-3.5 sm:h-4 rounded-sm border border-transparent transition-colors hover:border-gray-400/80 dark:hover:border-gray-500/80 ${getHeatCellClass(value)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}

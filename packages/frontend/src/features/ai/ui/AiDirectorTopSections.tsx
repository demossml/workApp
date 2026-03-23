import type { AiDirectorPageModel } from "@features/ai/hooks/useAiDirectorPageModel";
import { AlertCard, Badge, Button, Card, Select, StatCard, Textarea } from "@shared/ui";

type Props = {
  model: AiDirectorPageModel;
};

export function AiDirectorTopSections({ model }: Props) {
  const {
    systemStatus,
    topKpi,
    problemsSummary,
    directorDecisions,
    handleQuickAction,
    quickActionNote,
    decisionsLog,
    chatMessage,
    setChatMessage,
    handleChat,
    chatLoading,
    chatError,
    chatReply,
    kpiNarrativeShopName,
    kpiSelectedShopUuid,
    setKpiSelectedShopUuid,
    rating,
    handleRefreshKpiNarrative,
    kpiNarrativeLoading,
    kpiNarrativeError,
    kpiNarrative,
    kpiNarrativeSections,
  } = model;

  const systemBadgeTone = systemStatus.label.toLowerCase().includes("крит")
    ? "danger"
    : systemStatus.label.toLowerCase().includes("проблем")
      ? "warning"
      : "success";

  return (
    <>
      <Card className="order-1 w-full min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              AI-Директор
            </h2>
            <div className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
              Персона: <span className="font-medium">Алексей, операционный директор</span>
            </div>
          </div>
          <Badge tone={systemBadgeTone} className="px-3 py-2 text-xs sm:text-sm font-semibold">
            {systemStatus.icon} {systemStatus.label}
          </Badge>
        </div>
      </Card>

      <Card className="order-2 w-full min-w-0 p-4 sm:p-5">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
          KPI
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <StatCard
            label="Выручка сети"
            value={`${Math.round(topKpi.totalRevenue).toLocaleString("ru-RU")} ₽`}
          />
          <StatCard label="Чеки" value={topKpi.totalChecks} />
          <StatCard
            label="Средний чек"
            value={`${Math.round(topKpi.avgCheck).toLocaleString("ru-RU")} ₽`}
          />
          <StatCard label="Зона внимания" value={topKpi.weakShops} tone="warning" />
        </div>
      </Card>

      <Card className="order-3 w-full min-w-0 p-4 sm:p-5">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
          Проблемы
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <AlertCard
            title="Критичные сигналы"
            severity="critical"
            value={problemsSummary.criticalAlerts.length}
            description={
              problemsSummary.criticalAlerts[0]?.message
                ? problemsSummary.criticalAlerts[0].message.slice(0, 120)
                : "Критичных алертов не обнаружено"
            }
          />
          <AlertCard
            title="Зоны риска"
            severity="warning"
            value={problemsSummary.riskyEmployees.length}
            description={
              <>
                Высокий риск у сотрудников и смен. Возвраты &gt; 5%:{" "}
                {problemsSummary.highRefundEmployees.length}
              </>
            }
          />
        </div>
      </Card>

      <Card className="order-4 w-full min-w-0 p-4 sm:p-5">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
          Рекомендации от директора
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {directorDecisions.length > 0 ? (
            directorDecisions.map((item, idx) => (
              <Card
                key={`${item.employeeName}-${idx}`}
                className="p-3"
              >
                <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                  Риск: {item.risk}/100
                </div>
                <div className="mt-1 text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100">
                  {item.employeeName}
                </div>
                <div className="mt-2 text-xs text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Проблема:</span> {item.problem}
                </div>
                <div className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Действие:</span> {item.action}
                </div>
              </Card>
            ))
          ) : (
            <Card className="p-3 text-xs text-gray-500 dark:text-gray-400 sm:col-span-3">
              AI пока не выявил критичных решений.
            </Card>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Исправить", "Создать задачу", "Отправить сотруднику", "Изменить цену"].map(
            (action) => (
              <Button
                key={action}
                type="button"
                onClick={() => handleQuickAction(action)}
                variant="secondary"
                size="sm"
                className="text-[11px] sm:text-xs font-medium"
              >
                {action}
              </Button>
            ),
          )}
        </div>
        {quickActionNote && (
          <div className="mt-2 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
            {quickActionNote}
          </div>
        )}
      </Card>

      <Card className="order-5 w-full min-w-0 p-4 sm:p-5">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
          История решений AI
        </h2>
        <div className="mt-3 space-y-2">
          {decisionsLog.length > 0 ? (
            decisionsLog.map((item) => (
              <Card
                key={item.id}
                className="p-3 text-xs sm:text-sm"
              >
                <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                  {item.when} · {item.type} · {item.severity}
                  <Badge
                    tone={
                      item.severity === "critical"
                        ? "danger"
                        : item.severity === "warning"
                          ? "warning"
                          : "info"
                    }
                  >
                    {item.severity}
                  </Badge>
                </div>
                <div className="mt-1 line-clamp-2 whitespace-pre-line text-gray-800 dark:text-gray-100">
                  {item.text}
                </div>
              </Card>
            ))
          ) : (
            <Card className="p-3 text-xs text-gray-500 dark:text-gray-400">
              История решений пока пуста.
            </Card>
          )}
        </div>
      </Card>

      <Card className="order-6 w-full min-w-0 p-4 sm:p-5">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
          KPI Narrative
        </h2>
        <div className="mt-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
          {kpiNarrativeShopName
            ? `Сводка по магазину: ${kpiNarrativeShopName}`
            : "Сводка по KPI сотрудников"}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value={kpiSelectedShopUuid}
            onChange={(e) => setKpiSelectedShopUuid(e.target.value)}
            className="h-8 w-auto px-2 text-[11px] sm:text-xs"
          >
            <option value="" disabled>
              Выберите магазин
            </option>
            {rating.map((row) => (
              <option key={row.shopUuid} value={row.shopUuid}>
                {row.shopName}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            onClick={handleRefreshKpiNarrative}
            disabled={!kpiSelectedShopUuid || kpiNarrativeLoading}
            size="sm"
            className="text-[11px] sm:text-xs font-semibold"
          >
            {kpiNarrativeLoading ? "Обновляю..." : "Перегенерировать"}
          </Button>
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
      </Card>

      <Card className="order-last w-full min-w-0 p-4 sm:p-5">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
          Чат с директором (опционально)
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          <Textarea
            className="min-h-[90px] text-xs sm:text-sm"
            placeholder="Например: почему упали продажи?"
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={handleChat}
              disabled={chatLoading}
              className="text-xs sm:text-sm font-semibold"
            >
              {chatLoading ? "Думаю..." : "Спросить"}
            </Button>
            {chatError && <span className="text-sm text-red-600 dark:text-red-400">{chatError}</span>}
          </div>
          {chatReply && (
            <div className="rounded-xl bg-gray-50 p-4 text-xs sm:text-sm text-gray-800 dark:bg-gray-900 dark:text-gray-100">
              {chatReply}
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

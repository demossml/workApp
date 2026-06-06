import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Info } from "lucide-react";
import { useEmployeeNameAndUuid } from "@/hooks/useApi";
import { useSellerEffectiveness } from "@/hooks/dashboard/useSellerEffectiveness";

// ====== Helpers ======

function fmtRub(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ₽`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k ₽`;
  return `${Math.round(n)} ₽`;
}

function trendArrow(dir: "↑" | "↓" | "→"): { icon: JSX.Element; color: string } {
  if (dir === "↑") return { icon: <TrendingUp className="w-3.5 h-3.5" />, color: "text-emerald-500" };
  if (dir === "↓") return { icon: <TrendingDown className="w-3.5 h-3.5" />, color: "text-red-500" };
  return { icon: <span className="text-base">→</span>, color: "text-gray-400" };
}

// ====== Loading skeleton ======

function LoadingSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 animate-pulse">
      <div className="flex justify-between mb-3">
        <div className="space-y-1.5">
          <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-20 bg-gray-100 dark:bg-gray-750 rounded" />
        </div>
        <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="bg-gray-50 dark:bg-gray-750 rounded-lg p-2.5 space-y-1.5">
            <div className="h-2.5 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-2 w-12 bg-gray-100 dark:bg-gray-750 rounded" />
          </div>
        ))}
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full" />
    </div>
  );
}

// ====== Error / Empty states ======

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
      <div className="text-center text-gray-400 dark:text-gray-500 py-4">
        <Info className="w-6 h-6 mx-auto mb-1.5 opacity-50" />
        <div className="text-[11px]">{message}</div>
      </div>
    </div>
  );
}

// ====== Main widget ======

export function MyPerformanceWidget() {
  const { data: emp } = useEmployeeNameAndUuid();
  const { data: effData, isLoading, isError } = useSellerEffectiveness({ period: 90 });
  const [expanded, setExpanded] = useState(false);

  // Loading
  if (isLoading) return <LoadingSkeleton />;

  // Error
  if (isError || !effData) {
    return <EmptyState message="Не удалось загрузить данные. Попробуйте позже." />;
  }

  // No employee data yet
  if (!emp) return <LoadingSkeleton />;

  // No employee match
  if (!emp.employeeNameAndUuid?.[0]?.uuid) {
    return <EmptyState message="Сотрудник не найден" />;
  }

  // Find seller by UUID
  const seller = effData.sellers.find(s => s.uuid === emp.employeeNameAndUuid[0].uuid);

  if (!seller || seller.daysWorked < 1) {
    return <EmptyState message="Нет данных о продажах за период" />;
  }

  const t = trendArrow(seller.trendDirection);
  const mainStore = seller.stores[0];
  const baseline = effData.baselines.find(b => b.store === mainStore?.store);
  const isExpanded = expanded;

  // Build analysis from real data
  const diagnosisParts: string[] = [];
  if (seller.riskReasons.length > 0) {
    diagnosisParts.push(...seller.riskReasons);
  }
  if (seller.trendSlope < -30) {
    diagnosisParts.push(`Тренд ${seller.trendSlope} ₽/день — снижение`);
  }
  if (seller.cv > 30) {
    diagnosisParts.push(`Волатильность CV ${seller.cv}% — выше нормы`);
  }

  const actions: string[] = [];
  if (seller.avgCheck < seller.targetAvgCheck) {
    actions.push(`Повысить средний чек с ${seller.avgCheck} до ${seller.targetAvgCheck} ₽ (+${seller.targetAvgCheck - seller.avgCheck} ₽). Цель: тренинг upselling.`);
  }
  if (seller.vapeShare < seller.targetVapeShare) {
    actions.push(`Увеличить vape-долю с ${seller.vapeShare}% до ${seller.targetVapeShare}%. Выучить топ-10 вейп-позиций.`);
  }
  if (seller.cv > 30) {
    actions.push("Стабилизировать выручку: проанализировать график смен, исключить «плохие» дни.");
  }
  if (seller.checksPerDay > 70) {
    actions.push("Высокий поток покупателей — фокус на повышении чека, а не количества.");
  }

  const strengths: string[] = [];
  if (seller.avgCheck >= seller.targetAvgCheck) {
    strengths.push(`Средний чек ${seller.avgCheck} ₽ — выше целевого (${seller.targetAvgCheck} ₽).`);
  }
  if (seller.vapeShare >= seller.targetVapeShare) {
    strengths.push(`Vape-доля ${seller.vapeShare}% — отличная работа с основным ассортиментом.`);
  }
  if (seller.cv <= 25) {
    strengths.push(`CV ${seller.cv}% — стабильная выручка.`);
  }
  if (seller.rank <= 3) {
    strengths.push(`Место #${seller.rank} в рейтинге сети — топ-продавец.`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Мои показатели</h3>
            <div className="text-[10px] text-gray-400">{seller.daysWorked} смен за 90 дней</div>
          </div>
          <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            seller.riskLevel === "critical" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
            seller.riskLevel === "warn" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
            "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          }`}>
            {seller.riskLevel === "critical" ? "⚠ Требует внимания" : seller.riskLevel === "warn" ? "Есть риски" : "Всё хорошо"}
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-2.5">
            <div className="text-[10px] text-gray-500">Выручка/день</div>
            <div className="text-base font-bold text-gray-800 dark:text-gray-100">{fmtRub(seller.avgDailyRev)}</div>
            {baseline && (
              <div className="text-[10px] text-gray-400 mt-0.5">
                {Math.round(seller.avgDailyRev / baseline.avgDailyRev * 100)}% от {mainStore.store}
              </div>
            )}
          </div>
          <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-2.5">
            <div className="text-[10px] text-gray-500">Средний чек</div>
            <div className="text-base font-bold text-gray-800 dark:text-gray-100">{seller.avgCheck} ₽</div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {seller.checksPerDay} чеков/день
              {seller.rubPerHour != null && <span> · {fmtRub(seller.rubPerHour)}/ч</span>}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-2.5">
            <div className="text-[10px] text-gray-500">Тренд</div>
            <div className={`text-base font-bold flex items-center gap-1 ${t.color}`}>
              {t.icon}
              {seller.trendSlope > 0 ? "+" : ""}{seller.trendSlope} ₽/д
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">R²={seller.trendR2.toFixed(3)}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-2.5">
            <div className="text-[10px] text-gray-500">Стабильность</div>
            <div className={`text-base font-bold ${seller.cv > 35 ? "text-red-500" : seller.cv > 30 ? "text-amber-500" : "text-emerald-500"}`}>
              CV {seller.cv}%
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">MAD {seller.mad.toFixed(3)}</div>
          </div>
        </div>

        {/* Rank + Delta */}
        <div className="flex items-center gap-3 mb-3 text-[11px]">
          <span className="text-gray-500">Место в рейтинге:</span>
          <span className="font-bold text-gray-800 dark:text-gray-100">#{seller.rank}</span>
          {seller.deltaRank != null && (
            <span className={`font-semibold ${seller.deltaRank > 0 ? "text-emerald-500" : seller.deltaRank < 0 ? "text-red-500" : "text-gray-400"}`}>
              {seller.deltaRank > 0 ? "↑" : seller.deltaRank < 0 ? "↓" : "="}{Math.abs(seller.deltaRank)}
            </span>
          )}
          <span className="text-gray-400 ml-auto text-[10px]">из {effData.sellers.filter(s => s.daysWorked >= 10).length}</span>
        </div>

        {/* Vape + Acc bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
            <span>Специализация</span>
            <span className="flex gap-2">
              <span className="text-purple-600">Vape {seller.vapeShare}%</span>
              <span className="text-amber-600">Акс. {seller.accShare}%</span>
            </span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
            <div className="bg-purple-500" style={{ width: `${seller.vapeShare}%` }} />
            <div className="bg-amber-500" style={{ width: `${seller.accShare}%` }} />
            <div className="bg-gray-300 dark:bg-gray-600" style={{ width: `${Math.max(0, 100 - seller.vapeShare - seller.accShare)}%` }} />
          </div>
        </div>

        {/* Expand button */}
        <button
          onClick={() => setExpanded(!isExpanded)}
          className="w-full text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-750 border border-gray-100 dark:border-gray-700 transition-colors"
        >
          {isExpanded ? (
            <><ChevronUp className="w-3 h-3" />Свернуть</>
          ) : (
            <><ChevronDown className="w-3 h-3" />Подробный анализ моих показателей</>
          )}
        </button>
      </div>

      {/* Expanded analysis */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-gray-100 dark:border-gray-700"
          >
            <div className="p-4 space-y-3 bg-gray-50/50 dark:bg-gray-750">
              {/* Strengths */}
              {strengths.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">Сильные стороны</div>
                  <div className="space-y-0.5">
                    {strengths.map((s, i) => (
                      <div key={i} className="text-[10px] text-gray-700 dark:text-gray-300 flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diagnosis */}
              {diagnosisParts.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Диагноз</div>
                  <div className="space-y-0.5">
                    {diagnosisParts.map((d, i) => (
                      <div key={i} className="text-[10px] text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                        <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                        <span>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {actions.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">План действий</div>
                  <div className="space-y-1">
                    {actions.map((a, i) => (
                      <div key={i} className="text-[10px] text-gray-700 dark:text-gray-300 flex items-start gap-1.5">
                        <span className="text-blue-500 font-bold mt-0.5 shrink-0">{i + 1}.</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* KPI targets */}
              <div>
                <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">KPI цели</div>
                <div className="space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Чек</span>
                      <span className="text-gray-700 dark:text-gray-200">{seller.avgCheck} / {seller.targetAvgCheck} ₽</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 mt-0.5 overflow-hidden">
                      <div className={`h-full rounded-full ${seller.avgCheck >= seller.targetAvgCheck ? "bg-emerald-500" : "bg-blue-500"}`}
                        style={{ width: `${Math.min(seller.avgCheck / seller.targetAvgCheck * 100, 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Vape</span>
                      <span className="text-gray-700 dark:text-gray-200">{seller.vapeShare} / {seller.targetVapeShare}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 mt-0.5 overflow-hidden">
                      <div className={`h-full rounded-full ${seller.vapeShare >= seller.targetVapeShare ? "bg-emerald-500" : "bg-purple-500"}`}
                        style={{ width: `${Math.min(seller.vapeShare / seller.targetVapeShare * 100, 100)}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Store breakdown */}
              <div>
                <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Мои магазины</div>
                <div className="space-y-1">
                  {seller.stores.map(st => {
                    const sBaseline = effData.baselines.find(b => b.store === st.store);
                    const eff = sBaseline ? Math.round(st.avgDailyRev / sBaseline.avgDailyRev * 100) : null;
                    return (
                      <div key={st.store} className="flex items-center justify-between text-[10px] py-1 px-2 rounded bg-white dark:bg-gray-800">
                        <span className="text-gray-700 dark:text-gray-200">{st.store} · {st.days}д</span>
                        <span className="font-medium text-gray-800 dark:text-gray-100">
                          {fmtRub(st.avgDailyRev)}
                          {eff !== null && (
                            <span className={`ml-1 ${eff >= 100 ? "text-emerald-500" : "text-amber-500"}`}>({eff}%)</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

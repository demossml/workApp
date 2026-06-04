import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, BarChart3, ShoppingBag, AlertTriangle, Info } from "lucide-react";
import { useEmployeeNameAndUuid } from "@/hooks/useApi";
import {
  SELLERS, STORE_BASELINES,
  type SellerMetrics,
} from "@/entities/seller-effectiveness/types";

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

// ====== Detail per seller ======

const analysis: Record<string, { diagnosis: string; causes: string[]; actions: string[]; strengths: string[] }> = {
  "valya": {
    diagnosis: "Системный спад: −93 ₽/день. При сохранении тренда через 2 месяца выйдет на 21 000 ₽/день (−19%). Самый низкий чек в сети.",
    causes: [
      "Чек 318 ₽ — самый низкий. Разница с лучшим (393 ₽) = 75 ₽ с каждой покупки.",
      "Vape-доля 15.7% — не работает с основным ассортиментом.",
      "Высокий поток (81 чек/д) при низком чеке — конвейер дешёвых продаж.",
    ],
    actions: [
      "Тренинг upselling: к каждой одноразке предлагать жидкость (+150–250 ₽). Цель: чек ≥ 350 ₽ за 2 недели.",
      "Выучить топ-10 вейп-позиций и их преимущества. Цель: vape-доля ≥ 18%.",
      "2 смены в паре с Александрой (эталон сети).",
    ],
    strengths: ["Высокая проходимость (81 чек/д — рекорд). При повышении чека станет лидером."],
  },
  "1133134176": {
    diagnosis: "Максимальная волатильность (CV 36.3%). Хорошие дни 30 000+ ₽, плохие — 12 000 ₽. Проблема во внешних факторах, а не в навыках.",
    causes: [
      "CV 36.3% + MAD 0.281 — худшие показатели стабильности.",
      "Две точки: Победа (CV 38.4%) и Твардоского (31.5%). Смена локации добавляет нестабильность.",
      "Эффективность vs магазин 92% — стабильно ниже baseline.",
    ],
    actions: [
      "Закрепить за одной точкой на месяц — исключить фактор смены магазина.",
      "Проанализировать график: возможно, достаются «плохие» смены.",
      "Цель: снизить CV до ≤ 30% за счёт стабилизации графика.",
    ],
    strengths: ["Стабильный чек (345 ₽). В хорошие дни показывает результаты выше среднего."],
  },
};

// ====== Main widget ======

export function MyPerformanceWidget() {
  const { data: emp } = useEmployeeNameAndUuid();
  const [expanded, setExpanded] = useState(false);

  if (!emp?.uuid) return null;

  // Match employee UUID to seller
  const seller = SELLERS.find(s => {
    // Try exact UUID match first
    if (s.uuid === emp.uuid) return true;
    // Also match by known employee UUIDs from DuckDB
    const knownUuids: Record<string, string> = {
      // These are Telegram IDs from employees table
      "6555710145": "6555710145",   // Сухорукова
      "5415308750": "5415308750",   // Алла
      "769619168": "769619168",     // Карина Боброва
      "59618984877": "59618984877", // Александра
      "1133134176": "1133134176",   // Федорова
    };
    return s.uuid === knownUuids[emp.uuid];
  });

  if (!seller) return null;

  const t = trendArrow(seller.trendDirection);
  const detail = analysis[seller.uuid];
  const mainStore = seller.stores[0];
  const baseline = STORE_BASELINES.find(b => b.store === mainStore?.store);
  const isExpanded = expanded;

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
            <div className="text-[10px] text-gray-400 mt-0.5">{seller.checksPerDay} чеков/день</div>
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
            <div className="bg-gray-300 dark:bg-gray-600" style={{ width: `${100 - seller.vapeShare - seller.accShare}%` }} />
          </div>
        </div>

        {/* Expand button */}
        {detail && (
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
        )}
      </div>

      {/* Expanded analysis */}
      <AnimatePresence>
        {isExpanded && detail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-gray-100 dark:border-gray-700"
          >
            <div className="p-4 space-y-3 bg-gray-50/50 dark:bg-gray-750">
              {/* Strengths */}
              {detail.strengths.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">Сильные стороны</div>
                  <div className="space-y-0.5">
                    {detail.strengths.map((s, i) => (
                      <div key={i} className="text-[10px] text-gray-700 dark:text-gray-300 flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diagnosis */}
              <div>
                <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Диагноз</div>
                <div className="text-[11px] text-gray-800 dark:text-gray-200 leading-relaxed">{detail.diagnosis}</div>
              </div>

              {/* Causes */}
              {detail.causes.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Над чем работать</div>
                  <div className="space-y-1">
                    {detail.causes.map((c, i) => (
                      <div key={i} className="text-[10px] text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                        <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {detail.actions.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">План действий</div>
                  <div className="space-y-1">
                    {detail.actions.map((a, i) => (
                      <div key={i} className="text-[10px] text-gray-700 dark:text-gray-300 flex items-start gap-1.5">
                        <span className="text-blue-500 font-bold mt-0.5 shrink-0">{i + 1}.</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Store breakdown */}
              <div>
                <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Мои магазины</div>
                <div className="space-y-1">
                  {seller.stores.map(st => {
                    const sBaseline = STORE_BASELINES.find(b => b.store === st.store);
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

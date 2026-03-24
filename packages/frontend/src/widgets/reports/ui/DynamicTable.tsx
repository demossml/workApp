import React, { Fragment, useRef, useState } from "react";
import { motion, useScroll, useSpring } from "framer-motion";

interface TableData {
  [key: string]: string | number | string[];
}

interface DynamicTableProps {
  data: TableData[];
  columns?: string[];
}

const tableN: { [key: string]: string } = {
  productName: "Имя",
  smaQuantity: "Спрос/день",
  quantity: "Остаток",
  availableStock: "Доступный остаток",
  safetyStock: "Страх. запас",
  reorderPoint: "Точка заказа",
  targetStock: "Целевой остаток",
  quantitySale: "Количество",
  orderQuantity: "К заказу",
  confidencePct: "Доверие",
  reasonCodes: "Причины",
  sum: "Сумма",
};

const mobilePriorityColumns = [
  "orderQuantity",
  "availableStock",
  "confidencePct",
  "sum",
] as const;

const hiddenOnMobileDetails = new Set(["productName", "reasonCodes"]);

const reasonCodeLabel = (code: string) => {
  if (code === "LOW_STOCK") return "Низкий остаток";
  if (code === "HIGH_VARIABILITY") return "Высокая вариативность";
  if (code === "BUDGET_LIMIT") return "Ограничение бюджета";
  return code.replace(/_/g, " ");
};

export const DynamicTable: React.FC<DynamicTableProps> = ({ data, columns: columnsProp }) => {
  const [sortConfig, setSortConfig] = useState<{
    key: string | null;
    direction: "asc" | "desc" | null;
  }>({
    key: "sum",
    direction: "desc",
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    container: scrollRef,
  });
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  const sortedData = React.useMemo(() => {
    const sortableData = [...data];
    if (sortConfig.key && sortConfig.direction) {
      const key = sortConfig.key;
      sortableData.sort((a, b) => {
        const aValue = a[key];
        const bValue = b[key];

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
        }

        const aText = Array.isArray(aValue) ? aValue.join(", ") : String(aValue ?? "");
        const bText = Array.isArray(bValue) ? bValue.join(", ") : String(bValue ?? "");
        const compare = aText.localeCompare(bText, "ru");
        return sortConfig.direction === "asc" ? compare : -compare;
      });
    }
    return sortableData;
  }, [data, sortConfig]);

  const isNumericColumn = (key: string) => data.some((row) => typeof row[key] === "number");

  const formatNumber = (value: number) => value.toLocaleString("ru-RU");

  const formatCellValue = (key: string, value: string | number | string[]) => {
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value !== "number") return value;
    if (key === "sum") return `${formatNumber(value)} ₽`;
    if (key === "confidencePct") return `${value.toFixed(1)}%`;
    return formatNumber(value);
  };

  const valueToneClass = (key: string, value: string | number | string[] | undefined) => {
    if (key === "confidencePct" && typeof value === "number") {
      if (value < 55) return "text-red-600 dark:text-red-400 font-semibold";
      if (value < 75) return "text-amber-600 dark:text-amber-400 font-semibold";
      return "text-emerald-600 dark:text-emerald-400 font-semibold";
    }
    if (key === "orderQuantity" && typeof value === "number" && value > 0) {
      return "text-blue-700 dark:text-blue-300 font-semibold";
    }
    if (key === "sum" && typeof value === "number" && value < 0) {
      return "text-red-600 dark:text-red-400";
    }
    return "text-gray-700 dark:text-gray-300";
  };

  const reasonBadgeClass = (code: string) => {
    if (code === "LOW_STOCK") {
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    }
    if (code === "HIGH_VARIABILITY") {
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    }
    if (code === "BUDGET_LIMIT") {
      return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
    }
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  };

  const renderReasonCodes = (value: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {value.length > 0 ? (
        value.map((code) => (
          <span key={code} className={`rounded-full px-2 py-1 text-[10px] font-semibold ${reasonBadgeClass(code)}`}>
            {reasonCodeLabel(code)}
          </span>
        ))
      ) : (
        <span className="text-gray-400 dark:text-gray-500">—</span>
      )}
    </div>
  );

  const handleSort = (key: string) => {
    if (sortConfig.key === key) {
      setSortConfig({
        key,
        direction: sortConfig.direction === "desc" ? "asc" : "desc",
      });
      return;
    }
    setSortConfig({ key, direction: "desc" });
  };

  const columns = columnsProp && columnsProp.length > 0 ? columnsProp : Object.keys(data[0] || {});
  if (columns.length === 0) {
    return (
      <div className="w-full rounded-xl bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        Нет данных для отображения.
      </div>
    );
  }

  const mobileSortColumns = columns.filter((key) => key !== "productName");

  return (
    <div className="w-full rounded-2xl min-h-screen bg-custom-gray dark:bg-gray-900 px-2 sm:px-4">
      <motion.div
        style={{ scaleX, transformOrigin: "0%" }}
        className="h-1 bg-blue-500 mb-2 rounded-full"
      />

      <div className="lg:hidden space-y-3 pb-20">
        <div className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-slate-950/85 backdrop-blur border-b border-white/10">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {mobileSortColumns.map((key) => {
              const isActive = sortConfig.key === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSort(key)}
                  className={`h-11 px-3 rounded-full text-xs whitespace-nowrap border transition ${
                    isActive
                      ? "border-blue-400 bg-blue-500/20 text-blue-200"
                      : "border-slate-700 bg-slate-900/70 text-slate-300"
                  }`}
                >
                  {tableN[key] || key}
                  {isActive ? (sortConfig.direction === "asc" ? " ▲" : " ▼") : " ↕"}
                </button>
              );
            })}
          </div>
        </div>

        {sortedData.map((row, rowIndex) => {
          const productName = typeof row.productName === "string" ? row.productName : "Товар";
          const reasons = Array.isArray(row.reasonCodes) ? row.reasonCodes : [];

          return (
            <motion.article
              key={`${productName}-${rowIndex}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: rowIndex * 0.02 }}
              className="rounded-2xl border border-white/10 bg-slate-900/65 backdrop-blur-sm p-3"
            >
              <h3 className="text-sm leading-snug font-semibold text-slate-100">{productName}</h3>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {mobilePriorityColumns.map((key) => {
                  const value = row[key];
                  return (
                    <div key={key} className="rounded-xl border border-white/10 bg-slate-800/50 p-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">{tableN[key]}</p>
                      <p className={`mt-1 text-sm font-semibold ${valueToneClass(key, value)}`}>
                        {value === undefined ? "—" : formatCellValue(key, value)}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Причины</p>
                {renderReasonCodes(reasons)}
              </div>

              <details className="mt-3 rounded-xl border border-white/10 bg-slate-900/40">
                <summary className="h-11 px-3 text-sm text-slate-200 cursor-pointer flex items-center">
                  Подробнее
                </summary>
                <div className="px-3 pb-3 pt-1 space-y-2">
                  {columns
                    .filter((key) => !hiddenOnMobileDetails.has(key) && !mobilePriorityColumns.includes(key as (typeof mobilePriorityColumns)[number]))
                    .map((key) => {
                      const value = row[key];
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-slate-400">{tableN[key] || key}</span>
                          <span className={`${valueToneClass(key, value)} text-right`}>
                            {value === undefined ? "—" : formatCellValue(key, value)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </details>
            </motion.article>
          );
        })}
      </div>

      <div className="relative hidden lg:block">
        <table className="w-full table-auto bg-custom-gray dark:bg-gray-900 rounded-lg shadow-sm">
          <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0 z-10">
            <tr>
              {columns.map((key) => {
                const alignClass = isNumericColumn(key) ? "text-right" : "text-left";
                const isActive = sortConfig.key === key;
                const indicator = isActive ? (sortConfig.direction === "asc" ? "▲" : "▼") : "↕";
                return (
                  <th
                    key={key}
                    className={`px-3 sm:px-4 py-2 text-[10px] sm:text-xs text-gray-700 dark:text-gray-300 cursor-pointer bg-gray-100 dark:bg-gray-700 ${alignClass}`}
                    onClick={() => handleSort(key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>{tableN[key] || key.charAt(0).toUpperCase() + key.slice(1)}</span>
                      <span
                        className={`text-[10px] ${isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`}
                      >
                        {indicator}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
        </table>

        <div
          id="dynamic-table-scroll"
          ref={scrollRef}
          style={{
            maxHeight: "calc(100vh - 4rem)",
            overflowY: "auto",
            overflowX: "auto",
          }}
        >
          <table className="w-full table-auto bg-custom-gray dark:bg-gray-900 rounded-lg shadow-sm">
            <tbody>
              {sortedData.map((row, rowIndex) => {
                const zebraClass =
                  rowIndex % 2 === 0 ? "bg-white/70 dark:bg-gray-900/40" : "bg-gray-50/80 dark:bg-gray-900/70";
                const hoverClass = "hover:bg-blue-50/70 dark:hover:bg-blue-900/20";
                return (
                  <Fragment key={rowIndex}>
                    <motion.tr
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: rowIndex * 0.03, ease: "easeInOut" }}
                      className={`${zebraClass} ${hoverClass} transition-colors`}
                    >
                      <td
                        className="px-3 sm:px-4 py-2 text-[11px] sm:text-xs text-left text-gray-800 dark:text-gray-200"
                        colSpan={Object.keys(row).length}
                        style={{
                          wordWrap: "break-word",
                          maxWidth: "150px",
                        }}
                      >
                        {Object.keys(row).map((key) => {
                          const value = row[key];
                          if (key === "productName" && typeof value === "string") {
                            return value.length > 34 ? <span className="break-all">{value}</span> : value;
                          }
                          return null;
                        })}
                      </td>
                    </motion.tr>
                    <motion.tr
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: rowIndex * 0.03, ease: "easeInOut" }}
                      className={`${zebraClass} ${hoverClass} border-b border-gray-200/40 dark:border-gray-700/40 transition-colors`}
                    >
                      <td className="px-3 sm:px-4 py-2" />
                      {Object.keys(row).map((key, index) => {
                        if (key !== "productName") {
                          const value = row[key];
                          const alignClass =
                            typeof value === "number" ? "text-right tabular-nums" : "text-left";
                          const emphasisClass = key === "sum" ? "font-semibold" : "font-medium";
                          const reasonCodesView =
                            key === "reasonCodes" && Array.isArray(value)
                              ? renderReasonCodes(value)
                              : null;
                          return (
                            <td
                              key={index}
                              className={`px-3 sm:px-4 py-2 text-[11px] sm:text-xs ${alignClass} ${emphasisClass} ${valueToneClass(
                                key,
                                value
                              )}`}
                            >
                              {reasonCodesView || (
                                <span>{value === undefined ? "—" : formatCellValue(key, value)}</span>
                              )}
                            </td>
                          );
                        }
                        return null;
                      })}
                    </motion.tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

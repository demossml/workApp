import React from "react";
import { motion } from "framer-motion";

type SalesReportRow = {
  productName: string;
  quantitySale: number;
  sum: number;
};

type SortKey = "productName" | "quantitySale" | "sum";
type SortDirection = "asc" | "desc";

interface DynamicTableSalesReportV2Props {
  data: SalesReportRow[];
}

const formatNumber = (value: number) => value.toLocaleString("ru-RU");

export const DynamicTableSalesReportV2: React.FC<
  DynamicTableSalesReportV2Props
> = ({ data }) => {
  const [sortKey, setSortKey] = React.useState<SortKey>("sum");
  const [sortDirection, setSortDirection] =
    React.useState<SortDirection>("desc");

  const sortedData = React.useMemo(() => {
    const next = [...data];
    next.sort((a, b) => {
      if (sortKey === "productName") {
        const cmp = a.productName.localeCompare(b.productName, "ru");
        return sortDirection === "asc" ? cmp : -cmp;
      }
      const left = a[sortKey];
      const right = b[sortKey];
      return sortDirection === "asc" ? left - right : right - left;
    });
    return next;
  }, [data, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDirection("desc");
  };

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        Нет данных по выбранным параметрам.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Sort chips — bigger and better spaced */}
      <div className="sticky top-0 z-10 flex gap-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm px-3 py-2.5">
        <button
          type="button"
          onClick={() => handleSort("productName")}
          className={`rounded-full px-3.5 py-2 text-xs font-medium border transition shrink-0 ${
            sortKey === "productName"
              ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700"
              : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-400"
          }`}
        >
          Название{" "}
          {sortKey === "productName"
            ? sortDirection === "desc"
              ? "▼"
              : "▲"
            : "↕"}
        </button>
        <button
          type="button"
          onClick={() => handleSort("quantitySale")}
          className={`rounded-full px-3.5 py-2 text-xs font-medium border transition shrink-0 ${
            sortKey === "quantitySale"
              ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700"
              : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-400"
          }`}
        >
          Количество{" "}
          {sortKey === "quantitySale"
            ? sortDirection === "desc"
              ? "▼"
              : "▲"
            : "↕"}
        </button>
        <button
          type="button"
          onClick={() => handleSort("sum")}
          className={`rounded-full px-3.5 py-2 text-xs font-medium border transition shrink-0 ${
            sortKey === "sum"
              ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700"
              : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-400"
          }`}
        >
          Сумма{" "}
          {sortKey === "sum"
            ? sortDirection === "desc"
              ? "▼"
              : "▲"
            : "↕"}
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {sortedData.map((row, index) => (
            <motion.div
              key={`${row.productName}-${index}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.18,
                delay: index < 20 ? index * 0.01 : 0,
              }}
              className="px-4 py-3.5"
            >
              <div className="space-y-3">
                <div className="text-[15px] leading-snug font-semibold text-gray-900 dark:text-gray-100">
                  {row.productName}
                </div>
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 px-3.5 py-3">
                  <div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
                      Количество
                    </div>
                    <div className="text-[15px] font-bold text-gray-800 dark:text-gray-200">
                      {formatNumber(row.quantitySale)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
                      Сумма
                    </div>
                    <div className="text-[15px] font-bold text-gray-900 dark:text-gray-100">
                      {formatNumber(row.sum)} ₽
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

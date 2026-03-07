import React, { Fragment, useState, useRef } from "react";
import { motion, useScroll, useSpring } from "framer-motion";

// Интерфейс для структуры данных
interface TableData {
  [key: string]: string | number;
}

interface DynamicTableProps {
  data: TableData[];
}

// Объект с переводами
const tableN: { [key: string]: string } = {
  productName: "Имя",
  smaQuantity: "SMA",
  quantity: "Остаток",
  quantitySale: "Количество",
  orderQuantity: "К заказу",
  sum: "Сумма",
};

// Основной компонент таблицы
export const DynamicTable: React.FC<DynamicTableProps> = ({ data }) => {
  // Состояние для сортировки таблицы
  const [sortConfig, setSortConfig] = useState<{
    key: string | null;
    direction: "asc" | "desc" | null;
  }>({
    key: "sum",
    direction: "desc",
  });

  // Реф на скроллируемый контейнер
  const scrollRef = useRef<HTMLDivElement>(null);

  // Полоса прогресса скролла для tbody
  const { scrollYProgress } = useScroll({
    container: scrollRef,
  });
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  // Функция для сортировки данных
  const sortedData = React.useMemo(() => {
    const sortableData = [...data];
    if (sortConfig.key && sortConfig.direction) {
      const key = sortConfig.key;
      sortableData.sort((a, b) => {
        const aValue = a[key];
        const bValue = b[key];

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortConfig.direction === "asc"
            ? aValue - bValue
            : bValue - aValue;
        }

        const aText = String(aValue ?? "");
        const bText = String(bValue ?? "");
        const compare = aText.localeCompare(bText, "ru");
        return sortConfig.direction === "asc" ? compare : -compare;
      });
    }
    return sortableData;
  }, [data, sortConfig]);

  const isNumericColumn = (key: string) =>
    data.some((row) => typeof row[key] === "number");

  const formatNumber = (value: number) => value.toLocaleString("ru-RU");

  const formatCellValue = (key: string, value: string | number) => {
    if (typeof value !== "number") return value;
    if (key === "sum") return `${formatNumber(value)} ₽`;
    return formatNumber(value);
  };

  const valueToneClass = (key: string, value: string | number) => {
    if (key === "sum" && typeof value === "number" && value < 0) {
      return "text-red-600 dark:text-red-400";
    }
    return "text-gray-700 dark:text-gray-300";
  };

  // Обработчик сортировки по клику на заголовок
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

  const columns = Object.keys(data[0] || {});
  if (columns.length === 0) {
    return (
      <div className="w-full rounded-xl bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        Нет данных для отображения.
      </div>
    );
  }

  return (
    // Основной контейнер таблицы, занимающий весь экран
    <div
      className="w-full
     rounded-2xl min-h-screen bg-custom-gray dark:bg-gray-900 px-2 sm:px-4 "
    >
      {/* Анимированная полоса прокрутки сверху */}
      <motion.div
        style={{ scaleX, transformOrigin: "0%" }}
        className="h-1 bg-blue-500 mb-2 rounded-full"
      />
      <div className="relative">
        {/* Заголовок таблицы */}
        <table className="w-full table-auto bg-custom-gray dark:bg-gray-900 rounded-lg shadow-sm">
          <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0 z-10">
            <tr>
              {columns.map((key) => {
                const alignClass = isNumericColumn(key) ? "text-right" : "text-left";
                const isActive = sortConfig.key === key;
                const indicator = isActive
                  ? sortConfig.direction === "asc"
                    ? "▲"
                    : "▼"
                  : "↕";
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
        {/* Прокручиваемый блок с данными */}
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
                  rowIndex % 2 === 0
                    ? "bg-white/70 dark:bg-gray-900/40"
                    : "bg-gray-50/80 dark:bg-gray-900/70";
                const hoverClass = "hover:bg-blue-50/70 dark:hover:bg-blue-900/20";
                return (
                  <Fragment key={rowIndex}>
                    <motion.tr
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.25,
                        delay: rowIndex * 0.03,
                        ease: "easeInOut",
                      }}
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
                          if (
                            key === "productName" &&
                            typeof value === "string"
                          ) {
                            return value.length > 34 ? (
                              <span className="break-all">{value}</span>
                            ) : (
                              value
                            );
                          }
                          return null;
                        })}
                      </td>
                    </motion.tr>
                    <motion.tr
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.3,
                        delay: rowIndex * 0.03,
                        ease: "easeInOut",
                      }}
                      className={`${zebraClass} ${hoverClass} border-b border-gray-200/40 dark:border-gray-700/40 transition-colors`}
                    >
                      <td className="px-3 sm:px-4 py-2" />
                      {Object.keys(row).map((key, index) => {
                        if (key !== "productName") {
                          const value = row[key];
                          const alignClass =
                            typeof value === "number" ? "text-right tabular-nums" : "text-left";
                          const emphasisClass = key === "sum" ? "font-semibold" : "font-medium";
                          return (
                            <td
                              key={index}
                              className={`px-3 sm:px-4 py-2 text-[11px] sm:text-xs ${alignClass} ${emphasisClass} ${valueToneClass(
                                key,
                                value
                              )}`}
                            >
                              <span>{formatCellValue(key, value)}</span>
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

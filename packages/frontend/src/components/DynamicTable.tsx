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
    key: null,
    direction: null,
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
    if (sortConfig.key) {
      const key = sortConfig.key;
      sortableData.sort((a, b) => {
        if (a[key] < b[key]) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (a[key] > b[key]) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableData;
  }, [data, sortConfig]);

  // Обработчик сортировки по клику на заголовок
  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

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
        <table className="w-full table-auto bg-custom-gray dark:bg-gray-900 rounded-lg shadow-md">
          <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0 z-10">
            <tr>
              {Object.keys(data[0] || {}).map((key) => (
                <th
                  key={key}
                  className="px-2 sm:px-4 py-0.5 sm:py-1 text-left text-[10px] sm:text-xs text-gray-700 dark:text-gray-400 cursor-pointer bg-gray-100 dark:bg-gray-700"
                  onClick={() => handleSort(key)}
                >
                  {tableN[key] || key.charAt(0).toUpperCase() + key.slice(1)}{" "}
                  {sortConfig.key === key
                    ? sortConfig.direction === "asc"
                      ? "↑"
                      : "↓"
                    : null}
                </th>
              ))}
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
          <table className="w-full table-auto bg-custom-gray dark:bg-gray-900 rounded-lg shadow-md">
            <tbody>
              {sortedData.map((row, rowIndex) => (
                <Fragment key={rowIndex}>
                  <motion.tr
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.25,
                      delay: rowIndex * 0.07,
                      ease: "easeInOut",
                    }}
                  >
                    <td
                      className="px-2 sm:px-4 py-0.5 sm:py-1 text-[10px] sm:text-xs text-left text-gray-700 dark:text-gray-400"
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
                      duration: 0.4,
                      delay: rowIndex * 0.07,
                      ease: "easeInOut",
                    }}
                  >
                    <td className="px-2 sm:px-4 py-0.5 sm:py-1" />
                    {Object.keys(row).map((key, index) => {
                      if (key !== "productName") {
                        // Центрируем "Количество" и "Сумма"
                        const isCenter =
                          key === "quantitySale" || key === "sum"
                            ? "text-center font-semibold"
                            : "text-left";
                        return (
                          <td
                            key={index}
                            className={`px-2 sm:px-4 py-0.5 sm:py-1 text-[10px] sm:text-xs text-gray-700 dark:text-gray-400 ${isCenter}`}
                          >
                            {key === "sum" && typeof row[key] === "number" ? (
                              <span>{row[key]} ₽</span>
                            ) : (
                              <span>{row[key]}</span>
                            )}
                          </td>
                        );
                      }
                      return null;
                    })}
                  </motion.tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

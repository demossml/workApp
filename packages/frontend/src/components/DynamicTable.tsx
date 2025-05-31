import React, { Fragment, useState } from "react";

// Интерфейс для структуры данных
interface TableData {
  [key: string]: string | number; // Ключи могут быть строками, а значения - строками или числами
}

interface DynamicTableProps {
  data: TableData[]; // Массив объектов, которые соответствуют интерфейсу TableData
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

export const DynamicTable: React.FC<DynamicTableProps> = ({ data }) => {
  const [sortConfig, setSortConfig] = useState<{
    key: string | null;
    direction: "asc" | "desc" | null;
  }>({
    key: null,
    direction: null,
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

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="overflow-x-auto w-full bg-custom-gray dark:bg-gray-900 rounded-t-lg">
      <table className="min-w-full table-auto bg-custom-gray dark:bg-gray-900 rounded-lg shadow-md">
        <thead className=" bg-gray-100 dark:bg-gray-700">
          <tr>
            {Object.keys(data[0]).map((key) => (
              <th
                key={key}
                className="px-4 py-1 text-left text-xs sm:text-sm text-gray-700 dark:text-gray-400 cursor-pointer"
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
        <tbody>
          {sortedData.map((row, rowIndex) => (
            <Fragment key={rowIndex}>
              <tr>
                <td
                  className="px-4 py-1 text-sm text-left text-gray-700 dark:text-gray-400"
                  colSpan={Object.keys(row).length}
                  style={{
                    wordWrap: "break-word",
                    maxWidth: "200px",
                  }}
                >
                  {Object.keys(row).map((key) => {
                    const value = row[key];
                    if (key === "productName" && typeof value === "string") {
                      return value.length > 34 ? (
                        <span className="break-all">{value}</span>
                      ) : (
                        value
                      );
                    }
                    return null;
                  })}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-1 text"></td>
                {Object.keys(row).map((key, index) => {
                  if (key !== "productName") {
                    return (
                      <td
                        key={index}
                        className="px-4 py-1 text-xs sm:text-sm text-gray-700 dark:text-gray-400"
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
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

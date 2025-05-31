import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

interface ScheduleTableProps {
  scheduleTable: Array<{
    id: number;
    shopName: string;
    employeeName: string;
    date: string | number;
    shiftType: string;
  }>;
}

const ScheduleTableView: React.FC<ScheduleTableProps> = ({ scheduleTable }) => {
  const [sortConfig, setSortConfig] = useState<{
    key: string | null;
    direction: "asc" | "desc" | null;
  }>({
    key: null,
    direction: null,
  });

  const sortedData = React.useMemo(() => {
    const sortableData = [...scheduleTable];
    if (sortConfig.key) {
      const key = sortConfig.key as keyof (typeof sortableData)[0];
      sortableData.sort((a, b) => {
        if (a[key] < b[key]) return sortConfig.direction === "asc" ? -1 : 1;
        if (a[key] > b[key]) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableData;
  }, [scheduleTable, sortConfig]);

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const navigate = useNavigate();
  const handleBack = () => {
    navigate("/");
  };

  const tableHeaders = {
    shopName: "Магазин",
    employeeName: "Сотрудник",
    date: "Дата",
  };

  const formatDate = (dateValue: string | number): string => {
    // Преобразуем значение в строку, если оно является числом
    const dateString = String(dateValue);

    // Попробуем создать объект Date
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      // Если дата некорректна, возвращаем сообщение об ошибке
      return dateString;
    }

    // const format = (d: Date) =>
    //   `${d.getUTCDate().toStrƒng().padStart(2, "0")}.${(d.getUTCMonth() + 1)
    //     .toString()
    //     .padStart(2, "0")}.${d.getUTCFullYear()}`;

    // Форматируем дату в формате дд.мм.гггг
    // const day = date.getDate().toString().padStart(1, "0");
    // const month = (date.getMonth() + 1).toString().padStart(2, "0");
    // const year = date.getFullYear();
    return `${dateString}`;
  };

  return (
    <div className="overflow-x-auto w-full bg-custom-gray dark:bg-gray-900 rounded-t-lg">
      <table className="min-w-full table-auto bg-custom-gray dark:bg-gray-900 rounded-lg shadow-md">
        <thead className="bg-gray-100 dark:bg-gray-700">
          <tr>
            {Object.keys(tableHeaders).map((key) => (
              <th
                key={key}
                className="sticky top-0 z-10 px-4 py-3 text-left text-xs sm:text-sm text-gray-700 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600"
                onClick={() => handleSort(key)}
              >
                <div className="flex items-center">
                  {tableHeaders[key as keyof typeof tableHeaders]}
                  {sortConfig.key === key && (
                    <span className="ml-1">
                      {sortConfig.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row) => (
            <tr
              key={row.id}
              className="border-t border-gray-200 dark:border-gray-700"
            >
              {Object.keys(tableHeaders).map((key) => {
                const value = row[key as keyof typeof row];

                const isWeekend =
                  key === "date" &&
                  (() => {
                    const dateString = String(value); // Преобразуем значение в строку
                    const date = new Date(dateString);
                    if (isNaN(date.getTime())) return false; // Если дата некорректна, не считаем её выходным
                    const day = date.getDay();
                    return day === 0 || day === 6; // Воскресенье (0) или суббота (6)
                  })();

                return (
                  <td
                    key={key}
                    className={`px-4 py-3 text-xs sm:text-sm ${
                      isWeekend
                        ? "text-red-500 dark:text-red-400 font-bold"
                        : "text-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {key === "date" ? (
                      formatDate(value) // Преобразуем дату в читаемый формат
                    ) : (
                      <span className="break-all">{value}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={handleBack}
        className="btn bg-blue-700 text-white p-2 rounded w-full"
      >
        Назад
      </button>
    </div>
  );
};

export default ScheduleTableView;

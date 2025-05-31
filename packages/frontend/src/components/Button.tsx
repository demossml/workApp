import { Link } from "react-router-dom";

export const CashierButtons = () => (
  <div className="flex flex-col gap-0 w-full max-w-md mt-auto mb-4">
    <Link
      to="/evotor/salary-user-report"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Зарплата
    </Link>
    <Link
      to="/evotor/plan-for-today"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      План/продажи
    </Link>
    <Link
      to="/evotor/orders"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Заказ товара (SMA)
    </Link>
    <Link
      to="/evotor/sales-report"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Отчет по продажам
    </Link>
    <Link
      to="/evotor/stock-realization-report"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Товарные остатки
    </Link>
    <Link
      to="/evotor/schedules-view"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Табель 👀
    </Link>
  </div>
);

export const AdminButtons = () => (
  <div className="flex flex-col gap-0 w-full max-w-md mt-auto mb-4">
    <Link
      to="/evotor/settings"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Настроить
    </Link>
    <Link
      to="/evotor/salary-report"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Зарплата
    </Link>
    <Link
      to="/evotor/orders"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Заказ товара (SMA)
    </Link>
    <Link
      to="/evotor/sales-report"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Отчет по продажам
    </Link>
    <Link
      to="/evotor/sales-for-the-period"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Сводный финансовый отчет
    </Link>
    <Link
      to="/evotor/store-opening-report"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Отчет об открытии магазинов
    </Link>
    <Link
      to="/evotor/stock-realization-report"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Товарные остатки
    </Link>
    <Link
      to="/evotor/schedules"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Проверка времени чикина
    </Link>
    <Link
      to="/evotor/schedules-table"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Табель 🖊️
    </Link>
    <Link
      to="/evotor/schedules-view"
      className="btn py-2 bg-white dark:bg-gray-800 text-black dark:text-gray-200 text-center rounded-lg border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Табель 👀
    </Link>
  </div>
);

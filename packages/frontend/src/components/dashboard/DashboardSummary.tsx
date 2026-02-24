import { useFilteredSalesData } from "../../hooks/dashboard/useFilteredSalesData";
import { useSalesCalculations } from "../../hooks/dashboard/useSalesCalculations";
import { useSalesData } from "../../hooks/dashboard/useSalesData";
import { useEmployeeRole, useMe } from "../../hooks/useApi";
import { useCurrentWorkShop } from "../../hooks/useCurrentWorkShop";
import { LoadingSpinner } from "../LoadingSpinner";
import { BestShopCard } from "./cards/BestShopCard";
import { ExpensesCard } from "./cards/ExpensesCard";
import { RevenueCard } from "./cards/RevenueCard";
import { RevenueDetailsAdmin } from "./cards/RevenueDetailsAdmin";
import { RevenueDetailsUser } from "./cards/RevenueDetailsUser";
import { ExpensesDetailsAdmin } from "./cards/ExpensesDetailsAdmin";
import { ExpensesDetailsUser } from "./cards/ExpensesDetailsUser";
import { useAccessoriesSales } from "../../hooks/dashboard/useAccessoriesSales";
import { BestShopDetails } from "./cards/BestShopDetails";
import { TopProductsDetails } from "./cards/TopProductsDetails";
import { SummaryHeader } from "./SummaryHeader";
import { EmptyWorkDay } from "./ui/EmptyWorkDay";
import React, { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui";
import { Calendar } from "../ui";
import { Cherry } from "lucide-react";

function LoadingAccessories() {
  return (
    <div className="bg-blue-100 dark:bg-blue-900 rounded-lg p-4 min-h-[120px] flex flex-col items-center justify-center">
      <Cherry className="w-12 h-12 text-blue-600 dark:text-blue-400 animate-pulse" />
      <div className="text-xs text-gray-600 dark:text-gray-300 mt-2">
        Загрузка...
      </div>
    </div>
  );
}

function AccessoriesCard({
  value,
  onClick,
}: {
  value: number;
  onClick: () => void;
}) {
  return (
    <div
      className="bg-blue-100 dark:bg-blue-900 rounded-lg p-4 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 transition min-h-[120px] flex flex-col justify-between"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Аксессуары
        </div>
        <Cherry className="w-6 h-6 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="text-2xl font-bold text-blue-800 dark:text-blue-200">
        {value.toLocaleString()} ₽
      </div>
    </div>
  );
}

function AccessoriesSummaryStats({
  data,
}: {
  data: import("../../hooks/dashboard/useAccessoriesSales").AccessoriesSalesData;
}) {
  // Сумма по всем магазинам
  const totalSum = data.total.reduce((sum, item) => sum + item.sum, 0);
  // Количество проданных аксессуаров
  const totalQty = data.total.reduce((sum, item) => sum + item.quantity, 0);
  // Средняя цена
  const avgPrice =
    data.total.length > 0 ? Math.round(totalSum / data.total.length) : 0;
  // Всего видов аксессуаров
  const totalProducts = data.total.length;
  // Доля топ-3 аксессуаров
  const top3Sum = data.total
    .slice(0, 3)
    .reduce((sum, item) => sum + item.sum, 0);
  const topShare = totalSum > 0 ? Math.round((top3Sum / totalSum) * 100) : 0;

  // Суммы по каждому магазину
  const byShop = data.byShop.map((shop) => ({
    shopName: shop.shopName,
    sum: shop.sales.reduce((s, item) => s + item.sum, 0),
  }));

  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      <div className="bg-blue-100 dark:bg-blue-900 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px] col-span-1">
        <div className="text-xs text-gray-700 dark:text-gray-300 mb-2">
          Суммы по магазинам
        </div>
        <div className="flex flex-col gap-1 w-full items-center">
          {byShop.map((shop) => (
            <div
              key={shop.shopName}
              className="flex flex-row items-center justify-between w-full text-xs font-semibold text-blue-800 dark:text-blue-200"
            >
              <span className="truncate max-w-[60%] text-gray-800 dark:text-gray-200">
                {shop.shopName}
              </span>
              <span className="ml-2 whitespace-nowrap">
                {shop.sum.toLocaleString()} ₽
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gray-800 dark:bg-gray-700 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px]">
        <div className="text-white text-2xl font-bold mb-1">
          {totalProducts}
        </div>
        <div className="text-xs text-gray-300 dark:text-gray-400">
          ВСЕГО ТОВАРОВ
        </div>
      </div>
      <div className="bg-gray-800 dark:bg-gray-700 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px]">
        <div className="text-white text-2xl font-bold mb-1">{topShare}%</div>
        <div className="text-xs text-gray-300 dark:text-gray-400">
          ДОЛЯ ТОП-3
        </div>
      </div>
      <div className="bg-gray-800 dark:bg-gray-700 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px]">
        <div className="text-white text-2xl font-bold mb-1">{avgPrice}</div>
        <div className="text-xs text-gray-300 dark:text-gray-400">СР. ЦЕНА</div>
      </div>
      <div className="bg-gray-800 dark:bg-gray-700 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px]">
        <div className="text-white text-2xl font-bold mb-1">{totalQty}</div>
        <div className="text-xs text-gray-300 dark:text-gray-400">
          ПРОДАНО ШТ
        </div>
      </div>
    </div>
  );
}

function AccessoriesDetails({
  data,
}: {
  data: import("../../hooks/dashboard/useAccessoriesSales").AccessoriesSalesData;
}) {
  // Сортировка по сумме
  const sorted = [...data.total].sort((a, b) => b.sum - a.sum);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
      <h2 className="text-base font-semibold mb-3 text-gray-900 dark:text-white">
        Продажи аксессуаров
      </h2>
      <ul>
        {sorted.map((sale, idx) => (
          <li
            key={sale.name}
            className="flex justify-between items-center mb-2"
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-gray-800 dark:text-gray-300">
                {idx + 1}.
              </span>
              <span className="font-bold text-sm text-gray-900 dark:text-white">
                {sale.name}
              </span>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-blue-700 dark:text-blue-400">
                {sale.sum.toLocaleString()} ₽
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {sale.quantity} шт
              </div>
            </div>
          </li>
        ))}
      </ul>
      <AccessoriesSummaryStats data={data} />
    </div>
  );
}

export default function DashboardSummary2() {
  const [dateMode, setDateMode] = useState<"today" | "yesterday" | "period">(
    "today"
  );
  // Для shadcn/ui Calendar нужен DateRange
  const [period, setPeriod] = useState<DateRange | undefined>(undefined);
  const [tempPeriod, setTempPeriod] = useState<DateRange | undefined>(
    undefined
  );
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);

  // Вычисляем since/until в ISO-формате в зависимости от режима
  // Используем UTC даты, но учитываем рабочий день по МСК (UTC+3)
  let since: string | undefined = undefined;
  let until: string | undefined = undefined;

  const getMSKDayRange = (date: Date): [string, string] => {
    // Получаем дату в формате YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    // Отправляем просто дату в формате YYYY-MM-DD
    // Бэкенд сам преобразует в нужный формат с учетом timezone
    const dateStr = `${year}-${month}-${day}`;

    return [dateStr, dateStr];
  };

  if (dateMode === "today") {
    const today = new Date();
    [since, until] = getMSKDayRange(today);
  } else if (dateMode === "yesterday") {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    [since, until] = getMSKDayRange(yesterday);
  } else if (dateMode === "period" && period?.from && period?.to) {
    const [sinceStart] = getMSKDayRange(period.from);
    const [, untilEnd] = getMSKDayRange(period.to);
    since = sinceStart;
    until = untilEnd;
  }

  const { data, loading, lastUpdate } = useSalesData(
    since && until ? { since, until } : undefined
  );
  const { data: roleData } = useEmployeeRole();
  const { data: currentWorkShop } = useCurrentWorkShop();

  const isSuperAdmin = roleData?.employeeRole === "SUPERADMIN";
  const filteredData = useFilteredSalesData(
    data,
    isSuperAdmin,
    currentWorkShop ?? null
  );
  const { netSales, bestShop } = useSalesCalculations(filteredData);

  const [expandedCard, setExpandedCard] = React.useState<string | null>(null);
  const me = useMe();
  const accessoriesSales = useAccessoriesSales({
    role: roleData?.employeeRole || "CASHIER",
    userId: me.data?.id ?? "",
    ...(since && until ? { since, until } : {}),
  });

  if (loading) return <LoadingSpinner />;
  if (!filteredData) return <EmptyWorkDay />;

  // Вычисляем сумму аксессуаров с учетом фильтрации
  const getAccessoriesValue = () => {
    if (!accessoriesSales.data) return 0;

    // Если не SUPERADMIN или filteredData показывает один магазин
    const shopNames = Object.keys(filteredData.salesDataByShopName);
    if (!isSuperAdmin || shopNames.length === 1) {
      const shopName = shopNames[0];
      // Находим соответствующий магазин в данных аксессуаров
      const shopAccessories = accessoriesSales.data.byShop.find(
        (shop) => shop.shopName === shopName
      );
      return shopAccessories
        ? shopAccessories.sales.reduce((sum, item) => sum + item.sum, 0)
        : 0;
    }

    // Для SUPERADMIN с несколькими магазинами - показываем общую сумму
    return accessoriesSales.data.total.reduce((sum, item) => sum + item.sum, 0);
  };

  return (
    <>
      <SummaryHeader
        lastUpdate={lastUpdate}
        dateMode={dateMode}
        period={period}
      />
      <div className="grid grid-cols-2 gap-4 mb-6">
        <RevenueCard
          value={netSales}
          onClick={() =>
            setExpandedCard(expandedCard === "revenue" ? null : "revenue")
          }
        />
        <ExpensesCard
          value={filteredData.grandTotalCashOutcome}
          onClick={() =>
            setExpandedCard(expandedCard === "expenses" ? null : "expenses")
          }
        />
        {bestShop && (
          <BestShopCard
            shop={bestShop}
            onClick={() =>
              setExpandedCard(expandedCard === "best" ? null : "best")
            }
          />
        )}
        {filteredData.topProducts?.length > 0 && (
          <ExpensesCard
            value={filteredData.topProducts[0].netRevenue}
            onClick={() =>
              setExpandedCard(expandedCard === "products" ? null : "products")
            }
            label="Топ продукт"
          />
        )}
        {/* Плитка аксессуаров */}
        {accessoriesSales.data &&
        !accessoriesSales.loading &&
        !accessoriesSales.error ? (
          <AccessoriesCard
            value={getAccessoriesValue()}
            onClick={() =>
              setExpandedCard(
                expandedCard === "accessories" ? null : "accessories"
              )
            }
          />
        ) : accessoriesSales.loading ? (
          <LoadingAccessories />
        ) : accessoriesSales.error ? (
          <div className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 p-4 rounded min-h-[120px] flex items-center justify-center">
            {accessoriesSales.error}
          </div>
        ) : null}
      </div>

      {/* Детальные блоки */}
      {expandedCard === "revenue" &&
        (isSuperAdmin ? (
          <RevenueDetailsAdmin
            salesDataByShopName={filteredData.salesDataByShopName}
            grandTotalSell={filteredData.grandTotalSell}
            grandTotalRefund={filteredData.grandTotalRefund}
          />
        ) : (
          <RevenueDetailsUser
            salesDataByShopName={filteredData.salesDataByShopName}
          />
        ))}
      {expandedCard === "expenses" &&
        (isSuperAdmin ? (
          <ExpensesDetailsAdmin
            cashOutcomeData={filteredData.cashOutcomeData}
            grandTotalCashOutcome={filteredData.grandTotalCashOutcome}
          />
        ) : (
          <ExpensesDetailsUser cashOutcomeData={filteredData.cashOutcomeData} />
        ))}
      {expandedCard === "best" && (
        <BestShopDetails
          salesDataByShopName={filteredData.salesDataByShopName}
          grandTotalSell={filteredData.grandTotalSell}
          grandTotalRefund={filteredData.grandTotalRefund}
        />
      )}
      {expandedCard === "products" && filteredData.topProducts?.length > 0 && (
        <TopProductsDetails topProducts={filteredData.topProducts} />
      )}
      {expandedCard === "accessories" && accessoriesSales.data && (
        <AccessoriesDetails data={accessoriesSales.data} />
      )}
      <div className="flex items-center gap-2 mb-4">
        <button
          className={`px-3 py-1 rounded ${dateMode === "today" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
          onClick={() => setDateMode("today")}
        >
          Сегодня
        </button>
        <button
          className={`px-3 py-1 rounded ${dateMode === "yesterday" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
          onClick={() => setDateMode("yesterday")}
        >
          Вчера
        </button>
        <Popover
          open={showPeriodPicker}
          onOpenChange={(open) => {
            setShowPeriodPicker(open);
            if (!open) {
              // Сбрасываем временный период при закрытии без применения
              setTempPeriod(undefined);
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              className={`px-3 py-1 rounded ${dateMode === "period" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
              onClick={() => {
                if (!isSuperAdmin) return;
                setDateMode("period");
                setTempPeriod(period);
                setShowPeriodPicker(true);
              }}
              disabled={!isSuperAdmin}
              title={!isSuperAdmin ? "Только для SUPERADMIN" : undefined}
            >
              Период
            </button>
          </PopoverTrigger>
          {isSuperAdmin && (
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="range"
                selected={tempPeriod?.from ? tempPeriod : undefined}
                onSelect={setTempPeriod}
                numberOfMonths={1}
                disabled={(date) => date > new Date()}
                initialFocus
              />
              <div className="flex justify-end p-2">
                <button
                  className="px-3 py-1 rounded bg-blue-600 text-white"
                  disabled={!(tempPeriod?.from && tempPeriod?.to)}
                  onClick={() => {
                    setPeriod(tempPeriod);
                    console.log("Период применён:", tempPeriod);
                    setShowPeriodPicker(false);
                  }}
                >
                  Применить
                </button>
              </div>
            </PopoverContent>
          )}
        </Popover>
      </div>
    </>
  );
}

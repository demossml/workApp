import { ErrorState, LoadingState } from "@shared/ui/states";
import { RegisterUserCard } from "@features/employees";
import { useEmployeeRole } from "../hooks/useApi";
import { useIsFetching } from "@tanstack/react-query";
import {
  PlanStatusWidget,
  QuickActionsWidget,
  TodayAlertsWidget,
  StockHealthWidget,
} from "@widgets/home";
import { buildHomeAccessModel } from "@features/dashboard/model/homePageModel";
import { SellerPerformanceWidget } from "@widgets/home/SellerPerformanceWidget";
import { DailyBriefing } from "@widgets/home/DailyBriefing";
import { DateFilter, type DateFilterValue } from "@widgets/home/DateFilter";
import { RevenueWidget } from "@widgets/home/RevenueWidget";
import { SalesTempoWidget } from "@widgets/home/SalesTempoWidget";
import { FinanceWidget } from "@widgets/home/FinanceWidget";
import { BestShopWidget } from "@widgets/home/BestShopWidget";
import { TopProductWidget } from "@widgets/home/TopProductWidget";
import { AccessoriesWidget } from "@widgets/home/AccessoriesWidget";
import { isTelegramMiniApp } from "../helpers/telegram";
import { useState, useEffect, useCallback } from "react";

function getTodayRange(): DateFilterValue {
  const d = new Date();
  const s = d.toISOString().slice(0, 10);
  return { since: s, until: s, dateMode: "today" };
}

export default function Home() {
  const { data, error, isLoading } = useEmployeeRole();
  const miniApp = isTelegramMiniApp();
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(getTodayRange);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error.message} />;

  if (!data?.employeeRole || data.employeeRole === "null") {
    const shouldShowManualIdInput = !miniApp || data?.employeeRole === "null";
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-6">
        <h1 className="mb-4 text-lg sm:text-xl md:text-2xl text-gray-800 dark:text-gray-100 font-bold">
          {shouldShowManualIdInput ? "Введите Telegram ID для входа" : "У вас нет прав доступа."}
        </h1>
        {shouldShowManualIdInput && <RegisterUserCard onRegister={(id) => console.log("Новый пользователь Telegram ID:", id)} />}
      </div>
    );
  }

  const { isCashier, isAdmin, isSuperAdmin } = buildHomeAccessModel(data.employeeRole);
  const { since, until, dateMode } = dateFilter;

  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-gray-100 dark:bg-gray-900 pt-20 sm:pt-24 px-4 sm:px-6 pb-24">
      <div className="w-full max-w-7xl space-y-4">

        {/* Приветствие */}
        <DailyBriefing />

        {/* Эффективность продавцов */}
        {isSuperAdmin && <SellerPerformanceWidget />}

        {/* Выбор даты (общий для всех виджетов) */}
        <DateFilter value={dateFilter} onChange={setDateFilter} />

        {/* План продаж */}
        <PlanStatusWidget />

        {/* Виджеты v3.1 — каждый независимый */}
        <div className="grid grid-cols-2 gap-4">
          <RevenueWidget since={since} until={until} />

          {(isSuperAdmin || isAdmin) && (
            <SalesTempoWidget since={since} until={until} />
          )}

          {(isSuperAdmin || isAdmin) && (
            <FinanceWidget since={since} until={until} />
          )}

          {(isSuperAdmin || isAdmin) && (
            <BestShopWidget since={since} until={until} dateMode={dateMode} />
          )}

          <TopProductWidget since={since} until={until} />

          <AccessoriesWidget since={since} until={until} />
        </div>

        {/* Оповещения */}
        {isSuperAdmin && <TodayAlertsWidget />}

        {/* Остатки */}
        {(isSuperAdmin || isAdmin) && <StockHealthWidget />}

        {/* Быстрые действия */}
        <QuickActionsWidget employeeRole={data.employeeRole} />

        <LastUpdated />
      </div>
    </div>
  );
}

function LastUpdated() {
  const fetching = useIsFetching();
  const [lastOk, setLastOk] = useState<Date | null>(null);
  useEffect(() => { if (fetching === 0) setLastOk(new Date()); }, [fetching]);
  const timeStr = lastOk ? lastOk.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--";
  return (
    <div className="text-center mt-6 mb-2">
      <span className="text-[10px] text-gray-400 dark:text-gray-500">
        {fetching > 0 ? (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            Обновление...
          </span>
        ) : `Данные от ${timeStr}`}
      </span>
    </div>
  );
}

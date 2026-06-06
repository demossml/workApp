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
import { MyShiftCard } from "@widgets/home/MyShiftCard";
import { WeekSalary } from "@widgets/home/WeekSalary";
import { NetworkPulse } from "@widgets/home/NetworkPulse";
import { TodayPulse } from "@widgets/home/TodayPulse";
import { isTelegramMiniApp } from "../helpers/telegram";
import { useState, useEffect } from "react";

export default function Home() {
  const { data, error, isLoading } = useEmployeeRole();
  const miniApp = isTelegramMiniApp();

  // Состояния загрузки и ошибок
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error.message} />;

  // Проверка прав доступа
  if (!data?.employeeRole || data.employeeRole === "null") {
    const shouldShowManualIdInput = !miniApp || data?.employeeRole === "null";

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-6">
        <h1 className="mb-4 text-lg sm:text-xl md:text-2xl text-gray-800 dark:text-gray-100 font-bold">
          {shouldShowManualIdInput
            ? "Введите Telegram ID для входа"
            : "У вас нет прав доступа."}
        </h1>
        {shouldShowManualIdInput && (
          <RegisterUserCard
            onRegister={(id) => {
              console.log("Новый пользователь Telegram ID:", id);
            }}
          />
        )}
      </div>
    );
  }

  const { isCashier, isAdmin, isSuperAdmin, canSeeMainDashboard } =
    buildHomeAccessModel(data.employeeRole);

  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-gray-100 dark:bg-gray-900 pt-20 sm:pt-24 px-4 sm:px-6 pb-24">
      <div className="w-full max-w-7xl space-y-4">

        {/* === ПРОДАВЕЦ === */}
        {isCashier && !isSuperAdmin && (
          <>
            <MyShiftCard />
            <WeekSalary />
            <DailyBriefing />
            <QuickActionsWidget employeeRole={data.employeeRole} />
          </>
        )}

        {/* === АДМИН / СУПЕРАДМИН === */}
        {(isAdmin || isSuperAdmin) && (
          <>
            <TodayPulse />
            <NetworkPulse />
            <PlanStatusWidget />
            {isSuperAdmin && <TodayAlertsWidget />}
            {isSuperAdmin && <SellerPerformanceWidget />}
            {(isSuperAdmin || isAdmin) && <StockHealthWidget />}
            <QuickActionsWidget employeeRole={data.employeeRole} />
          </>
        )}

        {/* Last updated */}
        <LastUpdated />
      </div>
    </div>
  );
}

// ====== LastUpdated indicator ======

function LastUpdated() {
  const fetching = useIsFetching();
  const [lastOk, setLastOk] = useState<Date | null>(null);

  useEffect(() => {
    if (fetching === 0) setLastOk(new Date());
  }, [fetching]);

  const timeStr = lastOk
    ? lastOk.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--:--:--";

  return (
    <div className="text-center mt-6 mb-2">
      <span className="text-[10px] text-gray-400 dark:text-gray-500">
        {fetching > 0 ? (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            Обновление...
          </span>
        ) : (
          `Данные от ${timeStr}`
        )}
      </span>
    </div>
  );
}

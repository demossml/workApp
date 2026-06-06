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
import { DashboardSummaryWidget } from "@widgets/dashboard";
import { buildHomeAccessModel } from "@features/dashboard/model/homePageModel";
import { useDataSourceStore } from "@shared/model/dataSourceStore";
import { SellerPerformanceWidget } from "@widgets/home/SellerPerformanceWidget";
import { MyPerformanceWidget } from "@widgets/home/MyPerformanceWidget";
// import { SalaryWidget } from "@widgets/home/SalaryWidget";
import { DailyBriefing } from "@widgets/home/DailyBriefing";
import { HealthScore } from "@widgets/home/HealthScore";
import { isTelegramMiniApp } from "../helpers/telegram";
import { useState, useEffect } from "react";

export default function Home() {
  const { data, error, isLoading } = useEmployeeRole();
  const _dataSource = useDataSourceStore((state) => state.dataSource);
  void _dataSource;
  const _aiAvailable = useDataSourceStore((state) => state.aiAvailable);
  void _aiAvailable;
  const miniApp = isTelegramMiniApp();

  // Состояния загрузки и ошибок
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error.message} />;

  // Проверка прав доступа - улучшенная версия
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
              // 👉 здесь можно вызвать API для сохранения в БД
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
      <div className="w-full max-w-7xl">

        {/* Daily Briefing — персональная сводка */}
        <DailyBriefing />

        {/* Health Score — индикатор здоровья сети */}
        <HealthScore />

        {/* Мои показатели — для всех продавцов */}
        <MyPerformanceWidget />

        {/* Эффективность продавцов (топ-3 за сегодня, тап → полный дашборд) */}
        {isSuperAdmin && <SellerPerformanceWidget />}

        {/* Зарплата — SUPERADMIN (тест: Карина Боброва) */}
        {/* {isSuperAdmin && <SalaryWidget />} */}

        {/* План продаж - карточки статусов (все роли) */}
        <PlanStatusWidget />

        {/* Детальный отчет по магазинам */}
        {/* {(isCashier || isAdmin) && <PlanSalesFinancialReport />} */}

        {/* Сводка за день - для всех ролей */}
        {canSeeMainDashboard && (
          <DashboardSummaryWidget showAiDirector={false} />
        )}

        {/* {isSuperAdmin && <DashboardSummary2 />} */}

        {/* Критические оповещения - только для админов */}
        {isSuperAdmin && <TodayAlertsWidget />}

        {/* Состояние остатков — мёртвый сток + заканчиваются */}
        {(isSuperAdmin || isAdmin) && <StockHealthWidget />}

        {/* Быстрые действия - в зависимости от роли */}
        <QuickActionsWidget employeeRole={data.employeeRole} />

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
    ? lastOk.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
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

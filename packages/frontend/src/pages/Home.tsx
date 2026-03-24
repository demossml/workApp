import { ErrorState, LoadingState } from "@shared/ui/states";
import { RegisterUserCard } from "@features/employees";
import { useEmployeeRole } from "../hooks/useApi";
import {
  DashboardSummaryWidget,
  PlanStatusWidget,
  QuickActionsWidget,
  TodayAlertsWidget,
} from "@widgets";
import { buildHomeAccessModel } from "@features/dashboard/model/homePageModel";

export default function Home() {
  const { data, error, isLoading } = useEmployeeRole();

  // Состояния загрузки и ошибок
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error.message} />;

  // Проверка прав доступа - улучшенная версия
  if (!data?.employeeRole || data.employeeRole === "null") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-6">
        <h1 className="mb-4 text-lg sm:text-xl md:text-2xl text-gray-800 dark:text-gray-100 font-bold">
          {!data?.employeeRole
            ? "У вас нет прав доступа."
            : "Завершите регистрацию."}
        </h1>
        {data?.employeeRole === "null" && (
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
        {/* План продаж - карточки статусов */}
        {(isSuperAdmin || isCashier || isAdmin) && <PlanStatusWidget />}

        {/* Детальный отчет по магазинам */}
        {/* {(isCashier || isAdmin) && <PlanSalesFinancialReport />} */}

        {/* Сводка за день - для всех ролей */}
        {canSeeMainDashboard && <DashboardSummaryWidget showAiDirector={false} />}

        {/* {isSuperAdmin && <DashboardSummary2 />} */}

        {/* Критические оповещения - только для админов */}
        {isSuperAdmin && <TodayAlertsWidget />}

        {/* Быстрые действия - в зависимости от роли */}
        <QuickActionsWidget employeeRole={data.employeeRole} />
      </div>
    </div>
  );
}

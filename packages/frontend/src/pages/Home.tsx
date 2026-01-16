import { ErrorDisplay } from "../components/ErrorDisplay";
import { LoadingSpinner } from "../components/LoadingSpinner";
// import PlanSalesFinancialReport from "../components/PlanSalesFinancialReport";
import PlanStatusCards from "../components/PlanStatusCards";
import DashboardSummary from "../components/DashboardSummary";
import TodayAlerts from "../components/TodayAlerts";
import QuickActions from "../components/QuickActions";
import { RegisterUser } from "../components/RegisterUser";
import { useEmployeeRole } from "../hooks/useApi";

export default function Home() {
  const { data, error, isLoading } = useEmployeeRole();

  // Состояния загрузки и ошибок
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error.message} />;

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
          <RegisterUser
            onRegister={(id) => {
              console.log("Новый пользователь Telegram ID:", id);
              // 👉 здесь можно вызвать API для сохранения в БД
            }}
          />
        )}
      </div>
    );
  }

  const isCashier = data.employeeRole === "CASHIER";
  const isAdmin = data.employeeRole === "ADMIN";
  const isSuperAdmin = data.employeeRole === "SUPERADMIN";

  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-gray-100 dark:bg-gray-900 pt-20 sm:pt-24 px-4 sm:px-6 pb-24">
      <div className="w-full max-w-7xl">
        {/* План продаж - карточки статусов */}
        {(isSuperAdmin || isCashier || isAdmin) && <PlanStatusCards />}

        {/* Детальный отчет по магазинам */}
        {/* {(isCashier || isAdmin) && <PlanSalesFinancialReport />} */}

        {/* Сводка за день - для всех ролей */}
        {(isSuperAdmin || isAdmin || isCashier) && <DashboardSummary />}

        {/* Критические оповещения - только для админов */}
        {isSuperAdmin && <TodayAlerts />}

        {/* Быстрые действия - в зависимости от роли */}
        <QuickActions employeeRole={data.employeeRole} />
      </div>
    </div>
  );
}

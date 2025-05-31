import { useEmployeeRole } from "../hooks/useApi";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorDisplay } from "../components/ErrorDisplay";
import { PlanSalesReport } from "../components/PlanSalesReport";
import { AdminButtons, CashierButtons } from "../components/Button";

export default function Home() {
  const { data, error, isLoading } = useEmployeeRole();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error.message} />;
  if (!data?.employeeRole)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-custom-gray dark:bg-gray-900 p-4">
        <h1 className="mb-4 text-xl sm:text-2xl text-gray-800 dark:text-gray-100 font-bold">
          У вас нет прав доступа.
        </h1>
      </div>
    );

  return (
    <div className="flex flex-col items-center bg-custom-gray dark:bg-gray-900 justify-center w-full py-12 h-screen">
      <div className="relative min-h-[150px] w-full top-[-120px]">
        <PlanSalesReport />
      </div>
      {data.employeeRole === "CASHIER" && <CashierButtons />}
      {data.employeeRole === "ADMIN" && <AdminButtons />}
    </div>
  );
}

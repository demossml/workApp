import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router";

const Settings = lazy(() => import("@/pages/reports/Settings"));
const Home = lazy(() => import("@/pages/Home"));
const PlanSalesReport = lazy(() => import("@/pages/reports/PlanSalesReport"));
const SalesReport = lazy(() => import("@/pages/reports/SaleRepor"));
const SalaryReports = lazy(() => import("@/pages/reports/SalarysReport"));
const SalestReportForThePeriod = lazy(() => import("@/pages/reports/SalestReportForThePeriod"));
const Orders = lazy(() => import("@/pages/reports/Orders"));
const QuantityTableProps = lazy(() => import("@/pages/reports/QuantityTable"));
const StoreOpeningReport = lazy(() => import("@/pages/reports/StoreOpeningReport"));
const ProfitReportPage = lazy(() => import("@/pages/reports/ProfitReportPage"));
const StaffRatingsReport = lazy(() => import("@/pages/reports/StaffRatingsReport"));
const SalaryReport = lazy(() => import("@/pages/reports/SalaryReport"));
const SalesTodayReport = lazy(() => import("@/pages/reports/SalesTodayReport"));
const SchedulesReport = lazy(() => import("@/pages/reports/SchedulesReport"));
const StoreOpeningPage = lazy(() => import("@/pages/opening/StoreOpeningPage"));
const DeadStocks = lazy(() => import("@/pages/deadstock/DeadStock"));
const StoreOpeningsAdminReport = lazy(() => import("@/pages/reports/StoreOpeningsAdminReport"));
const AiDirectorPage = lazy(() => import("@/pages/ai/AiDirector"));

export function AppRouter() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-gray-500">
          Загрузка экрана...
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/evotor/settings" element={<Settings />} />
        <Route path="/evotor/plan-for-today" element={<PlanSalesReport />} />
        <Route path="/evotor/sales-report" element={<SalesReport />} />
        <Route path="/evotor/salary-report" element={<SalaryReports />} />
        <Route path="/evotor/sales-for-the-period" element={<SalestReportForThePeriod />} />
        <Route path="/evotor/orders" element={<Orders />} />
        <Route path="/evotor/stock-realization-report" element={<QuantityTableProps />} />
        <Route path="/evotor/store-opening-report" element={<StoreOpeningReport />} />
        <Route path="/evotor/store-openings-admin" element={<StoreOpeningsAdminReport />} />
        <Route path="/evotor/profit" element={<ProfitReportPage />} />
        <Route path="/evotor/staff-analysi" element={<StaffRatingsReport />} />
        <Route path="/evotor/salary-user-report" element={<SalaryReport />} />
        <Route path="/evotor/sales-today" element={<SalesTodayReport />} />
        <Route path="/evotor/schedules" element={<SchedulesReport />} />
        <Route path="/evotor/open-store" element={<StoreOpeningPage />} />
        <Route path="evotor/dead-stock" element={<DeadStocks />} />
        <Route path="/ai/director" element={<AiDirectorPage />} />
      </Routes>
    </Suspense>
  );
}

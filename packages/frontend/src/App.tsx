import { Route, Routes } from "react-router";
import { Topbar } from "./components/Topbar";
import { BottomNavigation } from "./components/BottomNavigation";
import { PWAInstall } from "./pwa";
import Home from "./pages/Home";
import Settings from "./pages/reports/Settings";
import PlanSalesReport from "./pages/reports/PlanSalesReport";
import SalesReport from "./pages/reports/SaleRepor";
import SalaryReports from "./pages/reports/SalarysReport";
import SalestReportForThePeriod from "./pages/reports/SalestReportForThePeriod";
import Orders from "./pages/reports/Orders";
import QuantityTableProps from "./pages/reports/QuantityTable";
import StoreOpeningReport from "./pages/reports/StoreOpeningReport";
import ProfitReportPage from "./pages/reports/ProfitReportPage";
import StaffRatingsReport from "./pages/reports/StaffRatingsReport";
import SalaryReport from "./pages/reports/SalaryReport";
import SalesTodayReport from "./pages/reports/SalesTodayReport";
import SchedulesReport from "./pages/reports/SchedulesReport";
import { useEmployeeRole } from "./hooks/useApi";
import { useTheme } from "./hooks/useTheme";
import StoreOpeningPage from "./pages/opening/StoreOpeningPage";
import DeadStocks from "./pages/deadstock/DeadStock";

function App() {
  const { data } = useEmployeeRole();
  useTheme();

  return (
    <>
      <Topbar />
      <PWAInstall />
      {/* <div className="pb-20"> */} {/* отступ снизу под меню */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/evotor/settings" element={<Settings />} />
        <Route path="/evotor/plan-for-today" element={<PlanSalesReport />} />
        <Route path="/evotor/sales-report" element={<SalesReport />} />
        <Route path="/evotor/salary-report" element={<SalaryReports />} />
        <Route
          path="/evotor/sales-for-the-period"
          element={<SalestReportForThePeriod />}
        />
        <Route path="/evotor/orders" element={<Orders />} />
        <Route
          path="/evotor/stock-realization-report"
          element={<QuantityTableProps />}
        />
        <Route
          path="/evotor/store-opening-report"
          element={<StoreOpeningReport />}
        />
        <Route path="/evotor/profit" element={<ProfitReportPage />} />
        <Route path="/evotor/staff-analysi" element={<StaffRatingsReport />} />
        <Route path="/evotor/salary-user-report" element={<SalaryReport />} />
        <Route path="/evotor/sales-today" element={<SalesTodayReport />} />
        <Route path="/evotor/schedules" element={<SchedulesReport />} />
        <Route path="/evotor/open-store" element={<StoreOpeningPage />} />
        <Route path="evotor/dead-stock" element={<DeadStocks />} />
      </Routes>
      {data?.employeeRole && (
        <BottomNavigation employeeRole={data.employeeRole} />
      )}
    </>
  );
}

export default App;

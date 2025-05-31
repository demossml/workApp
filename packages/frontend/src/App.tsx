import { Route, Routes } from "react-router";
import { Topbar } from "./components/Topbar";
import Home from "./pages/Home";
import SalaryReport from "./pages/reports/SalaryReport";
import SalesTodayReport from "./pages/reports/SalesTodayReport";
import PlanSalesReport from "./pages/reports/PlanSalesReport";
import SalesReport from "./pages/reports/SaleRepor";
import Settings from "./pages/reports/Settings";
import SalestReportForThePeriod from "./pages/reports/SalestReportForThePeriod";
import SalaryReports from "./pages/reports/SalarysReport";
import SchedulesReport from "./pages/reports/SchedulesReport";
import StoreOpeningReport from "./pages/reports/StoreOpeningReport";
import QuantityTableProps from "./pages/reports/QuantityTable";
import Order from "./pages/reports/Orders";
import ScheduleTable from "./pages/reports/ScheduleTable";
import SchedulesView from "./components/SchedulesView";

function App() {
  return (
    <>
      <Topbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/evotor/salary-report" element={<SalaryReports />} />
        <Route path="/evotor/sales-today" element={<SalesTodayReport />} />
        <Route path="/evotor/plan-for-today" element={<PlanSalesReport />} />
        <Route path="/evotor/sales-report" element={<SalesReport />} />
        <Route path="/evotor/settings" element={<Settings />} />
        <Route
          path="/evotor/sales-for-the-period"
          element={<SalestReportForThePeriod />}
        />
        <Route path="/evotor/salary-user-report" element={<SalaryReport />} />
        <Route path="/evotor/schedules" element={<SchedulesReport />} />
        <Route
          path="/evotor/store-opening-report"
          element={<StoreOpeningReport />}
        />
        <Route
          path="/evotor/stock-realization-report"
          element={<QuantityTableProps />}
        />
        <Route path="/evotor/orders" element={<Order />} />
        <Route path="/evotor/schedules-table" element={<ScheduleTable />} />
        <Route path="/evotor/schedules-view" element={<SchedulesView />} />
      </Routes>
    </>
  );
}

export default App;

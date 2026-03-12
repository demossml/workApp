import { Route, Routes, useLocation } from "react-router";
import { Suspense, lazy, useEffect, useState } from "react";
import { BottomNavigation } from "./components/BottomNavigation";
import { PWAInstall } from "./pwa";
import Home from "./pages/Home";
import { useEmployeeRole } from "./hooks/useApi";
import { useTheme } from "./hooks/useTheme";
import { useUser } from "./hooks/userProvider";
import {
  startBackgroundUpload,
  hasFilesInQueue,
} from "./helpers/backgroundUploader";
import { trackEvent } from "./helpers/analytics";
import { useTelegramFullscreenLayout } from "./hooks/useTelegramFullscreenLayout";

const Settings = lazy(() => import("./pages/reports/Settings"));
const PlanSalesReport = lazy(() => import("./pages/reports/PlanSalesReport"));
const SalesReport = lazy(() => import("./pages/reports/SaleRepor"));
const SalaryReports = lazy(() => import("./pages/reports/SalarysReport"));
const SalestReportForThePeriod = lazy(
  () => import("./pages/reports/SalestReportForThePeriod")
);
const Orders = lazy(() => import("./pages/reports/Orders"));
const QuantityTableProps = lazy(() => import("./pages/reports/QuantityTable"));
const StoreOpeningReport = lazy(
  () => import("./pages/reports/StoreOpeningReport")
);
const ProfitReportPage = lazy(() => import("./pages/reports/ProfitReportPage"));
const StaffRatingsReport = lazy(
  () => import("./pages/reports/StaffRatingsReport")
);
const SalaryReport = lazy(() => import("./pages/reports/SalaryReport"));
const SalesTodayReport = lazy(() => import("./pages/reports/SalesTodayReport"));
const SchedulesReport = lazy(() => import("./pages/reports/SchedulesReport"));
const StoreOpeningPage = lazy(() => import("./pages/opening/StoreOpeningPage"));
const DeadStocks = lazy(() => import("./pages/deadstock/DeadStock"));
const StoreOpeningsAdminReport = lazy(
  () => import("./pages/reports/StoreOpeningsAdminReport")
);
const AiDirectorPage = lazy(() => import("./pages/ai/AiDirector"));

function App() {
  const { data } = useEmployeeRole();
  const tg = useUser();
  const userId = tg?.id?.toString();
  const location = useLocation();

  useTheme();
  useTelegramFullscreenLayout();

  const [uploadStatus, setUploadStatus] = useState<{
    isUploading: boolean;
    uploaded: number;
    total: number;
  }>({ isUploading: false, uploaded: 0, total: 0 });

  // Фоновая загрузка файлов при открытии приложения
  useEffect(() => {
    if (!userId) return;

    const checkAndUpload = async () => {
      const hasFiles = await hasFilesInQueue(userId);

      if (hasFiles) {
        console.log(
          "📤 Обнаружены файлы в очереди, начинаю фоновую загрузку..."
        );
        setUploadStatus({ isUploading: true, uploaded: 0, total: 0 });

        try {
          const result = await startBackgroundUpload(
            userId,
            (uploaded, total) => {
              setUploadStatus({ isUploading: true, uploaded, total });
            }
          );

          console.log(
            `✅ Фоновая загрузка завершена: ${result.uploaded} успешно, ${result.failed} ошибок`
          );
        } catch (error) {
          console.error("❌ Ошибка фоновой загрузки:", error);
        } finally {
          setUploadStatus({ isUploading: false, uploaded: 0, total: 0 });
        }
      }
    };

    // Запускаем проверку через 2 секунды после загрузки
    const timer = setTimeout(checkAndUpload, 2000);

    const onOnline = () => {
      void checkAndUpload();
    };
    window.addEventListener("online", onOnline);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [userId]);

  useEffect(() => {
    const screen = location.pathname || "/";
    void trackEvent("screen_open", { screen });
    return () => {
      void trackEvent("screen_close", { screen });
    };
  }, [location.pathname]);

  return (
    <>
      <PWAInstall />
      {/* Индикатор фоновой загрузки */}
      {uploadStatus.isUploading && uploadStatus.total > 0 && (
        <div
          className="fixed right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse"
          style={{
            top: "calc(var(--tg-app-top-offset, var(--tg-safe-top, 0px)) + 0.5rem)",
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">
              Загружаю фото: {uploadStatus.uploaded} / {uploadStatus.total}
            </span>
          </div>
        </div>
      )}
      {/* <div className="pb-20"> */} {/* отступ снизу под меню */}
      <main className="app-shell-main">
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
            <Route
              path="/evotor/plan-for-today"
              element={<PlanSalesReport />}
            />
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
            <Route
              path="/evotor/store-openings-admin"
              element={<StoreOpeningsAdminReport />}
            />
            <Route path="/evotor/profit" element={<ProfitReportPage />} />
            <Route
              path="/evotor/staff-analysi"
              element={<StaffRatingsReport />}
            />
            <Route
              path="/evotor/salary-user-report"
              element={<SalaryReport />}
            />
            <Route path="/evotor/sales-today" element={<SalesTodayReport />} />
            <Route path="/evotor/schedules" element={<SchedulesReport />} />
            <Route path="/evotor/open-store" element={<StoreOpeningPage />} />
            <Route path="evotor/dead-stock" element={<DeadStocks />} />
            <Route path="/ai/director" element={<AiDirectorPage />} />
          </Routes>
        </Suspense>
      </main>
      {(() => {
        const allowedRoles = ["SUPERADMIN", "CASHIER", "ADMIN"];
        const role = allowedRoles.includes(data?.employeeRole ?? "")
          ? (data?.employeeRole as "SUPERADMIN" | "CASHIER" | "ADMIN")
          : "CASHIER";
        return <BottomNavigation employeeRole={role} />;
      })()}
    </>
  );
}

export default App;

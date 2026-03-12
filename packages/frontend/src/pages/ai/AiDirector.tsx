import DashboardSummary2 from "../../components/dashboard/DashboardSummary";

export default function AiDirectorPage() {
  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-gray-100 dark:bg-gray-900 pt-20 sm:pt-24 px-4 sm:px-6 pb-24">
      <div className="w-full max-w-7xl">
        <DashboardSummary2 showAiDirector showMainDashboard={false} />
      </div>
    </div>
  );
}

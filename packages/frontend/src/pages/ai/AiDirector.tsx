import { useAiDirectorPageModel } from "@features/ai/hooks";
import { AiDirectorDataWidget, AiDirectorTopWidget } from "@widgets/ai-director";
import { DashboardSummaryWidget } from "@widgets";

export default function AiDirectorPage() {
  const model = useAiDirectorPageModel();

  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-gray-100 dark:bg-gray-900 pt-20 sm:pt-24 px-2 sm:px-6 pb-24 overflow-x-hidden">
      <div className="w-full max-w-7xl min-w-0 overflow-x-hidden">
        <DashboardSummaryWidget showAiDirector showMainDashboard={false} />
        <div className="mt-6 sm:mt-8 grid gap-4 sm:gap-6">
          <AiDirectorTopWidget model={model} />
          <AiDirectorDataWidget model={model} />
        </div>
      </div>
    </div>
  );
}

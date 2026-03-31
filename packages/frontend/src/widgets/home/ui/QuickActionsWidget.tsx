import { useNavigate } from "react-router-dom";
import {
  DoorOpen,
  Package,
  FileText,
  TrendingUp,
  Store,
  Calculator,
  Sparkles,
} from "lucide-react";
import {
  getAvailableQuickActions,
  type QuickActionModel,
} from "@features/dashboard/model/quickActionsModel";
import { useDataSourceStore } from "@shared/model/dataSourceStore";

interface QuickActionsWidgetProps {
  employeeRole: string;
}

export function QuickActionsWidget({ employeeRole }: QuickActionsWidgetProps) {
  const navigate = useNavigate();
  const aiAvailable = useDataSourceStore((state) => state.aiAvailable);

  const availableActions = getAvailableQuickActions(employeeRole);

  const getActionIcon = (action: QuickActionModel) => {
    switch (action.iconKey) {
      case "door_open":
        return <DoorOpen className="w-6 h-6" />;
      case "package":
        return <Package className="w-6 h-6" />;
      case "file_text":
        return <FileText className="w-6 h-6" />;
      case "trending_up":
        return <TrendingUp className="w-6 h-6" />;
      case "store":
        return <Store className="w-6 h-6" />;
      case "calculator":
        return <Calculator className="w-6 h-6" />;
      case "sparkles":
        return <Sparkles className="w-6 h-6" />;
      default:
        return <Store className="w-6 h-6" />;
    }
  };

  if (availableActions.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Быстрые действия
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {availableActions.map((action) => {
          const isAiDirectorAction = action.path === "/ai/director";
          const isDisabled = isAiDirectorAction && !aiAvailable;

          return (
            <button
              key={action.path}
              onClick={() => {
                if (isDisabled) return;
                navigate(action.path);
              }}
              disabled={isDisabled}
              title={
                isDisabled ? "Недоступно при работе через Elvator" : undefined
              }
              className={`bg-gradient-to-br ${action.color} text-white p-4 rounded-lg shadow-lg transition-all duration-200 ${
                isDisabled
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:shadow-xl hover:scale-105 active:scale-95"
              }`}
            >
              <div className="flex flex-col items-center text-center gap-2">
                {getActionIcon(action)}
                <div>
                  <div className="font-semibold text-sm">{action.title}</div>
                  <div className="text-xs opacity-80 mt-1">
                    {action.description}
                  </div>
                  {isDisabled && (
                    <div className="text-[11px] mt-1 opacity-90">
                      Недоступно при работе через Elvator
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

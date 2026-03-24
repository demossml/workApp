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

interface QuickActionsWidgetProps {
  employeeRole: string;
}

export function QuickActionsWidget({ employeeRole }: QuickActionsWidgetProps) {
  const navigate = useNavigate();

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
    }
  };

  if (availableActions.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Быстрые действия
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {availableActions.map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className={`bg-gradient-to-br ${action.color} text-white p-4 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95`}
          >
            <div className="flex flex-col items-center text-center gap-2">
              {getActionIcon(action)}
              <div>
                <div className="font-semibold text-sm">{action.title}</div>
                <div className="text-xs opacity-80 mt-1">
                  {action.description}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

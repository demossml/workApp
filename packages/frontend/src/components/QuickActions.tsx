import { useNavigate } from "react-router-dom";
import { DoorOpen, Package, FileText, TrendingUp } from "lucide-react";

interface QuickAction {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  color: string;
  roles: string[];
}

interface QuickActionsProps {
  employeeRole: string;
}

export default function QuickActions({ employeeRole }: QuickActionsProps) {
  const navigate = useNavigate();

  const actions: QuickAction[] = [
    {
      title: "Открытие магазина",
      description: "Зафиксировать открытие",
      icon: <DoorOpen className="w-6 h-6" />,
      path: "/evotor/open-store",
      color: "from-green-500 to-green-600",
      roles: ["CASHIER", "ADMIN", "SUPERADMIN"],
    },
    {
      title: "Мертвые остатки",
      description: "Проверить товары",
      icon: <Package className="w-6 h-6" />,
      path: "/evotor/dead-stock",
      color: "from-purple-500 to-purple-600",
      roles: ["ADMIN", "SUPERADMIN"],
    },
    {
      title: "Отчет по продажам",
      description: "Просмотр продаж",
      icon: <FileText className="w-6 h-6" />,
      path: "/evotor/sales-report",
      color: "from-blue-500 to-blue-600",
      roles: ["ADMIN", "SUPERADMIN"],
    },
    {
      title: "Прогноз закупки",
      description: "SMA заказы",
      icon: <TrendingUp className="w-6 h-6" />,
      path: "/evotor/sales-report",
      color: "from-orange-500 to-orange-600",
      roles: ["ADMIN", "SUPERADMIN"],
    },
  ];

  const availableActions = actions.filter((action) =>
    action.roles.includes(employeeRole)
  );

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
              {action.icon}
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

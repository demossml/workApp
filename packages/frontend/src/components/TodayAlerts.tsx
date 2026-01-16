import { useEffect, useState } from "react";
import { AlertTriangle, TrendingDown, Clock } from "lucide-react";

interface SalesData {
  salesDataByShopName: Record<string, { sell: number; refund: number }>;
  grandTotalSell: number;
}

interface Alert {
  type: "warning" | "danger" | "info";
  title: string;
  message: string;
  icon: React.ReactNode;
}

export default function TodayAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/evotor/report/financial/today", {
          headers: {
            "Content-Type": "application/json",
            "x-telegram-id": localStorage.getItem("telegramId") || "",
            "x-user-id": localStorage.getItem("userId") || "",
          },
        });
        const data: SalesData = await response.json();

        const newAlerts: Alert[] = [];

        // Проверяем магазины с низкими продажами
        const avgSales =
          data.grandTotalSell / Object.keys(data.salesDataByShopName).length;
        const lowSalesShops = Object.entries(data.salesDataByShopName).filter(
          ([, shopData]) => shopData.sell < avgSales * 0.5 && shopData.sell > 0
        );

        if (lowSalesShops.length > 0) {
          newAlerts.push({
            type: "warning",
            title: "Низкие продажи",
            message: `${lowSalesShops.length} магазин(ов) с продажами ниже 50% среднего`,
            icon: <TrendingDown className="w-5 h-5" />,
          });
        }

        // Проверяем магазины с высокими возвратами
        const highRefundShops = Object.entries(data.salesDataByShopName).filter(
          ([, shopData]) =>
            shopData.refund > 0 &&
            shopData.sell > 0 &&
            shopData.refund / shopData.sell > 0.1
        );

        if (highRefundShops.length > 0) {
          newAlerts.push({
            type: "danger",
            title: "Высокие возвраты",
            message: `${highRefundShops.length} магазин(ов) с возвратами >10%`,
            icon: <AlertTriangle className="w-5 h-5" />,
          });
        }

        // Проверяем время (если после 12:00, а есть магазины без продаж)
        const currentHour = new Date().getHours();
        const noSalesShops = Object.entries(data.salesDataByShopName).filter(
          ([, shopData]) => shopData.sell === 0
        );

        if (currentHour >= 12 && noSalesShops.length > 0) {
          newAlerts.push({
            type: "info",
            title: "Нет продаж",
            message: `${noSalesShops.length} магазин(ов) без продаж после 12:00`,
            icon: <Clock className="w-5 h-5" />,
          });
        }

        setAlerts(newAlerts);
      } catch (error) {
        console.error("Ошибка загрузки оповещений:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 120000); // Обновление каждые 2 минуты
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="mb-6">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-3 animate-pulse" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (alerts.length === 0) return null;

  const getAlertStyles = (type: Alert["type"]) => {
    switch (type) {
      case "danger":
        return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200";
      case "warning":
        return "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200";
      case "info":
        return "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200";
    }
  };

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Оповещения
      </h2>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={`${alert.type}-${alert.title}`}
            className={`flex items-start gap-3 p-3 rounded-lg border ${getAlertStyles(alert.type)}`}
          >
            <div className="mt-0.5">{alert.icon}</div>
            <div className="flex-1">
              <div className="font-semibold text-sm">{alert.title}</div>
              <div className="text-xs opacity-90 mt-0.5">{alert.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

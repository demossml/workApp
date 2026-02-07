import { useEffect, useState } from "react";
import { AlertTriangle, TrendingDown, Clock } from "lucide-react";

// Интерфейс для структуры данных о продажах
interface SalesData {
  salesDataByShopName: Record<string, { sell: number; refund: number }>;
  grandTotalSell: number;
}

// Интерфейс для оповещения
interface Alert {
  type: "warning" | "danger" | "info"; // Тип оповещения
  title: string; // Заголовок
  message: string; // Сообщение
  icon: React.ReactNode; // Иконка
}

export default function TodayAlerts() {
  // Состояние для списка оповещений
  const [alerts, setAlerts] = useState<Alert[]>([]);
  // Состояние загрузки
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Функция для загрузки данных и формирования оповещений
    const fetchData = async () => {
      try {
        // Запрос к API для получения финансового отчёта за сегодня
        const response = await fetch("/api/evotor/report/financial/today", {
          headers: {
            "Content-Type": "application/json",
            "x-telegram-id": localStorage.getItem("telegramId") || "",
            "x-user-id": localStorage.getItem("userId") || "",
          },
        });
        const data: SalesData = await response.json();

        const newAlerts: Alert[] = [];

        // --- Оповещение о низких продажах ---
        // Среднее значение продаж по всем магазинам
        const avgSales =
          data.grandTotalSell / Object.keys(data.salesDataByShopName).length;
        // Магазины, где продажи ниже 50% среднего
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

        // --- Оповещение о высоких возвратах ---
        // Магазины, где возвраты превышают 10% от продаж
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

        // --- Оповещение о магазинах без продаж после 12:00 ---
        const currentHour = new Date().getHours();
        // Магазины, где нет продаж
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

        // Сохраняем оповещения в состоянии
        setAlerts(newAlerts);
      } catch (error) {
        // Обработка ошибки загрузки
        console.error("Ошибка загрузки оповещений:", error);
      } finally {
        setLoading(false);
      }
    };

    // Первый запуск и периодическое обновление каждые 2 минуты
    fetchData();
    const interval = setInterval(fetchData, 120000); // 2 минуты
    return () => clearInterval(interval);
  }, []);

  // Отображение состояния загрузки (скелетон)
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

  // Если нет оповещений — ничего не показываем
  if (alerts.length === 0) return null;

  // Функция для выбора стилей оповещения по типу
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

  // Основной рендер компонента: список оповещений
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
            {/* Иконка оповещения */}
            <div className="mt-0.5">{alert.icon}</div>
            <div className="flex-1">
              {/* Заголовок оповещения */}
              <div className="font-semibold text-sm">{alert.title}</div>
              {/* Сообщение оповещения */}
              <div className="text-xs opacity-90 mt-0.5">{alert.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

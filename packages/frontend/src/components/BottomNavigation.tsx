import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  Settings,
  MoreHorizontal,
  X,
  FileBarChart,
  Package,
  Store,
  Wallet,
  HandCoins,
  Home,
  DoorOpen,
  NotepadText,
} from "lucide-react";
import { isTelegramMiniApp, telegram } from "../helpers/telegram";

interface BottomNavigationProps {
  employeeRole?: string; // роль пользователя (CASHIER | ADMIN | SUPERADMIN)
}

// Основное меню
const mainNav = [
  {
    to: "/",
    label: "Главная",
    icon: <Home />,
    roles: ["CASHIER", "ADMIN", "SUPERADMIN"],
  },
  {
    to: "/evotor/settings",
    label: "Настройки",
    icon: <Settings />,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/sales-report",
    label: "Прод. отчёт",
    icon: <BarChart3 />,
    roles: ["ADMIN", "SUPERADMIN", "CASHIER"],
  },
  {
    to: "/evotor/salary-user-report",
    label: "Зарплата",
    icon: <HandCoins />,
    roles: ["CASHIER", "ADMIN"],
  },
  {
    to: "/evotor/open-store",
    label: "Открытие магазина",
    icon: <DoorOpen />,
    roles: ["CASHIER", "SUPERADMIN"],
  },
];

// Дополнительные разделы
const moreButtons = [
  {
    to: "/evotor/salary-report",
    label: "Зарплата",
    icon: <HandCoins />,
    roles: ["SUPERADMIN"],
  },
  {
    to: "evotor/dead-stock",
    label: "Dead stock",
    icon: <NotepadText />,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/sales-for-the-period",
    label: "Финансовый отчёт",
    icon: <FileBarChart />,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/orders",
    label: "Заказ товара (SMA)",
    icon: <Package />,
    roles: ["CASHIER", "ADMIN", "SUPERADMIN"],
  },
  {
    to: "/evotor/store-opening-report",
    label: "Открытие магазинов",
    icon: <Store />,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/stock-realization-report",
    label: "Товарные остатки",
    icon: <Wallet />,
    roles: ["ADMIN", "SUPERADMIN"],
  },
  {
    to: "/evotor/profit",
    label: "Расчеты прибыли",
    icon: <Store />,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/sales-report",
    label: "Прод. отчёт",
    icon: <Store />,
    roles: ["ADMIN", "SUPERADMIN"],
  },
];

export function BottomNavigation({
  employeeRole = "CASHIER",
}: BottomNavigationProps) {
  const [open, setOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const location = useLocation();

  const isMiniApp = isTelegramMiniApp();

  const filteredMainNav = mainNav.filter((item) =>
    item.roles.includes(employeeRole)
  );
  const filteredMoreButtons = moreButtons.filter((btn) =>
    btn.roles.includes(employeeRole)
  );

  // Инициализация Telegram WebApp
  useEffect(() => {
    if (isMiniApp) {
      // Устанавливаем цвет фона
      const theme = telegram.WebApp.colorScheme;
      telegram.WebApp.setBackgroundColor(
        theme === "dark" ? "#1f2937" : "#f3f4f6"
      );

      // Включаем подтверждение закрытия
      telegram.WebApp.enableClosingConfirmation();

      // Отслеживаем изменение размера окна
      const handleViewportChanged = () => {
        setIsExpanded(telegram.WebApp.isExpanded);
      };

      telegram.WebApp.onEvent("viewportChanged", handleViewportChanged);
      setIsExpanded(telegram.WebApp.isExpanded);

      return () => {
        telegram.WebApp.offEvent("viewportChanged", handleViewportChanged);
        telegram.WebApp.disableClosingConfirmation();
      };
    }
  }, []);

  // Функция для разворачивания окна
  const expandApp = useCallback(() => {
    if (isMiniApp && !isExpanded) {
      telegram.WebApp.expand();
      telegram.WebApp.HapticFeedback.impactOccurred("medium");
    }
  }, [isExpanded]);

  // Функции для управления меню с тактильной отдачей
  const openMenu = useCallback(() => {
    setOpen(true);
    if (isMiniApp) {
      telegram.WebApp.HapticFeedback.impactOccurred("light");
      // Разворачиваем окно при открытии меню для лучшего отображения
      if (!isExpanded) {
        telegram.WebApp.expand();
      }
    }
  }, [isExpanded]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    if (isMiniApp) {
      telegram.WebApp.HapticFeedback.impactOccurred("light");
    }
  }, []);

  // 🔹 ИСПРАВЛЕНИЕ: Убрали неиспользуемый параметр 'to'
  const handleNavigation = useCallback(() => {
    if (isMiniApp) {
      telegram.WebApp.HapticFeedback.selectionChanged();
    }
    // Закрываем меню при переходе
    setOpen(false);
  }, []);

  // Настройка кнопки "Назад" при открытии меню
  useEffect(() => {
    if (isMiniApp) {
      if (open) {
        telegram.WebApp.BackButton.show();
        telegram.WebApp.BackButton.onClick(closeMenu);
      } else {
        telegram.WebApp.BackButton.hide();
        telegram.WebApp.BackButton.offClick(closeMenu);
      }

      return () => {
        telegram.WebApp.BackButton.hide();
        telegram.WebApp.BackButton.offClick(closeMenu);
      };
    }
  }, [open, closeMenu]);

  // Показываем уведомление о текущем разделе
  useEffect(() => {
    if (isMiniApp) {
      const currentPage = [...mainNav, ...moreButtons].find(
        (item) => item.to === location.pathname
      );
      if (currentPage) {
        console.log(`Текущий раздел: ${currentPage.label}`);
      }
    }
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col justify-end">
      {/* Панель навигации */}
      <div className="fixed bottom-0 left-0 w-full bg-white dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700 shadow-lg">
        <div className="flex justify-around items-center py-2">
          {filteredMainNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              // 🔹 ИСПРАВЛЕНИЕ: Убрали параметр из вызова функции
              onClick={handleNavigation}
              className="flex flex-col items-center text-gray-600 dark:text-gray-300 hover:text-blue-500 active:scale-95 transition-transform"
            >
              <div className="transform transition-transform hover:scale-110">
                {item.icon}
              </div>
              <span className="text-xs mt-1">{item.label}</span>
            </Link>
          ))}

          {/* Кнопка "Ещё" */}
          {filteredMoreButtons.length > 0 && (
            <button
              onClick={open ? closeMenu : openMenu}
              className="flex flex-col items-center text-gray-600 dark:text-gray-300 hover:text-blue-500 active:scale-95 transition-transform"
            >
              <div
                className={`transform transition-transform ${open ? "rotate-90" : "rotate-0"}`}
              >
                <MoreHorizontal />
              </div>
              <span className="text-xs mt-1">Ещё</span>
            </button>
          )}
        </div>
      </div>

      {/* Всплывающее окно */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 bg-black bg-opacity-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
            />

            <motion.div
              className="fixed bottom-0 left-0 w-full bg-white dark:bg-gray-800 rounded-t-2xl shadow-xl p-4 pb-10 max-h-[70vh] overflow-y-auto"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  Дополнительные разделы
                </h2>
                <button
                  onClick={closeMenu}
                  className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <X />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {filteredMoreButtons.map((btn) => (
                  <Link
                    key={btn.to}
                    to={btn.to}
                    // 🔹 ИСПРАВЛЕНИЕ: Убрали параметр из вызова функции
                    onClick={handleNavigation}
                    className="px-3 py-3 text-center bg-gray-100 dark:bg-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    {btn.icon && (
                      <span className="text-current">{btn.icon}</span>
                    )}
                    {btn.label}
                  </Link>
                ))}
              </div>

              {/* Кнопка разворачивания для Telegram */}
              {isMiniApp && !isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={expandApp}
                    className="w-full py-3 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <span>📱</span>
                    Развернуть на весь экран
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

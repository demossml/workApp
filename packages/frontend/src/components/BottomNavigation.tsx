import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
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
  Maximize2,
} from "lucide-react";
import { isTelegramMiniApp, telegram } from "../helpers/telegram";

interface BottomNavigationProps {
  employeeRole?: "CASHIER" | "ADMIN" | "SUPERADMIN";
}

/* -------------------- Основное меню -------------------- */

const mainNav = [
  {
    to: "/",
    label: "Главная",
    icon: Home,
    roles: ["CASHIER", "ADMIN", "SUPERADMIN"],
  },
  {
    to: "/evotor/settings",
    label: "Настройки",
    icon: Settings,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/sales-report",
    label: "Прод. отчёт",
    icon: BarChart3,
    roles: ["ADMIN", "SUPERADMIN", "CASHIER"],
  },
  {
    to: "/evotor/salary-user-report",
    label: "Зарплата",
    icon: HandCoins,
    roles: ["CASHIER", "ADMIN"],
  },
  {
    to: "/evotor/open-store",
    label: "Открытие магазина",
    icon: DoorOpen,
    roles: ["CASHIER", "SUPERADMIN"],
  },
];

/* -------------------- Доп. разделы -------------------- */

const moreButtons = [
  {
    to: "/evotor/salary-report",
    label: "Зарплата",
    icon: HandCoins,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/dead-stock",
    label: "Dead stock",
    icon: NotepadText,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/sales-for-the-period",
    label: "Финансовый отчёт",
    icon: FileBarChart,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/orders",
    label: "Заказ товара",
    icon: Package,
    roles: ["CASHIER", "ADMIN", "SUPERADMIN"],
  },
  {
    to: "/evotor/store-opening-report",
    label: "Открытие магазинов",
    icon: Store,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/stock-realization-report",
    label: "Товарные остатки",
    icon: Wallet,
    roles: ["ADMIN", "SUPERADMIN"],
  },
];

/* -------------------- Component -------------------- */

export function BottomNavigation({
  employeeRole = "CASHIER",
}: BottomNavigationProps) {
  const [open, setOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const isMiniApp = isTelegramMiniApp();

  const filteredMainNav = mainNav.filter((i) => i.roles.includes(employeeRole));
  const filteredMoreButtons = moreButtons.filter((i) =>
    i.roles.includes(employeeRole)
  );

  /* ---------- Telegram init ---------- */

  useEffect(() => {
    if (!isMiniApp) return;

    const theme = telegram.WebApp.colorScheme;
    telegram.WebApp.setBackgroundColor(
      theme === "dark" ? "#020617" : "#f8fafc"
    );

    telegram.WebApp.enableClosingConfirmation();

    const handleViewportChanged = () => {
      setIsExpanded(telegram.WebApp.isExpanded);
    };

    telegram.WebApp.onEvent("viewportChanged", handleViewportChanged);
    setIsExpanded(telegram.WebApp.isExpanded);

    return () => {
      telegram.WebApp.offEvent("viewportChanged", handleViewportChanged);
      telegram.WebApp.disableClosingConfirmation();
    };
  }, [isMiniApp]);

  /* ---------- Actions ---------- */

  const handleNavigation = useCallback(() => {
    setOpen(false);
    if (isMiniApp) {
      telegram.WebApp.HapticFeedback.selectionChanged();
    }
  }, [isMiniApp]);

  const openMenu = useCallback(() => {
    setOpen(true);
    if (isMiniApp) {
      telegram.WebApp.HapticFeedback.impactOccurred("light");
      telegram.WebApp.expand();
    }
  }, [isMiniApp]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    if (isMiniApp) {
      telegram.WebApp.HapticFeedback.impactOccurred("light");
    }
  }, [isMiniApp]);

  const expandApp = useCallback(() => {
    if (isMiniApp && !isExpanded) {
      telegram.WebApp.expand();
      telegram.WebApp.HapticFeedback.impactOccurred("medium");
    }
  }, [isMiniApp, isExpanded]);

  /* ---------- Back button ---------- */

  useEffect(() => {
    if (!isMiniApp) return;

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
  }, [open, closeMenu, isMiniApp]);

  /* -------------------- Render -------------------- */

  return (
    <>
      <nav className="fixed bottom-0 left-0 z-50 w-full border-t bg-background">
        <div className="flex justify-around py-2">
          {filteredMainNav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={handleNavigation}
              className="flex flex-col items-center text-muted-foreground hover:text-primary"
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs">{label}</span>
            </Link>
          ))}

          {filteredMoreButtons.length > 0 && (
            <button
              onClick={open ? closeMenu : openMenu}
              className="flex flex-col items-center text-muted-foreground hover:text-primary"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-xs">Ещё</span>
            </button>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40"
              onClick={closeMenu}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            <motion.div
              className="fixed bottom-0 left-0 z-50 w-full rounded-t-2xl bg-background p-4 pb-8"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Разделы</h3>
                <button onClick={closeMenu}>
                  <X />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {filteredMoreButtons.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={handleNavigation}
                    className="flex items-center gap-2 rounded-xl bg-muted px-3 py-3 text-sm font-medium"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </div>

              {isMiniApp && !isExpanded && (
                <button
                  onClick={expandApp}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-white"
                >
                  <Maximize2 className="h-4 w-4" />
                  Развернуть
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

import { useUser } from "../hooks/userProvider";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { X, Download, Cigarette } from "lucide-react";
import { isTelegramMiniApp, telegram } from "../helpers/telegram";

// Тип события beforeinstallprompt
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export const Topbar = () => {
  const user = useUser();
  const [isExpanded, setIsExpanded] = useState(false);

  const isMiniApp = isTelegramMiniApp();

  // Состояние установки PWA (только для браузера)
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Инициализация Telegram WebApp
  useEffect(() => {
    if (isMiniApp) {
      // Отслеживаем изменение размера окна
      const handleViewportChanged = () => {
        setIsExpanded(telegram.WebApp.isExpanded);
      };

      telegram.WebApp.onEvent("viewportChanged", handleViewportChanged);
      setIsExpanded(telegram.WebApp.isExpanded);

      return () => {
        telegram.WebApp.offEvent("viewportChanged", handleViewportChanged);
      };
    }
  }, []);

  // PWA логика - только для обычного браузера
  useEffect(() => {
    if (isMiniApp) return; // Не показываем PWA установку в Telegram

    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed === "true") return;

    const handler = (e: Event) => {
      e.preventDefault();
      const event = e as BeforeInstallPromptEvent;
      setDeferredPrompt(event);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;

    if (choiceResult.outcome === "accepted") {
      console.log("✅ Пользователь установил приложение");
    } else {
      console.log("❌ Пользователь отклонил установку");
      localStorage.setItem("pwa-install-dismissed", "true");
    }

    setIsVisible(false);
    setDeferredPrompt(null);
  };

  // Функция для разворачивания окна в Telegram
  const expandApp = () => {
    if (isMiniApp && !isExpanded) {
      telegram.WebApp.expand();
      telegram.WebApp.HapticFeedback.impactOccurred("medium");
    }
  };

  // Функция для открытия настроек Telegram
  // const openSettings = () => {
  //   if (isTelegramMiniApp && telegram.WebApp) {
  //     telegram.WebApp.SettingsButton.show();
  //     telegram.WebApp.SettingsButton.onClick(() => {
  //       telegram.WebApp.showPopup({
  //         title: "Настройки",
  //         message: "Настройки приложения",
  //         buttons: [{ type: "close" }],
  //       });
  //     });
  //   }
  // };

  // Получаем данные пользователя из Telegram, если доступны
  const getUserData = () => {
    if (isMiniApp && telegram.WebApp?.initDataUnsafe?.user) {
      const tgUser = telegram.WebApp.initDataUnsafe.user;
      return {
        firstName: tgUser.first_name || "Пользователь",
        photoUrl: tgUser.photo_url,
        username: tgUser.username,
      };
    }
    return {
      firstName: user.first_name || "Evo",
      photoUrl: user.photo_url,
      username: user.username,
    };
  };

  const userData = getUserData();

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed top-0 left-0 w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-md z-50"
    >
      <div className="flex items-center justify-between px-1 py-1">
        {/* Приветствие */}
        <div className="flex ml-4 gap-2 text-lg font-semibold text-gray-800 dark:text-gray-100">
          {userData.firstName}
          {/* {userData.username && (
            <span className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              @{userData.username}
            </span>
          )} */}
        </div>

        {/* Аватар и кнопки */}
        <div className="flex items-center gap-3">
          {/* Кнопка разворачивания для Telegram */}
          {isMiniApp && !isExpanded && (
            <motion.button
              onClick={expandApp}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1 bg-green-500 text-white text-xs font-medium px-2 py-1 rounded-lg shadow hover:bg-green-600 transition-all"
            >
              📱
            </motion.button>
          )}

          {/* Кнопка настроек для Telegram */}
          {/* {isTelegramMiniApp && (
            <motion.button
              onClick={openSettings}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1 bg-gray-500 text-white text-xs font-medium px-2 py-1 rounded-lg shadow hover:bg-gray-600 transition-all"
            >
              ⚙️
            </motion.button>
          )} */}

          {/* Кнопка установки PWA (только для браузера) */}
          <AnimatePresence>
            {isVisible && !isTelegramMiniApp && (
              <motion.button
                onClick={handleInstallClick}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-xl shadow hover:bg-blue-700 transition-all"
              >
                <Download className="w-4 h-4" />
                Установить
              </motion.button>
            )}
          </AnimatePresence>

          <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}>
            {userData.photoUrl ? (
              <img
                src={userData.photoUrl}
                alt="User"
                className="mr-4 w-9 h-9 rounded-full border border-gray-300 dark:border-gray-600 shadow-sm"
                onClick={() => {
                  if (isMiniApp) {
                    telegram.WebApp.HapticFeedback.impactOccurred("light");
                  }
                }}
              />
            ) : (
              <div className="flex items-center mr-4 gap-2">
                <Cigarette className="w-9 h-9 p-1.5 bg-blue-500 text-white rounded-full border border-gray-300 dark:border-gray-600 shadow-sm" />
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Всплывающее окно уведомления PWA (только для браузера) */}
      <AnimatePresence>
        {isVisible && !isTelegramMiniApp && (
          <motion.div
            className="absolute top-full left-0 w-full bg-blue-50 dark:bg-blue-900 text-blue-900 dark:text-blue-100 text-center py-2 border-t border-blue-200 dark:border-blue-800"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="flex justify-center items-center gap-2">
              <span>
                Добавь приложение на главный экран для быстрого доступа
              </span>
              <button
                onClick={() => setIsVisible(false)}
                className="text-blue-500 hover:text-blue-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Информация о Telegram WebApp (только для разработки) */}
      {isMiniApp && process.env.NODE_ENV === "development" && (
        <div className="absolute top-full left-0 w-full bg-yellow-50 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs text-center py-1">
          Telegram Mini App v{telegram.WebApp.version} •{" "}
          {isExpanded ? "Развернут" : "Свернут"}
        </div>
      )}
    </motion.header>
  );
};

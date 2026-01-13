import type React from "react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type ShopSelectorProps = {
  isLoadingShops: boolean;
  fetchGroups: (shopUuid: string) => Promise<void>;
  shopOptions: Record<string, string>;
  selectedShop: string | null;
  setSelectedShop: React.Dispatch<React.SetStateAction<string | null>>;
  onOpenChange?: (isOpen: boolean) => void;
};

export const ShopSelector: React.FC<ShopSelectorProps> = ({
  isLoadingShops,
  shopOptions,
  fetchGroups,
  selectedShop,
  setSelectedShop,
  onOpenChange,
}) => {
  const [showAllShops, setShowAllShops] = useState(false);
  const [tempSelectedShop, setTempSelectedShop] = useState<string | null>(null);

  // Уведомляем родительский компонент об изменении состояния модального окна
  useEffect(() => {
    onOpenChange?.(showAllShops);
  }, [showAllShops, onOpenChange]);

  // Сортируем магазины по названию
  const sortedShops = Object.entries(shopOptions).sort(([, a], [, b]) =>
    a.localeCompare(b)
  );

  // Устанавливаем первый магазин по умолчанию
  useEffect(() => {
    if (!selectedShop && sortedShops.length > 0) {
      const firstShopUuid = sortedShops[0][0];
      setSelectedShop(firstShopUuid);
      fetchGroups(firstShopUuid);
    }
  }, [sortedShops, selectedShop, fetchGroups, setSelectedShop]);

  // Переключатель видимости модалки
  const handleShowAllShops = () => setShowAllShops((prev) => !prev);

  // Выбор магазина во всплывающем окне
  const handleShopChange = (uuid: string) => setTempSelectedShop(uuid);

  // Подтверждение выбора магазина
  const handleConfirmShopSelection = () => {
    if (tempSelectedShop) {
      setSelectedShop(tempSelectedShop);
      fetchGroups(tempSelectedShop);
    }
    setShowAllShops(false);
  };

  // Отмена выбора и закрытие модального окна
  const handleCancelSelection = () => {
    setTempSelectedShop(null);
    setShowAllShops(false);
  };

  // Группировка магазинов по первой букве
  const groupedShops = sortedShops.reduce<Record<string, [string, string][]>>(
    (groups, [uuid, name]) => {
      const firstLetter = name.charAt(0).toUpperCase();
      if (!groups[firstLetter]) groups[firstLetter] = [];
      groups[firstLetter].push([uuid, name]);
      return groups;
    },
    {}
  );

  return (
    <div className="shop-selector">
      {/* Заголовок */}
      <div className="flex items-center justify-between w-full mb-4">
        <span className="text-gray-700 dark:text-gray-400 text-sm">
          Магазин
        </span>
        <button
          onClick={handleShowAllShops}
          className="text-blue-500 dark:text-blue-400 text-sm"
        >
          {showAllShops ? "Скрыть" : "Все →"}
        </button>
      </div>

      {/* Кнопки магазинов (первые 5) */}
      <div className="flex flex-wrap gap-2 mb-4">
        {isLoadingShops ? (
          <div className="flex items-center justify-center w-full h-16">
            <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
          </div>
        ) : (
          sortedShops.slice(0, 5).map(([uuid, name], idx) => (
            <motion.button
              key={uuid}
              className={`
                flex 
                items-center 
                justify-center 
                px-3 
                py-2 
                rounded-md 
                text-sm 
                font-medium
                border-2 
                ${
                  selectedShop === uuid
                    ? "border-blue-500 dark:border-blue-400"
                    : "border-gray-300 dark:border-gray-700"
                } 
                transition-colors 
                duration-300 
                ease-in-out
                min-w-max
                h-7
                whitespace-nowrap
                dark:text-gray-300
              `}
              onClick={() => {
                setSelectedShop(uuid);
                fetchGroups(uuid);
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
            >
              {name}
            </motion.button>
          ))
        )}
      </div>

      {/* Модальное окно выбора магазина */}
      <AnimatePresence>
        {showAllShops && (
          <motion.div
            className="fixed inset-0 bg-custom-gray dark:bg-gray-900 flex flex-col z-50"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {/* Заголовок */}
            <div className="p-2 border-b bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
              <p className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                Выберите магазин
              </p>
              <button
                onClick={handleCancelSelection}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            {/* Список магазинов */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingShops ? (
                <div className="flex items-center justify-center w-full h-full">
                  <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
                </div>
              ) : (
                Object.entries(groupedShops).map(([letter, shops]) => (
                  <motion.div
                    key={letter}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-4"
                  >
                    <h3 className="font-semibold text-gray-700 dark:text-gray-300 bg-custom-gray dark:bg-gray-700 mb-2">
                      {letter}
                    </h3>
                    <div className="space-y-2">
                      {shops.map(([uuid, name]) => (
                        <div
                          key={uuid}
                          className="flex items-center mt-2 cursor-pointer"
                          onClick={() => handleShopChange(uuid)}
                        >
                          <div
                            className={`w-4 h-4 rounded-full ${
                              tempSelectedShop === uuid
                                ? "border-4 border-blue-500 bg-white dark:bg-gray-900"
                                : "border-2 border-gray-300 dark:border-gray-600 bg-custom-gray dark:bg-gray-800"
                            }`}
                          />
                          <span className="text-lg ml-2 text-gray-900 dark:text-gray-100">
                            {name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Кнопки подтверждения и отмены */}
            <div className="sticky bottom-0 left-0 right-0 z-10 bg-gray-50 dark:bg-gray-800 border-t p-2 flex gap-2">
              <motion.button
                onClick={handleCancelSelection}
                className="flex-1 p-2 rounded-md text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                Отмена
              </motion.button>
              <motion.button
                onClick={handleConfirmShopSelection}
                className={`flex-1 p-2 rounded-md text-white ${
                  tempSelectedShop
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
                }`}
                disabled={!tempSelectedShop}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                Подтвердить
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

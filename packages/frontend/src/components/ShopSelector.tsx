import React, { useState, useEffect } from "react";

type ShopSelectorProps = {
  isLoadingShops: boolean;
  fetchGroups: (shopUuid: string) => Promise<void>;
  shopOptions: Record<string, string>;
  selectedShop: string | null;
  setSelectedShop: React.Dispatch<React.SetStateAction<string | null>>;
};

export const ShopSelector: React.FC<ShopSelectorProps> = ({
  isLoadingShops,
  shopOptions,
  fetchGroups,
  selectedShop,
  setSelectedShop,
}) => {
  const [showAllShops, setShowAllShops] = useState(false);
  const [tempSelectedShop, setTempSelectedShop] = useState<string | null>(null);

  const sortedShops = Object.entries(shopOptions).sort(([, nameA], [, nameB]) =>
    nameA.localeCompare(nameB)
  );

  useEffect(() => {
    if (!selectedShop && sortedShops.length > 0) {
      const firstShopUuid = sortedShops[0][0];
      setSelectedShop(firstShopUuid);
      fetchGroups(firstShopUuid);
    }
  }, [sortedShops, selectedShop, fetchGroups, setSelectedShop]);

  const handleShowAllShops = () => {
    setShowAllShops((prev) => !prev);
  };

  const handleShopChange = (uuid: string) => {
    setTempSelectedShop(uuid);
  };

  const handleConfirmShopSelection = () => {
    if (tempSelectedShop) {
      setSelectedShop(tempSelectedShop);
      fetchGroups(tempSelectedShop);
    }
    setShowAllShops(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between w-full mb-4">
        <span className="text-gray-700 dark:text-gray-400 text-sm">
          Магазин
        </span>
        <button
          onClick={handleShowAllShops}
          className="text-blue-500 dark:text-blue-400 text-sm ml-auto"
        >
          {showAllShops ? "Скрыть" : "Все →"}
        </button>
      </div>

      <div>
        {isLoadingShops ? (
          <div className="flex items-center justify-center w-full h-16">
            <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 dark:border-blue-400 border-solid rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="flex gap-2 mb-4">
            {sortedShops.slice(0, 5).map(([uuid, name]) => (
              <button
                key={uuid}
                className={`
                  flex 
                  justify-center 
                  items-center 
                  px-4 
                  py-2 
                  rounded-md 
                  text-center 
                  text-gray-700
                 dark:text-gray-400
                  border-2 
                  ${
                    selectedShop === uuid
                      ? "border-blue-500 dark:border-blue-400"
                      : "border-gray-300 dark:border-gray-700"
                  } 
                  transition-colors duration-200 ease-in-out
                  w-auto
                  h-7 
                  whitespace-nowrap
                `}
                onClick={() => {
                  setSelectedShop(uuid);
                  fetchGroups(uuid);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {showAllShops && (
        <div className="fixed inset-0 bg-custom-gray dark:bg-gray-900 flex flex-col">
          {/* Заголовок */}
          <div className="p-4 border-b bg-gray-50 dark:bg-gray-800">
            <p className="font-semibold text-lg text-gray-900 dark:text-gray-100">
              Выберите магазин
            </p>
          </div>

          {/* Список магазинов */}
          <div className="flex-1 overflow-y-auto p-4">
            {Object.entries(
              sortedShops.reduce<Record<string, [string, string][]>>(
                (groups, [uuid, name]) => {
                  const firstLetter = name.charAt(0).toUpperCase();
                  if (!groups[firstLetter]) {
                    groups[firstLetter] = [];
                  }
                  groups[firstLetter].push([uuid, name]);
                  return groups;
                },
                {}
              )
            ).map(([letter, shops]) => (
              <div key={letter} className="mb-4">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 bg-custom-gray dark:bg-gray-700 mb-2">
                  {letter}
                </h3>
                <div className="space-y-2">
                  {shops.map(([uuid, name]) => (
                    <button
                      key={uuid}
                      className="w-full text-left p-2 rounded-md flex items-center space-x-3"
                      onClick={() => handleShopChange(uuid)}
                    >
                      <div
                        className={`w-4 h-4 rounded-full ${
                          tempSelectedShop === uuid
                            ? "border-4 border-blue-500 bg-white dark:bg-gray-900"
                            : "border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                        }`}
                      />
                      <span className="text-gray-700 dark:text-gray-100">
                        {name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Кнопка "Подтвердить выбор" */}
          <div className="p-4 border-t bg-gray-50 dark:bg-gray-800">
            <button
              onClick={handleConfirmShopSelection}
              className={`w-full p-2 rounded-md text-white ${
                tempSelectedShop
                  ? "bg-blue-500 hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-500"
                  : "bg-gray-300 dark:bg-gray-700"
              }`}
              disabled={!tempSelectedShop}
            >
              Выбрать
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

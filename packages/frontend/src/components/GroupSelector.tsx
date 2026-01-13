import type React from "react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Тип для элемента группы
interface GroupOption {
  uuid: string;
  name: string;
}

// Тип для компонента
interface GroupSelectorProps {
  groupOptions: GroupOption[];
  selectedGroups: string[];
  setSelectedGroups: React.Dispatch<React.SetStateAction<string[]>>;
  isLoadingGroups: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

// Тип для групп, где ключом является строка (первая буква группы), а значением — массив групп
interface GroupDictionary {
  [key: string]: GroupOption[];
}

export const GroupSelector: React.FC<GroupSelectorProps> = ({
  groupOptions,
  selectedGroups,
  setSelectedGroups,
  isLoadingGroups,
  onOpenChange,
}) => {
  const [showGroups, setShowGroups] = useState(false);

  // Уведомляем родительский компонент об изменении состояния модального окна
  useEffect(() => {
    onOpenChange?.(showGroups);
  }, [showGroups, onOpenChange]);

  // Обработчик для переключения видимости групп
  const handleShowGroups = () => {
    setShowGroups((prevState) => !prevState);
  };

  // Обработчик для добавления или удаления группы из выбранных
  const handleGroupToggle = (groupUuid: string) => {
    setSelectedGroups((prevSelectedGroups) =>
      prevSelectedGroups.includes(groupUuid)
        ? prevSelectedGroups.filter((uuid) => uuid !== groupUuid)
        : [...prevSelectedGroups, groupUuid]
    );
  };

  // Закрытие модального окна
  const handleCloseModal = () => {
    setShowGroups(false);
  };

  // Группируем группы по первой букве
  const groupedByLetter = groupOptions.reduce<GroupDictionary>(
    (groups, group) => {
      const firstLetter = group.name.charAt(0).toUpperCase();
      if (!groups[firstLetter]) {
        groups[firstLetter] = [];
      }
      groups[firstLetter].push(group);
      return groups;
    },
    {}
  );

  return (
    <div className="group-selector">
      {/* Заголовок с кнопкой для отображения/скрытия списка групп */}
      <div className="flex items-center justify-between w-full mb-4">
        <span className="text-gray-700 dark:text-gray-400 text-sm">Группа</span>
        <button
          onClick={handleShowGroups}
          className="text-blue-500 dark:text-blue-400 text-sm"
        >
          {showGroups ? "Скрыть" : "Все →"}
        </button>
      </div>

      {/* Плитки групп (только для первых 7) */}
      <div className="flex flex-wrap gap-2 mb-4">
        {isLoadingGroups ? (
          <div className="flex items-center justify-center w-full h-16">
            <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
          </div>
        ) : (
          groupOptions.slice(0, 7).map((group, idx) => (
            <motion.button
              key={group.uuid}
              className={`
                flex 
                items-center 
                justify-center 
                px-3 
                py-2 
                rounded-md 
                text-cent
                dark:text-gray-400
                border-2 
                ${
                  selectedGroups.includes(group.uuid)
                    ? "border-blue-500 dark:border-blue-400"
                    : "border-gray-300 dark:border-gray-700"
                } 
                transition-colors 
                duration-300 
                ease-in-out
                min-w-max
                h-7
                whitespace-nowrap
              `}
              onClick={() => handleGroupToggle(group.uuid)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
            >
              <span>{group.name}</span>
            </motion.button>
          ))
        )}
      </div>

      {/* Список групп с анимацией */}
      <AnimatePresence>
        {showGroups && (
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
                Выберите группу
              </p>
              <button
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            {/* Список групп */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingGroups ? (
                <div className="flex items-center justify-center w-full h-full">
                  <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
                </div>
              ) : (
                Object.entries(groupedByLetter).map(([letter, groups]) => (
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
                      {groups.map((group) => (
                        <div
                          key={group.uuid}
                          className="flex items-center mt-2 cursor-pointer"
                          onClick={() => handleGroupToggle(group.uuid)}
                        >
                          <div
                            className={`w-4 h-4 rounded-full ${
                              selectedGroups.includes(group.uuid)
                                ? "border-4 border-blue-500 bg-white dark:bg-gray-900"
                                : "border-2 border-gray-300 dark:border-gray-600 bg-custom-gray dark:bg-gray-800"
                            }`}
                          />
                          <span className="text-lg ml-2 text-gray-900 dark:text-gray-100">
                            {group.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Кнопки внизу */}
            <div className="sticky bottom-0 left-0 right-0 z-10 bg-gray-50 dark:bg-gray-800 border-t p-2">
              <div className="flex items-center cursor-pointer mb-2 p-2">
                <div
                  className={`w-4 h-4 rounded-full mr-2 ${
                    selectedGroups.length === groupOptions.length
                      ? "border-4 border-blue-500 bg-white dark:bg-gray-900"
                      : "border-2 border-gray-300 dark:border-gray-600 bg-custom-gray dark:bg-gray-800"
                  }`}
                  onClick={() => {
                    const allGroupIds = groupOptions.map((group) => group.uuid);
                    if (selectedGroups.length === groupOptions.length) {
                      setSelectedGroups([]);
                    } else {
                      setSelectedGroups(allGroupIds);
                    }
                  }}
                />
                <span className="text-lg text-gray-900 dark:text-gray-100">
                  Выбрать все группы
                </span>
              </div>
              <div className="flex gap-2">
                <motion.button
                  onClick={handleCloseModal}
                  className="flex-1 p-2 rounded-md text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  Отмена
                </motion.button>
                <motion.button
                  onClick={handleCloseModal}
                  className={`flex-1 p-2 rounded-md text-white ${
                    selectedGroups.length > 0
                      ? "bg-blue-500 hover:bg-blue-600"
                      : "bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
                  }`}
                  disabled={selectedGroups.length === 0}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  Подтвердить
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

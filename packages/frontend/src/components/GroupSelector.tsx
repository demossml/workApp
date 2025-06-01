import type React from "react";
import { useState } from "react";

// Тип для элемента группы
interface GroupOption {
  uuid: string;
  name: string;
}

// Тип для компонента
interface GroupSelectorProps {
  groupOptions: GroupOption[]; // Массив групп
  selectedGroups: string[]; // Массив выбранных групп (по uuid)
  setSelectedGroups: React.Dispatch<React.SetStateAction<string[]>>; // Функция для обновления выбранных групп
  isLoadingGroups: boolean; // Флаг загрузки
}

// Тип для групп, где ключом является строка (первая буква группы), а значением — массив групп
interface GroupDictionary {
  [key: string]: GroupOption[]; // Строковый ключ и массив групп
}

// Компонент выбора группы
export const GroupSelector: React.FC<GroupSelectorProps> = ({
  groupOptions,
  selectedGroups,
  setSelectedGroups,
  isLoadingGroups,
}) => {
  const [showGroups, setShowGroups] = useState(false);

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
          groupOptions.slice(0, 7).map((group) => (
            <button
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
            >
              <span>{group.name}</span>
            </button>
          ))
        )}
      </div>

      {/* Список групп */}
      {showGroups && (
        <div className="fixed inset-0 bg-custom-gray dark:bg-gray-900 flex flex-col">
          {/* Заголовок */}
          <div className="p-4 border-b bg-gray-50 dark:bg-gray-800">
            <p className="font-semibold text-lg text-gray-900 dark:text-gray-100">
              Выберите группу
            </p>
          </div>

          {/* Список групп */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingGroups ? (
              <div className="flex items-center justify-center w-full h-full">
                <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
              </div>
            ) : (
              Object.entries(groupedByLetter).map(([letter, groups]) => (
                <div key={letter} className="mb-4">
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
                </div>
              ))
            )}
          </div>

          {/* Кнопка "Выбрать все" */}
          <div className="p-4 border-t bg-gray-50 dark:bg-gray-800">
            <div
              className="flex items-center cursor-pointer"
              onClick={() => {
                const allGroupIds = groupOptions.map((group) => group.uuid);
                if (selectedGroups.length === groupOptions.length) {
                  setSelectedGroups([]); // Снимаем все выборы
                } else {
                  setSelectedGroups(allGroupIds); // Выбираем все группы
                }
              }}
            >
              <input
                type="checkbox"
                className="mr-2"
                checked={selectedGroups.length === groupOptions.length}
                readOnly
              />
              <label className="text-lg text-gray-900 dark:text-gray-100">
                Выбрать все группы
              </label>
            </div>
          </div>

          {/* Кнопка "Подтвердить выбор" */}
          <div className="p-4 border-t bg-gray-50 dark:bg-gray-800">
            <button
              onClick={() => setShowGroups(false)} // Закрываем список
              className={`w-full p-2 rounded-md text-white ${
                selectedGroups.length > 0
                  ? "bg-blue-500 hover:bg-blue-600"
                  : "bg-gray-300 dark:bg-gray-700"
              }`}
              disabled={selectedGroups.length === 0} // Кнопка неактивна, если нет выбранных групп
            >
              Подтвердить выбор
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

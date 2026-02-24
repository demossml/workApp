import { useEffect, useState } from "react";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";

// Определяем тип GroupOption для TypeScript
interface GroupOption {
  uuid: string;
  name: string;
}

const Settings = () => {
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [salary, setSalary] = useState("");
  const [bonus, setBonus] = useState("");
  const [accessoryGroups, setGroupOptions] = useState<GroupOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [responseData, setResponseData] = useState<{
    groupsName: string[];
    salary: string;
    bonus: string;
  } | null>(null);
  const [showGroups, setShowGroups] = useState(false);

  useTelegramBackButton();

  // Загружаем доступные группы аксессуаров при монтировании компонента
  useEffect(() => {
    const fetchGroupOptions = async () => {
      try {
        const response = await client.api.evotor.groups.$get();
        const data = await response.json();
        if (!data || !data.groups) {
          throw new Error("Ошибка загрузки групп: пустой ответ");
        }
        setGroupOptions(data.groups);
      } catch (err) {
        console.error(err);
        setError("Не удалось загрузить данные по группам");
      }
    };

    fetchGroupOptions();
  }, []);

  // Обрабатываем изменения выбранных групп
  const handleGroupChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = event.target;

    if (value) {
      setSelectedGroups((prevGroups) => {
        const updatedGroups = checked
          ? [...prevGroups, value]
          : prevGroups.filter((group) => group !== value);
        console.log(`Обновленный список групп: ${updatedGroups}`);
        return updatedGroups;
      });
    }
  };

  // Обрабатываем отправку формы
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const data = {
      groups: selectedGroups,
      salary,
      bonus,
    };

    try {
      const response = await client.api.evotor.submitGroups.$post({
        json: data,
      });
      // Альтернативный вариант с fetch, если по какой-то причине не работает клиентский API
      // const response = await

      if (response.ok) {
        const result = await response.json();
        setResponseData({
          groupsName: result.groupsName,
          salary: String(result.salary),
          bonus: String(result.bonus),
        });

        // Сброс данных формы после успешной отправки
        setSelectedGroups([]);
        setSalary("");
        setBonus("");
      } else {
        console.error("Ошибка при отправке данных:", response.statusText);
        setError("Не удалось отправить данные");
      }
    } catch (error) {
      console.error("Ошибка при отправке формы:", error);
      setError("Не удалось отправить данные");
    }
  };

  // Обрабатываем переключение видимости списка групп
  const toggleGroups = () => {
    setShowGroups(!showGroups);
  };

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">
        Настройки оплаты и выбора групп аксессуаров
      </h2>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      {/* Если responseData присутствует, показываем только результаты, иначе показываем форму */}
      {responseData ? (
        <div className="mt-4 p-4 bg-green-100 rounded">
          <h3 className="text-lg font-semibold">Результаты:</h3>

          {/* Display each group on a new line */}
          <p>
            <strong>Группы:</strong>
          </p>
          <ul className="list-disc pl-5">
            {responseData.groupsName.map((groupName, index) => (
              <li key={index}>{groupName}</li>
            ))}
          </ul>

          <p>
            <strong>Оклад:</strong> {responseData.salary} ₽
          </p>
          <p>
            <strong>Премия:</strong> {responseData.bonus} ₽
          </p>

          {/* Navigation button */}
          <div className="text-left mt-4">
            <a
              href="/"
              className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-700 active:bg-blue-800 transition duration-300"
            >
              На главную
            </a>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Поле для ввода оклада */}
          <div>
            <label className="block text-lg font-semibold" htmlFor="salary">
              Оклад:
            </label>
            <input
              type="number"
              id="salary"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              className="border border-gray-300 p-2 rounded w-full"
              required
            />
          </div>

          {/* Поле для ввода премии */}
          <div>
            <label className="block text-lg font-semibold" htmlFor="bonus">
              Премия за выполнение плана:
            </label>
            <input
              type="number"
              id="bonus"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              className="border border-gray-300 p-2 rounded w-full"
              required
            />
          </div>

          {/* Кнопка для показа/скрытия групп */}
          <button
            type="button"
            onClick={toggleGroups}
            className="mt-2 bg-gray-300 text-black py-2 px-4 rounded hover:bg-gray-400 transition duration-300"
          >
            Выбор групп
          </button>

          {/* Список групп с переключателем видимости */}
          {showGroups && (
            <fieldset className="mt-4">
              <legend className="text-lg font-semibold">
                Выберите группы аксессуаров:
              </legend>
              {accessoryGroups.map((group) => (
                <div key={group.uuid} className="flex items-center">
                  <input
                    type="checkbox"
                    id={group.uuid}
                    value={group.uuid}
                    onChange={handleGroupChange}
                    checked={selectedGroups.includes(group.uuid)}
                    className="mr-2"
                  />
                  <label htmlFor={group.uuid}>{group.name}</label>
                </div>
              ))}
            </fieldset>
          )}

          {/* Кнопка отправки формы */}
          <button
            type="submit"
            className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-700 active:bg-blue-800 transition duration-300"
          >
            Отправить
          </button>
        </form>
      )}
    </div>
  );
};

export default Settings;

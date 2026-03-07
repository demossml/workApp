import { useEffect, useState } from "react";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";
import {
  DEFAULT_ACCESSORY_SHARE_TARGET_PCT,
  getAccessoryShareTargetPct,
  setAccessoryShareTargetPct,
} from "../../config/tempoSettings";

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
    savedAt: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [accessoryShareTargetInput, setAccessoryShareTargetInput] = useState(
    String(DEFAULT_ACCESSORY_SHARE_TARGET_PCT)
  );
  const [tempoSettingsMessage, setTempoSettingsMessage] = useState<string | null>(
    null
  );

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

  useEffect(() => {
    setAccessoryShareTargetInput(String(getAccessoryShareTargetPct()));
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

    const salaryNumber = Number(salary);
    const bonusNumber = Number(bonus);
    if (!Number.isFinite(salaryNumber) || salaryNumber < 0) {
      setError("Оклад должен быть неотрицательным числом");
      return;
    }
    if (!Number.isFinite(bonusNumber) || bonusNumber < 0) {
      setError("Премия должна быть неотрицательным числом");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const data = {
      groups: selectedGroups,
      salary: salaryNumber,
      bonus: bonusNumber,
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
          savedAt: new Date().toLocaleString("ru-RU"),
        });
      } else {
        console.error("Ошибка при отправке данных:", response.statusText);
        setError("Не удалось отправить данные");
      }
    } catch (error) {
      console.error("Ошибка при отправке формы:", error);
      setError("Не удалось отправить данные");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Обрабатываем переключение видимости списка групп
  const toggleGroups = () => {
    setShowGroups(!showGroups);
  };

  const saveTempoSettings = () => {
    const parsed = Number(accessoryShareTargetInput);
    if (!Number.isFinite(parsed)) {
      setTempoSettingsMessage("Введите число от 1 до 100");
      return;
    }
    const next = setAccessoryShareTargetPct(parsed);
    setAccessoryShareTargetInput(String(next));
    setTempoSettingsMessage(`Порог сохранен: ${next}%`);
  };

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">
        Настройки оплаты и выбора групп аксессуаров
      </h2>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-lg font-semibold mb-2">
          Настройка темпа продаж: доля аксессуаров
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          Целевой порог доли высокомаржинальных аксессуаров в общей массе продаж.
          По умолчанию: {DEFAULT_ACCESSORY_SHARE_TARGET_PCT}%.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="w-full sm:w-64">
            <label
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              htmlFor="accessoryShareTarget"
            >
              Целевой порог, %
            </label>
            <input
              id="accessoryShareTarget"
              type="number"
              min={1}
              max={100}
              value={accessoryShareTargetInput}
              onChange={(e) => setAccessoryShareTargetInput(e.target.value)}
              className="border border-gray-300 p-2 rounded w-full dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <button
            type="button"
            onClick={saveTempoSettings}
            className="bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 transition duration-300"
          >
            Сохранить порог
          </button>
        </div>
        {tempoSettingsMessage && (
          <div className="mt-2 text-sm text-indigo-700 dark:text-indigo-300">
            {tempoSettingsMessage}
          </div>
        )}
      </div>

      {responseData && (
        <div className="mt-4 p-4 bg-green-100 rounded dark:bg-green-900/30">
          <h3 className="text-lg font-semibold mb-2">Настройки сохранены</h3>
          <p className="text-sm mb-2">Время: {responseData.savedAt}</p>
          <p>
            <strong>Группы:</strong> {responseData.groupsName.join(", ") || "—"}
          </p>
          <p>
            <strong>Оклад:</strong> {responseData.salary} ₽
          </p>
          <p>
            <strong>Премия:</strong> {responseData.bonus} ₽
          </p>
        </div>
      )}

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
            disabled={isSubmitting}
            className={`text-white py-2 px-4 rounded transition duration-300 ${
              isSubmitting
                ? "bg-blue-300 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-700 active:bg-blue-800"
            }`}
          >
            {isSubmitting ? "Сохранение..." : "Сохранить"}
          </button>
      </form>
    </div>
  );
};

export default Settings;

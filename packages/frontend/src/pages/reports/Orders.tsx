import { useEffect, useState } from "react";
import { PeriodSelector } from "../../components/Period";
import { ShopSelector } from "../../components/ShopSelector"; // Импортируем компонент "Назад"
import { useMe } from "../../hooks/useApi";

import React from "react";
import { DynamicTable } from "../../components/DynamicTable";
import { ErrorDisplay } from "../../components/ErrorDisplay";
import { GroupSelector } from "../../components/GroupSelector";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";

// Интерфейсы для типов данных
interface GroupOption {
  name: string;
  uuid: string;
}

interface ProductData {
  orderQuantity: number;
  smaQuantity: number;
  quantity: number;
  sum: number;
}

interface ReportData {
  order: Record<string, ProductData>;
  startDate: string;
  endDate: string;
  shopName: string;
}

export default function Order() {
  const [shopOptions, setShopOptions] = useState<Record<string, string>>({});
  const [selectedShop, setSelectedShop] = useState<string | null>(null); // Добавляем состояние для выбранного магазина

  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  // Состояния для отображения всех магазинов
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [daysFromStart, setDaysFromStart] = useState<Date[]>([]);

  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [isLoadingShops, setIsLoadingShops] = useState<boolean>(false);

  useTelegramBackButton({
    show: true,
  });

  const toggleInstructions = () => {
    setShowInstructions(!showInstructions);
  };

  const { data } = useMe(); // Получаем данные из хука useAuthCheck
  const userId = data?.id.toString() || " ";

  useEffect(() => {
    const fetchSalesData = async () => {
      setIsLoadingShops(true); // Начало загрузки групп

      try {
        const response = await fetch("/api/evotor/shops", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId }),
        });

        if (!response.ok) {
          throw new Error(`Ошибка: ${response.status}`);
        }

        const data = await response.json();
        setShopOptions(data.shopOptions);

        // Если магазины есть, устанавливаем первый магазин как выбранный
        if (Object.keys(data.shopOptions).length > 0) {
          const defaultShopUuid = Object.keys(data.shopOptions)[0];
          setSelectedShop(defaultShopUuid); // Устанавливаем первый магазин как выбранный
          await fetchGroups(defaultShopUuid); // Получаем группы для первого магазина
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoadingShops(false); // Завершение загрузки групп
      }
    };

    if (userId) {
      fetchSalesData();
    }
  }, [userId]);

  const fetchGroups = async (shopUuid: string) => {
    setIsLoadingGroups(true); // Начало загрузки групп
    try {
      const dataGroups = {
        shopUuid: shopUuid,
      };
      const response = await fetch("/api/evotor/groups-by-shop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataGroups),
      });

      if (!response.ok) {
        throw new Error(`Ошибка загрузки групп: ${response.status}`);
      }

      const data: { groups: GroupOption[] } = await response.json();
      setGroupOptions(data.groups || []);
      setSelectedGroups([]);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить группы для выбранного магазина");
    } finally {
      setIsLoadingGroups(false); // Завершение загрузки групп
    }
  };

  // const toggleGroups = () => {
  //   setShowGroups((prev) => !prev);
  // };

  // Функция для вычисления начала дня
  const getStartOfToday = (date: Date) => {
    const today = new Date(date);
    today.setHours(0, 0, 0, 0);
    return today;
  };

  // Функция для генерации массива из 7 дней начиная с указанной даты
  const getDaysFrom = (start: Date) => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return day;
    });
  };

  // Функция для выбора начальной даты
  const selectDate = (date: Date) => {
    if (!startDate || (startDate && endDate)) {
      // Устанавливаем новую дату начала
      setStartDate(date);
      setEndDate(null);

      // Обновляем список отображаемых дней
      const updatedDays = getDaysFrom(date);
      setDaysFromStart(updatedDays);
    } else if (startDate && !endDate) {
      // Устанавливаем дату конца
      setEndDate(date);
    }
  };

  // Сброс выбора
  const resetSelection = () => {
    setStartDate(null);
    setEndDate(null);
    setDaysFromStart(getDaysFrom(getStartOfToday(new Date())));
  };

  // Форматирование даты
  const formatDate = (date: Date) =>
    `${date.getDate().toString().padStart(2, "0")} ${date.toLocaleString(
      "default",
      {
        month: "short",
      }
    )}`;

  // При первой загрузке задаем дни начиная с сегодняшнего дня
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  React.useEffect(() => {
    const today = getStartOfToday(new Date());
    setDaysFromStart(getDaysFrom(today));
  }, []);

  const formatPeriod = (
    shopName: string,
    startDate: string,
    endDate: string
  ): string => {
    const formattedStartDate = formatDate(new Date(startDate));
    const formattedEndDate = formatDate(new Date(endDate));
    return `${shopName}, ${formattedStartDate} → ${formattedEndDate}`;
  };
  // Функция для отправки данных на сервер
  const submitForecast = async () => {
    // Проверяем, что все необходимые данные выбраны
    if (
      !startDate ||
      !endDate ||
      !selectedShop ||
      !selectedPeriod ||
      selectedGroups.length === 0
    ) {
      alert("Пожалуйста, выберите все параметры для формирования прогноза.");
      return;
    }

    // Форматируем даты в YYYY-MM-DD
    const formatDateToYYYYMMDD = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const data = {
      startDate: formatDateToYYYYMMDD(startDate),
      endDate: formatDateToYYYYMMDD(endDate),
      shopUuid: selectedShop,
      groups: selectedGroups,
      period: selectedPeriod,
      userId: userId,
    };
    setIsLoadingReport(true);

    try {
      const response = await fetch("/api/evotor/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }

      const report: ReportData = await response.json();
      setReportData(report);
    } catch (err) {
      console.error(err);
      setError("Не удалось получить отчёт");
    } finally {
      setIsLoadingReport(false); // Завершаем загрузку
    }
  };

  if (isLoadingReport) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  if (!Object.keys(shopOptions).length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-custom-gray p-4">
        <div className="flex items-center mb-4">
          {/* Loading spinner */}
          <div className="w-24 h-24 border-8 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
          <h1 className="ml-4 text-xl sm:text-2xl text-gray-900 font-bold" />
        </div>
      </div>
    );
  }

  if (reportData) {
    // Вычисляем общую сумму заказа
    const totalSum = Object.values(reportData.order).reduce(
      (sum, product) => sum + product.sum,
      0
    );

    // Преобразуем данные в нужный формат для DynamicTable
    const tableData = Object.keys(reportData.order).map((productKey) => {
      const product = reportData.order[productKey];
      return {
        productName: productKey,
        smaQuantity: product.smaQuantity,
        quantity: product.quantity,
        orderQuantity: product.orderQuantity,
        sum: product.sum,
      };
    });

    return (
      <div className="p-4 flex flex-col items-start bg-custom-gray dark:bg-gray-900 gap-4 max-w-md mx-auto">
        {/* Заголовок с информацией */}
        <div className="text-sm text-gray-700 dark:text-gray-400">
          {/* Формат: Имя магазина, 31 янв → 4 фев */}
          <p className="font-semibold">
            {formatPeriod(
              reportData.shopName,
              reportData.startDate,
              reportData.endDate
            )}
          </p>
          <p className="font-semibold text-xl">
            Общая сумма заказа:{" "}
            <span className="font-semibold text-xl text-gray-900 dark:text-gray-400">
              {totalSum.toLocaleString("ru-RU")} ₽
            </span>
          </p>
        </div>

        {/* Вставка компонента DynamicTable */}
        <DynamicTable data={tableData} />
      </div>
    );
  }

  return (
    <div className="p-4 flex  w-screen h-screen flex-col items-start gap-4 max-w-md  dark:bg-gray-900 mx-auto">
      <div className="flex items-center justify-between w-full">
        {/* Кнопка "Назад" */}

        {/* Кнопка "Инструкция" */}
        <button
          type="button"
          onClick={toggleInstructions}
          className="text-blue-500 dark:text-blue-400 text-sm"
        >
          {showInstructions ? "Свернуть" : "Инструкция"}
        </button>
      </div>

      <h1 className="text-xl dark:text-gray-400 font-bold">Прогноз закупки</h1>

      {/* Блок для отображения выбранного периода */}
      <div className="flex items-center justify-between w-full">
        <span className="font-semibold dark:text-gray-400 text-lg">
          {startDate && endDate
            ? `${formatDate(startDate)} → ${formatDate(endDate)}`
            : "Выберите период"}
        </span>
        {/* Кнопка для сброса выбора */}
        {(startDate || endDate) && (
          <button
            onClick={resetSelection}
            className="text-sm text-blue-500 dark:text-blue-400"
          >
            Сбросить выбор даты
          </button>
        )}
      </div>

      {/* Календарь с кнопками для выбора даты */}
      <div className="flex items-center w-full justify-between">
        <div className="grid grid-cols-7 gap-2 flex-1">
          {daysFromStart.map((day) => (
            <button
              key={day.toString()}
              onClick={() => selectDate(day)} // Выбор даты
              className={`p-2 rounded-md border ${
                startDate && endDate && day >= startDate && day <= endDate
                  ? "bg-blue-500 text-white dark:bg-blue-400 dark:text-white" // Подсветка для выбранного периода
                  : startDate && day.getTime() === startDate.getTime()
                    ? "bg-blue-300 text-white dark:bg-blue-300 dark:text-white" // Подсветка для начала периода
                    : "bg-gray-100 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              <span className="text-sm">{day.getDate()}</span>
              <span className="block text-xs">
                {day.toLocaleString("default", { weekday: "short" })}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="w-full">
        {/* Передаем функцию обновления периода */}
        <PeriodSelector onPeriodChange={setSelectedPeriod} />
        {/* Отображение данных */}
      </div>

      <div className="w-full">
        {/* Передаем userId как строку, даже если он пустой */}
        <ShopSelector
          shopOptions={shopOptions}
          isLoadingShops={isLoadingShops}
          fetchGroups={fetchGroups}
          selectedShop={selectedShop} // Передаем текущее состояние выбранного магазина
          setSelectedShop={setSelectedShop} // Передаем функцию для обновления выбранного магазина
        />
      </div>

      {/* Выбор группы */}
      <div className="w-full">
        <GroupSelector
          groupOptions={groupOptions} // Передаем данные групп
          selectedGroups={selectedGroups} // Передаем выбранные группы
          setSelectedGroups={setSelectedGroups} // Функция для обновления выбранных групп
          isLoadingGroups={isLoadingGroups} // Флаг загрузки
        />
      </div>

      {/* Кнопка "Сформировать прогноз" */}
      <button
        onClick={submitForecast} // Вызываем функцию отправки данных
        className={`w-full p-2 rounded-md text-white ${
          startDate &&
          endDate &&
          selectedShop &&
          selectedGroups.length &&
          selectedPeriod !== null
            ? "bg-blue-500 hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-500"
            : "bg-gray-300 dark:bg-gray-700"
        }`}
        disabled={
          !(
            startDate &&
            endDate &&
            selectedShop &&
            selectedGroups.length &&
            selectedPeriod !== null
          ) // Блокируем кнопку, если не выбраны все параметры
        }
      >
        Сгенерировать прогноз
      </button>

      {showInstructions && (
        <div className="fixed top-0 left-0 w-full h-full bg-gray-100 bg-opacity-90 p-4 mt-2 rounded shadow z-50 dark:bg-gray-900 dark:bg-opacity-80">
          <div className="max-w-screen-md mx-auto overflow-y-auto h-full flex flex-col">
            <div className="flex-1">
              <h2 className="text-lg font-semibold dark:text-gray-100">
                Инструкция: Как создать прогноз закупки
              </h2>
              <p className="mt-2 dark:text-gray-400">
                Чтобы получить точный прогноз для ваших закупок, выполните
                следующие шаги:
              </p>
              <ol className="mt-2 list-decimal pl-6 dark:text-gray-400">
                <li>
                  <strong>Выберите даты:</strong> Укажите начальную и конечную
                  дату периода, за который вы хотите получить прогноз. Например,
                  если вам нужен отчет за неделю, выберите соответствующие дни.
                </li>
                <li>
                  <strong>Выберите магазин:</strong> Укажите конкретный магазин,
                  для которого нужен прогноз.
                </li>
                <li>
                  <strong>Укажите группы товаров:</strong> Выберите, для каких
                  категорий товаров (например, “Сигареты”, “Вода”, “Газеты”)
                  хотите рассчитать прогноз. Если нужны данные по всем товарам,
                  выберите “Все”.
                </li>
                <li>
                  <strong>Выберите количество периодов:</strong> Укажите, за
                  сколько временных интервалов система должна рассчитать прогноз
                  (например, 1 неделя, 2 недели, 3 месяца). Это поможет учесть
                  изменения в продажах за разные периоды.
                </li>
                <li>
                  <strong>Нажмите “Сгенерировать прогноз”:</strong> После выбора
                  всех параметров нажмите эту кнопку, и система автоматически
                  создаст прогноз, отображая оптимальные объемы заказов для
                  каждого товара.
                </li>
              </ol>

              <h3 className="mt-4 text-lg font-semibold dark:text-gray-100">
                Как работает прогноз?
              </h3>
              <p className="mt-2 dark:text-gray-400">
                1. <strong>Анализ продаж:</strong> Система делит указанный вами
                период на части (например, недели или дни) и анализирует,
                сколько товаров продано в каждый интервал.
              </p>
              <p className="mt-2 dark:text-gray-400">
                2. <strong>Скользящее среднее (SMA):</strong> На основе продаж
                за периоды система вычисляет среднее количество проданных
                товаров. Это позволяет учесть общие тенденции.
              </p>
              <p className="mt-2 dark:text-gray-400">
                3. <strong>Расчет заказа:</strong> Система определяет
                оптимальный объем заказа, вычитая остаток товара на складе из
                рассчитанного среднего.
              </p>

              <h4 className="mt-4 text-lg font-semibold dark:text-gray-100">
                Пример: Как это выглядит на практике
              </h4>
              <p className="mt-2 dark:text-gray-400">
                <strong>Товар:</strong> Сигареты “Marlboro Red” <br />
                <strong>Продажи за последние 4 недели:</strong> 10, 12, 15, 13
                пачек <br />
                <strong>Среднее количество продаж:</strong> (10 + 12 + 15 + 13)
                / 4 = 12.5 пачек <br />
                <strong>Остаток на складе:</strong> 8 пачек <br />
                <strong>Рекомендуемый объем заказа:</strong> 12.5 (среднее) - 8
                (остаток) = 4.5, округляется до 5 пачек. <br />
                <strong>Результат:</strong> Рекомендуется заказать 5 пачек
                Marlboro Red, чтобы оптимально пополнить запас.
              </p>
            </div>

            <button
              type="button"
              onClick={toggleInstructions}
              className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-400 transition duration-300 mt-4 dark:bg-red-400 dark:hover:bg-red-700"
            >
              Свернуть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

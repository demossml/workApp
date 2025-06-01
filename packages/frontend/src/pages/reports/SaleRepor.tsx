import { useEffect, useState, useRef } from "react";
import { DateRangePicker } from "../../components/DateRangePicker";
import { ShopSelector } from "../../components/ShopSelector";
import { useMe } from "../../hooks/useApi";
import { GroupSelector } from "../../components/GroupSelector";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorDisplay } from "../../components/ErrorDisplay";
import { GoBackButton } from "../../components/GoBackButton";
import { DynamicTable } from "../../components/DynamicTable";
import ReportUploader from "../../components/ReportUploader";
// import DownloadTableButton from "../../components/DownloadTableButton";

// import SendToTelegramButton from "../../components/SendToTelegramButton";

interface GroupOption {
  name: string;
  uuid: string;
}

// Интерфейс для структуры данных отчёта
interface ReportData {
  salesData: Record<string, { quantitySale: number; sum: number }>; // Сортированные данные по продажам
  shopName: string;
  startDate: string; // Начальная дата
  endDate: string; // Конечная дата
}

export default function SalesReport() {
  // Declare ref at the top level of the component
  const pageRef = useRef<HTMLDivElement>(null);

  const [shopOptions, setShopOptions] = useState<Record<string, string>>({});
  const [selectedShop, setSelectedShop] = useState<string | null>(null); // Добавляем состояние для выбранного магазина
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState<boolean>(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(false);
  const [isLoadingShops, setIsLoadingShops] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

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

  const submitForecast = async () => {
    // Проверяем, что все необходимые данные выбраны
    if (
      !startDate ||
      !endDate ||
      !selectedShop ||
      selectedGroups.length === 0
    ) {
      alert("Пожалуйста, выберите все параметры для формирования прогноза.");
      return;
    }
    const data = {
      startDate: startDate, // Устанавливаем начало дня
      endDate: endDate,
      shopUuid: selectedShop,
      groups: selectedGroups,
    };
    setIsLoadingReport(true);

    try {
      const response = await fetch("/api/evotor/sales-result", {
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

  // Форматирование даты
  const formatDate = (date: Date) =>
    `${date.getDate().toString().padStart(2, "0")} ${date.toLocaleString(
      "default",
      {
        month: "short",
      }
    )}`;

  const formatPeriod = (
    shopName: string,
    startDate: string,
    endDate: string
  ): string => {
    const formattedStartDate = formatDate(new Date(startDate));
    const formattedEndDate = formatDate(new Date(endDate));
    return `${shopName}, ${formattedStartDate} → ${formattedEndDate}`;
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
          <div className="w-24 h-24 border-8 border-t-transparent border-blue-500 dark:text-blue-400 border-solid rounded-full animate-spin" />
          <h1 className="ml-4 text-xl sm:text-2xl text-gray-800 font-bold" />
        </div>
      </div>
    );
  }

  if (reportData) {
    const { salesData, startDate, endDate, shopName } = reportData;

    // Преобразуем объект в массив
    const tableData = Object.entries(salesData).map(
      ([productName, { quantitySale, sum }]) => ({
        productName,
        quantitySale,
        sum,
      })
    );

    return (
      <div className="p-4  flex-col block items-start bg-custom-gray gap-4 max-w-md mx-auto  dark:bg-gray-900">
        <GoBackButton />
        {/* Заголовок с информацией */}
        <div className="text-sm dark:text-gray-400">
          <p className="font-semibold">
            {formatPeriod(shopName, startDate, endDate)}
          </p>
          <p className="font-semibold">
            Общая сумма продаж:{" "}
            <span className="font-semibold ">
              {Object.values(salesData)
                .reduce((acc, item) => acc + item.sum, 0)
                .toLocaleString("ru-RU")}{" "}
              ₽
            </span>
          </p>
        </div>

        {/* Использование компонента DynamicTable */}
        <DynamicTable data={tableData} />
        {/* <DownloadTableButton data={tableData} fileName="Отчёт_сотрудников" /> */}

        <ReportUploader ref={pageRef} />
      </div>
    );
  }

  return (
    <div className="fixed  w-screen h-screen px-4  dark:text-gray-400 dark:bg-gray-900">
      <GoBackButton />
      <h1 className="text-3xl font-bold text-center">Отчёт по продажам</h1>
      <div className="w-full">
        <DateRangePicker
          onDateChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
        />
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

      {/* <SortCriteriaPicker onSortChange={handleSortChange} /> */}

      {/* Кнопка "Сформировать прогноз" */}
      <button
        onClick={submitForecast} // Вызываем функцию отправки данных
        className={`w-full p-2 rounded-md text-white mt-8 ${
          startDate && endDate && selectedShop && selectedGroups.length
            ? "bg-blue-500 hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-500"
            : "bg-gray-300 dark:bg-gray-700"
        }`}
        disabled={
          !(startDate && endDate && selectedShop && selectedGroups.length) // Блокируем кнопку, если не выбраны все параметры
        }
      >
        Сгенерировать отчет
      </button>
    </div>
  );
}

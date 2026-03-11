import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { motion } from "framer-motion";
import { PeriodSelector } from "../../components/Period";
import { ShopSelector } from "../../components/ShopSelector";
import { useMe } from "../../hooks/useApi";
import { DynamicTable } from "../../components/DynamicTable";
import { ErrorDisplay } from "../../components/ErrorDisplay";
import { GroupSelector } from "../../components/GroupSelector";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";
import { Button, Calendar, Popover, PopoverContent, PopoverTrigger } from "../../components/ui";

interface GroupOption {
  name: string;
  uuid: string;
}

interface ReportData {
  order: Record<string, { [key: string]: number }>;
  startDate: string;
  endDate: string;
  shopName: string;
}

export default function Orders() {
  const [shopOptions, setShopOptions] = useState<Record<string, string>>({});
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isLoadingShops, setIsLoadingShops] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const [dateMode, setDateMode] = useState<"lastWeek" | "period">("lastWeek");
  const [period, setPeriod] = useState<DateRange | undefined>(undefined);
  const [tempPeriod, setTempPeriod] = useState<DateRange | undefined>(undefined);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  useTelegramBackButton({ show: true });

  const { data } = useMe();
  const userId = data?.id?.toString() || "";

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatDate = (date: Date) =>
    date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const formatCompactDate = (date: string) =>
    new Date(date).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "short",
    });

  const getLastWeekRange = () => {
    const today = new Date();
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const thisWeekMonday = new Date(today);
    thisWeekMonday.setDate(today.getDate() + mondayOffset);

    const start = new Date(thisWeekMonday);
    start.setDate(thisWeekMonday.getDate() - 7);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    return {
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(end),
    };
  };

  useEffect(() => {
    if (dateMode === "lastWeek") {
      const range = getLastWeekRange();
      setStartDate(range.startDate);
      setEndDate(range.endDate);
      setPeriod(undefined);
      setTempPeriod(undefined);
      setShowPeriodPicker(false);
    }
  }, [dateMode]);

  useEffect(() => {
    if (dateMode !== "period" || !period?.from || !period?.to) return;
    setStartDate(formatLocalDate(period.from));
    setEndDate(formatLocalDate(period.to));
  }, [dateMode, period]);

  useEffect(() => {
    const fetchSalesData = async () => {
      setIsLoadingShops(true);
      setError(null);
      try {
        const response = await client.api.evotor.shops.$post({
          json: { userId },
        });

        if (!response.ok) throw new Error(`Ошибка: ${response.status}`);

        const result = await response.json();
        setShopOptions(result.shopOptions);

        if (Object.keys(result.shopOptions).length > 0) {
          const defaultShopUuid = Object.keys(result.shopOptions)[0];
          setSelectedShop(defaultShopUuid);
          await fetchGroups(defaultShopUuid);
        }
      } catch (err) {
        console.error(err);
        setError("Не удалось загрузить список магазинов");
      } finally {
        setIsLoadingShops(false);
      }
    };

    if (userId) {
      void fetchSalesData();
    }
  }, [userId]);

  const fetchGroups = async (shopUuid: string) => {
    setIsLoadingGroups(true);
    setError(null);
    try {
      const response = await client.api.evotor["groups-by-shop"].$post({
        json: { shopUuid },
      });

      if (!response.ok) {
        throw new Error(`Ошибка загрузки групп: ${response.status}`);
      }

      const result = (await response.json()) as
        | { groups: GroupOption[] }
        | { code: string; message: string; details?: unknown };

      if (!("groups" in result)) {
        throw new Error(result.message || "Не удалось загрузить группы");
      }
      setGroupOptions(result.groups || []);
      setSelectedGroups([]);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить группы для выбранного магазина");
    } finally {
      setIsLoadingGroups(false);
    }
  };

  const isFormValid =
    !!startDate &&
    !!endDate &&
    !!selectedShop &&
    !!selectedPeriod &&
    selectedGroups.length > 0;

  const submitForecast = async () => {
    if (!isFormValid) {
      setError("Выберите период, магазин, группы и количество периодов SMA.");
      return;
    }

    setIsLoadingReport(true);
    setError(null);
    try {
      const response = await client.api.evotor.order.$post({
        json: {
          startDate,
          endDate,
          shopUuid: selectedShop,
          groups: selectedGroups,
          period: selectedPeriod,
          userId,
        },
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => null)) as
          | Record<string, unknown>
          | null;
        const message =
          (typeof err?.error === "string" ? err.error : undefined) ||
          (typeof err?.message === "string" ? err.message : undefined) ||
          `Ошибка: ${response.status}`;
        throw new Error(message);
      }

      const report = (await response.json()) as
        | ReportData
        | { code: string; message: string; details?: unknown };
      if (!("order" in report)) {
        throw new Error(report.message || "Некорректный ответ сервера");
      }
      setReportData(report);
    } catch (err) {
      console.error(err);
      setError("Не удалось получить прогноз закупки");
    } finally {
      setIsLoadingReport(false);
    }
  };

  const normalizedProducts = useMemo(
    () =>
      reportData
        ? Object.values(reportData.order).filter(
            (product): product is {
              orderQuantity: number;
              smaQuantity: number;
              quantity: number;
              sum: number;
            } =>
              !!product &&
              typeof product === "object" &&
              typeof product.orderQuantity === "number" &&
              typeof product.smaQuantity === "number" &&
              typeof product.quantity === "number" &&
              typeof product.sum === "number"
          )
        : [],
    [reportData]
  );

  const totalSum = useMemo(
    () => normalizedProducts.reduce((sum, product) => sum + product.sum, 0),
    [normalizedProducts]
  );

  const tableData = useMemo(
    () =>
      reportData
        ? Object.entries(reportData.order)
            .filter(
              (
                entry
              ): entry is [
                string,
                {
                  orderQuantity: number;
                  smaQuantity: number;
                  quantity: number;
                  sum: number;
                },
              ] => {
                const product = entry[1];
                return (
                  !!product &&
                  typeof product === "object" &&
                  typeof product.orderQuantity === "number" &&
                  typeof product.smaQuantity === "number" &&
                  typeof product.quantity === "number" &&
                  typeof product.sum === "number"
                );
              }
            )
            .map(([productName, product]) => ({
              productName,
              smaQuantity: product.smaQuantity,
              quantity: product.quantity,
              orderQuantity: product.orderQuantity,
              sum: product.sum,
            }))
        : [],
    [reportData]
  );

  if (isLoadingReport) return <LoadingSpinner />;
  if (error && !reportData) return <ErrorDisplay error={error} />;

  if (!Object.keys(shopOptions).length && isLoadingShops) {
    return (
      <div className="app-page flex min-h-[60vh] items-center justify-center">
        <div className="w-16 h-16 border-4 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
      </div>
    );
  }

  if (reportData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="app-page w-full px-4 sm:px-6 py-6 flex flex-col gap-4"
        style={{
          paddingTop: "calc(var(--app-top-clearance) + 0.5rem)",
          paddingBottom: "calc(var(--app-bottom-clearance) + 0.75rem)",
        }}
      >
        <div className="rounded-2xl border border-white/10 bg-slate-900/45 backdrop-blur-xl p-4">
          <p className="text-sm text-slate-300">
            {reportData.shopName}, {formatCompactDate(reportData.startDate)} -{" "}
            {formatCompactDate(reportData.endDate)}
          </p>
          <p className="mt-1 text-xl font-semibold text-white">
            {totalSum.toLocaleString("ru-RU")} ₽
          </p>
          <p className="text-xs text-slate-400">
            Позиций в прогнозе: {tableData.length}
          </p>
          <button
            type="button"
            onClick={() => {
              setReportData(null);
              setError(null);
            }}
            className="mt-3 text-sm text-blue-400 hover:text-blue-300"
          >
            Сформировать новый прогноз
          </button>
        </div>

        <DynamicTable data={tableData} />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="app-page w-full px-4 sm:px-6 py-6 flex flex-col gap-4"
      style={{
        paddingTop: "calc(var(--app-top-clearance) + 0.5rem)",
        paddingBottom: "calc(var(--app-bottom-clearance) + 0.75rem)",
      }}
    >
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
          Прогноз закупки
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Выберите период, магазин и группы для расчёта заказа
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/45 backdrop-blur-xl p-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDateMode("lastWeek")}
            className={`h-11 rounded-xl border text-sm font-semibold transition ${
              dateMode === "lastWeek"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 text-slate-200 hover:border-blue-500/60"
            }`}
          >
            Прошлая неделя
          </button>
          <button
            type="button"
            onClick={() => {
              setDateMode("period");
              setShowPeriodPicker(true);
            }}
            className={`h-11 rounded-xl border text-sm font-semibold transition ${
              dateMode === "period"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 text-slate-200 hover:border-blue-500/60"
            }`}
          >
            Период
          </button>
        </div>

        {dateMode === "period" && (
          <Popover open={showPeriodPicker} onOpenChange={setShowPeriodPicker}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start border-slate-700 bg-slate-900/70 text-slate-200 hover:bg-slate-800"
              >
                {period?.from && period?.to
                  ? `${formatDate(period.from)} - ${formatDate(period.to)}`
                  : "Выберите диапазон дат"}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-auto p-0 bg-slate-950/95 border border-white/10"
            >
              <Calendar
                mode="range"
                selected={tempPeriod ?? period}
                onSelect={setTempPeriod}
                numberOfMonths={1}
                className="text-slate-100"
              />
              <div className="flex gap-2 p-3 border-t border-white/10">
                <Button
                  variant="outline"
                  className="flex-1 border-slate-700 bg-slate-900/80 text-slate-200 hover:bg-slate-800"
                  onClick={() => {
                    setTempPeriod(period);
                    setShowPeriodPicker(false);
                  }}
                >
                  Отмена
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white"
                  onClick={() => {
                    if (tempPeriod?.from && tempPeriod?.to) {
                      setPeriod(tempPeriod);
                    }
                    setShowPeriodPicker(false);
                  }}
                >
                  Применить
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}

        <div className="text-xs text-slate-300">
          Выбранный диапазон:{" "}
          {startDate && endDate
            ? `${formatCompactDate(startDate)} - ${formatCompactDate(endDate)}`
            : "не выбран"}
        </div>

        <PeriodSelector onPeriodChange={setSelectedPeriod} />

        <ShopSelector
          shopOptions={shopOptions}
          isLoadingShops={isLoadingShops}
          fetchGroups={fetchGroups}
          selectedShop={selectedShop}
          setSelectedShop={setSelectedShop}
        />

        <GroupSelector
          groupOptions={groupOptions}
          selectedGroups={selectedGroups}
          setSelectedGroups={setSelectedGroups}
          isLoadingGroups={isLoadingGroups}
        />

        <button
          type="button"
          onClick={submitForecast}
          className={`h-11 rounded-xl text-sm font-semibold transition ${
            isFormValid
              ? "bg-blue-600 hover:bg-blue-500 text-white"
              : "bg-slate-700 text-slate-400 cursor-not-allowed"
          }`}
          disabled={!isFormValid}
        >
          Сгенерировать прогноз
        </button>

        <button
          type="button"
          onClick={() => setShowInstructions((prev) => !prev)}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          {showInstructions ? "Скрыть инструкцию" : "Инструкция"}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
          {error}
        </div>
      )}

      {showInstructions && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/45 backdrop-blur-xl p-4 text-sm text-slate-300 space-y-2">
          <p className="font-semibold text-slate-100">Как работает прогноз</p>
          <p>1. Выберите период истории продаж, магазин и группы товаров.</p>
          <p>2. Укажите количество периодов SMA (скользящее среднее).</p>
          <p>
            3. Система рассчитает рекомендуемый заказ: спрос по SMA минус
            текущий остаток.
          </p>
        </div>
      )}
    </motion.div>
  );
}

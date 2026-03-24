import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { motion } from "framer-motion";
import { useMe } from "../../hooks/useApi";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { Button, Calendar, Popover, PopoverContent, PopoverTrigger } from "../../components/ui";
import { ErrorState, LoadingState } from "@shared/ui/states";
import { DynamicTable, GroupSelector, PeriodSelector, ShopSelector } from "@widgets/reports";
import {
  fetchEvotorShops,
  fetchGroupsByShop,
  fetchOrderForecastV2,
  queryKeys,
} from "@shared/api";

const ORDER_TABLE_COLUMNS = [
  "productName",
  "smaQuantity",
  "quantity",
  "availableStock",
  "safetyStock",
  "reorderPoint",
  "targetStock",
  "orderQuantity",
  "sum",
  "confidencePct",
  "reasonCodes",
];

interface GroupOption {
  name: string;
  uuid: string;
}

interface ReportData {
  order: Record<string, { [key: string]: number | string[] }>;
  startDate: string;
  endDate: string;
  shopName: string;
}

type OrderV2Response = {
  period: { startDate: string; endDate: string };
  assumptions: {
    forecastHorizonDays: number;
    leadTimeDays: number;
    serviceLevel: number;
  };
  summary: {
    totalOrderCost: number;
    skuCount: number;
    constrainedByBudget: boolean;
  };
  items: Array<{
    productUuid: string;
    productName: string;
    abcClass: "A" | "B" | "C";
    xyzClass: "X" | "Y" | "Z";
    currentStock: number;
    availableStock: number;
    avgDailyDemand: number;
    demandStdDev: number;
    safetyStock: number;
    reorderPoint: number;
    targetStock: number;
    recommendedOrderRaw: number;
    recommendedOrderRounded: number;
    unitCost: number;
    orderCost: number;
    expectedCoverageDays: number;
    confidence: number;
    reasonCodes: string[];
  }>;
};

export default function Orders() {
  const queryClient = useQueryClient();
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
        const result = await queryClient.fetchQuery({
          queryKey: queryKeys.reports.sales.shops(userId),
          queryFn: () => fetchEvotorShops(userId),
          staleTime: 5 * 60_000,
        });
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
  }, [queryClient, userId]);

  const fetchGroups = async (shopUuid: string) => {
    setIsLoadingGroups(true);
    setError(null);
    try {
      const result = await queryClient.fetchQuery({
        queryKey: queryKeys.reports.sales.groups(shopUuid),
        queryFn: () => fetchGroupsByShop(shopUuid),
        staleTime: 5 * 60_000,
      });

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
      const report = (await queryClient.fetchQuery({
        queryKey: queryKeys.reports.orders.forecast({
          startDate,
          endDate,
          shopUuid: selectedShop,
          groups: selectedGroups,
          period: selectedPeriod,
          userId,
        }),
        queryFn: () =>
          fetchOrderForecastV2({
            startDate,
            endDate,
            shopUuid: selectedShop,
            groups: selectedGroups,
            forecastHorizonDays: selectedPeriod || 7,
            leadTimeDays: 2,
            serviceLevel: 0.95,
          }),
        staleTime: 60_000,
      })) as
        | OrderV2Response
        | { code: string; message: string; details?: unknown };
      if (!("items" in report)) {
        throw new Error(report.message || "Некорректный ответ сервера");
      }
      const orderMap: Record<string, { [key: string]: number | string[] }> = {};
      for (const item of report.items) {
        orderMap[item.productName] = {
          smaQuantity: Number(item.avgDailyDemand.toFixed(2)),
          quantity: Number(item.currentStock.toFixed(2)),
          availableStock: Number(item.availableStock.toFixed(2)),
          safetyStock: Number(item.safetyStock.toFixed(2)),
          reorderPoint: Number(item.reorderPoint.toFixed(2)),
          targetStock: Number(item.targetStock.toFixed(2)),
          orderQuantity: Number(item.recommendedOrderRounded.toFixed(2)),
          sum: Number(item.orderCost.toFixed(2)),
          confidencePct: Number((item.confidence * 100).toFixed(1)),
          reasonCodes: item.reasonCodes,
        };
      }
      setReportData({
        order: orderMap,
        startDate: report.period.startDate,
        endDate: report.period.endDate,
        shopName: shopOptions[selectedShop] || selectedShop,
      });
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
                  availableStock?: number;
                  safetyStock?: number;
                  reorderPoint?: number;
                  targetStock?: number;
                  confidencePct?: number;
                  reasonCodes?: string[];
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
              availableStock:
                typeof product.availableStock === "number" ? product.availableStock : 0,
              safetyStock:
                typeof product.safetyStock === "number" ? product.safetyStock : 0,
              reorderPoint:
                typeof product.reorderPoint === "number" ? product.reorderPoint : 0,
              targetStock:
                typeof product.targetStock === "number" ? product.targetStock : 0,
              orderQuantity: product.orderQuantity,
              sum: product.sum,
              confidencePct:
                typeof product.confidencePct === "number" ? product.confidencePct : 0,
              reasonCodes: Array.isArray(product.reasonCodes) ? product.reasonCodes : [],
            }))
        : [],
    [reportData]
  );

  if (isLoadingReport) return <LoadingState />;
  if (error && !reportData) return <ErrorState error={error} />;

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

        <DynamicTable data={tableData} columns={ORDER_TABLE_COLUMNS} />
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
          <p>2. Укажите горизонт прогноза (в днях) через селектор периодов SMA.</p>
          <p>
            3. Система рассчитает рекомендуемый заказ с учетом страхового запаса,
            точки заказа и целевого уровня остатков.
          </p>
        </div>
      )}
    </motion.div>
  );
}

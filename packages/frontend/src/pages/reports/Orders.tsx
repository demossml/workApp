import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { motion } from "framer-motion";
import { useMe } from "../../hooks/useApi";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { Button, Calendar, Popover, PopoverContent, PopoverTrigger } from "../../components/ui";
import { ErrorState, LoadingState } from "@shared/ui/states";
import { DynamicTable, GroupSelector } from "@widgets/reports";
import {
  fetchEvotorShops,
  fetchGroupsByShop,
  fetchOrderForecastV2,
  queryKeys,
} from "@shared/api";

const ORDER_TABLE_COLUMNS = [
  "shopName",
  "productName",
  "smaQuantity",
  "quantity",
  "orderQuantity",
  "sum",
  "confidencePct",
  "reasonCodes",
];

interface GroupOption {
  name: string;
  uuid: string;
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

type FlatRow = {
  shopName: string;
  productName: string;
  smaQuantity: number;
  quantity: number;
  orderQuantity: number;
  sum: number;
  confidencePct: number;
  reasonCodes: string[];
};

export default function Orders() {
  const queryClient = useQueryClient();
  const [shopOptions, setShopOptions] = useState<Record<string, string>>({});
  const [selectedShops, setSelectedShops] = useState<string[]>([]);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isLoadingShops, setIsLoadingShops] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [analysisWeeks, setAnalysisWeeks] = useState<number>(4);
  const [tableData, setTableData] = useState<FlatRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

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

        const shopUuids = Object.keys(result.shopOptions);
        if (shopUuids.length > 0) {
          setSelectedShops(shopUuids); // Select all by default
          await fetchGroupsForShop(shopUuids[0]);
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

  const fetchGroupsForShop = async (shopUuid: string) => {
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

  useEffect(() => {
    if (!period?.from || !period?.to) return;
    setStartDate(formatLocalDate(period.from));
    setEndDate(formatLocalDate(period.to));
  }, [period]);

  const toggleShop = (uuid: string) => {
    setSelectedShops((prev) =>
      prev.includes(uuid)
        ? prev.filter((s) => s !== uuid)
        : [...prev, uuid]
    );
  };

  const isFormValid =
    !!startDate &&
    !!endDate &&
    selectedShops.length > 0 &&
    selectedGroups.length > 0;

  const submitForecast = async () => {
    if (!isFormValid || !startDate || !endDate) {
      setError("Выберите период заказа, магазины и группы.");
      return;
    }

    setIsLoadingReport(true);
    setError(null);
    try {
      // Run forecasts for all selected shops in parallel
      const results = await Promise.all(
        selectedShops.map((shopUuid) =>
          fetchOrderForecastV2({
            startDate,
            endDate,
            shopUuid,
            groups: selectedGroups,
            analysisWeeks,
            leadTimeDays: 0,
            serviceLevel: 0.95,
          })
        )
      );

      // Merge all results into a flat table with shopName column
      const shopName = (uuid: string) => shopOptions[uuid] || uuid;
      const allRows: FlatRow[] = [];

      for (let i = 0; i < results.length; i++) {
        const report = results[i] as OrderV2Response | { code: string; message: string };
        if (!("items" in report)) continue;
        const name = shopName(selectedShops[i]);
        for (const item of report.items) {
          allRows.push({
            shopName: name,
            productName: item.productName,
            smaQuantity: Number(item.avgDailyDemand.toFixed(2)),
            quantity: Number(item.currentStock.toFixed(2)),
            orderQuantity: Number(item.recommendedOrderRounded.toFixed(2)),
            sum: Number(item.orderCost.toFixed(2)),
            confidencePct: Number((item.confidence * 100).toFixed(1)),
            reasonCodes: item.reasonCodes,
          });
        }
      }

      setTableData(allRows);
    } catch (err) {
      console.error(err);
      setError("Не удалось получить прогноз закупки");
    } finally {
      setIsLoadingReport(false);
    }
  };

  const totalSum = useMemo(
    () => (tableData || []).reduce((sum, row) => sum + row.sum, 0),
    [tableData]
  );

  const shopNames = useMemo(
    () => (tableData ? [...new Set(tableData.map((r) => r.shopName))].join(", ") : ""),
    [tableData]
  );

  if (isLoadingReport) return <LoadingState />;
  if (error && !tableData) return <ErrorState error={error} />;

  if (!Object.keys(shopOptions).length && isLoadingShops) {
    return (
      <div className="app-page flex min-h-[60vh] items-center justify-center">
        <div className="w-16 h-16 border-4 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
      </div>
    );
  }

  if (tableData) {
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
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {shopNames}
          </p>
          <p className="text-xs text-slate-400">
            {formatCompactDate(startDate!)} – {formatCompactDate(endDate!)}
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {totalSum.toLocaleString("ru-RU")} ₽
          </p>
          <p className="text-xs text-slate-400">
            Позиций: {tableData.length}
          </p>
          <button
            type="button"
            onClick={() => {
              setTableData(null);
              setError(null);
            }}
            className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500"
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Прогноз закупки
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Выберите период, магазины и группы для расчёта заказа
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-4">
        {/* Period picker */}
        <Popover open={showPeriodPicker} onOpenChange={setShowPeriodPicker}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {period?.from && period?.to
                ? `${formatDate(period.from)} – ${formatDate(period.to)}`
                : "Выберите период заказа"}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-auto p-0 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          >
            <Calendar
              mode="range"
              selected={tempPeriod ?? period}
              onSelect={setTempPeriod}
              numberOfMonths={1}
              className="text-slate-900 dark:text-slate-100"
            />
            <div className="flex gap-2 p-3 border-t border-slate-200 dark:border-slate-800">
              <Button
                variant="outline"
                className="flex-1 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
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

        <div className="text-xs text-slate-500 dark:text-slate-400">
          Товар должен быть в наличии с{" "}
          <span className="text-slate-700 dark:text-slate-200 font-medium">
            {startDate && endDate
              ? `${formatCompactDate(startDate)} по ${formatCompactDate(endDate)}`
              : "—"}
          </span>
        </div>

        {/* Shop multi-select */}
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Магазины</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(shopOptions).map(([uuid, name]) => (
              <button
                key={uuid}
                type="button"
                onClick={() => toggleShop(uuid)}
                className={`h-9 px-3 rounded-lg border text-sm font-medium transition ${
                  selectedShops.includes(uuid)
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Analysis weeks selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-300">Анализ за</span>
          <div className="flex gap-1">
            {[2, 3, 4, 6, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAnalysisWeeks(n)}
                className={`h-9 w-10 rounded-lg border text-sm font-medium transition ${
                  analysisWeeks === n
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400">нед.</span>
        </div>

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
              : "bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
          }`}
          disabled={!isFormValid}
        >
          Сгенерировать прогноз
        </button>

        <button
          type="button"
          onClick={() => setShowInstructions((prev) => !prev)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500"
        >
          {showInstructions ? "Скрыть инструкцию" : "Инструкция"}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-3 py-2">
          {error}
        </div>
      )}

      {showInstructions && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-sm text-slate-600 dark:text-slate-300 space-y-2">
          <p className="font-semibold text-slate-900 dark:text-slate-100">Как работает прогноз</p>
          <p>1. Выберите период, на который нужен товар (например, среда–пятница).</p>
          <p>2. Выберите магазины — можно все или несколько.</p>
          <p>3. Укажите, за сколько прошлых недель анализировать продажи.</p>
          <p>
            4. Система проанализирует продажи за такие же дни недели в прошлых
            периодах и рассчитает рекомендуемый заказ с учётом страхового запаса.
          </p>
        </div>
      )}
    </motion.div>
  );
}

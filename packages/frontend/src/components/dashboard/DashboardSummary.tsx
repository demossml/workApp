import { useFilteredSalesData } from "../../hooks/dashboard/useFilteredSalesData";
import { useSalesCalculations } from "../../hooks/dashboard/useSalesCalculations";
import { useSalesData } from "../../hooks/dashboard/useSalesData";
import { useEmployeeRole, useMe } from "../../hooks/useApi";
import { useCurrentWorkShop } from "../../hooks/useCurrentWorkShop";
import { useGetReportAndPlan } from "../../hooks/useReportData";
import { BestShopCard } from "./cards/BestShopCard";
import { ExpensesCard } from "./cards/ExpensesCard";
import { RevenueCard } from "./cards/RevenueCard";
import { RevenueDetailsAdmin } from "./cards/RevenueDetailsAdmin";
import { RevenueDetailsUser } from "./cards/RevenueDetailsUser";
import { RevenueTempoCard, RevenueTempoDetails } from "./cards/RevenueTempoCard";
import { ExpensesDetailsAdmin } from "./cards/ExpensesDetailsAdmin";
import { ExpensesDetailsUser } from "./cards/ExpensesDetailsUser";
import {
  useAccessoriesSales,
  type AccessoriesSalesData,
} from "../../hooks/dashboard/useAccessoriesSales";
import { client } from "../../helpers/api";
import { BestShopDetails } from "./cards/BestShopDetails";
import { TopProductsDetails } from "./cards/TopProductsDetails";
import { SummaryHeader } from "./SummaryHeader";
import { EmptyWorkDay } from "./ui/EmptyWorkDay";
import type {
  DashboardSummaryAiSectionProps,
  DashboardSummaryAiInsights,
} from "./DashboardSummaryAiSection";
import React, { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui";
import { Calendar } from "../ui";
import {
  Cherry,
  DollarSign,
  ShoppingCart,
  Store,
  Package,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";

type OpeningPhotoDigestResponse = {
  date: string;
  shops: Array<{
    shopUuid: string;
    shopName: string;
    openedAt?: string;
    openedByName?: string | null;
    digest: string;
    photoCount: number;
    photos?: Array<{
      key: string;
      category: string;
      description: string;
    }>;
  }>;
};

type PlanInfo = {
  datePlan: number;
  dataSales: number;
  dataQuantity?: Record<string, number | string>;
};

type DashboardSummaryProps = {
  onAiSectionDataChange?: (data: DashboardSummaryAiSectionProps) => void;
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const shiftIsoDate = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getDiffDaysInclusive = (since: string, until: string) => {
  const from = new Date(`${since}T00:00:00`);
  const to = new Date(`${until}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 1;
  const diffMs = to.getTime() - from.getTime();
  return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
};

function LoadingTile({
  title,
  Icon,
  tone = "blue",
}: {
  title: string;
  Icon: LucideIcon;
  tone?: "blue" | "orange" | "purple" | "pink" | "cyan" | "indigo";
}) {
  const toneClasses: Record<string, string> = {
    blue: "bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300",
    orange:
      "bg-orange-100 dark:bg-orange-900/60 text-orange-600 dark:text-orange-300",
    purple:
      "bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300",
    pink: "bg-pink-100 dark:bg-pink-900/60 text-pink-600 dark:text-pink-300",
    cyan: "bg-cyan-100 dark:bg-cyan-900/60 text-cyan-600 dark:text-cyan-300",
    indigo:
      "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300",
  };
  return (
    <div
      className={`rounded-lg p-4 h-[120px] border border-white/60 dark:border-white/10 shadow-sm flex flex-col items-center justify-center ${toneClasses[tone]}`}
    >
      <Icon className="w-10 h-10 animate-pulse" />
      <div className="text-sm font-semibold mt-2 text-center">{title}</div>
      <div className="text-xs opacity-80">Загрузка...</div>
    </div>
  );
}

function AccessoriesCard({
  value,
  onClick,
}: {
  value: number;
  onClick: () => void;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="bg-blue-100 dark:bg-blue-900 rounded-lg p-4 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 transition h-[120px] flex flex-col justify-between"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Аксессуары
        </div>
        <Cherry className="w-6 h-6 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="text-2xl font-bold text-blue-800 dark:text-blue-200">
        {value.toLocaleString()} ₽
      </div>
    </motion.div>
  );
}

function OpeningPhotoDigestCard({
  title,
  subtitle,
  loading,
  error,
  onClick,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  error: string | null;
  onClick: () => void;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="h-[120px] cursor-pointer rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 dark:from-indigo-600 dark:to-indigo-700 text-indigo-50 p-4 flex flex-col justify-between"
      onClick={onClick}
    >
      <div className="text-xs font-semibold">
        {loading ? "Анализ фото..." : "AI-дайджест"}
      </div>
      <div className="text-sm font-bold leading-tight">Утренние фото</div>
      <div className="text-xs leading-4 overflow-hidden">
        {error ? <span className="text-red-200">{error}</span> : subtitle}
      </div>
      <div className="text-[11px] opacity-80">{title}</div>
    </motion.div>
  );
}

function AccessoriesSummaryStats({
  data,
}: {
  data: AccessoriesSalesData;
}) {
  // Сумма по всем магазинам
  const totalSum = data.total.reduce((sum, item) => sum + item.sum, 0);
  // Количество проданных аксессуаров
  const totalQty = data.total.reduce((sum, item) => sum + item.quantity, 0);
  // Средняя цена
  const avgPrice =
    data.total.length > 0 ? Math.round(totalSum / data.total.length) : 0;
  // Всего видов аксессуаров
  const totalProducts = data.total.length;
  // Доля топ-3 аксессуаров
  const top3Sum = data.total
    .slice(0, 3)
    .reduce((sum, item) => sum + item.sum, 0);
  const topShare = totalSum > 0 ? Math.round((top3Sum / totalSum) * 100) : 0;

  // Суммы по каждому магазину
  const byShop = data.byShop.map((shop) => ({
    shopName: shop.shopName,
    sum: shop.sales.reduce((s, item) => s + item.sum, 0),
  }));

  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      <div className="bg-blue-100 dark:bg-blue-900 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px] col-span-1">
        <div className="text-xs text-gray-700 dark:text-gray-300 mb-2">
          Суммы по магазинам
        </div>
        <div className="flex flex-col gap-1 w-full items-center">
          {byShop.map((shop) => (
            <div
              key={shop.shopName}
              className="flex flex-row items-center justify-between w-full text-xs font-semibold text-blue-800 dark:text-blue-200"
            >
              <span className="truncate max-w-[60%] text-gray-800 dark:text-gray-200">
                {shop.shopName}
              </span>
              <span className="ml-2 whitespace-nowrap">
                {shop.sum.toLocaleString()} ₽
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gray-800 dark:bg-gray-700 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px]">
        <div className="text-white text-2xl font-bold mb-1">
          {totalProducts}
        </div>
        <div className="text-xs text-gray-300 dark:text-gray-400">
          ВСЕГО ТОВАРОВ
        </div>
      </div>
      <div className="bg-gray-800 dark:bg-gray-700 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px]">
        <div className="text-white text-2xl font-bold mb-1">{topShare}%</div>
        <div className="text-xs text-gray-300 dark:text-gray-400">
          ДОЛЯ ТОП-3
        </div>
      </div>
      <div className="bg-gray-800 dark:bg-gray-700 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px]">
        <div className="text-white text-2xl font-bold mb-1">{avgPrice}</div>
        <div className="text-xs text-gray-300 dark:text-gray-400">СР. ЦЕНА</div>
      </div>
      <div className="bg-gray-800 dark:bg-gray-700 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px]">
        <div className="text-white text-2xl font-bold mb-1">{totalQty}</div>
        <div className="text-xs text-gray-300 dark:text-gray-400">
          ПРОДАНО ШТ
        </div>
      </div>
    </div>
  );
}

function AccessoriesDetails({
  data,
  shopFilter,
  onShopFilterChange,
  shopOptions,
  productScope,
  onProductScopeChange,
}: {
  data: AccessoriesSalesData;
  shopFilter: string;
  onShopFilterChange: (value: string) => void;
  shopOptions: string[];
  productScope: "accessories" | "nonAccessories";
  onProductScopeChange: (value: "accessories" | "nonAccessories") => void;
}) {
  // Сортировка по сумме
  const list = data.total;
  const sorted = [...list].sort((a, b) => b.sum - a.sum);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {"Продажи"}
        </h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 text-[11px] dark:border-gray-600 dark:bg-gray-700">
            <button
              type="button"
              className={`rounded px-2 py-1 ${
                productScope === "accessories"
                  ? "bg-cyan-600 text-white"
                  : "text-gray-600 dark:text-gray-300"
              }`}
              onClick={() => onProductScopeChange("accessories")}
            >
              Акс.
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 ${
                productScope === "nonAccessories"
                  ? "bg-slate-700 text-white"
                  : "text-gray-600 dark:text-gray-300"
              }`}
              onClick={() => onProductScopeChange("nonAccessories")}
            >
              Не акс.
            </button>
          </div>
          {shopOptions.length > 1 && (
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              value={shopFilter}
              onChange={(event) => onShopFilterChange(event.target.value)}
            >
              <option value="all">Все магазины</option>
              {shopOptions.map((shopName) => (
                <option key={shopName} value={shopName}>
                  {shopName}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <ul>
        {sorted.map((sale, idx) => (
          <li
            key={sale.name}
            className="flex justify-between items-center mb-2"
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-gray-800 dark:text-gray-300">
                {idx + 1}.
              </span>
              <span className="font-bold text-sm text-gray-900 dark:text-white">
                {sale.name}
              </span>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-blue-700 dark:text-blue-400">
                {sale.sum.toLocaleString()} ₽
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {sale.quantity} шт
              </div>
            </div>
          </li>
        ))}
      </ul>
      <AccessoriesSummaryStats data={data} />
    </div>
  );
}

function OpeningPhotoDigestDetails({
  data,
  loading,
  error,
  onRefresh,
}: {
  data: OpeningPhotoDigestResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          AI-дайджест утреннего открытия
        </h2>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Обновление..." : "Обновить"}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-red-100 p-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">
          {error}
        </div>
      )}

      {!data?.shops?.length && !loading && !error && (
        <div className="rounded-md bg-gray-100 dark:bg-gray-700 p-3 text-sm text-gray-700 dark:text-gray-200">
          Нет данных по утренним фото за выбранную дату.
        </div>
      )}

      <div className="space-y-3">
        {data?.shops?.map((shop) => (
          <div key={shop.shopUuid} className="rounded-md border p-3 dark:border-gray-700">
            <div className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {shop.shopName}
            </div>
            <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Фото: {shop.photoCount}
              {shop.openedByName ? ` • Открыл: ${shop.openedByName}` : ""}
            </div>
            <div className="rounded-md bg-indigo-50 p-2 text-sm text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-100">
              {shop.digest}
            </div>

            {shop.photos && shop.photos.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-gray-600 dark:text-gray-300">
                  Показать описания фото
                </summary>
                <div className="mt-2 space-y-1">
                  {shop.photos.map((photo) => (
                    <div
                      key={photo.key}
                      className="rounded bg-gray-100 dark:bg-gray-700 p-2 text-xs text-gray-700 dark:text-gray-200"
                    >
                      <div className="mb-1 text-gray-500 dark:text-gray-400">
                        [{photo.category}] {photo.key.split("/").pop()}
                      </div>
                      <div>{photo.description}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardSummary2({
  onAiSectionDataChange,
}: DashboardSummaryProps = {}) {
  const [dateMode, setDateMode] = useState<"today" | "yesterday" | "period">(
    "today"
  );
  // Для shadcn/ui Calendar нужен DateRange
  const [period, setPeriod] = useState<DateRange | undefined>(undefined);
  const [tempPeriod, setTempPeriod] = useState<DateRange | undefined>(
    undefined
  );
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);

  // Вычисляем since/until в ISO-формате в зависимости от режима
  // Используем UTC даты, но учитываем рабочий день по МСК (UTC+3)
  let since: string | undefined = undefined;
  let until: string | undefined = undefined;

  const getMSKDayRange = (date: Date): [string, string] => {
    // Получаем дату в формате YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    // Отправляем просто дату в формате YYYY-MM-DD
    // Бэкенд сам преобразует в нужный формат с учетом timezone
    const dateStr = `${year}-${month}-${day}`;

    return [dateStr, dateStr];
  };

  if (dateMode === "today") {
    const today = new Date();
    [since, until] = getMSKDayRange(today);
  } else if (dateMode === "yesterday") {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    [since, until] = getMSKDayRange(yesterday);
  } else if (dateMode === "period" && period?.from && period?.to) {
    const [sinceStart] = getMSKDayRange(period.from);
    const [, untilEnd] = getMSKDayRange(period.to);
    since = sinceStart;
    until = untilEnd;
  }

  const [todaySince] = getMSKDayRange(new Date());
  const safeSince = since || todaySince;
  const safeUntil = until || safeSince;

  const { data, loading, lastUpdate } = useSalesData({
    since: safeSince,
    until: safeUntil,
  });
  const { data: roleData } = useEmployeeRole();
  const { data: currentWorkShop } = useCurrentWorkShop();
  const reportAndPlan = useGetReportAndPlan(true);

  const isSuperAdmin = roleData?.employeeRole === "SUPERADMIN";
  const isAdmin = roleData?.employeeRole === "ADMIN";
  const canViewTempoCard = isSuperAdmin || isAdmin;
  const filteredData = useFilteredSalesData(
    data,
    isSuperAdmin,
    currentWorkShop ?? null
  );
  const { netSales, bestShop } = useSalesCalculations(filteredData);

  const [expandedCard, setExpandedCard] = React.useState<string | null>(null);
  const [accessoriesShopFilter, setAccessoriesShopFilter] = React.useState<string>(
    "all"
  );
  const [accessoriesProductScope, setAccessoriesProductScope] = React.useState<
    "accessories" | "nonAccessories"
  >("accessories");
  const [digestLoading, setDigestLoading] = React.useState(false);
  const [digestError, setDigestError] = React.useState<string | null>(null);
  const [digestData, setDigestData] =
    React.useState<OpeningPhotoDigestResponse | null>(null);
  const me = useMe();
  const accessoriesSales = useAccessoriesSales({
    role: roleData?.employeeRole || "CASHIER",
    userId: me.data?.id ?? "",
    since: safeSince,
    until: safeUntil,
  });
  const comparisonRange = React.useMemo(() => {
    const periodDays = getDiffDaysInclusive(safeSince, safeUntil);
    const prevUntil = shiftIsoDate(safeSince, -1);
    const prevSince = shiftIsoDate(prevUntil, -(periodDays - 1));
    return { prevSince, prevUntil, periodDays };
  }, [safeSince, safeUntil]);

  const previousPeriodData = useSalesData({
    since: comparisonRange.prevSince,
    until: comparisonRange.prevUntil,
  });
  const previousFilteredData = useFilteredSalesData(
    previousPeriodData.data,
    isSuperAdmin,
    currentWorkShop ?? null
  );
  const digestDate = since || new Date().toISOString().slice(0, 10);

  React.useEffect(() => {
    setDigestError(null);
    setDigestData(null);
  }, [digestDate, roleData?.employeeRole]);

  const accessoryShopOptions = React.useMemo(
    () => (accessoriesSales.data?.byShop || []).map((shop) => shop.shopName),
    [accessoriesSales.data]
  );
  const canChooseAccessoriesShop =
    (isSuperAdmin || isAdmin) && accessoryShopOptions.length > 1;
  const effectiveAccessoriesShopFilter = canChooseAccessoriesShop
    ? accessoriesShopFilter
    : accessoryShopOptions[0] || "all";
  React.useEffect(() => {
    if (!canChooseAccessoriesShop) return;
    if (
      accessoriesShopFilter !== "all" &&
      !accessoryShopOptions.includes(accessoriesShopFilter)
    ) {
      setAccessoriesShopFilter("all");
    }
  }, [canChooseAccessoriesShop, accessoriesShopFilter, accessoryShopOptions]);
  const filteredAccessoriesData = React.useMemo<AccessoriesSalesData | null>(() => {
    const data = accessoriesSales.data;
    if (!data) return null;
    const sourceByShop =
      accessoriesProductScope === "nonAccessories"
        ? data.nonAccessoriesByShop || []
        : data.byShop;
    const sourceTotal =
      accessoriesProductScope === "nonAccessories"
        ? data.nonAccessoriesTotal || []
        : data.total;
    if (effectiveAccessoriesShopFilter === "all") {
      return {
        ...data,
        byShop: sourceByShop,
        total: sourceTotal,
      };
    }
    const shop = sourceByShop.find(
      (item) => item.shopName === effectiveAccessoriesShopFilter
    );
    return {
      ...data,
      byShop: shop ? [shop] : [],
      total: shop ? shop.sales : [],
    };
  }, [accessoriesSales.data, effectiveAccessoriesShopFilter, accessoriesProductScope]);
  const accessoriesTileValue = React.useMemo(() => {
    if (!filteredAccessoriesData) return 0;
    return filteredAccessoriesData.total.reduce((sum, item) => sum + item.sum, 0);
  }, [filteredAccessoriesData]);

  const planData = React.useMemo(
    () => (reportAndPlan.data?.planData || {}) as Record<string, PlanInfo | number>,
    [reportAndPlan.data]
  );

  const aiInsights = React.useMemo<DashboardSummaryAiInsights>(() => {
    const fallback = {
      risk: {
        networkProbability: 0,
        redShops: [] as Array<{
          shopName: string;
          risk: number;
          progress: number;
          plan: number;
          fact: number;
          missing: number;
        }>,
      },
      actions: {
        top3: [] as string[],
        checklist: [] as Array<{ shopName: string; items: string[] }>,
      },
      forecast: {
        value: 0,
        lower: 0,
        upper: 0,
        confidence: 0,
        factors: [] as Array<{ label: string; value: string; impact: "plus" | "minus" | "neutral" }>,
      },
      drop: {
        salesDeltaPct: 0,
        mainReason: "Недостаточно данных",
        byShop: [] as Array<{ shopName: string; deltaPct: number; current: number; previous: number }>,
      },
      anomalies: {
        incidents: [] as Array<{
          shopName: string;
          type: string;
          details: string;
          severity: number;
        }>,
      },
      losses: {
        totalLoss: 0,
        skus: [] as Array<{
          productName: string;
          planQty: number;
          actualQty: number;
          lostQty: number;
          lostRevenue: number;
        }>,
      },
      context: {
        checksDeltaPct: 0,
        avgCheckDeltaPct: 0,
        refundRate: 0,
        refundDeltaPp: 0,
      },
    };

    if (!filteredData) return fallback;

    const currentNetSales = filteredData.grandTotalSell - filteredData.grandTotalRefund;
    const currentChecks = filteredData.totalChecks || 0;
    const currentAvgCheck = currentChecks > 0 ? currentNetSales / currentChecks : 0;
    const currentRefundRate =
      filteredData.grandTotalSell > 0
        ? (filteredData.grandTotalRefund / filteredData.grandTotalSell) * 100
        : 0;

    const previousNetSales = previousFilteredData
      ? previousFilteredData.grandTotalSell - previousFilteredData.grandTotalRefund
      : 0;
    const previousChecks = previousFilteredData?.totalChecks || 0;
    const previousAvgCheck =
      previousChecks > 0 ? previousNetSales / previousChecks : 0;
    const previousRefundRate =
      previousFilteredData && previousFilteredData.grandTotalSell > 0
        ? (previousFilteredData.grandTotalRefund / previousFilteredData.grandTotalSell) *
          100
        : 0;

    const pctChange = (current: number, previous: number) => {
      if (previous <= 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const checksDeltaPct = pctChange(currentChecks, previousChecks);
    const avgCheckDeltaPct = pctChange(currentAvgCheck, previousAvgCheck);
    const salesDeltaPct = pctChange(currentNetSales, previousNetSales);
    const refundDeltaPp = currentRefundRate - previousRefundRate;

    const previousByShop = new Map<
      string,
      { netSales: number; checks: number; avgCheck: number; refundRate: number }
    >();
    if (previousFilteredData) {
      Object.entries(previousFilteredData.salesDataByShopName).forEach(
        ([shopName, shopData]) => {
          const totalRefund = Object.values(shopData.refund || {}).reduce(
            (sum, val) => sum + val,
            0
          );
          const netSales = shopData.totalSell - totalRefund;
          const checks = shopData.checksCount || 0;
          previousByShop.set(shopName, {
            netSales,
            checks,
            avgCheck: checks > 0 ? netSales / checks : 0,
            refundRate: shopData.totalSell > 0 ? (totalRefund / shopData.totalSell) * 100 : 0,
          });
        }
      );
    }

    const shopMetrics = Object.entries(filteredData.salesDataByShopName).map(
      ([shopName, shopData]) => {
        const totalRefund = Object.values(shopData.refund || {}).reduce(
          (sum, val) => sum + val,
          0
        );
        const netSales = shopData.totalSell - totalRefund;
        const checks = shopData.checksCount || 0;
        const avgCheck = checks > 0 ? netSales / checks : 0;
        const refundRate =
          shopData.totalSell > 0 ? (totalRefund / shopData.totalSell) * 100 : 0;
        const prev = previousByShop.get(shopName);
        return {
          shopName,
          totalSell: shopData.totalSell,
          totalRefund,
          netSales,
          checks,
          avgCheck,
          refundRate,
          prevNetSales: prev?.netSales ?? 0,
          prevChecks: prev?.checks ?? 0,
          prevAvgCheck: prev?.avgCheck ?? 0,
        };
      }
    );

    const riskRows = shopMetrics
      .map((shop) => {
        const planInfo = planData[shop.shopName];
        const plan =
          typeof planInfo === "number"
            ? planInfo
            : Number(planInfo?.datePlan || 0);
        const fact = shop.netSales;
        const progress = plan > 0 ? (fact / plan) * 100 : 0;
        const risk = plan > 0 ? clamp(100 - progress + (shop.refundRate > 8 ? 6 : 0), 0, 99) : 0;
        return {
          shopName: shop.shopName,
          plan,
          fact,
          progress,
          risk,
          missing: Math.max(0, plan - fact),
        };
      })
      .filter((row) => row.plan > 0)
      .sort((a, b) => b.risk - a.risk);

    const totalPlan = riskRows.reduce((sum, row) => sum + row.plan, 0);
    const weightedRisk = totalPlan
      ? riskRows.reduce((sum, row) => sum + row.risk * row.plan, 0) / totalPlan
      : 0;
    const redShops = riskRows.filter((row) => row.risk >= 40 || row.progress < 70);

    const topActions: string[] = [];
    if (redShops.length > 0) {
      const top = redShops[0];
      topActions.push(
        `Фокус на ${top.shopName}: закрыть отставание ${formatMoney(top.missing)} ₽ до конца смены.`
      );
    }
    const refundRiskShops = shopMetrics
      .filter((shop) => shop.refundRate > 8)
      .sort((a, b) => b.refundRate - a.refundRate);
    if (refundRiskShops.length > 0) {
      topActions.push(
        `Снизить возвраты в ${refundRiskShops[0].shopName}: сейчас ${refundRiskShops[0].refundRate.toFixed(1)}%.`
      );
    }
    if (salesDeltaPct < -5) {
      topActions.push(
        `Оперативно восстановить темп: сеть просела на ${Math.abs(salesDeltaPct).toFixed(1)}% к прошлому периоду.`
      );
    }
    while (topActions.length < 3) {
      topActions.push("Проверить наличие топ-SKU и усилить продажи в пиковый час.");
    }

    const checklistShops = (redShops.length > 0 ? redShops : riskRows)
      .slice(0, 3)
      .map((shop) => ({
        shopName: shop.shopName,
        items: [
          "Проверить остатки топ-3 SKU.",
          "Запустить дополнительный upsell на кассе.",
          "Промониторить возвраты и спорные чеки в реальном времени.",
        ],
      }));

    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const openHour = 10;
    const closeHour = 22;
    const elapsed = clamp((hour - openHour) / (closeHour - openHour), 0.2, 1);
    const forecastValue = dateMode === "today" ? currentNetSales / elapsed : currentNetSales;
    const uncertainty = dateMode === "today" ? clamp(0.45 - elapsed * 0.25, 0.12, 0.4) : 0.2;
    const forecastLower = forecastValue * (1 - uncertainty);
    const forecastUpper = forecastValue * (1 + uncertainty);
    const confidence = Math.round((1 - uncertainty) * 100);

    const forecastFactors: Array<{
      label: string;
      value: string;
      impact: "plus" | "minus" | "neutral";
    }> = [
      {
        label: "Трафик (чеки)",
        value: `${checksDeltaPct >= 0 ? "+" : ""}${checksDeltaPct.toFixed(1)}%`,
        impact: checksDeltaPct > 2 ? "plus" : checksDeltaPct < -2 ? "minus" : "neutral",
      },
      {
        label: "Средний чек",
        value: `${avgCheckDeltaPct >= 0 ? "+" : ""}${avgCheckDeltaPct.toFixed(1)}%`,
        impact:
          avgCheckDeltaPct > 2 ? "plus" : avgCheckDeltaPct < -2 ? "minus" : "neutral",
      },
      {
        label: "Доля возвратов",
        value: `${currentRefundRate.toFixed(1)}% (${refundDeltaPp >= 0 ? "+" : ""}${refundDeltaPp.toFixed(1)} п.п.)`,
        impact: refundDeltaPp > 0.5 ? "minus" : refundDeltaPp < -0.5 ? "plus" : "neutral",
      },
    ];

    const reasonCandidates = [
      {
        reason: "Падение трафика (меньше чеков)",
        score: Math.max(0, -checksDeltaPct),
      },
      {
        reason: "Просадка среднего чека",
        score: Math.max(0, -avgCheckDeltaPct),
      },
      {
        reason: "Рост возвратов",
        score: Math.max(0, refundDeltaPp * 2),
      },
    ];
    const mainReason =
      salesDeltaPct >= 0
        ? "Просадки нет, динамика стабильная или положительная."
        : reasonCandidates.sort((a, b) => b.score - a.score)[0].reason;

    const dropByShop = shopMetrics
      .filter((shop) => shop.prevNetSales > 0)
      .map((shop) => ({
        shopName: shop.shopName,
        current: shop.netSales,
        previous: shop.prevNetSales,
        deltaPct: pctChange(shop.netSales, shop.prevNetSales),
      }))
      .sort((a, b) => a.deltaPct - b.deltaPct)
      .slice(0, 5);

    const incidents: Array<{
      shopName: string;
      type: string;
      details: string;
      severity: number;
    }> = [];
    for (const shop of shopMetrics) {
      if (shop.refundRate > 10) {
        incidents.push({
          shopName: shop.shopName,
          type: "Возвраты",
          details: `Высокая доля возвратов: ${shop.refundRate.toFixed(1)}%`,
          severity: Math.round(shop.refundRate * 3),
        });
      }
      if (shop.prevChecks > 5) {
        const deltaChecks = pctChange(shop.checks, shop.prevChecks);
        if (deltaChecks < -30) {
          incidents.push({
            shopName: shop.shopName,
            type: "Чеки",
            details: `Просадка количества чеков: ${deltaChecks.toFixed(1)}%`,
            severity: Math.round(Math.abs(deltaChecks)),
          });
        }
      }
      if (shop.prevAvgCheck > 0) {
        const deltaAvg = pctChange(shop.avgCheck, shop.prevAvgCheck);
        if (deltaAvg < -25) {
          incidents.push({
            shopName: shop.shopName,
            type: "Средний чек",
            details: `Падение среднего чека: ${deltaAvg.toFixed(1)}%`,
            severity: Math.round(Math.abs(deltaAvg)),
          });
        }
      }
    }
    incidents.sort((a, b) => b.severity - a.severity);

    const plannedQtyByProduct = new Map<string, number>();
    for (const shop of shopMetrics) {
      const planInfo = planData[shop.shopName];
      const quantityMap =
        typeof planInfo === "object" && planInfo?.dataQuantity
          ? planInfo.dataQuantity
          : undefined;
      if (!quantityMap) continue;
      for (const [productName, quantityRaw] of Object.entries(quantityMap)) {
        const qty = Number(quantityRaw || 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        plannedQtyByProduct.set(productName, (plannedQtyByProduct.get(productName) || 0) + qty);
      }
    }

    const actualByProduct = new Map(
      (filteredData.topProducts || []).map((item) => [item.productName, item])
    );

    const losses = Array.from(plannedQtyByProduct.entries())
      .map(([productName, planQty]) => {
        const actual = actualByProduct.get(productName);
        const actualQty = Number(actual?.netQuantity ?? actual?.quantity ?? 0);
        const avgPrice =
          Number(actual?.averagePrice || 0) > 0
            ? Number(actual?.averagePrice || 0)
            : actualQty > 0
            ? Number(actual?.netRevenue || 0) / actualQty
            : 0;
        const lostQty = Math.max(0, planQty - actualQty);
        const lostRevenue = lostQty * Math.max(0, avgPrice);
        return {
          productName,
          planQty,
          actualQty,
          lostQty,
          lostRevenue,
        };
      })
      .filter((row) => row.lostQty > 0 && row.lostRevenue > 0)
      .sort((a, b) => b.lostRevenue - a.lostRevenue)
      .slice(0, 6);

    const fallbackLosses =
      losses.length > 0
        ? losses
        : (filteredData.topProducts || []).slice(0, 6).map((item) => {
            const impliedLostQty = Math.max(1, Math.round((item.netQuantity || 1) * 0.15));
            return {
              productName: item.productName,
              planQty: item.netQuantity + impliedLostQty,
              actualQty: item.netQuantity,
              lostQty: impliedLostQty,
              lostRevenue: impliedLostQty * Math.max(0, item.averagePrice || 0),
            };
          });
    const totalLoss = fallbackLosses.reduce((sum, row) => sum + row.lostRevenue, 0);

    return {
      risk: {
        networkProbability: weightedRisk,
        redShops,
      },
      actions: {
        top3: topActions.slice(0, 3),
        checklist: checklistShops,
      },
      forecast: {
        value: forecastValue,
        lower: forecastLower,
        upper: forecastUpper,
        confidence,
        factors: forecastFactors,
      },
      drop: {
        salesDeltaPct,
        mainReason,
        byShop: dropByShop,
      },
      anomalies: {
        incidents: incidents.slice(0, 8),
      },
      losses: {
        totalLoss,
        skus: fallbackLosses,
      },
      context: {
        checksDeltaPct,
        avgCheckDeltaPct,
        refundRate: currentRefundRate,
        refundDeltaPp,
      },
    };
  }, [filteredData, previousFilteredData, planData, dateMode]);

  React.useEffect(() => {
    if (!onAiSectionDataChange) return;
    onAiSectionDataChange({
      loading,
      hasData: Boolean(filteredData),
      since: safeSince,
      until: safeUntil,
      aiInsights,
    });
  }, [
    onAiSectionDataChange,
    loading,
    filteredData,
    safeSince,
    safeUntil,
    aiInsights,
  ]);

  const loadOpeningDigest = async () => {
    setDigestLoading(true);
    setDigestError(null);
    try {
      const response = await client.api.ai["opening-photo-digest"].$post({
        json: { date: digestDate },
      });
      const json = (await response.json()) as OpeningPhotoDigestResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(json.error || "Ошибка AI-анализа фото");
      }
      setDigestData(json);
    } catch (error) {
      setDigestError(
        error instanceof Error ? error.message : "Ошибка AI-анализа фото"
      );
    } finally {
      setDigestLoading(false);
    }
  };

  const handleDigestCardClick = async () => {
    const nextState = expandedCard !== "openingDigest";
    setExpandedCard(nextState ? "openingDigest" : null);
    if (nextState && !digestData && !digestLoading) {
      await loadOpeningDigest();
    }
  };

  const digestTitle =
    roleData?.employeeRole === "SUPERADMIN"
      ? `Магазинов: ${digestData?.shops.length ?? 0}`
      : digestData?.shops[0]?.shopName || "Ваш магазин";
  const digestSubtitle =
    digestData?.shops.length && digestData.shops[0]?.digest
      ? digestData.shops
          .map((shop) => `${shop.shopName}: ${shop.digest}`)
          .join(" ")
          .slice(0, 280)
      : "Нажмите, чтобы получить дайджест по утренним фото.";

  const toggleCard = (cardId: string) => {
    setExpandedCard(expandedCard === cardId ? null : cardId);
  };

  if (!loading && !filteredData) return <EmptyWorkDay />;

  return (
    <>
      <SummaryHeader
        lastUpdate={lastUpdate}
        dateMode={dateMode}
        period={period}
      />
      <div className="mb-4 grid grid-cols-3 gap-2">
        <button
          className={`rounded-lg border px-3 py-2 text-sm transition ${
            dateMode === "today"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-300 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          }`}
          onClick={() => setDateMode("today")}
        >
          Сегодня
        </button>
        <button
          className={`rounded-lg border px-3 py-2 text-sm transition ${
            dateMode === "yesterday"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-300 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          }`}
          onClick={() => setDateMode("yesterday")}
        >
          Вчера
        </button>
        <Popover
          open={showPeriodPicker}
          onOpenChange={(open) => {
            setShowPeriodPicker(open);
            if (!open) {
              setTempPeriod(undefined);
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                dateMode === "period"
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-300 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              }`}
              onClick={() => {
                if (!isSuperAdmin) return;
                setDateMode("period");
                setTempPeriod(period);
                setShowPeriodPicker(true);
              }}
              disabled={!isSuperAdmin}
              title={!isSuperAdmin ? "Только для SUPERADMIN" : undefined}
            >
              Период
            </button>
          </PopoverTrigger>
          {isSuperAdmin && (
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="range"
                selected={tempPeriod?.from ? tempPeriod : undefined}
                onSelect={setTempPeriod}
                numberOfMonths={1}
                disabled={(date) => date > new Date()}
                initialFocus
              />
              <div className="flex justify-end p-2">
                <button
                  className="px-3 py-1 rounded bg-blue-600 text-white"
                  disabled={!(tempPeriod?.from && tempPeriod?.to)}
                  onClick={() => {
                    setPeriod(tempPeriod);
                    setShowPeriodPicker(false);
                  }}
                >
                  Применить
                </button>
              </div>
            </PopoverContent>
          )}
        </Popover>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className={expandedCard === "revenue" ? "col-span-2" : ""}>
          <div
            className={`rounded-xl transform-gpu transition-all duration-300 ${
              expandedCard === "revenue"
                ? "ring-2 ring-blue-500 scale-[1.01]"
                : "hover:-translate-y-0.5"
            }`}
          >
            {loading || !filteredData ? (
              <LoadingTile title="Выручка" Icon={DollarSign} tone="blue" />
            ) : (
              <RevenueCard value={netSales} onClick={() => toggleCard("revenue")} />
            )}
          </div>
          {expandedCard === "revenue" && filteredData && (
            <div className="mt-3">
              {isSuperAdmin ? (
                <RevenueDetailsAdmin
                  salesDataByShopName={filteredData.salesDataByShopName}
                  grandTotalSell={filteredData.grandTotalSell}
                  grandTotalRefund={filteredData.grandTotalRefund}
                  netRevenue={filteredData.netRevenue}
                  averageCheck={filteredData.averageCheck}
                  totalChecks={filteredData.totalChecks}
                  since={safeSince}
                  until={safeUntil}
                />
              ) : (
                <RevenueDetailsUser
                  salesDataByShopName={filteredData.salesDataByShopName}
                />
              )}
            </div>
          )}
        </div>
        {canViewTempoCard && (
          <div className={expandedCard === "tempo" ? "col-span-2" : ""}>
            <div
              className={`rounded-xl transform-gpu transition-all duration-300 ${
                expandedCard === "tempo"
                  ? "ring-2 ring-slate-500 scale-[1.01]"
                  : "hover:-translate-y-0.5"
              }`}
            >
              {loading || !filteredData ? (
                <LoadingTile title="Темп продаж" Icon={DollarSign} tone="indigo" />
              ) : (
                <RevenueTempoCard
                  salesDeltaPct={aiInsights.drop.salesDeltaPct}
                  onClick={() => toggleCard("tempo")}
                />
              )}
            </div>
            {expandedCard === "tempo" && filteredData && (
              <RevenueTempoDetails
                since={safeSince}
                currentData={filteredData}
                previousData={previousFilteredData}
                accessoriesData={accessoriesSales.data}
              />
            )}
          </div>
        )}
        <div className={expandedCard === "expenses" ? "col-span-2" : ""}>
          <div
            className={`rounded-xl transform-gpu transition-all duration-300 ${
              expandedCard === "expenses"
                ? "ring-2 ring-orange-500 scale-[1.01]"
                : "hover:-translate-y-0.5"
            }`}
          >
            {loading || !filteredData ? (
              <LoadingTile title="Расходы" Icon={ShoppingCart} tone="orange" />
            ) : (
              <ExpensesCard
                value={filteredData.grandTotalCashOutcome}
                onClick={() => toggleCard("expenses")}
              />
            )}
          </div>
          {expandedCard === "expenses" && filteredData && (
            <div className="mt-3">
              {isSuperAdmin ? (
                <ExpensesDetailsAdmin
                  cashOutcomeData={filteredData.cashOutcomeData}
                  grandTotalCashOutcome={filteredData.grandTotalCashOutcome}
                />
              ) : (
                <ExpensesDetailsUser cashOutcomeData={filteredData.cashOutcomeData} />
              )}
            </div>
          )}
        </div>
        <div className={expandedCard === "best" ? "col-span-2" : ""}>
          <div
            className={`rounded-xl transform-gpu transition-all duration-300 ${
              expandedCard === "best"
                ? "ring-2 ring-purple-500 scale-[1.01]"
                : "hover:-translate-y-0.5"
            }`}
          >
            {loading ? (
              <LoadingTile title="Лучший магазин" Icon={Store} tone="purple" />
            ) : bestShop ? (
              <BestShopCard shop={bestShop} onClick={() => toggleCard("best")} />
            ) : (
              <LoadingTile title="Лучший магазин" Icon={Store} tone="purple" />
            )}
          </div>
          {expandedCard === "best" && filteredData && (
            <div className="mt-3">
              <BestShopDetails
                salesDataByShopName={filteredData.salesDataByShopName}
                netRevenue={filteredData.netRevenue}
              />
            </div>
          )}
        </div>
        <div className={expandedCard === "products" ? "col-span-2" : ""}>
          <div
            className={`rounded-xl transform-gpu transition-all duration-300 ${
              expandedCard === "products"
                ? "ring-2 ring-pink-500 scale-[1.01]"
                : "hover:-translate-y-0.5"
            }`}
          >
            {loading || !filteredData ? (
              <LoadingTile title="Топ продукт" Icon={Package} tone="pink" />
            ) : filteredData.topProducts?.length > 0 ? (
              <ExpensesCard
                value={filteredData.topProducts[0].netRevenue}
                onClick={() => toggleCard("products")}
                label="Топ продукт"
              />
            ) : (
              <LoadingTile title="Топ продукт" Icon={Package} tone="pink" />
            )}
          </div>
          {expandedCard === "products" &&
            filteredData &&
            filteredData.topProducts?.length > 0 && (
              <div className="mt-3">
                <TopProductsDetails topProducts={filteredData.topProducts} />
              </div>
            )}
        </div>
        {/* Плитка аксессуаров */}
        <div className={expandedCard === "accessories" ? "col-span-2" : ""}>
          {accessoriesSales.data &&
          !accessoriesSales.loading &&
          !accessoriesSales.error ? (
            <div
              className={`rounded-xl transform-gpu transition-all duration-300 ${
                expandedCard === "accessories"
                  ? "ring-2 ring-cyan-500 scale-[1.01]"
                  : "hover:-translate-y-0.5"
              }`}
            >
              <AccessoriesCard
                value={accessoriesTileValue}
                onClick={() => toggleCard("accessories")}
              />
            </div>
          ) : accessoriesSales.loading ? (
            <LoadingTile title="Аксессуары" Icon={Cherry} tone="cyan" />
          ) : accessoriesSales.error ? (
            <div className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 p-4 rounded min-h-[120px] flex items-center justify-center">
              {accessoriesSales.error}
            </div>
          ) : null}
          {expandedCard === "accessories" && filteredAccessoriesData && (
            <div className="mt-3">
              <AccessoriesDetails
                data={filteredAccessoriesData}
                shopFilter={effectiveAccessoriesShopFilter}
                onShopFilterChange={setAccessoriesShopFilter}
                shopOptions={accessoryShopOptions}
                productScope={accessoriesProductScope}
                onProductScopeChange={setAccessoriesProductScope}
              />
            </div>
          )}
        </div>
        <div className={expandedCard === "openingDigest" ? "col-span-2" : ""}>
          <div
            className={`rounded-xl transform-gpu transition-all duration-300 ${
              expandedCard === "openingDigest"
                ? "ring-2 ring-indigo-500 scale-[1.01]"
                : "hover:-translate-y-0.5"
            }`}
          >
            {loading && !digestData ? (
              <LoadingTile title="AI-дайджест" Icon={Sparkles} tone="indigo" />
            ) : (
              <OpeningPhotoDigestCard
                title={digestTitle}
                subtitle={digestSubtitle}
                loading={digestLoading}
                error={digestError}
                onClick={handleDigestCardClick}
              />
            )}
          </div>
          {expandedCard === "openingDigest" && (
            <div className="mt-3">
              <OpeningPhotoDigestDetails
                data={digestData}
                loading={digestLoading}
                error={digestError}
                onRefresh={loadOpeningDigest}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

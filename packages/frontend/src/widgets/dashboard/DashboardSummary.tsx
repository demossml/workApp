import { useFilteredSalesData } from "../../hooks/dashboard/useFilteredSalesData";
import { useSalesCalculations } from "../../hooks/dashboard/useSalesCalculations";
import { useSalesData } from "../../hooks/dashboard/useSalesData";
import { useDashboardHomeInsights } from "../../hooks/dashboard/useDashboardHomeInsights";
import { useEmployeeRole, useMe } from "../../hooks/useApi";
import { useCurrentWorkShop } from "../../hooks/useCurrentWorkShop";
import {
  BestShopCard,
  type LeaderMode,
} from "./cards/BestShopCard";
import { ExpensesCard } from "./cards/ExpensesCard";
import { RevenueCard } from "./cards/RevenueCard";
import { RevenueDetailsAdmin } from "./cards/RevenueDetailsAdmin";
import { RevenueDetailsUser } from "./cards/RevenueDetailsUser";
import { RevenueTempoCard, RevenueTempoDetails } from "./cards/RevenueTempoCard";
import { FinancialReportDetails } from "./cards/FinancialReportDetails";
import {
  useAccessoriesSales,
  type AccessoriesSalesData,
} from "../../hooks/dashboard/useAccessoriesSales";
import { client } from "../../helpers/api";
import { BestShopDetails } from "./cards/BestShopDetails";
import { TopProductsDetails } from "./cards/TopProductsDetails";
import {
  TopProductCard,
  type TopProductMetricMode,
  type TopProductRefundFilter,
} from "./cards/TopProductCard";
import { SummaryHeader } from "./SummaryHeader";
import { EmptyWorkDay } from "./ui/EmptyWorkDay";
import type {
  DashboardSummaryAiSectionProps,
  DashboardSummaryAiInsights,
} from "./DashboardSummaryAiSection";
import React, { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { Calendar } from "@/components/ui";
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
import {
  buildAccessoriesSummaryStats,
  formatDashboardMoney,
  formatDashboardPct,
  getDiffDaysInclusive,
  shiftIsoDate,
} from "@features/dashboard/model/dashboardSummaryModel";

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

type DirectorSummaryResponse = {
  date: string;
  shopUuids: string[];
  periods: {
    today: { metrics: DirectorMetrics };
    yesterday: { metrics: DirectorMetrics };
    weekAgo: { metrics: DirectorMetrics };
    avg: { days: number; metrics: DirectorMetrics };
  };
};

type DirectorMetrics = {
  revenue: number;
  checks: number;
  averageCheck: number;
  costOfGoods: number;
  profit: number;
  refunds: number;
  refundChecks: number;
};

type DirectorAlert = {
  code: string;
  severity: "high" | "medium" | "low";
  title: string;
  details: string;
  shopName?: string;
  category?: string;
};

type DirectorAlertsResponse = {
  date: string;
  alerts: DirectorAlert[];
};

type DirectorForecastResponse = {
  date: string;
  revenueToNow: number;
  forecast: number;
  hoursPassed: number;
  workingHours: number;
};

type DirectorVelocityEntry = {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  velocityPerDay: number;
  velocityPerHour: number;
};

type DirectorVelocityResponse = {
  since: string;
  until: string;
  velocity: {
    sku: DirectorVelocityEntry[];
    categories: DirectorVelocityEntry[];
  };
};

type DirectorRecommendationsResponse = {
  recommendations: Array<{
    type: "procurement" | "dead_stock" | "abc";
    id: string;
    name: string;
    category?: string;
    priority: "high" | "medium" | "low";
    details: string;
  }>;
};

type DirectorReportResponse = {
  blocks: {
    happened: string;
    whyImportant: string;
    whatToDo: string[];
  };
};

type DashboardSummaryProps = {
  onAiSectionDataChange?: (data: DashboardSummaryAiSectionProps) => void;
  showAiDirector?: boolean;
  showMainDashboard?: boolean;
};

const formatMoney = formatDashboardMoney;
const formatPct = formatDashboardPct;

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

function EmptyTile({
  title,
  Icon,
  tone = "blue",
  message = "Нет данных",
}: {
  title: string;
  Icon: LucideIcon;
  tone?: "blue" | "orange" | "purple" | "pink" | "cyan" | "indigo";
  message?: string;
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
      <Icon className="w-10 h-10 opacity-70" />
      <div className="text-sm font-semibold mt-2 text-center">{title}</div>
      <div className="text-xs opacity-80">{message}</div>
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
  const { totalQty, avgPrice, totalProducts, topShare, byShop } =
    buildAccessoriesSummaryStats(data);

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
  showAiDirector = false,
  showMainDashboard = true,
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

  const salesEnabled = showMainDashboard;
  const { data: roleData } = useEmployeeRole();
  const { data: currentWorkShop } = useCurrentWorkShop();
  const scopedShopUuid =
    roleData?.employeeRole === "SUPERADMIN"
      ? undefined
      : currentWorkShop?.uuid || undefined;
  const { data, loading, lastUpdate } = useSalesData({
    since: safeSince,
    until: safeUntil,
    shopUuid: scopedShopUuid,
    enabled: salesEnabled,
  });

  const isSuperAdmin = roleData?.employeeRole === "SUPERADMIN";
  const isAdmin = roleData?.employeeRole === "ADMIN";
  const canViewTempoCard = isSuperAdmin || isAdmin;
  const filteredData = useFilteredSalesData(
    data,
    isSuperAdmin,
    currentWorkShop ?? null
  );
  const { netSales } = useSalesCalculations(filteredData);
  const [bestShopMode, setBestShopMode] = React.useState<LeaderMode>("day");

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
  const topProductMetricMode: TopProductMetricMode = "revenue";
  const topProductRefundFilter: TopProductRefundFilter = "all";
  const me = useMe();
  const accessoriesSales = useAccessoriesSales({
    role: roleData?.employeeRole || "CASHIER",
    userId: me.data?.id ?? "",
    since: safeSince,
    until: safeUntil,
    enabled: showMainDashboard,
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
    shopUuid: scopedShopUuid,
    enabled: salesEnabled,
  });
  const previousFilteredData = useFilteredSalesData(
    previousPeriodData.data,
    isSuperAdmin,
    currentWorkShop ?? null
  );
  const digestDate = since || new Date().toISOString().slice(0, 10);

  const [directorLoading, setDirectorLoading] = React.useState(false);
  const [directorError, setDirectorError] = React.useState<string | null>(null);
  const [directorSummary, setDirectorSummary] =
    React.useState<DirectorSummaryResponse | null>(null);
  const [directorAlerts, setDirectorAlerts] =
    React.useState<DirectorAlertsResponse | null>(null);
  const [directorForecast, setDirectorForecast] =
    React.useState<DirectorForecastResponse | null>(null);
  const [directorVelocity, setDirectorVelocity] =
    React.useState<DirectorVelocityResponse | null>(null);
  const [directorRecommendations, setDirectorRecommendations] =
    React.useState<DirectorRecommendationsResponse | null>(null);
  const [directorReport, setDirectorReport] =
    React.useState<DirectorReportResponse | null>(null);

  const directorDate = safeUntil;

  React.useEffect(() => {
    setDigestError(null);
    setDigestData(null);
  }, [digestDate, roleData?.employeeRole]);

  React.useEffect(() => {
    if (!showAiDirector) return;
    let cancelled = false;

    const loadDirectorData = async () => {
      setDirectorLoading(true);
      setDirectorError(null);
      try {
        const aiDirector = client.api.ai as any;
        const settled = await Promise.allSettled([
          aiDirector["director/summary"].$post({
            json: { date: directorDate },
          }),
          aiDirector["director/alerts"].$post({
            json: { date: directorDate },
          }),
          aiDirector["director/forecast"].$post({
            json: { date: directorDate },
          }),
          aiDirector["director/velocity"].$post({
            json: { since: safeSince, until: safeUntil, limit: 50 },
          }),
          aiDirector["director/recommendations"].$post({
            json: { since: safeSince, until: safeUntil, limit: 50 },
          }),
          aiDirector["director/report"].$post({
            json: { date: directorDate, sendTelegram: false },
          }),
        ]);

        const labels = [
          "summary",
          "alerts",
          "forecast",
          "velocity",
          "recommendations",
          "report",
        ] as const;

        const errors: string[] = [];

        const parseFailedResponse = async (res: Response, label: string) => {
          try {
            const body = await res.json();
            const reason =
              (body as { error?: string; message?: string })?.error ||
              (body as { error?: string; message?: string })?.message;
            return reason
              ? `Не удалось загрузить ${label}: ${reason}`
              : `Не удалось загрузить ${label}`;
          } catch {
            return `Не удалось загрузить ${label}`;
          }
        };

        const parseData = async <T,>(index: number): Promise<T | null> => {
          const entry = settled[index];
          const label = labels[index];
          if (entry.status === "rejected") {
            errors.push(`Не удалось загрузить ${label}`);
            return null;
          }
          const res = entry.value;
          if (!res.ok) {
            errors.push(await parseFailedResponse(res, label));
            return null;
          }
          return (await res.json()) as T;
        };

        const [summary, alerts, forecast, velocity, recommendations, report] =
          await Promise.all([
            parseData<DirectorSummaryResponse>(0),
            parseData<DirectorAlertsResponse>(1),
            parseData<DirectorForecastResponse>(2),
            parseData<DirectorVelocityResponse>(3),
            parseData<DirectorRecommendationsResponse>(4),
            parseData<DirectorReportResponse>(5),
          ]);

        if (cancelled) return;
        if (summary) setDirectorSummary(summary);
        if (alerts) setDirectorAlerts(alerts);
        if (forecast) setDirectorForecast(forecast);
        if (velocity) setDirectorVelocity(velocity);
        if (recommendations) setDirectorRecommendations(recommendations);
        if (report) setDirectorReport(report);

        setDirectorError(errors.length > 0 ? errors.join(" • ") : null);
      } catch (error) {
        if (cancelled) return;
        setDirectorError(
          error instanceof Error ? error.message : "Ошибка AI директора"
        );
      } finally {
        if (!cancelled) setDirectorLoading(false);
      }
    };

    void loadDirectorData();
    return () => {
      cancelled = true;
    };
  }, [directorDate, safeSince, safeUntil, showAiDirector]);

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

  const insightsState = useDashboardHomeInsights({
    since: safeSince,
    until: safeUntil,
    dateMode,
    shopUuid: scopedShopUuid,
    enabled: showMainDashboard,
  });
  const aiInsights: DashboardSummaryAiInsights = insightsState.data;
  const dayShopKpiRows = insightsState.bestShop.dayRows;
  const weekShopKpiRows = insightsState.bestShop.weekRows;
  const dayLeaderData = insightsState.bestShop.dayLeader;
  const weekLeaderData = insightsState.bestShop.weekLeader;
  const activeBestShopRows = bestShopMode === "week" ? weekShopKpiRows : dayShopKpiRows;

  React.useEffect(() => {
    if (!onAiSectionDataChange) return;
    onAiSectionDataChange({
      loading: loading || insightsState.loading,
      hasData: Boolean(filteredData),
      since: safeSince,
      until: safeUntil,
      aiInsights,
    });
  }, [
    onAiSectionDataChange,
    loading,
    insightsState.loading,
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

  const directorToday = directorSummary?.periods.today.metrics;
  const directorYesterday = directorSummary?.periods.yesterday.metrics;
  const directorWeekAgo = directorSummary?.periods.weekAgo.metrics;
  const directorAvg = directorSummary?.periods.avg.metrics;

  const pctChange = (current?: number, previous?: number) => {
    if (!previous || !Number.isFinite(previous)) return null;
    if (!Number.isFinite(current ?? 0)) return null;
    return ((current ?? 0) - previous) / previous;
  };

  const directorSalesChange = pctChange(
    directorToday?.revenue,
    directorYesterday?.revenue
  );
  const directorChecksChange = pctChange(
    directorToday?.checks,
    directorYesterday?.checks
  );
  const directorAvgCheckChange = pctChange(
    directorToday?.averageCheck,
    directorYesterday?.averageCheck
  );

  const topAlerts = (directorAlerts?.alerts || []).slice(0, 5);
  const topRecommendations = (directorRecommendations?.recommendations || []).slice(0, 5);

  if (showMainDashboard && !loading && !filteredData) return <EmptyWorkDay />;

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
      {showMainDashboard && (
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
              <LoadingTile title="Фин. отчет" Icon={ShoppingCart} tone="orange" />
            ) : (
              <ExpensesCard
                value={filteredData.grandTotalCashOutcome}
                onClick={() => toggleCard("expenses")}
                label="Фин. отчет"
                cashBalanceByShop={filteredData.cashBalanceByShop}
                salesDataByShopName={filteredData.salesDataByShopName}
              />
            )}
          </div>
          {expandedCard === "expenses" && filteredData && (
            <div className="mt-3">
              <FinancialReportDetails
                salesDataByShopName={filteredData.salesDataByShopName}
                cashOutcomeData={filteredData.cashOutcomeData}
                cashBalanceByShop={filteredData.cashBalanceByShop}
                grandTotalSell={filteredData.grandTotalSell}
                grandTotalRefund={filteredData.grandTotalRefund}
                grandTotalCashOutcome={filteredData.grandTotalCashOutcome}
                totalCashBalance={filteredData.totalCashBalance}
              />
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
            ) : dayLeaderData || weekLeaderData ? (
              <BestShopCard
                dayLeader={dayLeaderData}
                weekLeader={weekLeaderData}
                mode={bestShopMode}
                onClick={() => toggleCard("best")}
              />
            ) : (
              <LoadingTile title="Лучший магазин" Icon={Store} tone="purple" />
            )}
          </div>
          {expandedCard === "best" && filteredData && (
            <div className="mt-3">
              <BestShopDetails
                shops={activeBestShopRows}
                mode={bestShopMode}
                dayLeader={dayLeaderData}
                weekLeader={weekLeaderData}
                onModeChange={setBestShopMode}
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
              <TopProductCard
                topProducts={filteredData.topProducts}
                previousTopProducts={previousFilteredData?.topProducts || []}
                metricMode={topProductMetricMode}
                refundFilter={topProductRefundFilter}
                onClick={() => toggleCard("products")}
              />
            ) : (
              <EmptyTile title="Топ продукт" Icon={Package} tone="pink" />
            )}
          </div>
          {expandedCard === "products" &&
            filteredData &&
            filteredData.topProducts?.length > 0 && (
              <div className="mt-3">
                <TopProductsDetails
                  topProducts={filteredData.topProducts}
                  metricMode={topProductMetricMode}
                  refundFilter={topProductRefundFilter}
                />
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
      )}

      {showAiDirector && (
        <section className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            AI Директор
          </h2>
          {directorLoading && (
            <span className="text-xs text-gray-500">Обновление…</span>
          )}
        </div>

        {directorError && (
          <div className="rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">
            {directorError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow">
            <div className="text-xs text-gray-500">Выручка</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {directorToday ? `${formatMoney(directorToday.revenue)} ₽` : "—"}
            </div>
            <div className="text-xs text-gray-500">
              к вчера: {formatPct(directorSalesChange)}
            </div>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow">
            <div className="text-xs text-gray-500">Прибыль</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {directorToday ? `${formatMoney(directorToday.profit)} ₽` : "—"}
            </div>
            <div className="text-xs text-gray-500">
              к вчера: {formatPct(pctChange(directorToday?.profit, directorYesterday?.profit))}
            </div>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow">
            <div className="text-xs text-gray-500">Чеки</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {directorToday ? Math.round(directorToday.checks).toLocaleString("ru-RU") : "—"}
            </div>
            <div className="text-xs text-gray-500">
              к вчера: {formatPct(directorChecksChange)}
            </div>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow">
            <div className="text-xs text-gray-500">Средний чек</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {directorToday ? `${formatMoney(directorToday.averageCheck)} ₽` : "—"}
            </div>
            <div className="text-xs text-gray-500">
              к вчера: {formatPct(directorAvgCheckChange)}
            </div>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow">
            <div className="text-xs text-gray-500">Себестоимость</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {directorToday ? `${formatMoney(directorToday.costOfGoods)} ₽` : "—"}
            </div>
            <div className="text-xs text-gray-500">
              к вчера: {formatPct(pctChange(directorToday?.costOfGoods, directorYesterday?.costOfGoods))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Проблемы
            </h3>
            {!topAlerts.length ? (
              <div className="text-sm text-gray-500">Критичных проблем нет.</div>
            ) : (
              <ul className="space-y-2">
                {topAlerts.map((alert, idx) => (
                  <li key={`${alert.code}-${idx}`} className="text-sm">
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {alert.title}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                      {alert.details}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Рекомендации
            </h3>
            {!topRecommendations.length ? (
              <div className="text-sm text-gray-500">Пока нет рекомендаций.</div>
            ) : (
              <ul className="space-y-2">
                {topRecommendations.map((item, idx) => (
                  <li key={`${item.id}-${idx}`} className="text-sm">
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {item.name}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                      {item.details}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            История и тренды
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="text-gray-500">Сегодня</div>
            <div className="text-gray-900 dark:text-white">
              {directorToday ? `${formatMoney(directorToday.revenue)} ₽` : "—"}
            </div>
            <div className="text-gray-500">Вчера</div>
            <div className="text-gray-900 dark:text-white">
              {directorYesterday ? `${formatMoney(directorYesterday.revenue)} ₽` : "—"}
            </div>
            <div className="text-gray-500">Неделя назад</div>
            <div className="text-gray-900 dark:text-white">
              {directorWeekAgo ? `${formatMoney(directorWeekAgo.revenue)} ₽` : "—"}
            </div>
            <div className="text-gray-500">Среднее</div>
            <div className="text-gray-900 dark:text-white">
              {directorAvg ? `${formatMoney(directorAvg.revenue)} ₽` : "—"}
            </div>
          </div>
          {directorForecast && (
            <div className="mt-3 text-xs text-gray-500">
              Прогноз на день: {formatMoney(directorForecast.forecast)} ₽
              {" • "}
              Прошло {directorForecast.hoursPassed} из {directorForecast.workingHours} ч
            </div>
          )}
        </div>

        <div className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Скорость продаж
          </h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <div className="text-xs text-gray-500 mb-2">Топ SKU</div>
              <ul className="space-y-2">
                {(directorVelocity?.velocity.sku || []).slice(0, 5).map((item) => (
                  <li key={item.id} className="text-sm">
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {item.name}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                      {item.velocityPerDay.toFixed(2)} / день • {item.velocityPerHour.toFixed(2)} / час
                    </div>
                  </li>
                ))}
                {!directorVelocity?.velocity.sku?.length && (
                  <li className="text-xs text-gray-500">Нет данных</li>
                )}
              </ul>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-2">Топ категории</div>
              <ul className="space-y-2">
                {(directorVelocity?.velocity.categories || []).slice(0, 5).map((item) => (
                  <li key={item.id} className="text-sm">
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {item.name}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                      {item.velocityPerDay.toFixed(2)} / день • {item.velocityPerHour.toFixed(2)} / час
                    </div>
                  </li>
                ))}
                {!directorVelocity?.velocity.categories?.length && (
                  <li className="text-xs text-gray-500">Нет данных</li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {directorReport && (
          <div className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              AI‑отчёт
            </h3>
            <div className="text-sm text-gray-800 dark:text-gray-200 space-y-2">
              <div>
                <span className="font-semibold">Что случилось:</span>{" "}
                {directorReport.blocks.happened}
              </div>
              <div>
                <span className="font-semibold">Почему важно:</span>{" "}
                {directorReport.blocks.whyImportant}
              </div>
              <div>
                <span className="font-semibold">Что делать:</span>
                <ol className="list-decimal pl-5">
                  {directorReport.blocks.whatToDo.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}
        </section>
      )}
    </>
  );
}

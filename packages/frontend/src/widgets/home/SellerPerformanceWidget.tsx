import { useQuery } from "@tanstack/react-query";
import { TrendingUp, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { client } from "@/shared/api/client";
import { LoadingState } from "@shared/ui/states";

interface SellerPerformanceResponse {
  sellers: Array<{
    uuid: string;
    name: string;
    daysWorked: number;
    totalChecks: number;
    totalRevenue: number;
    avgCheck: number;
    avgDailyRev: number;
  }>;
  days: number;
}

function formatRev(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

export function SellerPerformanceWidget() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["seller-performance", 30],
    queryFn: async () => {
      const res = await client.api.employees["seller-performance"].$get({
        query: { days: "30" },
      });
      return res.json() as Promise<SellerPerformanceResponse>;
    },
    refetchInterval: 300_000,
  });

  if (isLoading) return null;
  if (!data?.sellers?.length) return null;

  const top3 = data.sellers.slice(0, 3);
  const totalRev = top3.reduce((s, x) => s + x.totalRevenue, 0);

  return (
    <div className="w-full mb-4">
      <div
        onClick={() => navigate("/evotor/seller-performance")}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Продавцы · 30 дней
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </div>

        {/* Top 3 mini cards */}
        <div className="px-4 py-2 space-y-1.5">
          {top3.map((s, i) => {
            const colors = ["#10b981", "#3b82f6", "#8b5cf6"];
            const share = totalRev > 0 ? Math.round((s.totalRevenue / totalRev) * 100) : 0;
            return (
              <div key={s.uuid} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-right font-bold text-gray-400">{i + 1}</span>
                <span className="font-medium text-gray-700 dark:text-gray-300 w-24 truncate">
                  {s.name}
                </span>
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${share}%`, backgroundColor: colors[i] }}
                  />
                </div>
                <span className="font-bold text-gray-800 dark:text-gray-200 w-14 text-right">
                  {formatRev(s.totalRevenue)}₽
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-750 text-[10px] text-gray-500 text-center border-t border-gray-100 dark:border-gray-700">
          Нажми для подробного анализа →
        </div>
      </div>
    </div>
  );
}

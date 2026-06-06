import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useSalesCalculations } from "@/hooks/dashboard/useSalesCalculations";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { RevenueCard } from "@/widgets/dashboard/cards/RevenueCard";
import { RevenueDetailsAdmin } from "@/widgets/dashboard/cards/RevenueDetailsAdmin";
import { RevenueDetailsUser } from "@/widgets/dashboard/cards/RevenueDetailsUser";
import { LoadingTile } from "./widgetUtils";
import { DollarSign } from "lucide-react";

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

export function RevenueWidget({ since, until, expanded, onToggle }: Props) {
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;

  const { data, loading, error } = useSalesData({ since, until, shopUuid, enabled: true });
  const filtered = useFilteredSalesData(data, isSuperAdmin, ws ?? null);
  const { netSales } = useSalesCalculations(filtered);

  if (loading || !filtered) return <LoadingTile title="Выручка" Icon={DollarSign} tone="blue" />;
  if (error) return <div className="text-red-500 text-sm p-2">Ошибка: {error}</div>;

  return (
    <div>
      <div onClick={onToggle} className={`rounded-xl transition-all duration-300 ${expanded ? "ring-2 ring-blue-500 scale-[1.01]" : "hover:-translate-y-0.5 cursor-pointer"}`}>
        <RevenueCard value={netSales} onClick={() => {}} />
      </div>
      {expanded && (
        <div className="mt-3">
          {isSuperAdmin ? (
            <RevenueDetailsAdmin
              salesDataByShopName={filtered.salesDataByShopName}
              grandTotalSell={filtered.grandTotalSell}
              grandTotalRefund={filtered.grandTotalRefund}
              netRevenue={filtered.netRevenue}
              averageCheck={filtered.averageCheck}
              totalChecks={filtered.totalChecks}
              since={since} until={until}
            />
          ) : (
            <RevenueDetailsUser salesDataByShopName={filtered.salesDataByShopName} />
          )}
        </div>
      )}
    </div>
  );
}

import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useSalesCalculations } from "@/hooks/dashboard/useSalesCalculations";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { RevenueCard } from "@/widgets/dashboard/cards/RevenueCard";
import { RevenueDetailsAdmin } from "@/widgets/dashboard/cards/RevenueDetailsAdmin";
import { RevenueDetailsUser } from "@/widgets/dashboard/cards/RevenueDetailsUser";
import { LoadingTile, type LucideIcon } from "./widgetUtils";
import { DollarSign } from "lucide-react";
import { useState } from "react";

interface Props { since: string; until: string }

export function RevenueWidget({ since, until }: Props) {
  const [open, setOpen] = useState(false);
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
      <div className={open ? "ring-2 ring-blue-500 scale-[1.01] rounded-xl" : "hover:-translate-y-0.5"} style={{ transition: "all 0.3s" }}>
        <RevenueCard value={netSales} onClick={() => setOpen(!open)} />
      </div>
      {open && (
        <div className="mt-3">
          {isSuperAdmin ? (
            <RevenueDetailsAdmin
              salesDataByShopName={filtered.salesDataByShopName}
              grandTotalSell={filtered.grandTotalSell}
              grandTotalRefund={filtered.grandTotalRefund}
              netRevenue={filtered.netRevenue}
              averageCheck={filtered.averageCheck}
              totalChecks={filtered.totalChecks}
              since={since}
              until={until}
            />
          ) : (
            <RevenueDetailsUser salesDataByShopName={filtered.salesDataByShopName} />
          )}
        </div>
      )}
    </div>
  );
}

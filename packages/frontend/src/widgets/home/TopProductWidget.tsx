import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { TopProductCard, type TopProductMetricMode, type TopProductRefundFilter } from "@/widgets/dashboard/cards/TopProductCard";
import { TopProductsDetails } from "@/widgets/dashboard/cards/TopProductsDetails";
import { LoadingTile, EmptyTile } from "./widgetUtils";
import { Package } from "lucide-react";
import { useState } from "react";

interface Props { since: string; until: string }

export function TopProductWidget({ since, until }: Props) {
  const [open, setOpen] = useState(false);
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;

  const { data, loading } = useSalesData({ since, until, shopUuid, enabled: true });
  const filtered = useFilteredSalesData(data, isSuperAdmin, ws ?? null);

  const metricMode: TopProductMetricMode = "revenue";
  const refundFilter: TopProductRefundFilter = "all";

  if (loading || !filtered) return <LoadingTile title="Топ продукт" Icon={Package} tone="pink" />;

  if (!filtered.topProducts?.length)
    return <EmptyTile title="Топ продукт" Icon={Package} tone="pink" />;

  return (
    <div>
      <div className={open ? "ring-2 ring-pink-500 scale-[1.01] rounded-xl" : "hover:-translate-y-0.5"} style={{ transition: "all 0.3s" }}>
        <TopProductCard
          topProducts={filtered.topProducts}
          previousTopProducts={[]}
          metricMode={metricMode}
          refundFilter={refundFilter}
          onClick={() => setOpen(!open)}
        />
      </div>
      {open && (
        <div className="mt-3">
          <TopProductsDetails
            topProducts={filtered.topProducts}
            metricMode={metricMode}
            refundFilter={refundFilter}
          />
        </div>
      )}
    </div>
  );
}

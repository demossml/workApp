import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { RevenueTempoCard } from "@/widgets/dashboard/cards/RevenueTempoCard";
import { RevenueTempoDetails } from "@/widgets/dashboard/cards/RevenueTempoCard";
import { useAccessoriesSales } from "@/hooks/dashboard/useAccessoriesSales";
import { useMe } from "@/hooks/useApi";
import { LoadingTile } from "./widgetUtils";
import { DollarSign } from "lucide-react";
import { useState } from "react";

interface Props { since: string; until: string }

export function SalesTempoWidget({ since, until }: Props) {
  const [open, setOpen] = useState(false);
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;
  const me = useMe();

  const { data, loading } = useSalesData({ since, until, shopUuid, enabled: true });
  const filtered = useFilteredSalesData(data, isSuperAdmin, ws ?? null);

  const prevUntil = new Date(since);
  prevUntil.setDate(prevUntil.getDate() - 1);
  const prevSince = new Date(prevUntil);
  prevSince.setDate(prevSince.getDate() - (new Date(until).getDate() - new Date(since).getDate()));
  const prevS = prevSince.toISOString().slice(0, 10);
  const prevU = prevUntil.toISOString().slice(0, 10);

  const prevData = useSalesData({ since: prevS, until: prevU, shopUuid, enabled: true, pollIntervalMs: 0 });
  const prevFiltered = useFilteredSalesData(prevData.data, isSuperAdmin, ws ?? null);

  const accessories = useAccessoriesSales({
    role: role?.employeeRole || "CASHIER",
    userId: me.data?.id ?? "",
    since,
    until,
    enabled: open,
  });

  if (loading || !filtered) return <LoadingTile title="Темп продаж" Icon={DollarSign} tone="indigo" />;

  const salesDeltaPct = prevFiltered?.netRevenue
    ? Math.round(((filtered.netRevenue - prevFiltered.netRevenue) / prevFiltered.netRevenue) * 100)
    : 0;

  return (
    <div>
      <div className={open ? "ring-2 ring-slate-500 scale-[1.01] rounded-xl" : "hover:-translate-y-0.5"} style={{ transition: "all 0.3s" }}>
        <RevenueTempoCard salesDeltaPct={salesDeltaPct} onClick={() => setOpen(!open)} pace={0} />
      </div>
      {open && (
        <div className="mt-3">
          <RevenueTempoDetails
            since={since}
            currentData={filtered}
            previousData={prevFiltered}
            accessoriesData={accessories.data}
          />
        </div>
      )}
    </div>
  );
}

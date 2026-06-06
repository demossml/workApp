import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { ExpensesCard } from "@/widgets/dashboard/cards/ExpensesCard";
import { FinancialReportDetails } from "@/widgets/dashboard/cards/FinancialReportDetails";
import { LoadingTile } from "./widgetUtils";
import { ShoppingCart } from "lucide-react";
import { useState } from "react";

interface Props { since: string; until: string }

export function FinanceWidget({ since, until }: Props) {
  const [open, setOpen] = useState(false);
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;

  const { data, loading, error } = useSalesData({ since, until, shopUuid, enabled: true });
  const filtered = useFilteredSalesData(data, isSuperAdmin, ws ?? null);

  if (loading || !filtered) return <LoadingTile title="Фин. отчёт" Icon={ShoppingCart} tone="orange" />;
  if (error) return <div className="text-red-500 text-sm p-2">Ошибка: {error}</div>;

  return (
    <div>
      <div className={open ? "ring-2 ring-orange-500 scale-[1.01] rounded-xl" : "hover:-translate-y-0.5"} style={{ transition: "all 0.3s" }}>
        <ExpensesCard
          value={filtered.grandTotalCashOutcome}
          onClick={() => setOpen(!open)}
          label="Фин. отчёт"
          cashBalanceByShop={filtered.cashBalanceByShop}
          salesDataByShopName={filtered.salesDataByShopName}
        />
      </div>
      {open && (
        <div className="mt-3">
          <FinancialReportDetails
            salesDataByShopName={filtered.salesDataByShopName}
            cashOutcomeData={filtered.cashOutcomeData}
            cashBalanceByShop={filtered.cashBalanceByShop}
            grandTotalSell={filtered.grandTotalSell}
            grandTotalRefund={filtered.grandTotalRefund}
            grandTotalCashOutcome={filtered.grandTotalCashOutcome}
            totalCashBalance={filtered.totalCashBalance}
          />
        </div>
      )}
    </div>
  );
}

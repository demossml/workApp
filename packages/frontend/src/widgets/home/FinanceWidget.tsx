import { useSalesData } from "@/hooks/dashboard/useSalesData";
import { useFilteredSalesData } from "@/hooks/dashboard/useFilteredSalesData";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { ExpensesCard } from "@/widgets/dashboard/cards/ExpensesCard";
import { FinancialReportDetails } from "@/widgets/dashboard/cards/FinancialReportDetails";
import { LoadingTile } from "./widgetUtils";
import { ShoppingCart } from "lucide-react";

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

export function FinanceWidget({ since, until, expanded, onToggle }: Props) {
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
      <div onClick={onToggle} className={`rounded-xl transition-all duration-300 ${expanded ? "ring-2 ring-orange-500 scale-[1.01]" : "hover:-translate-y-0.5 cursor-pointer"}`}>
        <ExpensesCard
          value={filtered.grandTotalCashOutcome}
          onClick={() => {}}
          label="Фин. отчёт"
          cashBalanceByShop={filtered.cashBalanceByShop}
          salesDataByShopName={filtered.salesDataByShopName}
        />
      </div>
      {expanded && (
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

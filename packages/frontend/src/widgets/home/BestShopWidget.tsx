import { useDashboardHomeInsights } from "@/hooks/dashboard/useDashboardHomeInsights";
import { useEmployeeRole } from "@/hooks/useApi";
import { useCurrentWorkShop } from "@/hooks/useCurrentWorkShop";
import { BestShopCard, type LeaderMode } from "@/widgets/dashboard/cards/BestShopCard";
import { BestShopDetails } from "@/widgets/dashboard/cards/BestShopDetails";
import { LoadingTile } from "./widgetUtils";
import { Store } from "lucide-react";
import { useState } from "react";

interface Props { since: string; until: string; dateMode: "today" | "yesterday" | "period" }

export function BestShopWidget({ since, until, dateMode }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LeaderMode>("day");
  const { data: role } = useEmployeeRole();
  const { data: ws } = useCurrentWorkShop();
  const isSuperAdmin = role?.employeeRole === "SUPERADMIN";
  const shopUuid = isSuperAdmin ? undefined : ws?.uuid || undefined;

  const insights = useDashboardHomeInsights({ since, until, dateMode, shopUuid, enabled: true });
  const { data: aiInsights, bestShop, loading } = insights;

  const dayLeader = bestShop.dayLeader;
  const weekLeader = bestShop.weekLeader;
  const activeRows = mode === "week" ? bestShop.weekRows : bestShop.dayRows;

  if (loading && !dayLeader && !weekLeader)
    return <LoadingTile title="Лучший магазин" Icon={Store} tone="purple" />;
  if (!dayLeader && !weekLeader)
    return <LoadingTile title="Лучший магазин" Icon={Store} tone="purple" />;

  return (
    <div>
      <div className={open ? "ring-2 ring-purple-500 scale-[1.01] rounded-xl" : "hover:-translate-y-0.5"} style={{ transition: "all 0.3s" }}>
        <BestShopCard dayLeader={dayLeader} weekLeader={weekLeader} mode={mode} onClick={() => setOpen(!open)} />
      </div>
      {open && (
        <div className="mt-3">
          <BestShopDetails
            shops={activeRows}
            mode={mode}
            dayLeader={dayLeader}
            weekLeader={weekLeader}
            onModeChange={setMode}
          />
        </div>
      )}
    </div>
  );
}

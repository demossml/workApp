import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Cherry } from "lucide-react";
import { useAccessoriesSales, type AccessoriesSalesData } from "@/hooks/dashboard/useAccessoriesSales";
import { useEmployeeRole, useMe } from "@/hooks/useApi";
import { LoadingTile } from "./widgetUtils";

interface Props { since: string; until: string }

// ── AccessoriesCard (inline — simple card) ──
function AccCard({ value, onClick }: { value: number; onClick: () => void }) {
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="bg-blue-100 dark:bg-blue-900 rounded-lg p-4 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 transition h-[120px] flex flex-col justify-between"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-600 dark:text-gray-300">Аксессуары</div>
        <Cherry className="w-6 h-6 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="text-2xl font-bold text-blue-800 dark:text-blue-200">{value.toLocaleString()} ₽</div>
    </motion.div>
  );
}

// ── AccessoriesDetails (inline) ──
function AccDetails({
  data, shopFilter, onShopFilterChange, shopOptions, productScope, onProductScopeChange,
}: {
  data: AccessoriesSalesData;
  shopFilter: string;
  onShopFilterChange: (v: string) => void;
  shopOptions: string[];
  productScope: "accessories" | "nonAccessories";
  onProductScopeChange: (v: "accessories" | "nonAccessories") => void;
}) {
  const sorted = [...data.total].sort((a, b) => b.sum - a.sum);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Продажи</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 text-[11px] dark:border-gray-600 dark:bg-gray-700">
            <button className={`rounded px-2 py-1 ${productScope === "accessories" ? "bg-slate-700 text-white" : "text-gray-600 dark:text-gray-300"}`} onClick={() => onProductScopeChange("accessories")}>Акс.</button>
            <button className={`rounded px-2 py-1 ${productScope === "nonAccessories" ? "bg-slate-700 text-white" : "text-gray-600 dark:text-gray-300"}`} onClick={() => onProductScopeChange("nonAccessories")}>Не акс.</button>
          </div>
          {shopOptions.length > 1 && (
            <select className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200" value={shopFilter} onChange={(e) => onShopFilterChange(e.target.value)}>
              <option value="all">Все магазины</option>
              {shopOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>
      </div>
      <ul>
        {sorted.map((sale, idx) => (
          <li key={sale.name} className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-gray-800 dark:text-gray-300">{idx + 1}.</span>
              <span className="font-bold text-sm text-gray-900 dark:text-white">{sale.name}</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-blue-700 dark:text-blue-400">{sale.sum.toLocaleString()} ₽</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">{sale.quantity} шт</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main widget ──
export function AccessoriesWidget({ since, until }: Props) {
  const [open, setOpen] = useState(false);
  const [shopFilter, setShopFilter] = useState("all");
  const [scope, setScope] = useState<"accessories" | "nonAccessories">("accessories");

  const { data: role } = useEmployeeRole();
  const me = useMe();
  const { data, loading, error } = useAccessoriesSales({
    role: role?.employeeRole || "CASHIER",
    userId: me.data?.id ?? "",
    since, until,
    enabled: true,
  });

  const shopOptions = useMemo(() => {
    const names = new Set<string>();
    data?.total?.forEach((i: any) => { if (i.shopName) names.add(i.shopName); });
    return Array.from(names);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (shopFilter === "all") return data;
    return {
      ...data,
      total: data.total.filter((i: any) => i.shopName === shopFilter),
    };
  }, [data, shopFilter]);

  const tileValue = useMemo(() => {
    if (!filtered) return 0;
    return filtered.total.reduce((s: number, i: any) => s + i.sum, 0);
  }, [filtered]);

  if (loading) return <LoadingTile title="Аксессуары" Icon={Cherry} tone="cyan" />;
  if (error) return <div className="text-red-500 text-sm p-2">Ошибка: {error}</div>;
  if (!data?.total?.length) return null;

  return (
    <div>
      <div className={open ? "ring-2 ring-cyan-500 scale-[1.01] rounded-xl" : "hover:-translate-y-0.5"} style={{ transition: "all 0.3s" }}>
        <AccCard value={tileValue} onClick={() => setOpen(!open)} />
      </div>
      {open && filtered && (
        <div className="mt-3">
          <AccDetails
            data={filtered}
            shopFilter={shopFilter}
            onShopFilterChange={setShopFilter}
            shopOptions={shopOptions}
            productScope={scope}
            onProductScopeChange={setScope}
          />
        </div>
      )}
    </div>
  );
}

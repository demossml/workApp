import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Clock, User, ChevronDown, ChevronUp, Wallet, Package, ShoppingBag } from "lucide-react";
import { isTelegramMiniApp, telegram } from "@/helpers/telegram";

// ── types ──

interface ShopRow {
  uuid: string;
  name: string;
  vapePlan: number;
  vapeFact: number;
  vapePct: number;
  openedTime: string | null;
  openedBy: string | null;
  isLate: boolean;
  isOpen: boolean;
}

interface PulseItem {
  storeName: string;
  productName: string;
  quantity: number;
  revenue: number;
}

interface PulseData {
  topProducts: PulseItem[];
  accessories: PulseItem[];
  cashByShop: Record<string, number>;
  totalCash: number;
}

// ── helpers ──

function fmtRub(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}K ₽`;
  return `${Math.round(n)} ₽`;
}

function fmtCash(n: number): string {
  if (n >= 1000) {
    const k = Math.floor(n / 1000);
    const rest = Math.round(n % 1000).toString().padStart(3, "0");
    return `${k} ${rest} ₽`;
  }
  return `${Math.round(n)} ₽`;
}

function fmtFirstName(fullName: string | null): string {
  if (!fullName) return "";
  return fullName.split(" ")[0] || fullName;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── fetch ──

async function fetchNetworkData() {
  const [planRes, sessionsRes] = await Promise.all([
    fetch("/api/evotor/plan-for-today").then((r) => r.json()),
    fetch("/api/stores/pos-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: todayStr() }),
    }).then((r) => r.json()),
  ]);

  const sessions = sessionsRes?.sessions ?? [];
  const salesData = planRes?.salesData ?? {};

  const shops: ShopRow[] = Object.entries(salesData).map(([shopName, shop]: [string, any]) => {
    const session = sessions.find((s: any) => s.shopName === shopName);
    const vapeFact = shop?.dataSales ?? 0;
    const vapePlan = shop?.datePlan ?? 0;
    const vapePct = vapePlan > 0 ? Math.min(Math.round((vapeFact / vapePlan) * 100), 100) : 0;
    return {
      uuid: shopName,
      name: shopName,
      vapePlan,
      vapeFact,
      vapePct,
      openedTime: session?.openedTime ?? null,
      openedBy: session?.openedByName ?? null,
      isLate: session?.isLate ?? false,
      isOpen: !!session,
    };
  });

  return { shops };
}

async function fetchPulse(params?: { since?: string; until?: string; storeUuid?: string }): Promise<PulseData> {
  const qs = new URLSearchParams();
  if (params?.since) qs.set("since", params.since);
  if (params?.until) qs.set("until", params.until);
  if (params?.storeUuid) qs.set("storeUuid", params.storeUuid);
  const url = "/api/evotor/today-pulse" + (qs.toString() ? "?" + qs.toString() : "");
  const r = await fetch(url);
  return r.json();
}

// ── component ──

export function NetworkPulse() {
  const [expanded, setExpanded] = useState(false);
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [selectedStore, setSelectedStore] = useState("");

  const { data: netData, isLoading: netLoading } = useQuery({
    queryKey: ["network-pulse"],
    queryFn: fetchNetworkData,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const pulseParams = expanded
    ? { since: dateFrom + "T00:00:00+03:00", until: dateTo + "T23:59:59+03:00", storeUuid: selectedStore || "" }
    : undefined;

  const { data: pulseData, isLoading: pulseLoading } = useQuery({
    queryKey: ["today-pulse", dateFrom, dateTo, selectedStore],
    queryFn: () => fetchPulse(pulseParams),
    staleTime: 60_000,
    enabled: expanded,
  });

  const toggle = useCallback(() => {
    if (isTelegramMiniApp()) telegram.WebApp.HapticFeedback.impactOccurred("light");
    setExpanded((v) => !v);
  }, []);

  // ── Loading: collapsed ──
  if (netLoading || !netData) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 animate-pulse">
        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-gray-100 dark:bg-gray-750 rounded-lg mb-2" />
        ))}
      </div>
    );
  }

  const { shops } = netData;
  const totalVape = shops.reduce((s, sh) => s + sh.vapeFact, 0);
  const openCount = shops.filter((s) => s.isOpen).length;
  const shopOptions = shops.map((s) => ({ uuid: s.uuid, name: s.name }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
    >
      {/* ── Header (tappable) ── */}
      <button
        onClick={toggle}
        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-750 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <Building2 className="w-3.5 h-3.5" />
        Сеть сегодня
        <span className="ml-auto font-normal normal-case text-gray-400">
          {openCount}/{shops.length} открыто
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* ── Collapsed: store rows ── */}
      <div className="p-3 space-y-0.5">
        {shops.map((shop) => (
          <div
            key={shop.uuid}
            className="flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
          >
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                shop.isOpen ? (shop.isLate ? "bg-amber-500" : "bg-emerald-500") : "bg-red-500"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{shop.name}</div>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                {shop.isOpen ? (
                  <>
                    <Clock className="w-2.5 h-2.5 shrink-0" />
                    <span>{shop.openedTime}</span>
                    {shop.isLate && <span className="text-amber-500 font-medium">опоздание</span>}
                    {shop.openedBy && (
                      <>
                        <span className="text-gray-300 dark:text-gray-600">·</span>
                        <User className="w-2.5 h-2.5 shrink-0" />
                        <span>{fmtFirstName(shop.openedBy)}</span>
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-red-400">Не открыт</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 min-w-[48px]">
              <div className="text-xs font-bold text-gray-800 dark:text-gray-100">{fmtRub(shop.vapeFact)}</div>
              <div className="text-[9px] text-gray-400">вейпы</div>
            </div>
            <div className="w-14 shrink-0">
              <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    shop.vapePct >= 80 ? "bg-emerald-500" : shop.vapePct >= 50 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${shop.vapePct}%` }}
                />
              </div>
              <div className="text-[9px] text-gray-400 text-right mt-0.5">{shop.vapePct}%</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Footer: collapsed ── */}
      <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
        <span>Итого вейпы: {fmtRub(totalVape)}</span>
        <span>{shops.length} магазина</span>
      </div>

      {/* ── Expanded: касса + топ-10 + аксессуары ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 dark:border-gray-700">
              {/* Фильтры: период + магазин */}
              <div className="px-3 py-2 flex flex-wrap items-center gap-2 bg-gray-50/50 dark:bg-gray-750/50">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-[11px] px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 w-[130px]"
                />
                <span className="text-[10px] text-gray-400">–</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-[11px] px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 w-[130px]"
                />
                <select
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                  className="text-[11px] px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 ml-auto"
                >
                  <option value="">Все магазины</option>
                  {shopOptions.map((s) => (
                    <option key={s.uuid} value={s.uuid}>{s.name}</option>
                  ))}
                </select>
              </div>

              {pulseLoading ? (
                <div className="p-4 animate-pulse space-y-2">
                  <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-6 bg-gray-100 dark:bg-gray-750 rounded" />
                  <div className="h-6 bg-gray-100 dark:bg-gray-750 rounded" />
                </div>
              ) : pulseData ? (
                <div className="max-h-[65vh] overflow-y-auto">
                  {/* ── Касса ── */}
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Wallet className="w-3 h-3 text-gray-400" />
                      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Остаток в кассе
                      </span>
                      {pulseData.totalCash > 0 && (
                        <span className="text-[10px] text-gray-400 ml-auto">{fmtCash(pulseData.totalCash)}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {Object.entries(pulseData.cashByShop).map(([shop, bal]) => (
                        <div key={shop} className="flex items-baseline gap-1.5 text-[11px]">
                          <span className="text-gray-500 dark:text-gray-400">{shop}</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">{fmtCash(bal)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Топ-10 товаров ── */}
                  <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <ShoppingBag className="w-3 h-3 text-gray-400" />
                      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Топ-10 товаров
                      </span>
                    </div>
                    <div className="space-y-1">
                      {pulseData.topProducts.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <span className="text-gray-300 dark:text-gray-600 w-3 text-right text-[10px]">{i + 1}</span>
                          <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{item.productName}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">{item.quantity} шт</span>
                          <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 w-14 text-right shrink-0">
                            {fmtRub(item.revenue)}
                          </span>
                        </div>
                      ))}
                      {pulseData.topProducts.length === 0 && (
                        <div className="text-[10px] text-gray-400 py-2">Нет продаж за выбранный период</div>
                      )}
                    </div>
                  </div>

                  {/* ── Все аксессуары ── */}
                  <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Package className="w-3 h-3 text-gray-400" />
                      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Аксессуары
                      </span>
                      {pulseData.accessories.length > 0 && (
                        <span className="text-[10px] text-gray-400">
                          {pulseData.accessories.reduce((s, a) => s + a.revenue, 0) > 0
                            ? fmtRub(pulseData.accessories.reduce((s, a) => s + a.revenue, 0))
                            : ""}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {pulseData.accessories.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{item.productName}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">{item.quantity} шт</span>
                          <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 w-14 text-right shrink-0">
                            {fmtRub(item.revenue)}
                          </span>
                          <span className="text-[9px] text-gray-400 w-16 truncate text-right shrink-0">
                            {item.storeName}
                          </span>
                        </div>
                      ))}
                      {pulseData.accessories.length === 0 && (
                        <div className="text-[10px] text-gray-400 py-2">Нет аксессуаров за выбранный период</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

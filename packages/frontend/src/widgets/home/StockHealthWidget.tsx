import React from "react";

type StockItem = {
  name: string;
  quantity: number;
  shopName: string;
  velocity?: number;
  daysLeft?: number;
};

type OutOfStockItem = {
  name: string;
  soldQty: number;
  velocity: number;
  lostRevenuePerDay: number;
  shopName: string;
};

type TransferRec = {
  productName: string;
  fromShop: string;
  fromShopName: string;
  deadQuantity: number;
  toShop: string;
  toShopName: string;
  soldQty14d: number;
  velocity: number;
  toShopQuantity: number;
};

type StockHealthData = {
  deadStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalLostPerDay: number;
  deadStock: Array<StockItem>;
  lowStock: Array<StockItem>;
  outOfStock: Array<OutOfStockItem>;
  byShop: Array<{
    shopUuid: string;
    shopName: string;
    deadStock: Array<StockItem>;
    lowStock: Array<StockItem>;
    outOfStock: Array<OutOfStockItem>;
  }>;
};

function formatMoney(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

export function StockHealthWidget() {
  const [data, setData] = React.useState<StockHealthData | null>(null);
  const [transferData, setTransferData] = React.useState<TransferRec[]>([]);
  const [selectedShop, setSelectedShop] = React.useState("all");
  const [expandedDead, setExpandedDead] = React.useState(false);
  const [expandedLow, setExpandedLow] = React.useState(false);
  const [expandedOOS, setExpandedOOS] = React.useState(false);
  const [onlyTransfers, setOnlyTransfers] = React.useState(false);
  const [deadDays, setDeadDays] = React.useState(14);
  const [exportUrl, setExportUrl] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setExportUrl(null);
    setLoading(true);
    const fetchData = async () => {
      try {
        const resp = await fetch("/api/ai/director/stock-health", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: deadDays }),
        });
        if (cancelled) return;
        if (resp.ok) {
          const json = await resp.json();
          setData(json);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const fetchTransfer = async () => {
      try {
        const resp = await fetch("/api/ai/director/stock-transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: deadDays }),
        });
        if (cancelled) return;
        if (resp.ok) {
          const json = await resp.json();
          setTransferData(json.recommendations || []);
        }
      } catch {
        // silent
      }
    };
    void fetchData();
    void fetchTransfer();
    return () => { cancelled = true; };
  }, [deadDays]);

  // Build transfer map: "fromShopName|productName" → best recommendation
  const transferMap = React.useMemo(() => {
    const map = new Map<string, TransferRec>();
    for (const rec of transferData) {
      const key = `${rec.fromShopName}|${rec.productName}`;
      const existing = map.get(key);
      if (!existing || rec.soldQty14d > existing.soldQty14d) {
        map.set(key, rec);
      }
    }
    return map;
  }, [transferData]);

  const shops =
    data?.byShop?.map((s) => ({ uuid: s.shopUuid, name: s.shopName })) || [];

  const getFilteredDead = () => {
    if (!data) return [];
    if (selectedShop === "all") return data.deadStock;
    const shop = data.byShop?.find(
      (s) => s.shopUuid === selectedShop || s.shopName === selectedShop
    );
    return shop?.deadStock || [];
  };

  const getFilteredLow = () => {
    if (!data) return [];
    if (selectedShop === "all") return data.lowStock;
    const shop = data.byShop?.find(
      (s) => s.shopUuid === selectedShop || s.shopName === selectedShop
    );
    return shop?.lowStock || [];
  };

  const getFilteredOOS = () => {
    if (!data) return [];
    if (selectedShop === "all") return data.outOfStock;
    const shop = data.byShop?.find(
      (s) => s.shopUuid === selectedShop || s.shopName === selectedShop
    );
    return shop?.outOfStock || [];
  };

  const getTransferFor = (item: StockItem): TransferRec | null => {
    const key = `${item.shopName}|${item.name}`;
    return transferMap.get(key) || null;
  };

  const filteredDead = getFilteredDead();
  const filteredLow = getFilteredLow();
  const filteredOOS = getFilteredOOS();
  const deadCount = filteredDead.length;
  const lowCount = filteredLow.length;
  const oosCount = filteredOOS.length;

  const displayDead = React.useMemo(() => {
    if (!expandedDead) return [] as StockItem[];
    return onlyTransfers
      ? filteredDead.filter((item) => getTransferFor(item) !== null)
      : filteredDead;
  }, [expandedDead, onlyTransfers, filteredDead]);
  const transferCount = React.useMemo(() =>
    expandedDead ? filteredDead.filter((item) => getTransferFor(item) !== null).length : 0,
    [expandedDead, filteredDead]);
  const lostPerDay = filteredOOS.reduce((s, i) => s + i.lostRevenuePerDay, 0);

  const collapseAll = (except?: string) => {
    if (except !== "dead") setExpandedDead(false);
    if (except !== "low") setExpandedLow(false);
    if (except !== "oos") setExpandedOOS(false);
    setOnlyTransfers(false);
  };

  if (
    !data ||
    (data.deadStockCount === 0 &&
      data.lowStockCount === 0 &&
      data.outOfStockCount === 0)
  )
    return null;

  return (
    <div className="mb-4 rounded-xl bg-white dark:bg-gray-800 p-4 shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Состояние остатков
          </h3>
          {loading && (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          )}
        </div>
        {shops.length > 1 && (
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            value={selectedShop}
            onChange={(e) => {
              setSelectedShop(e.target.value);
              collapseAll();
            }}
          >
            <option value="all">Все магазины</option>
            {shops.map((shop) => (
              <option key={shop.uuid} value={shop.uuid}>
                {shop.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Dead Stock Tile */}
        <button
          type="button"
          className={`rounded-lg bg-red-50 dark:bg-red-950/20 px-3 py-2 text-left transition-all ${
            expandedDead
              ? "ring-2 ring-red-500 scale-[1.02]"
              : "hover:-translate-y-0.5 active:scale-[0.98]"
          }`}
          onClick={() => {
            collapseAll("dead");
            setExpandedDead(!expandedDead);
          }}
        >
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {deadCount}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Мёртвый сток
          </div>
        </button>

        {/* Low Stock Tile */}
        <button
          type="button"
          className={`rounded-lg bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-left transition-all ${
            expandedLow
              ? "ring-2 ring-amber-500 scale-[1.02]"
              : "hover:-translate-y-0.5 active:scale-[0.98]"
          }`}
          onClick={() => {
            collapseAll("low");
            setExpandedLow(!expandedLow);
          }}
        >
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {lowCount}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Заканчиваются
          </div>
        </button>

        {/* Out of Stock Tile */}
        <button
          type="button"
          className={`rounded-lg bg-blue-50 dark:bg-blue-950/20 px-3 py-2 text-left transition-all ${
            expandedOOS
              ? "ring-2 ring-blue-500 scale-[1.02]"
              : "hover:-translate-y-0.5 active:scale-[0.98]"
          }`}
          onClick={() => {
            collapseAll("oos");
            setExpandedOOS(!expandedOOS);
          }}
        >
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {oosCount}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Нет в наличии
          </div>
        </button>
      </div>

      {/* Expanded Dead Stock */}
      {expandedDead && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-gray-500">
              Мёртвый сток (нет продаж {deadDays} дн.)
              {selectedShop !== "all" &&
                ` — ${
                  shops.find((s) => s.uuid === selectedShop)?.name ||
                  selectedShop
                }`}
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-md border border-gray-300 bg-white px-1 py-0.5 text-[10px] text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                value={deadDays}
                onChange={(e) => setDeadDays(Number(e.target.value))}
              >
                <option value={14}>14 дн</option>
                <option value={30}>30 дн</option>
                <option value={60}>60 дн</option>
              </select>
              {transferCount > 0 && (
                <label className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyTransfers}
                    onChange={() => setOnlyTransfers(!onlyTransfers)}
                    className="w-3 h-3 accent-purple-600"
                  />
                  Только перемещение
                </label>
              )}
            </div>
          </div>
          {displayDead.length === 0 ? (
            <div className="text-xs text-gray-400">Нет позиций</div>
          ) : (
            <div className="max-h-[40vh] overflow-y-auto">
            <ul className="space-y-1">
              {displayDead.map((item, idx) => {
                const transfer = getTransferFor(item);
                return (
                  <li
                    key={idx}
                    className="text-xs py-0.5 border-b border-gray-100 dark:border-gray-700 last:border-0"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-800 dark:text-gray-200 truncate">
                        {selectedShop === "all" ? `${item.shopName}: ` : ""}
                        {item.name}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 shrink-0">
                        {item.quantity} шт
                      </span>
                    </div>
                    {transfer && (
                      <div className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5 pl-1">
                        ← Из <strong>{item.shopName}</strong> → в <strong>{transfer.toShopName}</strong>
                        {" — "}
                        продано {transfer.soldQty14d} шт за {deadDays} дн, осталось{" "}
                        {transfer.deadQuantity} шт
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            </div>
          )}
          {displayDead.length > 0 && (
            <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              {exportUrl ? (
                <div className="text-[10px] text-green-600 dark:text-green-400 break-all">
                  <a href={exportUrl} target="_blank" rel="noopener" className="underline">
                    Открыть отчёт
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      const exportItems = displayDead.map((item) => {
                        const transfer = getTransferFor(item);
                        return {
                          name: item.name,
                          quantity: item.quantity,
                          shopName: item.shopName,
                          toShopName: transfer?.toShopName || null,
                          soldQty: transfer?.soldQty14d || 0,
                          deadQuantity: transfer?.deadQuantity || item.quantity,
                          toShopQuantity: transfer?.toShopQuantity || 0,
                        };
                      });
                      const resp = await fetch("/api/ai/director/deadstock-export", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          items: exportItems,
                          shop: selectedShop,
                          days: deadDays,
                        }),
                      });
                      if (resp.ok) {
                        const json = await resp.json();
                        setExportUrl(json.url);
                        window.open(json.url, "_blank");
                      }
                    } catch {
                      // silent
                    } finally {
                      setExporting(false);
                    }
                  }}
                  className="w-full py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {exporting ? "Сохраняю..." : "Сохранить"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expanded Low Stock */}
      {expandedLow && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-red-600 mb-2">
            Заканчиваются (&lt; 7 дней)
            {selectedShop !== "all" &&
              ` — ${
                shops.find((s) => s.uuid === selectedShop)?.name ||
                selectedShop
              }`}
          </div>
          {filteredLow.length === 0 ? (
            <div className="text-xs text-gray-400">Нет позиций</div>
          ) : (
            <ul className="space-y-1">
              {filteredLow.slice(0, 15).map((item, idx) => (
                <li
                  key={idx}
                  className="text-xs flex justify-between gap-2 py-0.5"
                >
                  <span className="text-gray-800 dark:text-gray-200 truncate">
                    {selectedShop === "all" ? `${item.shopName}: ` : ""}
                    {item.name}
                  </span>
                  <span className="text-red-600 dark:text-red-400 shrink-0 font-semibold">
                    {item.quantity} шт
                    {item.daysLeft != null &&
                      ` • ${
                        item.daysLeft < 0.5
                          ? "сегодня"
                          : `${item.daysLeft.toFixed(1)} д`
                      }`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Expanded Out of Stock */}
      {expandedOOS && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-2">
            Нет в наличии (продавались за 14 дн., сейчас 0 шт)
            {selectedShop !== "all" &&
              ` — ${
                shops.find((s) => s.uuid === selectedShop)?.name ||
                selectedShop
              }`}
          </div>
          {oosCount > 0 && (
            <div className="mb-3 rounded-lg bg-blue-100 dark:bg-blue-900/40 px-3 py-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
              Потери в день: ~{formatMoney(lostPerDay)} ₽
            </div>
          )}
          {filteredOOS.length === 0 ? (
            <div className="text-xs text-gray-400">Нет позиций</div>
          ) : (
            <ul className="space-y-1">
              {filteredOOS.slice(0, 15).map((item, idx) => (
                <li
                  key={idx}
                  className="text-xs flex justify-between gap-2 py-0.5"
                >
                  <span className="text-gray-800 dark:text-gray-200 truncate">
                    {selectedShop === "all" ? `${item.shopName}: ` : ""}
                    {item.name}
                  </span>
                  <span className="text-blue-600 dark:text-blue-400 shrink-0 font-semibold text-right">
                    <span className="text-gray-400 font-normal">
                      {item.soldQty} шт/14дн •
                    </span>{" "}
                    ~{formatMoney(item.lostRevenuePerDay)} ₽/д
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

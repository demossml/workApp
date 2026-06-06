import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@shared/api";

export interface StockItem {
  name: string;
  quantity: number;
  shopName: string;
  velocity?: number;
  daysLeft?: number;
}

export interface OutOfStockItem {
  name: string;
  soldQty: number;
  velocity: number;
  lostRevenuePerDay: number;
  shopName: string;
}

export interface TransferRec {
  productName: string;
  fromShop: string;
  fromShopName: string;
  deadQuantity: number;
  toShop: string;
  toShopName: string;
  soldQty14d: number;
  velocity: number;
  toShopQuantity: number;
}

export interface StockHealthData {
  deadStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalProducts: number;
  totalProblems: number;
  stockScore: number;
  totalLostPerDay: number;
  deadStock: StockItem[];
  lowStock: StockItem[];
  outOfStock: OutOfStockItem[];
  byShop: Array<{
    shopUuid: string;
    shopName: string;
    deadStock: StockItem[];
    lowStock: StockItem[];
    outOfStock: OutOfStockItem[];
  }>;
}

async function fetchStockHealth(days: number): Promise<StockHealthData> {
  const resp = await fetch("/api/ai/director/stock-health", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days }),
  });
  if (!resp.ok) throw new Error(`Stock health failed: ${resp.status}`);
  return resp.json();
}

async function fetchStockTransfer(days: number): Promise<{ recommendations: TransferRec[] }> {
  const resp = await fetch("/api/ai/director/stock-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days }),
  });
  if (!resp.ok) throw new Error(`Stock transfer failed: ${resp.status}`);
  return resp.json();
}

export function useStockHealth(days: number, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.stock.health(days),
    queryFn: () => fetchStockHealth(days),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled: opts?.enabled ?? true,
  });
}

export function useStockTransfer(days: number) {
  return useQuery({
    queryKey: queryKeys.stock.transfer(days),
    queryFn: () => fetchStockTransfer(days),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

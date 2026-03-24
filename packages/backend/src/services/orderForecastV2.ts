import type { IEnv } from "../types";
import { getDocumentsFromIndexFirst } from "./indexDocumentsFallback";

type ServiceLevel = 0.8 | 0.9 | 0.95 | 0.98;

export type OrderForecastV2Input = {
	db: IEnv["Bindings"]["DB"];
	evotor: IEnv["Variables"]["evotor"];
	shopUuid: string;
	groups: string[];
	startDate: string; // YYYY-MM-DD
	endDate: string; // YYYY-MM-DD
	forecastHorizonDays: number;
	leadTimeDays: number;
	serviceLevel: ServiceLevel;
	budgetLimit?: number | null;
};

export type OrderForecastV2Item = {
	productUuid: string;
	productName: string;
	abcClass: "A" | "B" | "C";
	xyzClass: "X" | "Y" | "Z";
	currentStock: number;
	inTransit: number;
	reserved: number;
	availableStock: number;
	avgDailyDemand: number;
	demandStdDev: number;
	seasonalityFactor: number;
	adjustedDailyDemand: number;
	leadTimeDays: number;
	safetyStock: number;
	reorderPoint: number;
	targetStock: number;
	recommendedOrderRaw: number;
	recommendedOrderRounded: number;
	unitCost: number;
	orderCost: number;
	expectedCoverageDays: number;
	confidence: number;
	reasonCodes: string[];
};

type StockProductMap = Record<
	string,
	{
		name?: string;
		quantity?: number | string;
		costPrice?: number | string;
	}
>;

const zByServiceLevel: Record<ServiceLevel, number> = {
	0.8: 0.84,
	0.9: 1.28,
	0.95: 1.65,
	0.98: 2.05,
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const dayKey = (date: Date) => {
	const yyyy = date.getUTCFullYear();
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(date.getUTCDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
};

const listDaysInclusive = (startDate: string, endDate: string) => {
	const start = new Date(`${startDate}T00:00:00Z`);
	const end = new Date(`${endDate}T00:00:00Z`);
	const result: string[] = [];
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return result;
	const cur = new Date(start);
	while (cur <= end) {
		result.push(dayKey(cur));
		cur.setUTCDate(cur.getUTCDate() + 1);
	}
	return result;
};

const mean = (values: number[]) =>
	values.length === 0
		? 0
		: values.reduce((sum, value) => sum + value, 0) / values.length;

const stdDev = (values: number[]) => {
	if (values.length < 2) return 0;
	const avg = mean(values);
	const variance =
		values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
	return Math.sqrt(variance);
};

const winsorize = (values: number[], lowPct = 0.05, highPct = 0.95) => {
	if (values.length < 5) return values;
	const sorted = [...values].sort((a, b) => a - b);
	const lowIdx = Math.floor((sorted.length - 1) * lowPct);
	const highIdx = Math.floor((sorted.length - 1) * highPct);
	const low = sorted[Math.max(0, lowIdx)];
	const high = sorted[Math.min(sorted.length - 1, highIdx)];
	return values.map((value) => clamp(value, low, high));
};

export async function buildOrderForecastV2(
	input: OrderForecastV2Input,
): Promise<{
	period: { startDate: string; endDate: string };
	assumptions: {
		forecastHorizonDays: number;
		leadTimeDays: number;
		serviceLevel: number;
	};
	summary: {
		totalOrderCost: number;
		skuCount: number;
		constrainedByBudget: boolean;
	};
	items: OrderForecastV2Item[];
}> {
	const productUuids = await input.evotor.getProductsByGroup(input.shopUuid, input.groups);
	const stockByProduct = (await input.evotor.getProductStockByGroups(
		input.shopUuid,
		input.groups,
	)) as StockProductMap;
	const allowed = new Set(productUuids || []);

	const fromTs = `${input.startDate}T00:00:00.000+0000`;
	const toTs = `${input.endDate}T23:59:59.000+0000`;
	const docs = await getDocumentsFromIndexFirst(
		input.db,
		input.evotor,
		input.shopUuid,
		fromTs,
		toTs,
		{ types: ["SELL", "PAYBACK"], skipFetchIfStale: true },
	);

	const days = listDaysInclusive(input.startDate, input.endDate);
	const dayIndex = new Map(days.map((key, index) => [key, index]));
	const demandByProduct = new Map<string, number[]>();
	const revenueByProduct = new Map<string, number>();

	for (const productUuid of allowed) {
		demandByProduct.set(productUuid, days.map(() => 0));
		revenueByProduct.set(productUuid, 0);
	}

	for (const doc of docs) {
		const docDay = dayIndex.get(dayKey(new Date(doc.closeDate)));
		if (docDay == null) continue;
		const sign = doc.type === "PAYBACK" ? -1 : 1;

		for (const tx of doc.transactions || []) {
			if (tx.type !== "REGISTER_POSITION") continue;
			if (!tx.commodityUuid || !allowed.has(tx.commodityUuid)) continue;
			const qty = Number(tx.quantity || 0) * sign;
			const row = demandByProduct.get(tx.commodityUuid);
			if (!row) continue;
			row[docDay] += qty;
			demandByProduct.set(tx.commodityUuid, row);

			const revenue = Number(tx.sum || 0) * sign;
			revenueByProduct.set(
				tx.commodityUuid,
				(revenueByProduct.get(tx.commodityUuid) || 0) + revenue,
			);
		}
	}

	const totalRevenue = Array.from(revenueByProduct.values()).reduce(
		(sum, value) => sum + Math.max(0, value),
		0,
	);
	const sortedRevenue = Array.from(revenueByProduct.entries()).sort(
		(a, b) => (b[1] || 0) - (a[1] || 0),
	);
	const abcByProduct = new Map<string, "A" | "B" | "C">();
	let cumulative = 0;
	for (const [productUuid, revenue] of sortedRevenue) {
		const share = totalRevenue > 0 ? Math.max(0, revenue) / totalRevenue : 0;
		cumulative += share;
		if (cumulative <= 0.8) abcByProduct.set(productUuid, "A");
		else if (cumulative <= 0.95) abcByProduct.set(productUuid, "B");
		else abcByProduct.set(productUuid, "C");
	}

	const z = zByServiceLevel[input.serviceLevel];
	const items: OrderForecastV2Item[] = Array.from(allowed).map((productUuid) => {
		const rawSeries = demandByProduct.get(productUuid) || [];
		const cleaned = winsorize(rawSeries).map((value) => Math.max(0, value));
		const avgDailyDemand = mean(cleaned);
		const demandStd = stdDev(cleaned);
		const seasonalityFactor = 1;
		const adjustedDailyDemand = avgDailyDemand * seasonalityFactor;
		const safetyStock = z * demandStd * Math.sqrt(Math.max(1, input.leadTimeDays));
		const reorderPoint = adjustedDailyDemand * input.leadTimeDays + safetyStock;
		const targetStock =
			adjustedDailyDemand * (input.leadTimeDays + input.forecastHorizonDays) +
			safetyStock;

		const stockRow = stockByProduct[productUuid] || {};
		const currentStock = Number(stockRow.quantity || 0);
		const inTransit = 0;
		const reserved = 0;
		const availableStock = Math.max(0, currentStock + inTransit - reserved);
		const recommendedOrderRaw = Math.max(0, targetStock - availableStock);
		const recommendedOrderRounded = Math.max(0, Math.ceil(recommendedOrderRaw));

		const unitCost = Math.max(0, Number(stockRow.costPrice || 0));
		const orderCost = recommendedOrderRounded * unitCost;
		const expectedCoverageDays =
			adjustedDailyDemand > 0
				? (availableStock + recommendedOrderRounded) / adjustedDailyDemand
				: 999;
		const cv = avgDailyDemand > 0 ? demandStd / avgDailyDemand : Number.POSITIVE_INFINITY;
		const xyzClass: "X" | "Y" | "Z" =
			cv <= 0.5 ? "X" : cv <= 1 ? "Y" : "Z";

		const confidence = clamp(1 - Math.min(1, cv / 2), 0.3, 0.99);
		const reasonCodes: string[] = [];
		if (availableStock < reorderPoint) reasonCodes.push("LOW_STOCK");
		if (demandStd > avgDailyDemand) reasonCodes.push("HIGH_VARIABILITY");
		if (adjustedDailyDemand <= 0.01) reasonCodes.push("LOW_DEMAND");
		if (recommendedOrderRounded > 0 && reasonCodes.length === 0) {
			reasonCodes.push("REPLENISH_TARGET");
		}

		return {
			productUuid,
			productName: String(stockRow.name || productUuid),
			abcClass: abcByProduct.get(productUuid) || "C",
			xyzClass,
			currentStock,
			inTransit,
			reserved,
			availableStock,
			avgDailyDemand,
			demandStdDev: demandStd,
			seasonalityFactor,
			adjustedDailyDemand,
			leadTimeDays: input.leadTimeDays,
			safetyStock,
			reorderPoint,
			targetStock,
			recommendedOrderRaw,
			recommendedOrderRounded,
			unitCost,
			orderCost,
			expectedCoverageDays,
			confidence,
			reasonCodes,
		};
	});

	items.sort((a, b) => {
		const abcWeight = { A: 3, B: 2, C: 1 };
		const leftScore = abcWeight[a.abcClass] * (a.adjustedDailyDemand + 0.1);
		const rightScore = abcWeight[b.abcClass] * (b.adjustedDailyDemand + 0.1);
		return rightScore - leftScore;
	});

	let constrainedByBudget = false;
	if (input.budgetLimit != null && Number.isFinite(input.budgetLimit)) {
		let remaining = Math.max(0, Number(input.budgetLimit));
		for (const item of items) {
			if (item.recommendedOrderRounded <= 0 || item.unitCost <= 0) continue;
			if (item.orderCost <= remaining) {
				remaining -= item.orderCost;
				continue;
			}
			const allowedQty = Math.max(0, Math.floor(remaining / item.unitCost));
			if (allowedQty < item.recommendedOrderRounded) {
				item.recommendedOrderRounded = allowedQty;
				item.orderCost = allowedQty * item.unitCost;
				item.reasonCodes = [...item.reasonCodes, "BUDGET_LIMIT"];
				constrainedByBudget = true;
			}
			remaining = Math.max(0, remaining - item.orderCost);
		}
	}

	const totalOrderCost = items.reduce((sum, item) => sum + item.orderCost, 0);

	return {
		period: {
			startDate: input.startDate,
			endDate: input.endDate,
		},
		assumptions: {
			forecastHorizonDays: input.forecastHorizonDays,
			leadTimeDays: input.leadTimeDays,
			serviceLevel: input.serviceLevel,
		},
		summary: {
			totalOrderCost,
			skuCount: items.filter((item) => item.recommendedOrderRounded > 0).length,
			constrainedByBudget,
		},
		items,
	};
}

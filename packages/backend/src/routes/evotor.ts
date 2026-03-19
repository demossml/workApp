import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import {
	AccessoryGroupsSaveSchema,
	GroupsByShopSchema,
	OrderSchema,
	ProfitReportSchema,
	ProfitReportSnapshotBodySchema,
	ProfitReportSnapshotIdSchema,
	ProfitReportSnapshotsListSchema,
	SalaryBonusSaveSchema,
	SalarySchema,
	SalesGardenReportSchema,
	SalesResultSchema,
	StockReportSchema,
	SubmitGroupsSchema,
	validate,
} from "../validation";
import type { IndexDocument, ShopUuidName } from "../evotor/types";
import {
	assert,
	calculateDateRanges,
	formatDate,
	formatDateTime,
	formatDateWithTime,
	getIntervals,
	getIsoTimestamp,
	calculateTotalSum,
} from "../utils";
import {
	createAccessoriesTable,
	getAllUuid,
	saveOrUpdateUUIDs,
} from "../db/repositories/accessories";
import { trackAppEvent } from "../analytics/track";
import { createPlanTable, getPlan, updatePlan } from "../db/repositories/plan";
import {
	createSalaryBonusTable,
	getSalaryAndBonus,
	saveSalaryAndBonus,
} from "../db/repositories/salaryBonus";
import { getSalaryData } from "../db/repositories/salaryData";
import {
	getProfitReportSnapshotById,
	listProfitReportSnapshots,
	saveProfitReportSnapshot,
} from "../db/repositories/profitReportSnapshots";
import {
	getProductsByGroup,
} from "../db/repositories/products";
import {
	getSalesDataG,
	getTopProductsData,
} from "../evotor/utils";
import {
	createStockSnapshotsTable,
	getStockSnapshot,
	saveStockSnapshot,
	type StockSnapshotData,
} from "../db/repositories/stockSnapshots";
import { jsonError, toApiErrorPayload } from "../errors";
import { FinancialMetricsResponseSchema } from "../contracts/financialMetrics";
import { aggregateShopFinancialFromDocuments } from "../contracts/financialAggregation";
import { runEvotorDocumentsIndexingJob } from "../jobs/indexEvotorDocuments";
import { computeRevenueSummary } from "../contracts/revenueMath";
import { PlanForTodayResponseSchema } from "../contracts/planMetrics";
import { WorkingByShopsResponseSchema } from "../contracts/workingByShops";
import { CurrentWorkShopResponseSchema } from "../contracts/currentWorkShop";
import { getDocumentsFromIndexFirst } from "../services/indexDocumentsFallback";
import { saveNewIndexDocuments } from "../db/repositories/indexDocuments";
import { getDocumentsByPeriod } from "../db/repositories/documents";
import { normalizeDocuments } from "../analytics/normalize";
import {
	upsertReceipts,
	upsertReceiptPositions,
	upsertReferenceSets,
} from "../db/repositories/normalizedSales";
import {
	buildSalesDayKey,
	buildTopProductsKey,
	getCachedJson,
} from "../utils/kvCache";

async function getShopUuidsWithFallback(
	c: { get: (key: "db") => IEnv["Bindings"]["DB"] },
	evotor: { getShopUuids: () => Promise<string[]> },
): Promise<string[]> {
	try {
		return await evotor.getShopUuids();
	} catch (error) {
		logger.warn("Evotor shop UUIDs fetch failed, using DB fallback", {
			error,
		});
		const db = c.get("db");
		const rows = await db
			.prepare("SELECT store_uuid FROM stores")
			.all<{ store_uuid: string }>();
		const list = (rows.results || [])
			.map((row) => row.store_uuid)
			.filter(Boolean);
		if (list.length > 0) return list;
		throw error;
	}
}

async function getShopUuidsFromDb(
	c: { get: (key: "db") => IEnv["Bindings"]["DB"] },
): Promise<string[]> {
	const db = c.get("db");
	const rows = await db
		.prepare("SELECT store_uuid FROM stores")
		.all<{ store_uuid: string }>();
	return (rows.results || []).map((row) => row.store_uuid).filter(Boolean);
}

async function getShopNamesFromDb(
	c: { get: (key: "db") => IEnv["Bindings"]["DB"] },
): Promise<Record<string, string>> {
	const db = c.get("db");
	const rows = await db
		.prepare("SELECT store_uuid, name FROM stores")
		.all<{ store_uuid: string; name: string | null }>();
	const map: Record<string, string> = {};
	for (const row of rows.results || []) {
		if (row.store_uuid) {
			map[row.store_uuid] = row.name || row.store_uuid;
		}
	}
	return map;
}

async function resolveScopedShopUuidForFinancial(
	c: {
		var: IEnv["Variables"];
	},
): Promise<string | null> {
	try {
		const userId = c.var.userId || "";
		if (!userId) return null;
		const roleFromEvotor = await c.var.evotor.getEmployeeRole(userId);
		const employeeRole =
			userId === "5700958253" || userId === "475039971"
				? "SUPERADMIN"
				: roleFromEvotor;
		if (employeeRole === "SUPERADMIN") return null;

		const now = new Date();
		const since = formatDateWithTime(now, false);
		const until = formatDateWithTime(now, true);
		const employeeData = await c.var.evotor.getEmployeesByLastName(userId);
		const employeeUuid = employeeData?.[0]?.uuid;
		if (!employeeUuid) return null;
		const shopUuid = await c.var.evotor.getFirstOpenSession(
			since,
			until,
			employeeUuid,
		);
		return shopUuid || null;
	} catch (error) {
		logger.warn("Financial scope resolution failed, fallback to all shops", {
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

function getLocalDateKey(now: Date, tzOffsetMinutes: number): string {
	const shifted = new Date(now.getTime() + tzOffsetMinutes * 60 * 1000);
	return shifted.toISOString().slice(0, 10);
}

function getLocalTodayAndYesterdayKeys(tzOffsetMinutes: number) {
	const now = new Date();
	const todayKey = getLocalDateKey(now, tzOffsetMinutes);
	const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
	const yesterdayKey = getLocalDateKey(yesterday, tzOffsetMinutes);
	return { todayKey, yesterdayKey };
}

function buildUtcRangeForLocalDates(
	startDate: string,
	endDate: string,
	tzOffsetMinutes: number,
): { since: string; until: string } {
	const [startY, startM, startD] = startDate.split("-").map(Number);
	const [endY, endM, endD] = endDate.split("-").map(Number);
	const startUtc = new Date(
		Date.UTC(startY, startM - 1, startD, 0, 0, 0, 0) -
			tzOffsetMinutes * 60 * 1000,
	);
	const endUtc = new Date(
		Date.UTC(endY, endM - 1, endD, 23, 59, 59, 999) -
			tzOffsetMinutes * 60 * 1000,
	);
	return {
		since: formatDateTime(startUtc),
		until: formatDateTime(endUtc),
	};
}

const paymentTypeLabels: Record<string, string> = {
	CARD: "Банковской картой:",
	ADVANCE: "Предоплатой (зачетом аванса):",
	CASH: "Нал. средствами:",
	COUNTEROFFER: "Встречным предоставлением:",
	CREDIT: "Постоплатой (в кредит):",
	ELECTRON: "Безналичными средствами:",
	UNKNOWN: "Неизвестно. По-умолчанию:",
};

function isFullMonthRange(since: string, until: string): boolean {
	const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;
	const sinceMatch = since.match(ymd);
	const untilMatch = until.match(ymd);
	if (!sinceMatch || !untilMatch) return false;

	const sinceYear = Number(sinceMatch[1]);
	const sinceMonth = Number(sinceMatch[2]);
	const sinceDay = Number(sinceMatch[3]);

	const untilYear = Number(untilMatch[1]);
	const untilMonth = Number(untilMatch[2]);
	const untilDay = Number(untilMatch[3]);

	if (sinceYear !== untilYear || sinceMonth !== untilMonth) return false;
	if (sinceDay !== 1) return false;

	const lastDayOfMonth = new Date(sinceYear, sinceMonth, 0).getDate();
	return untilDay === lastDayOfMonth;
}

async function getFinancialDataDirectFromEvotor(
	evo: IEnv["Variables"]["evotor"],
	shopUuids: string[],
	since: string,
	until: string,
) {
	const byShop = await Promise.all(
		shopUuids.map(async (shopUuid) => {
			const [shopName, documents] = await Promise.all([
				evo.getShopName(shopUuid),
				evo.getDocumentsBySellPayback(shopUuid, since, until),
			]);
			const { sell, refund, totalSell, totalRefund, checksCount } =
				aggregateShopFinancialFromDocuments(documents, paymentTypeLabels);

			return {
				shopName: shopName || shopUuid,
				sell,
				refund,
				totalSell,
				totalRefund,
				checksCount,
			};
		}),
	);

	const salesDataByShopName: Record<
		string,
		{
			sell: Record<string, number>;
			refund: Record<string, number>;
			totalSell: number;
			checksCount: number;
		}
	> = {};

	let grandTotalSell = 0;
	let grandTotalRefund = 0;
	let totalChecks = 0;

	for (const shop of byShop) {
		salesDataByShopName[shop.shopName] = {
			sell: shop.sell,
			refund: shop.refund,
			totalSell: shop.totalSell,
			checksCount: shop.checksCount,
		};
		grandTotalSell += shop.totalSell;
		grandTotalRefund += shop.totalRefund;
		totalChecks += shop.checksCount;
	}

	const [cashOutcomeData, topProducts, cashBalanceByShop] = await Promise.all([
		evo.getDocumentsByCashOutcomeData(shopUuids, since, until),
		getTopProductsData(evo, shopUuids, since, until),
		evo.getCashByShops(),
	]);
	const grandTotalCashOutcome = calculateTotalSum(cashOutcomeData);
	const totalCashBalance = Object.values(cashBalanceByShop).reduce(
		(sum, value) => sum + Number(value || 0),
		0,
	);
	const { netRevenue, averageCheck } = computeRevenueSummary(
		grandTotalSell,
		grandTotalRefund,
		totalChecks,
	);

	return {
		...FinancialMetricsResponseSchema.parse({
			salesDataByShopName,
			grandTotalSell,
			grandTotalRefund,
			netRevenue,
			averageCheck,
			grandTotalCashOutcome,
			cashOutcomeData,
			cashBalanceByShop,
			totalCashBalance,
			totalChecks,
			topProducts,
		}),
	};
}

const STOCK_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

function buildGroupsKey(groups: string[]): string {
	return [...groups].sort((a, b) => a.localeCompare(b)).join(",");
}

function isStockSnapshotFresh(updatedAt: string): boolean {
	const updatedAtTs = new Date(updatedAt).getTime();
	if (!Number.isFinite(updatedAtTs)) return false;
	return Date.now() - updatedAtTs <= STOCK_SNAPSHOT_TTL_MS;
}

function buildTopProductsFromIndexedDocuments(
	documentsByShop: Array<{ shopUuid: string; docs: IndexDocument[] }>,
	until: string,
) {
	const endDate = new Date(until);
	const dayKeys: string[] = [];
	for (let i = 6; i >= 0; i--) {
		const d = new Date(endDate);
		d.setDate(endDate.getDate() - i);
		dayKeys.push(d.toISOString().slice(0, 10));
	}
	const dayIndex = new Map(dayKeys.map((key, idx) => [key, idx]));

	const productStats = new Map<
		string,
		{
			revenue: number;
			quantity: number;
			refundRevenue: number;
			refundQuantity: number;
			cost: number;
			refundCost: number;
			dailyNetRevenue7: number[];
		}
	>();

	for (const { docs } of documentsByShop) {
		for (const doc of docs) {
			if (!["SELL", "PAYBACK"].includes(doc.type)) continue;
			const isRefund = doc.type === "PAYBACK";
			for (const trans of doc.transactions || []) {
				if (trans.type !== "REGISTER_POSITION") continue;

				const productName = trans.commodityName || "Неизвестный товар";
				const existing = productStats.get(productName) || {
					revenue: 0,
					quantity: 0,
					refundRevenue: 0,
					refundQuantity: 0,
					cost: 0,
					refundCost: 0,
					dailyNetRevenue7: [0, 0, 0, 0, 0, 0, 0],
				};
				const lineCost =
					Number(trans.costPrice || 0) * Number(trans.quantity || 0);
				const dayKey = new Date(doc.closeDate).toISOString().slice(0, 10);
				const idx = dayIndex.get(dayKey);

				if (isRefund) {
					existing.refundRevenue += Number(trans.sum || 0);
					existing.refundQuantity += Number(trans.quantity || 0);
					existing.refundCost += lineCost;
					if (typeof idx === "number") {
						existing.dailyNetRevenue7[idx] -= Number(trans.sum || 0);
					}
				} else {
					existing.revenue += Number(trans.sum || 0);
					existing.quantity += Number(trans.quantity || 0);
					existing.cost += lineCost;
					if (typeof idx === "number") {
						existing.dailyNetRevenue7[idx] += Number(trans.sum || 0);
					}
				}

				productStats.set(productName, existing);
			}
		}
	}

	return Array.from(productStats.entries())
		.map(([productName, stats]) => {
			const netRevenue = stats.revenue - stats.refundRevenue;
			const grossProfit = netRevenue - (stats.cost - stats.refundCost);
			return {
				productName,
				revenue: stats.revenue,
				quantity: stats.quantity,
				refundRevenue: stats.refundRevenue,
				refundQuantity: stats.refundQuantity,
				netRevenue,
				netQuantity: stats.quantity - stats.refundQuantity,
				grossProfit,
				marginPct: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
				averagePrice: stats.quantity > 0 ? stats.revenue / stats.quantity : 0,
				refundRate:
					stats.revenue > 0 ? (stats.refundRevenue / stats.revenue) * 100 : 0,
				dailyNetRevenue7: stats.dailyNetRevenue7,
			};
		})
		.filter((item) => item.netRevenue > 0)
		.sort((a, b) => b.netRevenue - a.netRevenue);
}

async function buildTopProductsFromDbAggregates(
	db: IEnv["Bindings"]["DB"],
	shopUuids: string[],
	since: string,
	until: string,
) {
	if (shopUuids.length === 0) return [];

	const placeholders = shopUuids.map(() => "?").join(", ");
	const normalizedSince = since.replace("+00:00", "+0000").replace(/Z$/, "+0000");
	const normalizedUntil = until.replace("+00:00", "+0000").replace(/Z$/, "+0000");

	const endDate = new Date(until);
	const dayKeys: string[] = [];
	for (let i = 6; i >= 0; i--) {
		const d = new Date(endDate);
		d.setDate(endDate.getDate() - i);
		dayKeys.push(d.toISOString().slice(0, 10));
	}
	const dayIndex = new Map(dayKeys.map((key, idx) => [key, idx]));

	// В receipt_positions исторически могут быть дубль-строки.
	// Дедуплируем по (receipt_id, commodity_uuid), чтобы расчет topProducts
	// следовал тому же принципу, что и выручка из receipts.
	const summarySql = `
		WITH dedup AS (
			SELECT
				receipt_id,
				shop_id,
				close_date,
				commodity_uuid,
				MAX(commodity_name) as commodity_name,
				MAX(quantity) as quantity,
				MAX(sum) as sum,
				MAX(cost_price) as cost_price
			FROM receipt_positions
			WHERE close_date >= ? AND close_date <= ?
				AND shop_id IN (${placeholders})
			GROUP BY receipt_id, commodity_uuid
		)
		SELECT
			commodity_uuid as commodityUuid,
			MAX(commodity_name) as productName,
			SUM(CASE WHEN sum > 0 THEN sum ELSE 0 END) as revenue,
			SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END) as quantity,
			SUM(CASE WHEN sum < 0 THEN ABS(sum) ELSE 0 END) as refundRevenue,
			SUM(CASE WHEN quantity < 0 THEN ABS(quantity) ELSE 0 END) as refundQuantity,
			SUM(CASE WHEN quantity > 0 THEN cost_price * quantity ELSE 0 END) as cost,
			SUM(CASE WHEN quantity < 0 THEN cost_price * ABS(quantity) ELSE 0 END) as refundCost
		FROM dedup
		GROUP BY commodity_uuid
	`;

	const dailySql = `
		WITH dedup AS (
			SELECT
				receipt_id,
				shop_id,
				close_date,
				commodity_uuid,
				MAX(sum) as sum
			FROM receipt_positions
			WHERE close_date >= ? AND close_date <= ?
				AND shop_id IN (${placeholders})
			GROUP BY receipt_id, commodity_uuid
		)
		SELECT
			commodity_uuid as commodityUuid,
			substr(close_date, 1, 10) as dayKey,
			SUM(sum) as netRevenue
		FROM dedup
		GROUP BY commodity_uuid, dayKey
	`;

	const [summaryRows, dailyRows] = await Promise.all([
		db.prepare(summarySql).bind(normalizedSince, normalizedUntil, ...shopUuids).all<{
			commodityUuid: string;
			productName: string | null;
			revenue: number | null;
			quantity: number | null;
			refundRevenue: number | null;
			refundQuantity: number | null;
			cost: number | null;
			refundCost: number | null;
		}>(),
		db.prepare(dailySql).bind(normalizedSince, normalizedUntil, ...shopUuids).all<{
			commodityUuid: string;
			dayKey: string;
			netRevenue: number | null;
		}>(),
	]);

	const dailyByCommodity = new Map<string, number[]>();
	for (const row of dailyRows.results || []) {
		const idx = dayIndex.get(row.dayKey);
		if (idx === undefined) continue;
		const arr = dailyByCommodity.get(row.commodityUuid) || [0, 0, 0, 0, 0, 0, 0];
		arr[idx] += Number(row.netRevenue || 0);
		dailyByCommodity.set(row.commodityUuid, arr);
	}

	return (summaryRows.results || [])
		.map((row) => {
			const revenue = Number(row.revenue || 0);
			const quantity = Number(row.quantity || 0);
			const refundRevenue = Number(row.refundRevenue || 0);
			const refundQuantity = Number(row.refundQuantity || 0);
			const netRevenue = revenue - refundRevenue;
			const grossProfit = netRevenue - (Number(row.cost || 0) - Number(row.refundCost || 0));
			return {
				productName: row.productName || "Неизвестный товар",
				revenue,
				quantity,
				refundRevenue,
				refundQuantity,
				netRevenue,
				netQuantity: quantity - refundQuantity,
				grossProfit,
				marginPct: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
				averagePrice: quantity > 0 ? revenue / quantity : 0,
				refundRate: revenue > 0 ? (refundRevenue / revenue) * 100 : 0,
				dailyNetRevenue7:
					dailyByCommodity.get(row.commodityUuid) || [0, 0, 0, 0, 0, 0, 0],
			};
		})
		.filter((item) => item.netRevenue > 0)
		.sort((a, b) => b.netRevenue - a.netRevenue);
}

async function getFinancialDataFromIndexWithFallback(
	db: IEnv["Bindings"]["DB"],
	evo: IEnv["Variables"]["evotor"],
	shopUuids: string[],
	since: string,
	until: string,
) {
	const shopNamesMap = await evo.getShopNamesByUuids(shopUuids);
	const paymentCategory: Record<number, string> = {
		1: "Инкассация",
		2: "Оплата поставщику",
		3: "Оплата услуг",
		4: "Аренда",
		5: "Заработная плата",
		6: "Прочее",
	};

	const docsByShop = await Promise.all(
		shopUuids.map(async (shopUuid) => ({
			shopUuid,
			docs: await getDocumentsFromIndexFirst(
				db,
				evo,
				shopUuid,
				since,
				until,
				{ skipFetchIfStale: true },
			),
		})),
	);

	const salesDataByShopName: Record<
		string,
		{
			sell: Record<string, number>;
			refund: Record<string, number>;
			totalSell: number;
			checksCount: number;
		}
	> = {};
	const cashOutcomeData: Record<string, Record<string, number>> = {};

	let grandTotalSell = 0;
	let grandTotalRefund = 0;
	let totalChecks = 0;

	for (const { shopUuid, docs } of docsByShop) {
		const shopName = shopNamesMap[shopUuid] || shopUuid;
		const salesDocs = docs.filter((doc) =>
			["SELL", "PAYBACK"].includes(doc.type),
		);
		const { sell, refund, totalSell, totalRefund, checksCount } =
			aggregateShopFinancialFromDocuments(salesDocs, paymentTypeLabels);

		salesDataByShopName[shopName] = {
			sell,
			refund,
			totalSell,
			checksCount,
		};
		grandTotalSell += totalSell;
		grandTotalRefund += totalRefund;
		totalChecks += checksCount;

		const cashByCategory: Record<string, number> = {};
		for (const doc of docs) {
			if (doc.type !== "CASH_OUTCOME") continue;
			for (const trans of doc.transactions || []) {
				if (trans.type !== "CASH_OUTCOME") continue;
				const category = paymentCategory[trans.paymentCategoryId];
				if (!category) continue;
				cashByCategory[category] =
					(cashByCategory[category] || 0) + Number(trans.sum || 0);
			}
		}
		cashOutcomeData[shopName] = cashByCategory;
	}

	const [topProducts, cashBalanceByShop] = await Promise.all([
		Promise.resolve(buildTopProductsFromIndexedDocuments(docsByShop, until)),
		evo.getCashByShops(),
	]);
	const grandTotalCashOutcome = calculateTotalSum(cashOutcomeData);
	const totalCashBalance = Object.values(cashBalanceByShop).reduce(
		(sum, value) => sum + Number(value || 0),
		0,
	);
	const { netRevenue, averageCheck } = computeRevenueSummary(
		grandTotalSell,
		grandTotalRefund,
		totalChecks,
	);

	return {
		...FinancialMetricsResponseSchema.parse({
			salesDataByShopName,
			grandTotalSell,
			grandTotalRefund,
			netRevenue,
			averageCheck,
			grandTotalCashOutcome,
			cashOutcomeData,
			cashBalanceByShop,
			totalCashBalance,
			totalChecks,
			topProducts,
		}),
	};
}

async function getFinancialDataFromDbAggregates(
	db: IEnv["Bindings"]["DB"],
	evo: IEnv["Variables"]["evotor"],
	shopUuids: string[],
	since: string,
	until: string,
	shopNamesMap: Record<string, string>,
	cashBalanceMode: "current" | "period" = "period",
) {
	if (shopUuids.length === 0) {
		return FinancialMetricsResponseSchema.parse({
			salesDataByShopName: {},
			grandTotalSell: 0,
			grandTotalRefund: 0,
			netRevenue: 0,
			averageCheck: 0,
			grandTotalCashOutcome: 0,
			cashOutcomeData: {},
			cashBalanceByShop: {},
			totalCashBalance: 0,
			totalChecks: 0,
			topProducts: [],
		});
	}

	const placeholders = shopUuids.map(() => "?").join(", ");
	const normalizedSince = since.replace("+00:00", "+0000").replace(/Z$/, "+0000");
	const normalizedUntil = until.replace("+00:00", "+0000").replace(/Z$/, "+0000");
	const stmt = db.prepare(
		`SELECT shop_id as shopId,
			SUM(CASE WHEN type = 'SELL' THEN total ELSE 0 END) as totalSell,
			SUM(CASE WHEN type = 'PAYBACK' THEN ABS(total) ELSE 0 END) as totalRefund,
			SUM(CASE WHEN type = 'SELL' THEN 1 ELSE 0 END) as checksCount
		FROM receipts
		WHERE close_date >= ? AND close_date <= ?
			AND shop_id IN (${placeholders})
		GROUP BY shop_id`,
	);

	const rows = await stmt
		.bind(normalizedSince, normalizedUntil, ...shopUuids)
		.all<{
			shopId: string;
			totalSell: number | null;
			totalRefund: number | null;
			checksCount: number | null;
		}>();

	const salesDataByShopName: Record<
		string,
		{
			sell: Record<string, number>;
			refund: Record<string, number>;
			totalSell: number;
			checksCount: number;
		}
	> = {};
	let grandTotalSell = 0;
	let grandTotalRefund = 0;
	let totalChecks = 0;

	for (const row of rows.results || []) {
		const totalSell = Number(row.totalSell || 0);
		const totalRefund = Number(row.totalRefund || 0);
		const checksCount = Number(row.checksCount || 0);
		const shopName = shopNamesMap[row.shopId] || row.shopId;
		const unknownPaymentLabel = "Неизвестно. По-умолчанию:";
		salesDataByShopName[shopName] = {
			sell: totalSell > 0 ? { [unknownPaymentLabel]: totalSell } : {},
			refund: totalRefund > 0 ? { [unknownPaymentLabel]: totalRefund } : {},
			totalSell,
			checksCount,
		};
		grandTotalSell += totalSell;
		grandTotalRefund += totalRefund;
		totalChecks += checksCount;
	}

	const { netRevenue, averageCheck } = computeRevenueSummary(
		grandTotalSell,
		grandTotalRefund,
		totalChecks,
	);
	const [topProductsResult, cashOutcomeResult, cashBalanceResult] = await Promise.allSettled([
		buildTopProductsFromDbAggregates(db, shopUuids, since, until),
		evo.getDocumentsByCashOutcomeData(shopUuids, since, until, db),
		cashBalanceMode === "current"
			? evo.getCashByShops()
			: evo.getCashByShopsForPeriod(since, until),
	]);

	let topProducts = topProductsResult.status === "fulfilled" ? topProductsResult.value : [];
	if (topProductsResult.status === "rejected") {
		logger.warn("Financial: failed to load top products from DB aggregates", {
			error:
				topProductsResult.reason instanceof Error
					? topProductsResult.reason.message
					: String(topProductsResult.reason),
		});
		try {
			topProducts = await getTopProductsData(evo, shopUuids, since, until);
		} catch (fallbackError) {
			logger.warn("Financial: fallback top products from Evotor failed", {
				error:
					fallbackError instanceof Error
						? fallbackError.message
						: String(fallbackError),
			});
		}
	}

	const cashOutcomeData =
		cashOutcomeResult.status === "fulfilled" ? cashOutcomeResult.value : {};
	if (cashOutcomeResult.status === "rejected") {
		logger.warn("Financial: failed to load cash outcome data for DB aggregates", {
			error:
				cashOutcomeResult.reason instanceof Error
					? cashOutcomeResult.reason.message
					: String(cashOutcomeResult.reason),
		});
	}

	const cashBalanceByShop =
		cashBalanceResult.status === "fulfilled" ? cashBalanceResult.value : {};
	if (cashBalanceResult.status === "rejected") {
		logger.warn("Financial: failed to load cash balances for DB aggregates", {
			error:
				cashBalanceResult.reason instanceof Error
					? cashBalanceResult.reason.message
					: String(cashBalanceResult.reason),
		});
	}

	const grandTotalCashOutcome = calculateTotalSum(cashOutcomeData);
	const totalCashBalance = Object.values(cashBalanceByShop).reduce(
		(sum, value) => sum + Number(value || 0),
		0,
	);

	return FinancialMetricsResponseSchema.parse({
		salesDataByShopName,
		grandTotalSell,
		grandTotalRefund,
		netRevenue,
		averageCheck,
		grandTotalCashOutcome,
		cashOutcomeData,
		cashBalanceByShop,
		totalCashBalance,
		totalChecks,
		topProducts,
	});
}

function calculateSmaLocal(data: number[], period: number): number[] {
	const sma: number[] = [];
	for (let i = 0; i < data.length; i++) {
		if (i + 1 >= period) {
			const sum = data
				.slice(i + 1 - period, i + 1)
				.reduce((acc, value) => acc + value, 0);
			sma.push(sum / period);
		} else {
			sma.push(0);
		}
	}
	return sma;
}

async function getOrderFromIndexWithFallback(
	db: IEnv["Bindings"]["DB"],
	evo: IEnv["Variables"]["evotor"],
	params: {
		shopId: string;
		groups: string[];
		since: string;
		until: string;
		periods: number;
	},
): Promise<Record<string, Record<string, number>>> {
	const dateRanges = calculateDateRanges(
		params.since,
		params.until,
		params.periods,
	);
	const productUuids = await evo.getProductsByGroup(params.shopId, params.groups);
	const stockProduct = await evo.getProductStockByGroups(
		params.shopId,
		params.groups,
	);
	const allowedUuids = new Set(productUuids);
	const resultData: Record<string, number[]> = {};

	for (let periodIndex = 0; periodIndex < dateRanges.length; periodIndex++) {
		const [periodSince, periodUntil] = dateRanges[periodIndex];
		const docs = await getDocumentsFromIndexFirst(
			db,
			evo,
			params.shopId,
			periodSince,
			periodUntil,
		);
		for (const doc of docs) {
			if (doc.type !== "SELL") continue;
			for (const trans of doc.transactions || []) {
				if (trans.type !== "REGISTER_POSITION") continue;
				if (!allowedUuids.has(trans.commodityUuid)) continue;

				if (!resultData[trans.commodityUuid]) {
					resultData[trans.commodityUuid] = new Array(params.periods).fill(0);
				}
				resultData[trans.commodityUuid][periodIndex] += Number(trans.quantity || 0);
			}
		}
	}

	const smaData: Record<string, number> = {};
	for (const [commodityUuid, sales] of Object.entries(resultData)) {
		const sma = calculateSmaLocal(sales, params.periods);
		smaData[commodityUuid] = sma[sma.length - 1];
	}

	const optimalOrder: Record<string, Record<string, number>> = {};
	for (const [commodityUuid, smaValue] of Object.entries(smaData)) {
		const stockItem = stockProduct[commodityUuid];
		if (!stockItem) continue;
		const stockQuantity = Number(stockItem.quantity || 0);
		const orderQuantity = Math.max(0, Math.ceil(smaValue) - stockQuantity);
		const sum =
			orderQuantity === 0
				? 0
				: Number((orderQuantity * Number(stockItem.costPrice || 0)).toFixed(2));
		optimalOrder[stockItem.name] = {
			orderQuantity,
			smaQuantity: Number(smaValue.toFixed(1)),
			quantity: stockQuantity,
			sum,
		};
	}

	return optimalOrder;
}

export const evotorRoutes = new Hono<IEnv>()

	.get("/sales-today", async (c) => {
		const salesData = await c.var.evotor.getSalesToday(c.get("db"));
		assert(salesData, "No sales data found");
		return c.json({ salesData });
	})

	.get("/current-work-shop", async (c) => {
		try {
			const userId = c.var.userId;
			const evo = c.var.evotor;
			const today = new Date();
			const since = formatDateWithTime(today, false);
			const until = formatDateWithTime(today, true);
			const employeeData = await evo.getEmployeesByLastName(userId);
			if (!employeeData || employeeData.length === 0) {
				return c.json(
					CurrentWorkShopResponseSchema.parse({
						uuid: "",
						name: "",
						isWorkingToday: false,
					}),
				);
			}
			const employeeUuid = employeeData[0].uuid;
			const shopUuid = await evo.getFirstOpenSession(
				since,
				until,
				employeeUuid,
			);
			if (!shopUuid) {
				return c.json(
					CurrentWorkShopResponseSchema.parse({
						uuid: "",
						name: "",
						isWorkingToday: false,
					}),
				);
			}
			const shops = await evo.getShops();
			const currentShop = shops.find((shop) => shop.uuid === shopUuid);
			if (!currentShop) {
				return c.json(
					CurrentWorkShopResponseSchema.parse({
						uuid: shopUuid,
						name: "",
						isWorkingToday: true,
					}),
				);
			}
			return c.json(
				CurrentWorkShopResponseSchema.parse({
					uuid: currentShop.uuid,
					name: currentShop.name,
					isWorkingToday: true,
				}),
			);
		} catch (error) {
			logger.error("Ошибка при получении текущего магазина:", error);
			return c.json(
				CurrentWorkShopResponseSchema.parse({
					uuid: "",
					name: "",
					isWorkingToday: false,
				}),
				500,
			);
		}
	})
	.get("/working-by-shops", async (c) => {
		try {
			const evo = c.var.evotor;
			const today = new Date();
			const since = formatDateWithTime(today, false);
			const until = formatDateWithTime(today, true);

			const shopUuids = await getShopUuidsWithFallback(c, evo);
			const shopNamesMap = await evo.getShopNamesByUuids(shopUuids);

			const sessionsByShop = await Promise.all(
				shopUuids.map(async (shopUuid) => {
					const docs = await getDocumentsFromIndexFirst(
						c.get("db"),
						evo,
						shopUuid,
						since,
						until,
					);
					const openSession = docs.find(
						(doc) => doc.type === "OPEN_SESSION" && !!doc.openUserUuid,
					);
					return {
						shopUuid,
						openUserUuid: openSession?.openUserUuid || null,
					};
				}),
			);

			const employeeUuids = Array.from(
				new Set(
					sessionsByShop
						.map((item) => item.openUserUuid)
						.filter((value): value is string => Boolean(value)),
				),
			);
			const employeeNamesMap =
				employeeUuids.length > 0
					? await evo.getEmployeeNamesByUuids(employeeUuids)
					: {};

			const byShop = sessionsByShop.reduce(
				(acc, item) => {
					const shopName = shopNamesMap[item.shopUuid] || item.shopUuid;
					acc[shopName] = {
						shopUuid: item.shopUuid,
						opened: Boolean(item.openUserUuid),
						employeeUuid: item.openUserUuid,
						employeeName: item.openUserUuid
							? employeeNamesMap[item.openUserUuid] || null
							: null,
					};
					return acc;
				},
				{} as Record<
					string,
					{
						shopUuid: string;
						opened: boolean;
						employeeUuid: string | null;
						employeeName: string | null;
					}
				>,
			);

			return c.json(
				WorkingByShopsResponseSchema.parse({
					byShop,
				}),
			);
		} catch (error) {
			logger.error("Ошибка при получении сотрудников по открытиям смен:", error);
			return c.json({ byShop: {} }, 200);
		}
	})
	.get("/sales-today-graf", async (c) => {
		const db = c.get("db");
		const evo = c.var.evotor;
		const shopUuids = await getShopUuidsWithFallback(c, c.var.evotor);
		const nowDate = new Date();
		const sevenDaysAgo = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000);
		const nowSince = formatDateWithTime(nowDate, false);
		const nowUntil = getIsoTimestamp();
		const sevenDaysSince = formatDateWithTime(sevenDaysAgo, false);
		const sevenDaysUntil = getIsoTimestamp(false, -7);
		const nowDataSales = await getSalesDataG(
			db,
			evo,
			shopUuids,
			nowSince,
			nowUntil,
		);
		const sevenDaysDataSales = await getSalesDataG(
			db,
			evo,
			shopUuids,
			sevenDaysSince,
			sevenDaysUntil,
		);
		assert(sevenDaysDataSales, "No sales data found");

		return c.json({ nowDataSales, sevenDaysDataSales });
	})
	.post("/accessoriesSales/:role/:userId", async (c) => {
		try {
			const db = c.get("db");
			const evo = c.var.evotor;

			const { role, userId } = c.req.param();
			const data = await c.req.json().catch(() => null);

			let since: string;
			let until: string;
			if (data?.since && data?.until) {
				const startData = data.since;
				const endData = data.until;
				since = formatDateWithTime(new Date(startData), false);
				until = formatDateWithTime(new Date(endData), true);
			} else {
				const today = new Date();
				since = formatDateWithTime(today, false);
				until = formatDateWithTime(today, true);
			}

			const groupIdsAks = await getAllUuid(db);

			type AccessoriesSalesItem = {
				name: string;
				quantity: number;
				sum: number;
			};
				type AccessoriesSalesByShop = {
					shopId: string;
					shopName: string;
					sales: AccessoriesSalesItem[];
				};
				const buildNonAccessoriesSales = async (
					shopId: string,
					accessoryProductUuids: string[],
				): Promise<Record<string, { quantity: number; sum: number }>> => {
					const docs = await getDocumentsFromIndexFirst(
						db,
						evo,
						shopId,
						since,
						until,
						{ types: ["SELL", "PAYBACK"] },
					);
					const accessorySet = new Set(accessoryProductUuids);
					const result: Record<string, { quantity: number; sum: number }> = {};
					for (const doc of docs) {
						if (!["SELL", "PAYBACK"].includes(doc.type)) continue;
						const sign = doc.type === "PAYBACK" ? -1 : 1;
						for (const tx of doc.transactions || []) {
							if (tx.type !== "REGISTER_POSITION") continue;
							if (accessorySet.has(tx.commodityUuid)) continue;
							const name = tx.commodityName || "Неизвестный товар";
							const qty = Number(tx.quantity || 0) * sign;
							const sum = Math.abs(Number(tx.sum || 0)) * sign;
							if (!result[name]) result[name] = { quantity: 0, sum: 0 };
							result[name].quantity += qty;
							result[name].sum += sum;
						}
					}
					return result;
				};
				const response: {
					byShop?: AccessoriesSalesByShop[];
					total?: AccessoriesSalesItem[];
					nonAccessoriesByShop?: AccessoriesSalesByShop[];
					nonAccessoriesTotal?: AccessoriesSalesItem[];
				} = {};
			if (role === "SUPERADMIN") {
				const shopUuids = await getShopUuidsWithFallback(c, evo);
				const shopProductsPromises = shopUuids.map((shopId) =>
					getProductsByGroup(db, shopId, groupIdsAks),
				);
				const shopProductsResults = await Promise.all(shopProductsPromises);
				const shopNamesMap = await evo.getShopNamesByUuids(shopUuids);
					const salesPromises = shopUuids.map(async (shopId, idx) => {
						const productUuids = shopProductsResults[idx];
						const [salesData, nonAccessoriesData] = await Promise.all([
							evo.getSalesSumQuantitySum(db, shopId, since, until, productUuids),
							buildNonAccessoriesSales(shopId, productUuids),
						]);
						return {
							shopId,
							shopName: shopNamesMap[shopId] || shopId,
							sales: salesData,
							nonAccessoriesSales: nonAccessoriesData,
						};
					});
				const salesResults = await Promise.all(salesPromises);
				response.byShop = salesResults.map(({ shopId, shopName, sales }) => ({
					shopId,
					shopName,
					sales: Object.entries(sales).map(([name, data]) => ({
						name,
						quantity: data.quantitySale,
						sum: data.sum,
					})),
				}));
					const total: Record<string, { quantity: number; sum: number }> = {};
					const nonAccessoriesTotal: Record<
						string,
						{ quantity: number; sum: number }
					> = {};
					for (const { sales } of salesResults) {
						for (const [name, data] of Object.entries(sales)) {
							if (!total[name]) total[name] = { quantity: 0, sum: 0 };
							total[name].quantity += data.quantitySale;
							total[name].sum += data.sum;
						}
					}
					for (const { nonAccessoriesSales } of salesResults) {
						for (const [name, data] of Object.entries(nonAccessoriesSales)) {
							if (!nonAccessoriesTotal[name]) {
								nonAccessoriesTotal[name] = { quantity: 0, sum: 0 };
							}
							nonAccessoriesTotal[name].quantity += data.quantity;
							nonAccessoriesTotal[name].sum += data.sum;
						}
					}
					response.total = Object.entries(total).map(([name, data]) => ({
						name,
						quantity: data.quantity,
						sum: data.sum,
					}));
					response.nonAccessoriesByShop = salesResults.map(
						({ shopId, shopName, nonAccessoriesSales }) => ({
							shopId,
							shopName,
							sales: Object.entries(nonAccessoriesSales).map(([name, data]) => ({
								name,
								quantity: data.quantity,
								sum: data.sum,
							})),
						}),
					);
					response.nonAccessoriesTotal = Object.entries(nonAccessoriesTotal).map(
						([name, data]) => ({
							name,
							quantity: data.quantity,
							sum: data.sum,
						}),
					);
				} else {
				const telegramUserId = c.var.userId || userId || "";
				const employees = await evo.getEmployees();
				const employee = employees.find(
					(emp) => emp.lastName === telegramUserId,
				);
				const employeeUuid = employee?.uuid || "";
				const employeeStores = employee?.stores || [];

				let shopUuid =
					employeeUuid
						? await evo.getFirstOpenSession(since, until, employeeUuid)
						: null;
				if (!shopUuid && employeeStores.length > 0) {
					shopUuid = employeeStores[0];
				}

				if (!shopUuid) {
					logger.warn(
						"[accessories-sales] Не найден магазин для пользователя",
						{ userId: telegramUserId, employeeUuid },
					);
					return c.json(
						{ error: "Не найден магазин для пользователя" },
						404,
					);
				}
				const shopName = await evo.getShopName(shopUuid);
				const productUuids = await getProductsByGroup(
					db,
					shopUuid,
					groupIdsAks,
				);
					const [salesData, nonAccessoriesData] = await Promise.all([
						evo.getSalesSumQuantitySum(db, shopUuid, since, until, productUuids),
						buildNonAccessoriesSales(shopUuid, productUuids),
					]);
					response.byShop = [
						{
						shopId: shopUuid,
						shopName,
						sales: Object.entries(salesData).map(([name, data]) => ({
							name,
							quantity: data.quantitySale,
							sum: data.sum,
						})),
					},
					];
					response.total = response.byShop[0].sales;
					response.nonAccessoriesByShop = [
						{
							shopId: shopUuid,
							shopName,
							sales: Object.entries(nonAccessoriesData).map(([name, data]) => ({
								name,
								quantity: data.quantity,
								sum: data.sum,
							})),
						},
					];
					response.nonAccessoriesTotal = response.nonAccessoriesByShop[0].sales;
				}

			return c.json(response);
		} catch (error) {
			logger.error("Ошибка при получении данных о продажах аксессуаров", error);
			return c.json(
				{ error: "Ошибка при получении данных о продажах аксессуаров" },
				500,
			);
		}
	})
	.post("/generate-pdf", async (c) => {
		try {
			const chatId = c.var.userId || c.req.header("telegram-id") || "";
			if (!chatId) {
				return jsonError(
					c,
					400,
					"VALIDATION_ERROR",
					"Missing telegram chat id",
				);
			}

			const contentType = c.req.header("content-type") || "";
			let file: File | null = null;
			let caption = "Report";

			if (contentType.includes("application/json")) {
				const data = (await c.req.json().catch(() => null)) as
					| { html?: string; fileName?: string; caption?: string }
					| null;
				if (!data?.html?.trim()) {
					return jsonError(c, 400, "VALIDATION_ERROR", "Missing html content");
				}

				const htmlBlob = new Blob([data.html], {
					type: "text/html;charset=utf-8",
				});
				const fileName =
					data.fileName?.trim() || `report-${Date.now().toString()}.html`;
				file = new File([htmlBlob], fileName, { type: "text/html" });
				caption = data.caption?.trim() || "HTML report";
			} else {
				const formData = await c.req.formData();
				const inputFile = formData.get("file");
				const html = formData.get("html");

				if (inputFile && typeof inputFile !== "string") {
					file = inputFile as File;
					caption = "Report image";
				} else if (typeof html === "string" && html.trim()) {
					const htmlBlob = new Blob([html], {
						type: "text/html;charset=utf-8",
					});
					file = new File([htmlBlob], `report-${Date.now().toString()}.html`, {
						type: "text/html",
					});
					caption = "HTML report";
				} else {
					return jsonError(
						c,
						400,
						"VALIDATION_ERROR",
						"Missing file or html content",
					);
				}
			}

			const telegramForm = new FormData();
			telegramForm.append("chat_id", chatId);
			telegramForm.append("document", file);
			telegramForm.append("caption", caption);

			const telegramResponse = await fetch(
				`https://api.telegram.org/bot${c.env.BOT_TOKEN}/sendDocument`,
				{
					method: "POST",
					body: telegramForm,
				},
			);

			if (!telegramResponse.ok) {
				const text = await telegramResponse.text();
				await trackAppEvent(c, "telegram_digest_failed", {
					props: {
						endpoint: "/api/evotor/generate-pdf",
						status: telegramResponse.status,
					},
				});
				logger.error("Telegram sendDocument failed", {
					status: telegramResponse.status,
					body: text,
				});
				return jsonError(
					c,
					502,
					"TELEGRAM_SEND_FAILED",
					"Failed to send report to Telegram",
					{ status: telegramResponse.status },
				);
			}

			const telegramPayload = (await telegramResponse.json()) as {
				ok?: boolean;
				description?: string;
				result?: { message_id?: number };
			};
			if (!telegramPayload.ok) {
				await trackAppEvent(c, "telegram_digest_failed", {
					props: {
						endpoint: "/api/evotor/generate-pdf",
						description: telegramPayload.description || null,
					},
				});
				return jsonError(
					c,
					502,
					"TELEGRAM_SEND_FAILED",
					telegramPayload.description || "Telegram API rejected the request",
				);
			}
			await trackAppEvent(c, "telegram_digest_sent", {
				props: {
					endpoint: "/api/evotor/generate-pdf",
					messageId: telegramPayload.result?.message_id || null,
				},
			});

			return c.json({
				success: true,
				messageId: telegramPayload.result?.message_id || null,
			});
		} catch (error) {
			await trackAppEvent(c, "telegram_digest_failed", {
				props: {
					endpoint: "/api/evotor/generate-pdf",
					reason: error instanceof Error ? error.message : "generate_pdf_failed",
				},
			});
			logger.error("Generate PDF failed", error);
			const { status, body } = toApiErrorPayload(error, {
				code: "GENERATE_PDF_FAILED",
				message: "Failed to generate and send report",
			});
			return c.json(body, status as 200);
		}
	})
	.get("/plan-for-today", async (c) => {
		try {
			interface SalesData {
				[shopName: string]: {
					datePlan: number;
					dataSales: number;
					dataQuantity: { [productName: string]: number } | null;
				} | null;
			}

			const db = c.get("db");
			const newDate: Date = new Date();
			const datePlan: string = formatDate(newDate);
			let salesData: SalesData = {};

			const since = formatDateWithTime(newDate, false);
			const until = formatDateWithTime(newDate, true);

			await createPlanTable(db);

			const groupIdsVape: string[] = [
				"78ddfd78-dc52-11e8-b970-ccb0da458b5a",
				"bc9e7e4c-fdac-11ea-aaf2-2cf05d04be1d",
				"0627db0b-4e39-11ec-ab27-2cf05d04be1d",
				"2b8eb6b4-92ea-11ee-ab93-2cf05d04be1d",
				"8a8fcb5f-9582-11ee-ab93-2cf05d04be1d",
				"97d6fa81-84b1-11ea-b9bb-70c94e4ebe6a",
				"ad8afa41-737d-11ea-b9b9-70c94e4ebe6a",
				"568905bd-9460-11ee-9ef4-be8fe126e7b9",
				"568905be-9460-11ee-9ef4-be8fe126e7b9",
			];

			const plan = await getPlan(datePlan, db);
			let datPlan: Record<string, number> = {};
			const shouldRegeneratePlan =
				!plan ||
				Object.keys(plan).length === 0 ||
				Object.values(plan).every((value) => Number(value) === 5200);

			if (shouldRegeneratePlan) {
				logger.debug(
					"План отсутствует/подозрителен, пересчитываем по товарам каждого магазина",
				);
				datPlan = await c.var.evotor.getPlan(newDate, (shopId) =>
					getProductsByGroup(db, shopId, groupIdsVape),
				);
				await updatePlan(datPlan, datePlan, db);
			} else {
				datPlan = plan;
			}

			const shopUuids: string[] = await getShopUuidsWithFallback(c, c.var.evotor);
			salesData = {};

			const shopNamesMap = await c.var.evotor.getShopNamesByUuids(shopUuids);

			const shopProductsPromises = shopUuids.map((shopId) =>
				getProductsByGroup(c.get("db"), shopId, groupIdsVape),
			);
			const shopProductsResults = await Promise.all(shopProductsPromises);

			const salesPromises = shopUuids.map(async (shopId, index) => {
				try {
					const shopProductUuids = shopProductsResults[index];

					const [sumSalesData, podQuantity] = await Promise.all([
						c.var.evotor.getSalesSum(
							shopId,
							since,
							until,
							shopProductUuids,
							db,
						),
						c.var.evotor.getSalesSumQuantity(
							shopId,
							since,
							until,
							shopProductUuids,
							db,
						),
					]);

					return {
						shopId,
						sumSalesData,
						podQuantity,
					};
				} catch (err) {
					logger.error(`Ошибка при обработке магазина ${shopId}:`, err);
					return {
						shopId,
						sumSalesData: 0,
						podQuantity: {},
					};
				}
			});
			const salesResults = await Promise.all(salesPromises);

			for (const { shopId, sumSalesData, podQuantity } of salesResults) {
				const shopName = shopNamesMap[shopId];
				salesData[shopName] = {
					datePlan: datPlan[shopId] || 0,
					dataSales: sumSalesData || 0,
					dataQuantity: podQuantity || {},
				};
			}

			return c.json(
				PlanForTodayResponseSchema.parse({
					salesData,
				}),
			);
		} catch (err) {
			logger.error("Ошибка при обработке запроса plan-for-today", err);
			return c.json(
				{ error: "Ошибка при обработке запроса. Проверьте логи." },
				500,
			);
		}
	})
	.get("/groups", async (c) => {
		const shopIds: string[] = await getShopUuidsWithFallback(c, c.var.evotor);

		const groups = await c.var.evotor.getGroupsByNameUuid(shopIds[0]);

		return c.json({ groups });
	})
	.post("/groups-by-shop", async (c) => {
		try {
			const data = await c.req.json();
			const { shopUuid } = validate(GroupsByShopSchema, data);

			const groupsData = await c.var.evotor.getGroupsByNameUuid(shopUuid);
			if (groupsData) {
				const excludedUuids = [
					"3f51bb7f-f3a2-11e8-b973-ccb0da458b5a",
					"be7939b7-d6e6-11ea-b9a5-ccb0da458b5a",
				];

				const groups = groupsData.filter(
					(group) => !excludedUuids.includes(group.uuid),
				);

				assert(groups, "not an result");

				console.log(groups);

				return c.json({ groups });
			}
			return jsonError(c, 404, "NOT_FOUND", "No data found");
		} catch (error) {
			const { status, body } = toApiErrorPayload(error, {
				code: "GROUPS_BY_SHOP_FAILED",
				message: "Invalid request data",
			});
			return c.json(body, status as 200);
		}
	})
	.post("/salary", async (c) => {
		try {
			const data = await c.req.json();
			const { employee, startDate, endDate } = validate(SalarySchema, data);
			const db = c.get("db");

			const sincetDate = formatDateWithTime(new Date(startDate), false);
			const untilDate = formatDateWithTime(new Date(endDate), true);
			const dates = getIntervals(sincetDate, untilDate, "days", 1);

			const groupIdsAks = await getAllUuid(db);
			const employeeName = await c.var.evotor.getEmployeeByUuid(employee);

			const groupIdsVape = [
				"78ddfd78-dc52-11e8-b970-ccb0da458b5a",
				"bc9e7e4c-fdac-11ea-aaf2-2cf05d04be1d",
				"0627db0b-4e39-11ec-ab27-2cf05d04be1d",
				"2b8eb6b4-92ea-11ee-ab93-2cf05d04be1d",
				"8a8fcb5f-9582-11ee-ab93-2cf05d04be1d",
				"97d6fa81-84b1-11ea-b9bb-70c94e4ebe6a",
				"ad8afa41-737d-11ea-b9b9-70c94e4ebe6a",
				"568905bd-9460-11ee-9ef4-be8fe126e7b9",
				"568905be-9460-11ee-9ef4-be8fe126e7b9",
			];
			const totalReport = {
				employeeName,
				startDate: formatDate(new Date(startDate)),
				endDate: formatDate(new Date(endDate)),
				totalBonusAccessories: 0,
				totalBonusPlan: 0,
				totalBonus: 0,
			};

			const result = [];

			const sessionPromises = dates.map((date_) => {
				const date = new Date(date_);
				const since = formatDateWithTime(date, false);
				const until = formatDateWithTime(date, true);
				return c.var.evotor.getFirstOpenSession(since, until, employee);
			});
			const openShopUuids = await Promise.all(sessionPromises);

			const uniqueShopUuids = [
				...new Set(openShopUuids.filter(Boolean) as string[]),
			];

			const shopNamesMap =
				uniqueShopUuids.length > 0
					? await c.var.evotor.getShopNamesByUuids(uniqueShopUuids)
					: {};

			for (let i = 0; i < dates.length; i++) {
				const date_ = dates[i];
				const date = new Date(date_);
				const since = formatDateWithTime(date, false);
				const until = formatDateWithTime(date, true);
				const datePlan = formatDate(date);

				const openShopUuid = openShopUuids[i];
				if (!openShopUuid) continue;

				const dataReport = {
					date: datePlan,
					shopName: shopNamesMap[openShopUuid] || "Неизвестный магазин",
					bonusAccessories: 0,
					dataPlan: 0,
					salesDataVape: 0,
					bonusPlan: 0,
					totalBonus: 0,
				};

				const salaryData = await getSalaryData(employee, datePlan, until, db);

				if (salaryData) {
					const { date, bonusAccessories, dataPlan, salesDataVape } =
						salaryData;
					const bonusPlan = salesDataVape >= dataPlan ? 450 : 0;

					Object.assign(dataReport, {
						date,
						bonusAccessories,
						dataPlan,
						salesDataVape,
						bonusPlan,
						totalBonus: bonusPlan + bonusAccessories,
					});
				} else {
					let plan = await getPlan(datePlan, db);
					const shouldRegeneratePlan =
						!plan ||
						Object.keys(plan).length === 0 ||
						Object.values(plan).every((value) => Number(value) === 5200);
					if (shouldRegeneratePlan) {
						plan = await c.var.evotor.getPlan(date, (shopId) =>
							getProductsByGroup(db, shopId, groupIdsVape),
						);
						await updatePlan(plan, datePlan, db);
					}
					const resolvedPlan = plan ?? {};

					const currentPlan = Number.isFinite(resolvedPlan[openShopUuid])
						? resolvedPlan[openShopUuid]
						: 0;

					const productsAks = await getProductsByGroup(
						db,
						openShopUuid,
						groupIdsAks,
					);
					const salesDataAks = await c.var.evotor.getSalesSum(
						openShopUuid,
						since,
						until,
						productsAks,
						db,
					);
					const bonusAccessories = Math.floor(salesDataAks * 0.05);

					const productsVape = await getProductsByGroup(
						db,
						openShopUuid,
						groupIdsVape,
					);
					const salesDataVape = await c.var.evotor.getSalesSum(
						openShopUuid,
						since,
						until,
						productsVape,
						db,
					);

					const bonusPlan = salesDataVape >= currentPlan ? 450 : 0;

					Object.assign(dataReport, {
						bonusAccessories,
						dataPlan: currentPlan,
						salesDataVape,
						bonusPlan,
						totalBonus: bonusAccessories + bonusPlan,
					});
				}

				result.push(dataReport);

				totalReport.totalBonusAccessories += dataReport.bonusAccessories;
				totalReport.totalBonusPlan += dataReport.bonusPlan;
				totalReport.totalBonus += dataReport.totalBonus;
			}

			return c.json({ result, totalReport });
		} catch (error) {
			logger.error("Ошибка при разборе JSON:", error);
			const { status, body } = toApiErrorPayload(error, {
				code: "SALARY_REPORT_FAILED",
				message: "Ошибка обработки данных",
			});
			return c.json(body, status as 200);
		}
	})
	.post("/submitGroups", async (c) => {
		try {
			const data = await c.req.json();

			const { groups, salary, bonus } = validate(SubmitGroupsSchema, data);
			const newDate = new Date();
			const date = formatDate(newDate);
			await createSalaryBonusTable(c.get("db"));
			await saveSalaryAndBonus(date, salary, bonus, c.get("db"));

			await createAccessoriesTable(c.get("db"));
			await saveOrUpdateUUIDs(groups, c.get("db"));
			const uuid = await getAllUuid(c.get("db"));

			const shopIds: string[] = await getShopUuidsWithFallback(c, c.var.evotor);

			const filteredUuids = shopIds.filter(
				(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
			);
			const groupsName = await c.var.evotor.getGroupsByName(
				filteredUuids[0],
				uuid,
			);

			return c.json({ groupsName, salary, bonus });
		} catch (error) {
			logger.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})
	.get("/settings-config", async (c) => {
		try {
			const db = c.get("db");
			await createAccessoriesTable(db);
			await createSalaryBonusTable(db);

			const shopIds: string[] = await getShopUuidsWithFallback(c, c.var.evotor);
			const filteredUuids = shopIds.filter(
				(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
			);
			const baseShopUuid = filteredUuids[0];

			const groupOptions = baseShopUuid
				? await c.var.evotor.getGroupsByNameUuid(baseShopUuid)
				: [];
			const selectedGroupUuids = await getAllUuid(db);
			const selectedGroupNames = baseShopUuid
				? await c.var.evotor.getGroupsByName(baseShopUuid, selectedGroupUuids)
				: [];

			const currentDate = formatDate(new Date());
			const salaryBonus = await getSalaryAndBonus(currentDate, db);

			return c.json({
				groupOptions,
				selectedGroupUuids,
				selectedGroupNames,
				salary: salaryBonus?.salary ?? 0,
				bonus: salaryBonus?.bonus ?? 0,
			});
		} catch (error) {
			logger.error("Ошибка получения настроек", error);
			return c.json({ message: "Не удалось загрузить настройки" }, 400);
		}
	})
	.post("/settings/accessory-groups", async (c) => {
		try {
			const data = await c.req.json();
			const { groups } = validate(AccessoryGroupsSaveSchema, data);

			const db = c.get("db");
			await createAccessoriesTable(db);
			await saveOrUpdateUUIDs(groups, db);

			const shopIds: string[] = await getShopUuidsWithFallback(c, c.var.evotor);
			const filteredUuids = shopIds.filter(
				(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
			);
			const baseShopUuid = filteredUuids[0];
			const groupsName = baseShopUuid
				? await c.var.evotor.getGroupsByName(baseShopUuid, groups)
				: [];

			return c.json({ groups, groupsName });
		} catch (error) {
			logger.error("Ошибка сохранения групп аксессуаров", error);
			return c.json({ message: "Не удалось сохранить группы аксессуаров" }, 400);
		}
	})
	.post("/settings/salary-bonus", async (c) => {
		try {
			const data = await c.req.json();
			const { salary, bonus } = validate(SalaryBonusSaveSchema, data);

			const db = c.get("db");
			await createSalaryBonusTable(db);
			await saveSalaryAndBonus(formatDate(new Date()), salary, bonus, db);

			return c.json({ salary, bonus });
		} catch (error) {
			logger.error("Ошибка сохранения оклада и премии", error);
			return c.json({ message: "Не удалось сохранить оклад и премию" }, 400);
		}
	})
	.post("/shops", async (c) => {
		const shopOptions: Record<string, string> = {};

		const shops: ShopUuidName[] | null = await c.var.evotor.getShopNameUuids();
		if (shops) {
			shops.forEach((shop) => {
				shopOptions[shop.uuid] = shop.name;
			});
		}

		assert(shopOptions, "not an shopOptions");

		return c.json({ shopOptions });
	})
	.get("/shops-names", async (c) => {
		const shopsName = await c.var.evotor.getShopsName();

		assert(shopsName, "not an shopOptions");

		return c.json({ shopsName });
	})
	.get("/api/evotor/sales-report", async (c) => {
		const shops = await c.var.evotor.getShops();

		const shopOptions: Record<string, string> = shops.reduce(
			(acc, shop) => {
				acc[shop.uuid] = shop.name;
				return acc;
			},
			{} as Record<string, string>,
		);

		const shopIds: string[] = await getShopUuidsWithFallback(c, c.var.evotor);

		const filteredUuids = shopIds.filter(
			(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
		);

		const groups = await c.var.evotor.getGroupsByNameUuid(filteredUuids[0]);

		return c.json({ shopOptions, groups });
	})

	.get("/financial", async (c) => {
		try {
			const db = c.get("db");
			const startDate = c.req.query("since");
			const endDate = c.req.query("until");
			const requestedShopUuid = c.req.query("shopUuid")?.trim() || "";
			const scopedShopUuid = await resolveScopedShopUuidForFinancial(c);
			const effectiveShopUuid = requestedShopUuid || scopedShopUuid || "";
			const kv = c.env.KV;

			if (!startDate || !endDate) {
				return c.json({ error: "since и until обязательны" }, 400);
			}

			const tzOffsetMinutes = Number(c.env.ALERT_TZ_OFFSET_MINUTES ?? 180);
			const { todayKey, yesterdayKey } =
				getLocalTodayAndYesterdayKeys(tzOffsetMinutes);
			const isSingleDay = startDate === endDate;
			const useDbAggregatesOnly = true;
			const scopeShopId = effectiveShopUuid || "all";
			const cacheKey = isSingleDay
				? buildSalesDayKey(scopeShopId, startDate)
				: `sales:store:${scopeShopId}:day:${startDate}-${endDate}`;
			const ttlSeconds = isSingleDay
				? startDate === todayKey
					? 300
					: startDate === yesterdayKey
						? 86400
						: 1800
				: 1800;

			const { data: financialData, cacheHit } = await getCachedJson(
				kv,
				cacheKey,
				ttlSeconds,
				async () => {
					const evo = c.var.evotor;
					// Конвертируем YYYY-MM-DD в формат Evotor API
					const { since, until } = buildUtcRangeForLocalDates(
						startDate,
						endDate,
						tzOffsetMinutes,
					);
					if (useDbAggregatesOnly) {
						const allShopUuids = await getShopUuidsFromDb(c);
						const shopUuids = effectiveShopUuid
							? allShopUuids.includes(effectiveShopUuid)
								? [effectiveShopUuid]
								: []
							: allShopUuids;
						const shopNamesMap = await getShopNamesFromDb(c);
						return await getFinancialDataFromDbAggregates(
							db,
							evo,
							shopUuids,
							since,
							until,
							shopNamesMap,
							startDate === todayKey && endDate === todayKey
								? "current"
								: "period",
						);
					}
					const shopUuids = await getShopUuidsWithFallback(c, evo);
					try {
						return await getFinancialDataFromIndexWithFallback(
							db,
							evo,
							shopUuids,
							since,
							until,
						);
					} catch (indexedError) {
						logger.warn(
							"Financial: indexed source failed, fallback to Evotor direct",
							{
								error:
									indexedError instanceof Error
										? indexedError.message
										: String(indexedError),
							},
						);
						return await getFinancialDataDirectFromEvotor(
							evo,
							shopUuids,
							since,
							until,
						);
					}
				},
			);

			if (cacheHit) {
				c.header("x-cache", "hit");
			}

				if (isSingleDay && kv) {
				const period =
					startDate === todayKey
						? "today"
						: startDate === yesterdayKey
							? "yesterday"
							: "custom";
					const topKey = buildTopProductsKey(scopeShopId, period);
				const topProducts = (financialData as { topProducts?: unknown })
					.topProducts;
				if (topProducts) {
					try {
						await kv.put(topKey, JSON.stringify(topProducts), {
							expirationTtl: 1800,
						});
					} catch (error) {
						logger.warn("KV put failed for top products", { error, key: topKey });
					}
				}
			}

			return c.json(financialData);
		} catch (error) {
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})
	.get("/financial/today", async (c) => {
		try {
			const db = c.get("db");
			const kv = c.env.KV;
			const requestedShopUuid = c.req.query("shopUuid")?.trim() || "";
			const scopedShopUuid = await resolveScopedShopUuidForFinancial(c);
			const effectiveShopUuid = requestedShopUuid || scopedShopUuid || "";

			const tzOffsetMinutes = Number(c.env.ALERT_TZ_OFFSET_MINUTES ?? 180);
			const todayKey = getLocalDateKey(new Date(), tzOffsetMinutes);
			const scopeShopId = effectiveShopUuid || "all";
			const { data: financialData, cacheHit } = await getCachedJson(
				kv,
				buildSalesDayKey(scopeShopId, todayKey),
				300,
				async () => {
					const localTodayKey = getLocalDateKey(new Date(), tzOffsetMinutes);
					const { since, until } = buildUtcRangeForLocalDates(
						localTodayKey,
						localTodayKey,
						tzOffsetMinutes,
					);
					const allShopUuids = await getShopUuidsFromDb(c);
					const shopUuids = effectiveShopUuid
						? allShopUuids.includes(effectiveShopUuid)
							? [effectiveShopUuid]
							: []
						: allShopUuids;
					const shopNamesMap = await getShopNamesFromDb(c);
					return await getFinancialDataFromDbAggregates(
						db,
						c.var.evotor,
						shopUuids,
						since,
						until,
						shopNamesMap,
						"current",
					);
				},
			);
			if (cacheHit) {
				c.header("x-cache", "hit");
			}
				if (kv) {
					const topProducts = (financialData as { topProducts?: unknown })
						.topProducts;
					if (topProducts) {
						const key = buildTopProductsKey(scopeShopId, "today");
					try {
						await kv.put(key, JSON.stringify(topProducts), {
							expirationTtl: 1800,
						});
					} catch (error) {
						logger.warn("KV put failed for top products", { error, key });
					}
				}
			}
			return c.json(financialData);
		} catch (error) {
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})
	.post("/financial/today/direct", async (c) => {
		try {
			const userId = c.var.userId || "";
			const roleFromEvotor = userId
				? await c.var.evotor.getEmployeeRole(userId)
				: null;
			const employeeRole =
				userId === "5700958253" || userId === "475039971"
					? "SUPERADMIN"
					: roleFromEvotor;

			if (employeeRole !== "SUPERADMIN") {
				return c.json({ error: "Доступ только для SUPERADMIN" }, 403);
			}

			const evo = c.var.evotor;
			const now = new Date();
			const since = formatDateWithTime(now, false);
			const until = formatDateWithTime(now, true);
			const shopUuids = await getShopUuidsWithFallback(c, evo);
			const financialData = await getFinancialDataDirectFromEvotor(
				evo,
				shopUuids,
				since,
				until,
			);

			return c.json(financialData);
		} catch (error) {
			logger.error("Ошибка при прямом запросе финансовых данных:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})
	.post("/index/warm", async (c) => {
		try {
			const userId = c.var.userId || "";
			const roleFromEvotor = userId
				? await c.var.evotor.getEmployeeRole(userId)
				: null;
			const employeeRole =
				userId === "5700958253" || userId === "475039971"
					? "SUPERADMIN"
					: roleFromEvotor;

			if (employeeRole !== "SUPERADMIN") {
				return c.json({ error: "Доступ только для SUPERADMIN" }, 403);
			}

			const start = Date.now();
			const beforeRow = await c.env.DB
				.prepare("SELECT COUNT(*) as count FROM index_documents")
				.first<{ count: number }>();
			const before = Number(beforeRow?.count || 0);

			await runEvotorDocumentsIndexingJob(c.env);

			const afterRow = await c.env.DB
				.prepare("SELECT COUNT(*) as count FROM index_documents")
				.first<{ count: number }>();
			const after = Number(afterRow?.count || 0);

			return c.json({
				ok: true,
				before,
				after,
				added: Math.max(0, after - before),
				durationMs: Date.now() - start,
			});
		} catch (error) {
			logger.error("Index warm failed", { error });
			return c.json({ error: "INDEX_WARM_FAILED" }, 500);
		}
	})
	.post("/index/pull-today", async (c) => {
		try {
			const userId = c.var.userId || "";
			const roleFromEvotor = userId
				? await c.var.evotor.getEmployeeRole(userId)
				: null;
			const employeeRole =
				userId === "5700958253" || userId === "475039971"
					? "SUPERADMIN"
					: roleFromEvotor;

			if (employeeRole !== "SUPERADMIN") {
				return c.json({ error: "Доступ только для SUPERADMIN" }, 403);
			}

			const evotor = c.var.evotor;
			const now = new Date();
			const since = formatDateWithTime(now, false);
			const until = formatDateWithTime(now, true);
			const shopUuids = await getShopUuidsWithFallback(c, evotor);
			const queries = shopUuids.map((shopId) => ({
				shopId,
				since,
				until,
			}));

			const beforeRow = await c.env.DB
				.prepare("SELECT COUNT(*) as count FROM index_documents")
				.first<{ count: number }>();
			const before = Number(beforeRow?.count || 0);

			const docs = await evotor.getDocumentsIndexForShops(queries);
			await saveNewIndexDocuments(c.env.DB, docs);

			const afterRow = await c.env.DB
				.prepare("SELECT COUNT(*) as count FROM index_documents")
				.first<{ count: number }>();
			const after = Number(afterRow?.count || 0);

			return c.json({
				ok: true,
				fetched: docs.length,
				before,
				after,
				added: Math.max(0, after - before),
			});
		} catch (error) {
			logger.error("Index pull-today failed", { error });
			return c.json({ error: "INDEX_PULL_TODAY_FAILED" }, 500);
		}
	})
	.post("/receipts/rebuild-day", async (c) => {
		try {
			const userId = c.var.userId || "";
			const roleFromEvotor = userId
				? await c.var.evotor.getEmployeeRole(userId)
				: null;
			const employeeRole =
				userId === "5700958253" || userId === "475039971"
					? "SUPERADMIN"
					: roleFromEvotor;

			if (employeeRole !== "SUPERADMIN") {
				return c.json({ error: "Доступ только для SUPERADMIN" }, 403);
			}

			const payload = await c.req.json().catch(() => ({}));
			const date = String(payload?.date || "");
			if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
				return c.json({ error: "date is required (YYYY-MM-DD)" }, 400);
			}

			const db = c.get("db");
			const tzOffsetMinutes = Number(c.env.ALERT_TZ_OFFSET_MINUTES ?? 180);
			const { since, until } = buildUtcRangeForLocalDates(
				date,
				date,
				tzOffsetMinutes,
			);

			let shopUuids = await getShopUuidsFromDb(c);
			if (shopUuids.length === 0) {
				shopUuids = await getShopUuidsWithFallback(c, c.var.evotor);
			}

			let deletedReceipts = 0;
			let deletedPositions = 0;
			let rebuiltReceipts = 0;
			let rebuiltPositions = 0;

			for (const shopId of shopUuids) {
				const delReceipts = await db
					.prepare(
						"DELETE FROM receipts WHERE shop_id = ? AND close_date >= ? AND close_date <= ?",
					)
					.bind(shopId, since, until)
					.run();
				deletedReceipts += Number(delReceipts.meta?.changes || 0);

				const delPositions = await db
					.prepare(
						"DELETE FROM receipt_positions WHERE shop_id = ? AND close_date >= ? AND close_date <= ?",
					)
					.bind(shopId, since, until)
					.run();
				deletedPositions += Number(delPositions.meta?.changes || 0);

				const docs = await getDocumentsByPeriod(db, shopId, since, until);
				const normalized = normalizeDocuments(docs);
				await upsertReceipts(db, normalized.receipts);
				await upsertReceiptPositions(db, normalized.positions);
				await upsertReferenceSets(db, normalized.sets);

				rebuiltReceipts += normalized.receipts.length;
				rebuiltPositions += normalized.positions.length;
			}

			return c.json({
				ok: true,
				date,
				shops: shopUuids.length,
				deletedReceipts,
				deletedPositions,
				rebuiltReceipts,
				rebuiltPositions,
			});
		} catch (error) {
			logger.error("Receipts rebuild failed", { error });
			return c.json({ error: "REBUILD_RECEIPTS_FAILED" }, 500);
		}
	})
	.post("/order", async (c) => {
		try {
			// Получаем данные из запроса
			const data = await c.req.json();
			const { startDate, endDate, shopUuid, groups, period } = validate(
				OrderSchema,
				data,
			);
			const sincetDate = new Date(startDate); // Преобразуем в объект Date
			const untilDate = new Date(endDate); // Преобразуем в объект Date

			const since = formatDateWithTime(sincetDate, false); // Форматируем начальную дату
			const until = formatDateWithTime(untilDate, true);

			const params = {
				shopId: shopUuid,
				groups: groups,
				since: since,
				until: until,
				periods: period,
			};

			let order: Record<string, Record<string, number>>;
			try {
				order = await getOrderFromIndexWithFallback(
					c.get("db"),
					c.var.evotor,
					params,
				);
			} catch (indexedError) {
				logger.warn("Order: indexed source failed, fallback to Evotor direct", {
					error:
						indexedError instanceof Error
							? indexedError.message
							: String(indexedError),
				});
				order = await c.var.evotor.getOrder(params);
			}
			const shopName = await c.var.evotor.getShopName(shopUuid);

			// Отправляем ответ
			return c.json({ order: order || {}, startDate, endDate, shopName });
		} catch (error) {
			logger.error("Ошибка при обработке запроса:", error);
			const { status, body } = toApiErrorPayload(error, {
				code: "ORDER_REPORT_FAILED",
				message: "Произошла ошибка при обработке запроса.",
			});
			return c.json(body, status as 200);
		}
	})

	.post("/profit-report", async (c) => {
		try {
			// Получаем данные из запроса
			const body = await c.req.json();
			const { shopUuids, since, until, dataFrom1C } = validate(
				ProfitReportSchema,
				body,
			);
			if (!isFullMonthRange(since, until)) {
				return c.json(
					{
						error:
							"Отчет по прибыли доступен только за полный месяц (с 1-го по последнее число месяца).",
					},
					400,
				);
			}

			// 1. Получаем расходы из Evo
			const evoData = await c.var.evotor.getExpensesByCategories(
				shopUuids,
				since,
				until,
			);

			// 2. Формируем отчет по каждому магазину
			const report: Record<
				string,
				{
					byCategory: Record<string, number>;
					totalEvoExpenses: number;
					expenses1C: number;
					grossProfit: number;
					netProfit: number;
				}
			> = {};

			for (const shopUuid of shopUuids) {
				const evoShopData = evoData[shopUuid] || {
					byCategory: {},
					total: 0,
				};
				const data1C = dataFrom1C[shopUuid] || {
					expenses: 0,
					grossProfit: 0,
				};

				// Чистая прибыль = Валовая прибыль - расходы Evo - расходы 1С
				const netProfit =
					(data1C.grossProfit || 0) -
					(evoShopData.total || 0) -
					(data1C.expenses || 0);

				report[shopUuid] = {
					byCategory: evoShopData.byCategory,
					totalEvoExpenses: evoShopData.total,
					expenses1C: data1C.expenses,
					grossProfit: data1C.grossProfit,
					netProfit,
				};
			}

			// 3. Возвращаем результат
			return c.json({
				period: { since, until },
				report,
			});
		} catch (error) {
			logger.error("Ошибка при формировании отчета:", error);
			return c.json({ error: "Ошибка при формировании отчета" }, 500);
		}
	})

	.get("/profit-report/snapshots", async (c) => {
		try {
			const query = c.req.query();
			const { limit } = validate(ProfitReportSnapshotsListSchema, query);
			const items = await listProfitReportSnapshots(c.env.DB, limit ?? 20);
			return c.json({ items });
		} catch (error) {
			logger.error("Ошибка при получении списка snapshots отчета прибыли:", error);
			return c.json({ error: "Ошибка при получении списка отчетов" }, 500);
		}
	})

	.get("/profit-report/snapshots/:id", async (c) => {
		try {
			const { id } = validate(ProfitReportSnapshotIdSchema, c.req.param());
			const snapshot = await getProfitReportSnapshotById(c.env.DB, id);
			if (!snapshot) {
				return c.json({ error: "Отчет не найден" }, 404);
			}
			return c.json(snapshot);
		} catch (error) {
			logger.error("Ошибка при получении snapshot отчета прибыли:", error);
			return c.json({ error: "Ошибка при получении отчета" }, 500);
		}
	})

	.post("/profit-report/snapshots", async (c) => {
		try {
			const body = await c.req.json();
			const { period, report } = validate(ProfitReportSnapshotBodySchema, body);
			if (!isFullMonthRange(period.since, period.until)) {
				return c.json(
					{
						error:
							"Сохранить можно только помесячный отчет (полный календарный месяц).",
					},
					400,
				);
			}
			const createdBy = c.var.userId || null;
			const payload = { period, report };
			const saved = await saveProfitReportSnapshot(c.env.DB, {
				createdBy,
				since: period.since,
				until: period.until,
				payload,
			});
			return c.json(saved);
		} catch (error) {
			logger.error("Ошибка при сохранении snapshot отчета прибыли:", error);
			return c.json({ error: "Ошибка при сохранении отчета" }, 500);
		}
	})

	.post("/stock-report", async (c) => {
		try {
			const data = await c.req.json();
			const { shopUuid, groups } = validate(StockReportSchema, data);
			const groupsKey = buildGroupsKey(groups);

			await createStockSnapshotsTable(c.env.DB);

			const snapshot = await getStockSnapshot(c.env.DB, shopUuid, groupsKey);
			const hasFreshSnapshot =
				snapshot !== null && isStockSnapshotFresh(snapshot.updatedAt);

			let stockData: StockSnapshotData | null = hasFreshSnapshot
				? snapshot.stockData
				: null;

			if (!stockData) {
				try {
					const freshStockData = await c.var.evotor.getStockByGroup(
						shopUuid,
						groups,
						"price",
					);

					if (freshStockData && Object.keys(freshStockData).length > 0) {
						stockData = freshStockData;
						await saveStockSnapshot(c.env.DB, {
							shopUuid,
							groupsKey,
							stockData: freshStockData,
						});
					} else if (snapshot) {
						stockData = snapshot.stockData;
					}
				} catch (error) {
					if (snapshot) {
						logger.warn(
							"Не удалось получить свежий stock-report из Evotor, возвращаем stale snapshot",
							{ shopUuid, groupsKey, error },
						);
						stockData = snapshot.stockData;
					} else {
						throw error;
					}
				}
			}

			if (!stockData || Object.keys(stockData).length === 0) {
				return c.json({ error: "Не удалось получить данные о товаре." }, 500);
			}

			const shopName = await c.var.evotor.getShopName(shopUuid);

			return c.json({
				stockData,
				shopName,
			});
		} catch (error) {
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Произошла ошибка при обработке запроса." }, 500);
		}
	})

	.post("/salesResult", async (c) => {
		try {
			const data = await c.req.json(); // Разбор JSON тела
			const { startDate, endDate, shopUuid, groups } = validate(
				SalesResultSchema,
				data,
			);

			const sincetDate = new Date(startDate); // Преобразуем в объект Date
			const untilDate = new Date(endDate); // Преобразуем в объект Date

			const since = formatDateWithTime(sincetDate, false); // Форматируем начальную дату
			const until = formatDateWithTime(untilDate, true); // Форматируем конечную дату

			const productUuids = await getProductsByGroup(
				c.get("db"),
				shopUuid,
				groups,
			);

			// const productUuids = await c.var.evotor.getProductsByGroup(
			// 	shopUuid,
			// 	groups,
			// );

			// Продукты по группам
			const salesData = await c.var.evotor.getSalesSumQuantitySum(
				c.env.DB,
				shopUuid,
				since,
				until,
				productUuids,
			); // Получаем данные по продажам

			// const sortedSalesDataByValue = sortSalesSummary(salesData, sortCriteria);

			const shopName = await c.var.evotor.getShopName(shopUuid);

			return c.json({ salesData, shopName, startDate, endDate });
		} catch (error) {
			logger.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.post("/salesGardenReport", async (c) => {
		try {
			const data = await c.req.json(); // Разбор JSON тела
			const { startDate, endDate } = validate(SalesGardenReportSchema, data);

			const shopUuids = await getShopUuidsWithFallback(c, c.var.evotor);

			const sincetDate = new Date(startDate); // Преобразуем в объект Date
			const untilDate = new Date(endDate); // Преобразуем в объект Date

			const since = formatDateWithTime(sincetDate, false); // Форматируем начальную дату
			const until = formatDateWithTime(untilDate, true); // Форматируем конечную дату

			// const filteredUuids = shopUuids.filter(
			// 	(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
			// );

			const { salesDataByShopName, grandTotalSell, grandTotaRefund } =
				await c.var.evotor.getSalesgardenReportData(
					shopUuids,
					since,
					until,
					c.get("db"),
				);

			const cashOutcomeData = await c.var.evotor.getDocumentsByCashOutcomeData(
				shopUuids,
				since,
				until,
				c.get("db"),
			);

			const cash = await c.var.evotor.getCashByShops();

			const grandTotaCashOutcome = calculateTotalSum(cashOutcomeData);
			return c.json({
				salesDataByShopName,
				grandTotalSell,
				grandTotaRefund,
				grandTotaCashOutcome,
				startDate,
				endDate,
				cashOutcomeData,
				cash,
			});
		} catch (error) {
			logger.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.post("/api/profit-report", async (c) => {
		try {
			// Получаем данные из запроса
			const body = await c.req.json();
			const { shopUuids, since, until, dataFrom1C } = validate(
				ProfitReportSchema,
				body,
			);
			if (!isFullMonthRange(since, until)) {
				return c.json(
					{
						error:
							"Отчет по прибыли доступен только за полный месяц (с 1-го по последнее число месяца).",
					},
					400,
				);
			}

			// 1. Получаем расходы из Evo
			const evoData = await c.var.evotor.getExpensesByCategories(
				shopUuids,
				since,
				until,
			);

			// 2. Формируем отчет по каждому магазину
			const report: Record<
				string,
				{
					byCategory: Record<string, number>;
					totalEvoExpenses: number;
					expenses1C: number;
					grossProfit: number;
					netProfit: number;
				}
			> = {};

			for (const shopUuid of shopUuids) {
				const evoShopData = evoData[shopUuid] || {
					byCategory: {},
					total: 0,
				};
				const data1C = dataFrom1C[shopUuid] || {
					expenses: 0,
					grossProfit: 0,
				};

				// Чистая прибыль = Валовая прибыль - расходы Evo - расходы 1С
				const netProfit =
					(data1C.grossProfit || 0) -
					(evoShopData.total || 0) -
					(data1C.expenses || 0);

				report[shopUuid] = {
					byCategory: evoShopData.byCategory,
					totalEvoExpenses: evoShopData.total,
					expenses1C: data1C.expenses,
					grossProfit: data1C.grossProfit,
					netProfit,
				};
			}

			// 3. Возвращаем результат
			return c.json({
				period: { since, until },
				report,
			});
		} catch (error) {
			logger.error("Ошибка при формировании отчета:", error);
			return c.json({ error: "Ошибка при формировании отчета" }, 500);
		}
	});

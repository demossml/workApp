import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import {
	AccessoryGroupsSaveSchema,
	DashboardHomeInsightsRequestSchema,
	GroupsByShopSchema,
	OrderSchema,
	OrderV2Schema,
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
import type { ShopUuidName } from "../evotor/types";
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
import {
	FinancialMetricsResponseSchema,
	type FinancialMetricsResponse,
} from "../contracts/financialMetrics";
import { aggregateShopFinancialFromDocuments } from "../contracts/financialAggregation";
import { runEvotorDocumentsIndexingJob } from "../jobs/indexEvotorDocuments";
import { computeRevenueSummary } from "../contracts/revenueMath";
import { PlanForTodayResponseSchema } from "../contracts/planMetrics";
import { WorkingByShopsResponseSchema } from "../contracts/workingByShops";
import { CurrentWorkShopResponseSchema } from "../contracts/currentWorkShop";
import {
	buildDataModeMeta,
	getDataModeOrDefault,
	type DataMode,
} from "../dataMode";
import { getDocumentsFromIndexFirst } from "../services/indexDocumentsFallback";
import { buildOrderForecastV2 } from "../services/orderForecastV2";
import { saveNewIndexDocuments } from "../db/repositories/indexDocuments";
import { getDocumentsByPeriod } from "../db/repositories/documents";
import { normalizeDocuments } from "../analytics/normalize";
import {
	upsertReceipts,
	upsertReceiptPositions,
	upsertReferenceSets,
} from "../db/repositories/normalizedSales";
import { recomputeEmployeeKpiDailyForShopDates } from "../db/repositories/employeeKpiDaily";
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
	try {
		const db = c.get("db");
		const rows = await db
			.prepare("SELECT store_uuid FROM stores")
			.all<{ store_uuid: string }>();
		return (rows.results || []).map((row) => row.store_uuid).filter(Boolean);
	} catch (error) {
		logger.warn("DB fallback shop UUIDs unavailable", { error });
		return [];
	}
}

async function getShopNamesFromDb(
	c: { get: (key: "db") => IEnv["Bindings"]["DB"] },
): Promise<Record<string, string>> {
	try {
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
	} catch (error) {
		logger.warn("DB fallback shop names unavailable", { error });
		return {};
	}
}

async function getShopNameByUuidFromDb(
	c: { get: (key: "db") => IEnv["Bindings"]["DB"] },
	shopUuid: string,
): Promise<string | null> {
	const db = c.get("db");
	const row = await db
		.prepare("SELECT name FROM stores WHERE store_uuid = ? LIMIT 1")
		.bind(shopUuid)
		.first<{ name: string | null }>();
	return row?.name || null;
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

const SUPERADMIN_TELEGRAM_IDS = new Set(["5700958253", "475039971"]);

const resolveEmployeeRole = async (c: {
	var: IEnv["Variables"];
}): Promise<string | null> => {
	const userId = c.var.userId || "";
	if (!userId) return null;
	if (SUPERADMIN_TELEGRAM_IDS.has(userId)) return "SUPERADMIN";
	return c.var.evotor.getEmployeeRole(userId);
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
	options?: { includeTopProducts?: boolean },
) {
	const includeTopProducts = options?.includeTopProducts ?? true;
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
		includeTopProducts
			? getTopProductsData(evo, shopUuids, since, until)
			: Promise.resolve([]),
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

async function getFinancialDataFromDbAggregates(
	db: IEnv["Bindings"]["DB"],
	evo: IEnv["Variables"]["evotor"],
	shopUuids: string[],
	since: string,
	until: string,
	shopNamesMap: Record<string, string>,
	cashBalanceMode: "current" | "period" = "period",
	options?: { includeTopProducts?: boolean },
) {
	const includeTopProducts = options?.includeTopProducts ?? true;
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
	const topProductsPromise = includeTopProducts
		? buildTopProductsFromDbAggregates(db, shopUuids, since, until)
		: Promise.resolve([]);

	const [topProductsResult, cashOutcomeResult, cashBalanceResult] = await Promise.allSettled([
		topProductsPromise,
		evo.getDocumentsByCashOutcomeData(shopUuids, since, until, db),
		cashBalanceMode === "current"
			? evo.getCashByShops()
			: evo.getCashByShopsForPeriod(since, until),
	]);

	let topProducts = topProductsResult.status === "fulfilled" ? topProductsResult.value : [];
	if (includeTopProducts && topProductsResult.status === "rejected") {
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

const shiftIsoDateKey = (isoDate: string, days: number) => {
	const date = new Date(`${isoDate}T00:00:00`);
	if (Number.isNaN(date.getTime())) return isoDate;
	date.setDate(date.getDate() + days);
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
};

const getDiffDaysInclusive = (since: string, until: string) => {
	const from = new Date(`${since}T00:00:00`);
	const to = new Date(`${until}T00:00:00`);
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 1;
	const diffMs = to.getTime() - from.getTime();
	return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
};

const clampRange = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

async function loadFinancialDataByMode(input: {
	c: {
		get: (key: "db") => IEnv["Bindings"]["DB"];
		var: IEnv["Variables"];
		env: IEnv["Bindings"];
	};
	mode: DataMode;
	effectiveShopUuid: string;
	since: string;
	until: string;
	startDate: string;
	endDate: string;
	todayKey: string;
	includeTopProducts?: boolean;
}): Promise<FinancialMetricsResponse> {
	const db = input.c.get("db");
	const evo = input.c.var.evotor;

	if (input.mode === "DB") {
		let allShopUuids = await getShopUuidsFromDb(input.c);
		if (allShopUuids.length === 0) {
			logger.warn(
				"Financial DB mode: stores table is empty, falling back to Evotor shops list",
			);
			allShopUuids = await getShopUuidsWithFallback(input.c, evo);
		}
		const shopUuids = input.effectiveShopUuid
			? allShopUuids.includes(input.effectiveShopUuid)
				? [input.effectiveShopUuid]
				: []
			: allShopUuids;
		let shopNamesMap = await getShopNamesFromDb(input.c);
		if (Object.keys(shopNamesMap).length === 0 && shopUuids.length > 0) {
			try {
				shopNamesMap = await getShopNamesByUuidsWithFallback(
					input.c,
					evo,
					shopUuids,
				);
			} catch (error) {
				logger.warn("Financial DB mode: failed to resolve shop names fallback", {
					error,
				});
			}
		}
		return await getFinancialDataFromDbAggregates(
			db,
			evo,
			shopUuids,
			input.since,
			input.until,
			shopNamesMap,
			input.startDate === input.todayKey && input.endDate === input.todayKey
				? "current"
				: "period",
			{ includeTopProducts: input.includeTopProducts },
		);
	}

	const allShopUuids = await getShopUuidsWithFallback(input.c, evo);
	const shopUuids = input.effectiveShopUuid
		? allShopUuids.includes(input.effectiveShopUuid)
			? [input.effectiveShopUuid]
			: []
		: allShopUuids;
	return await getFinancialDataDirectFromEvotor(
		evo,
		shopUuids,
		input.since,
		input.until,
		{ includeTopProducts: input.includeTopProducts },
	);
}

export const evotorRoutes = new Hono<IEnv>()

	.get("/sales-today", async (c) => {
		const mode = await getDataModeOrDefault(c.env);
		const salesData = await c.var.evotor.getSalesToday(c.get("db"));
		assert(salesData, "No sales data found");
		c.header("x-data-source", mode);
		return c.json({
			salesData,
			meta: buildDataModeMeta(mode),
		});
	})

	.get("/current-work-shop", async (c) => {
		const mode = await getDataModeOrDefault(c.env);
		try {
			const userId =
				String(c.var.userId || "").trim() ||
				String(c.req.header("telegram-id") || "").trim() ||
				String(c.req.query("telegram-id") || "").trim();
			if (!userId) {
				c.header("x-data-source", mode);
				return c.json(
					CurrentWorkShopResponseSchema.parse({
						uuid: "",
						name: "",
						isWorkingToday: false,
						meta: buildDataModeMeta(mode),
					}),
				);
			}

			const evo = c.var.evotor;
			const today = new Date();
			const since = formatDateWithTime(today, false);
			const until = formatDateWithTime(today, true);

			let employeeUuid = "";
			try {
				const row = await c
					.get("db")
					.prepare(
						"SELECT uuid FROM employees_details WHERE user_id = ? OR id = ? LIMIT 1",
					)
					.bind(userId, userId)
					.first<{ uuid: string | null }>();
				employeeUuid = String(row?.uuid || "").trim();
			} catch (error) {
				logger.warn("current-work-shop: employees_details lookup failed", { error });
			}

			if (!employeeUuid) {
				try {
					const employeeData = await evo.getEmployeesByLastName(userId);
					employeeUuid = String(employeeData?.[0]?.uuid || "").trim();
				} catch (error) {
					logger.warn("current-work-shop: employee lookup via Evotor failed", {
						error,
					});
				}
			}

			if (!employeeUuid) {
				c.header("x-data-source", mode);
				return c.json(
					CurrentWorkShopResponseSchema.parse({
						uuid: "",
						name: "",
						isWorkingToday: false,
						meta: buildDataModeMeta(mode),
					}),
				);
			}

			let shopUuid: string | null = null;
			try {
				shopUuid = await evo.getFirstOpenSession(since, until, employeeUuid);
			} catch (error) {
				logger.warn("current-work-shop: first open session lookup failed", {
					error,
				});
			}
			if (!shopUuid) {
				c.header("x-data-source", mode);
				return c.json(
					CurrentWorkShopResponseSchema.parse({
						uuid: "",
						name: "",
						isWorkingToday: false,
						meta: buildDataModeMeta(mode),
					}),
				);
			}

			let shopName = "";
			try {
				shopName = (await getShopNameByUuidFromDb(c, shopUuid)) || "";
			} catch (error) {
				logger.warn("current-work-shop: DB shop name lookup failed", { error });
			}
			if (!shopName) {
				try {
					shopName = (await evo.getShopName(shopUuid)) || "";
				} catch (error) {
					logger.warn("current-work-shop: Evotor shop name lookup failed", {
						error,
					});
				}
			}

			c.header("x-data-source", mode);
			return c.json(
				CurrentWorkShopResponseSchema.parse({
					uuid: shopUuid,
					name: shopName,
					isWorkingToday: true,
					meta: buildDataModeMeta(mode),
				}),
			);
		} catch (error) {
			logger.error("Ошибка при получении текущего магазина:", error);
			c.header("x-data-source", mode);
			return c.json(
				CurrentWorkShopResponseSchema.parse({
					uuid: "",
					name: "",
					isWorkingToday: false,
					meta: buildDataModeMeta(mode),
				}),
			);
		}
	})
	.get("/working-by-shops", async (c) => {
		const mode = await getDataModeOrDefault(c.env);
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

			c.header("x-data-source", mode);
			return c.json(
				WorkingByShopsResponseSchema.parse({
					byShop,
					meta: buildDataModeMeta(mode),
				}),
			);
		} catch (error) {
			logger.error("Ошибка при получении сотрудников по открытиям смен:", error);
			c.header("x-data-source", mode);
			return c.json(
				WorkingByShopsResponseSchema.parse({
					byShop: {},
					meta: buildDataModeMeta(mode),
				}),
				200,
			);
		}
	})
	.get("/sales-today-graf", async (c) => {
		const mode = await getDataModeOrDefault(c.env);
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

		c.header("x-data-source", mode);
		return c.json({
			nowDataSales,
			sevenDaysDataSales,
			meta: buildDataModeMeta(mode),
		});
	})
	.post("/accessoriesSales/:role/:userId", async (c) => {
		try {
			const db = c.get("db");
			const evo = c.var.evotor;
			const mode = await getDataModeOrDefault(c.env);
			const useDirectEvotor = mode === "ELVATOR";

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
					const docs = useDirectEvotor
						? await evo.getDocumentsBySellPayback(shopId, since, until)
						: await getDocumentsFromIndexFirst(
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
							useDirectEvotor
								? evo.getSalesSumQuantitySumDirect(
										shopId,
										since,
										until,
										productUuids,
									)
								: evo.getSalesSumQuantitySum(
										db,
										shopId,
										since,
										until,
										productUuids,
									),
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
					return c.json({
						byShop: [],
						total: [],
						nonAccessoriesByShop: [],
						nonAccessoriesTotal: [],
					});
				}
				const shopName = await evo.getShopName(shopUuid);
				const productUuids = await getProductsByGroup(
					db,
					shopUuid,
					groupIdsAks,
				);
					const [salesData, nonAccessoriesData] = await Promise.all([
						useDirectEvotor
							? evo.getSalesSumQuantitySumDirect(
									shopUuid,
									since,
									until,
									productUuids,
								)
							: evo.getSalesSumQuantitySum(
									db,
									shopUuid,
									since,
									until,
									productUuids,
								),
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

			c.header("x-data-source", mode);
			return c.json(response);
		} catch (error) {
			logger.error("Ошибка при получении данных о продажах аксессуаров", error);
			return c.json({
				byShop: [],
				total: [],
				nonAccessoriesByShop: [],
				nonAccessoriesTotal: [],
			});
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

			const mode = await getDataModeOrDefault(c.env);
			const db = c.get("db");
			const newDate: Date = new Date();
			const datePlan: string = formatDate(newDate);
			let salesData: SalesData = {};

			if (mode === "DB") {
				await createPlanTable(db);
				const plan = await getPlan(datePlan, db);
				const datPlan: Record<string, number> = plan || {};

				const tzOffsetMinutes = Number(c.env.ALERT_TZ_OFFSET_MINUTES ?? 180);
				const localTodayKey = getLocalDateKey(new Date(), tzOffsetMinutes);
				const { since, until } = buildUtcRangeForLocalDates(
					localTodayKey,
					localTodayKey,
					tzOffsetMinutes,
				);

				const salesRows = await db
					.prepare(
						`SELECT shop_id as shopUuid, SUM(total) as totalSell
						FROM receipts
						WHERE type = 'SELL' AND close_date >= ? AND close_date <= ?
						GROUP BY shop_id`,
					)
					.bind(since, until)
					.all<{ shopUuid: string; totalSell: number | null }>();

				const salesByShopUuid: Record<string, number> = {};
				for (const row of salesRows.results || []) {
					salesByShopUuid[row.shopUuid] = Number(row.totalSell || 0);
				}

				const shopNamesMap = await getShopNamesFromDb(c);
				const shopUuids = Array.from(
					new Set([
						...Object.keys(shopNamesMap),
						...Object.keys(datPlan),
						...Object.keys(salesByShopUuid),
					]),
				);

				salesData = {};
				for (const shopUuid of shopUuids) {
					const shopName = shopNamesMap[shopUuid] || shopUuid;
					salesData[shopName] = {
						datePlan: Number(datPlan[shopUuid] || 0),
						dataSales: Number(salesByShopUuid[shopUuid] || 0),
						dataQuantity: {},
					};
				}

				c.header("x-data-source", mode);
				return c.json(
					PlanForTodayResponseSchema.parse({
						salesData,
						meta: buildDataModeMeta(mode),
					}),
				);
			}

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

			c.header("x-data-source", mode);
			return c.json(
				PlanForTodayResponseSchema.parse({
					salesData,
					meta: buildDataModeMeta(mode),
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

			const shopIds: string[] =
				(await getShopUuidsWithFallback(c, c.var.evotor).catch(async (error) => {
					logger.warn("settings-config: Evotor shop UUIDs fallback to DB", { error });
					return await getShopUuidsFromDb(c);
				})) || [];
			const filteredUuids = shopIds.filter(
				(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
			);
			const baseShopUuid = filteredUuids[0];

			const groupOptions = baseShopUuid
				? await c.var.evotor.getGroupsByNameUuid(baseShopUuid).catch((error) => {
						logger.warn("settings-config: Evotor groupOptions failed", { error });
						return [];
					})
				: [];
			const selectedGroupUuids = await getAllUuid(db);
			const selectedGroupNames = baseShopUuid
				? await c.var.evotor
						.getGroupsByName(baseShopUuid, selectedGroupUuids)
						.catch((error) => {
							logger.warn("settings-config: Evotor selectedGroupNames failed", {
								error,
							});
							return [];
						})
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

	.post("/dashboard-home-insights", async (c) => {
		try {
			const mode = await getDataModeOrDefault(c.env);
			const payload = validate(
				DashboardHomeInsightsRequestSchema,
				await c.req.json().catch(() => ({})),
			);
			const baseUrl = new URL(c.req.url);
			const headers = new Headers();
			for (const headerName of ["initData", "telegram-id", "authorization", "cookie"]) {
				const value = c.req.header(headerName);
				if (value) headers.set(headerName, value);
			}
				const dateMode = payload.dateMode ?? "today";
				const periodDays = getDiffDaysInclusive(payload.since, payload.until);
				const prevUntil = shiftIsoDateKey(payload.since, -1);
				const prevSince = shiftIsoDateKey(prevUntil, -(periodDays - 1));
				const weekSince = shiftIsoDateKey(payload.until, -6);
				const requestedShopUuid = payload.shopUuid?.trim() || "";
				const scopedShopUuid = await resolveScopedShopUuidForFinancial(c);
				const effectiveShopUuid = requestedShopUuid || scopedShopUuid || "";
				const tzOffsetMinutes = Number(c.env.ALERT_TZ_OFFSET_MINUTES ?? 180);
				const { todayKey } = getLocalTodayAndYesterdayKeys(tzOffsetMinutes);
				const currentRange = buildUtcRangeForLocalDates(
					payload.since,
					payload.until,
					tzOffsetMinutes,
				);
				const previousRange = buildUtcRangeForLocalDates(
					prevSince,
					prevUntil,
					tzOffsetMinutes,
				);
				const weekRange = buildUtcRangeForLocalDates(
					weekSince,
					payload.until,
					tzOffsetMinutes,
				);

				const [currentFinancial, previousFinancial, weekFinancial, planRes] = await Promise.all([
					loadFinancialDataByMode({
						c,
						mode,
						effectiveShopUuid,
						since: currentRange.since,
						until: currentRange.until,
						startDate: payload.since,
						endDate: payload.until,
						todayKey,
						includeTopProducts: true,
					}),
					loadFinancialDataByMode({
						c,
						mode,
						effectiveShopUuid,
						since: previousRange.since,
						until: previousRange.until,
						startDate: prevSince,
						endDate: prevUntil,
						todayKey,
						includeTopProducts: false,
					}),
					loadFinancialDataByMode({
						c,
						mode,
						effectiveShopUuid,
						since: weekRange.since,
						until: weekRange.until,
						startDate: weekSince,
						endDate: payload.until,
						todayKey,
						includeTopProducts: false,
					}),
					fetch(new URL("/api/evotor/plan-for-today", baseUrl.origin), {
						method: "GET",
						headers,
					}),
				]);
				const currentData = currentFinancial as {
					grandTotalSell: number;
					grandTotalRefund: number;
					totalChecks: number;
				salesDataByShopName: Record<
					string,
					{ totalSell: number; checksCount: number; refund: Record<string, number> }
				>;
				cashOutcomeData: Record<string, Record<string, number>>;
				topProducts?: Array<{
					productName: string;
					netQuantity: number;
					quantity?: number;
					netRevenue?: number;
						averagePrice?: number;
					}>;
				};
				const previousData = previousFinancial as {
					grandTotalSell: number;
					grandTotalRefund: number;
					totalChecks: number;
				salesDataByShopName: Record<
					string,
						{ totalSell: number; checksCount: number; refund: Record<string, number> }
					>;
				};
				const weekData = weekFinancial as {
					salesDataByShopName: Record<
						string,
						{ totalSell: number; checksCount: number; refund: Record<string, number> }
					>;
					cashOutcomeData: Record<string, Record<string, number>>;
				};
				const planJson = ((await planRes.json().catch(() => ({}))) || {}) as {
				salesData?: Record<
					string,
					| {
							datePlan: number;
							dataSales: number;
							dataQuantity?: Record<string, number | string> | null;
					  }
					| number
					| null
				>;
			};
			const planData = (planJson.salesData || {}) as Record<
				string,
				| {
						datePlan: number;
						dataSales: number;
						dataQuantity?: Record<string, number | string> | null;
				  }
				| number
				| null
			>;

			const formatMoney = (value: number) =>
				new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
					Math.round(value),
				);
			const sumRecordValues = (record?: Record<string, number>) =>
				Object.values(record || {}).reduce((sum, value) => sum + Number(value || 0), 0);
			const buildShopKpiRowsFromFinancial = (input: {
				salesDataByShopName: Record<
					string,
					{ totalSell: number; checksCount: number; refund: Record<string, number> }
				>;
				cashOutcomeData?: Record<string, Record<string, number>>;
			}) =>
				Object.entries(input.salesDataByShopName || {}).map(([name, shop]) => {
					const refunds = sumRecordValues(shop.refund);
					const expenses = sumRecordValues(input.cashOutcomeData?.[name]);
					const netRevenue = Number(shop.totalSell || 0) - refunds - expenses;
					const averageCheck =
						Number(shop.checksCount || 0) > 0
							? Number(shop.totalSell || 0) / Number(shop.checksCount || 0)
							: 0;
					const refundRate =
						Number(shop.totalSell || 0) > 0 ? (refunds / Number(shop.totalSell || 0)) * 100 : 0;
					return {
						name,
						revenue: Number(shop.totalSell || 0),
						averageCheck,
						refunds,
						expenses,
						netRevenue,
						checks: Number(shop.checksCount || 0),
						refundRate,
					};
				});
			const getLeaderReason = (
				leader: {
					averageCheck: number;
					checks: number;
					refundRate: number;
				},
				rows: Array<{ averageCheck: number; checks: number; refundRate: number }>,
			): "чек" | "трафик" | "конверсия" => {
				if (rows.length === 0) return "чек";
				const avgCheck =
					rows.reduce((sum, item) => sum + item.averageCheck, 0) / Math.max(1, rows.length);
				const avgTraffic =
					rows.reduce((sum, item) => sum + item.checks, 0) / Math.max(1, rows.length);
				const avgRefundRate =
					rows.reduce((sum, item) => sum + item.refundRate, 0) / Math.max(1, rows.length);
				const checkScore = avgCheck > 0 ? leader.averageCheck / avgCheck : 0;
				const trafficScore = avgTraffic > 0 ? leader.checks / avgTraffic : 0;
				const conversionScore =
					avgRefundRate > 0 ? (avgRefundRate - leader.refundRate) / avgRefundRate + 1 : 1;
				if (checkScore >= trafficScore && checkScore >= conversionScore) return "чек";
				if (trafficScore >= checkScore && trafficScore >= conversionScore) return "трафик";
				return "конверсия";
			};
			const buildLeaderCardData = (
				rows: Array<{
					name: string;
					netRevenue: number;
					averageCheck: number;
					checks: number;
					refundRate: number;
				}>,
			) => {
				if (rows.length === 0) return null;
				const sorted = [...rows].sort((a, b) => b.netRevenue - a.netRevenue);
				const leader = sorted[0];
				const second = sorted[1];
				return {
					name: leader.name,
					netRevenue: leader.netRevenue,
					gapToSecond: second ? leader.netRevenue - second.netRevenue : leader.netRevenue,
					reason: getLeaderReason(leader, rows),
				};
			};
			const pctChange = (current: number, previous: number) => {
				if (previous <= 0) return current > 0 ? 100 : 0;
				return ((current - previous) / previous) * 100;
			};
			const dayShopKpiRows = buildShopKpiRowsFromFinancial(currentData);
			const weekShopKpiRows = buildShopKpiRowsFromFinancial(weekData);
			const dayLeader = buildLeaderCardData(dayShopKpiRows);
			const weekLeader = buildLeaderCardData(weekShopKpiRows);

			const currentNetSales = Number(currentData.grandTotalSell || 0) -
				Number(currentData.grandTotalRefund || 0);
			const currentChecks = Number(currentData.totalChecks || 0);
			const currentAvgCheck = currentChecks > 0 ? currentNetSales / currentChecks : 0;
			const currentRefundRate =
				Number(currentData.grandTotalSell || 0) > 0
					? (Number(currentData.grandTotalRefund || 0) /
							Number(currentData.grandTotalSell || 0)) *
						100
					: 0;

			const previousNetSales = Number(previousData.grandTotalSell || 0) -
				Number(previousData.grandTotalRefund || 0);
			const previousChecks = Number(previousData.totalChecks || 0);
			const previousAvgCheck = previousChecks > 0 ? previousNetSales / previousChecks : 0;
			const previousRefundRate =
				Number(previousData.grandTotalSell || 0) > 0
					? (Number(previousData.grandTotalRefund || 0) /
							Number(previousData.grandTotalSell || 0)) *
						100
					: 0;

			const checksDeltaPct = pctChange(currentChecks, previousChecks);
			const avgCheckDeltaPct = pctChange(currentAvgCheck, previousAvgCheck);
			const salesDeltaPct = pctChange(currentNetSales, previousNetSales);
			const refundDeltaPp = currentRefundRate - previousRefundRate;

			const previousByShop = new Map<
				string,
				{ netSales: number; checks: number; avgCheck: number; refundRate: number }
			>();
			for (const [shopName, shopData] of Object.entries(
				previousData.salesDataByShopName || {},
			)) {
				const totalRefund = Object.values(shopData.refund || {}).reduce(
					(sum, val) => sum + Number(val || 0),
					0,
				);
				const netSales = Number(shopData.totalSell || 0) - totalRefund;
				const checks = Number(shopData.checksCount || 0);
				previousByShop.set(shopName, {
					netSales,
					checks,
					avgCheck: checks > 0 ? netSales / checks : 0,
					refundRate:
						Number(shopData.totalSell || 0) > 0
							? (totalRefund / Number(shopData.totalSell || 0)) * 100
							: 0,
				});
			}

			const shopMetrics = Object.entries(currentData.salesDataByShopName || {}).map(
				([shopName, shopData]) => {
					const totalRefund = Object.values(shopData.refund || {}).reduce(
						(sum, val) => sum + Number(val || 0),
						0,
					);
					const netSales = Number(shopData.totalSell || 0) - totalRefund;
					const checks = Number(shopData.checksCount || 0);
					const avgCheck = checks > 0 ? netSales / checks : 0;
					const refundRate =
						Number(shopData.totalSell || 0) > 0
							? (totalRefund / Number(shopData.totalSell || 0)) * 100
							: 0;
					const prev = previousByShop.get(shopName);
					return {
						shopName,
						netSales,
						checks,
						avgCheck,
						refundRate,
						prevNetSales: prev?.netSales ?? 0,
						prevChecks: prev?.checks ?? 0,
						prevAvgCheck: prev?.avgCheck ?? 0,
					};
				},
			);

			const riskRows = shopMetrics
				.map((shop) => {
					const planInfo = planData[shop.shopName];
					const plan =
						typeof planInfo === "number"
							? Number(planInfo || 0)
							: Number(planInfo?.datePlan || 0);
					const fact = shop.netSales;
					const progress = plan > 0 ? (fact / plan) * 100 : 0;
					const risk =
						plan > 0
							? clampRange(100 - progress + (shop.refundRate > 8 ? 6 : 0), 0, 99)
							: 0;
					return {
						shopName: shop.shopName,
						plan,
						fact,
						progress,
						risk,
						missing: Math.max(0, plan - fact),
					};
				})
				.filter((row) => row.plan > 0)
				.sort((a, b) => b.risk - a.risk);

			const totalPlan = riskRows.reduce((sum, row) => sum + row.plan, 0);
			const weightedRisk = totalPlan
				? riskRows.reduce((sum, row) => sum + row.risk * row.plan, 0) / totalPlan
				: 0;
			const redShops = riskRows.filter((row) => row.risk >= 40 || row.progress < 70);

			const topActions: string[] = [];
			if (redShops.length > 0) {
				const top = redShops[0];
				topActions.push(
					`Фокус на ${top.shopName}: закрыть отставание ${formatMoney(top.missing)} ₽ до конца смены.`,
				);
			}
			const refundRiskShops = shopMetrics
				.filter((shop) => shop.refundRate > 8)
				.sort((a, b) => b.refundRate - a.refundRate);
			if (refundRiskShops.length > 0) {
				topActions.push(
					`Снизить возвраты в ${refundRiskShops[0].shopName}: сейчас ${refundRiskShops[0].refundRate.toFixed(1)}%.`,
				);
			}
			if (salesDeltaPct < -5) {
				topActions.push(
					`Оперативно восстановить темп: сеть просела на ${Math.abs(salesDeltaPct).toFixed(1)}% к прошлому периоду.`,
				);
			}
			while (topActions.length < 3) {
				topActions.push("Проверить наличие топ-SKU и усилить продажи в пиковый час.");
			}

			const checklistShops = (redShops.length > 0 ? redShops : riskRows)
				.slice(0, 3)
				.map((shop) => ({
					shopName: shop.shopName,
					items: [
						"Проверить остатки топ-3 SKU.",
						"Запустить дополнительный upsell на кассе.",
						"Промониторить возвраты и спорные чеки в реальном времени.",
					],
				}));

			const now = new Date();
			const hour = now.getHours() + now.getMinutes() / 60;
			const openHour = 10;
			const closeHour = 22;
			const elapsed = clampRange((hour - openHour) / (closeHour - openHour), 0.2, 1);
			const forecastValue =
				dateMode === "today" ? currentNetSales / Math.max(0.2, elapsed) : currentNetSales;
			const uncertainty =
				dateMode === "today"
					? clampRange(0.45 - elapsed * 0.25, 0.12, 0.4)
					: 0.2;
			const forecastLower = forecastValue * (1 - uncertainty);
			const forecastUpper = forecastValue * (1 + uncertainty);
			const confidence = Math.round((1 - uncertainty) * 100);

			const forecastFactors: Array<{
				label: string;
				value: string;
				impact: "plus" | "minus" | "neutral";
			}> = [
				{
					label: "Трафик (чеки)",
					value: `${checksDeltaPct >= 0 ? "+" : ""}${checksDeltaPct.toFixed(1)}%`,
					impact:
						checksDeltaPct > 2 ? "plus" : checksDeltaPct < -2 ? "minus" : "neutral",
				},
				{
					label: "Средний чек",
					value: `${avgCheckDeltaPct >= 0 ? "+" : ""}${avgCheckDeltaPct.toFixed(1)}%`,
					impact:
						avgCheckDeltaPct > 2
							? "plus"
							: avgCheckDeltaPct < -2
								? "minus"
								: "neutral",
				},
				{
					label: "Доля возвратов",
					value: `${currentRefundRate.toFixed(1)}% (${refundDeltaPp >= 0 ? "+" : ""}${refundDeltaPp.toFixed(1)} п.п.)`,
					impact:
						refundDeltaPp > 0.5
							? "minus"
							: refundDeltaPp < -0.5
								? "plus"
								: "neutral",
				},
			];

			const reasonCandidates = [
				{ reason: "Падение трафика (меньше чеков)", score: Math.max(0, -checksDeltaPct) },
				{ reason: "Просадка среднего чека", score: Math.max(0, -avgCheckDeltaPct) },
				{ reason: "Рост возвратов", score: Math.max(0, refundDeltaPp * 2) },
			];
			const mainReason =
				salesDeltaPct >= 0
					? "Просадки нет, динамика стабильная или положительная."
					: reasonCandidates.sort((a, b) => b.score - a.score)[0].reason;

			const dropByShop = shopMetrics
				.filter((shop) => shop.prevNetSales > 0)
				.map((shop) => ({
					shopName: shop.shopName,
					current: shop.netSales,
					previous: shop.prevNetSales,
					deltaPct: pctChange(shop.netSales, shop.prevNetSales),
				}))
				.sort((a, b) => a.deltaPct - b.deltaPct)
				.slice(0, 5);

			const incidents: Array<{
				shopName: string;
				type: string;
				details: string;
				severity: number;
			}> = [];
			for (const shop of shopMetrics) {
				if (shop.refundRate > 10) {
					incidents.push({
						shopName: shop.shopName,
						type: "Возвраты",
						details: `Высокая доля возвратов: ${shop.refundRate.toFixed(1)}%`,
						severity: Math.round(shop.refundRate * 3),
					});
				}
				if (shop.prevChecks > 5) {
					const deltaChecks = pctChange(shop.checks, shop.prevChecks);
					if (deltaChecks < -30) {
						incidents.push({
							shopName: shop.shopName,
							type: "Чеки",
							details: `Просадка количества чеков: ${deltaChecks.toFixed(1)}%`,
							severity: Math.round(Math.abs(deltaChecks)),
						});
					}
				}
				if (shop.prevAvgCheck > 0) {
					const deltaAvg = pctChange(shop.avgCheck, shop.prevAvgCheck);
					if (deltaAvg < -25) {
						incidents.push({
							shopName: shop.shopName,
							type: "Средний чек",
							details: `Падение среднего чека: ${deltaAvg.toFixed(1)}%`,
							severity: Math.round(Math.abs(deltaAvg)),
						});
					}
				}
			}
			incidents.sort((a, b) => b.severity - a.severity);

			const plannedQtyByProduct = new Map<string, number>();
			for (const shop of shopMetrics) {
				const planInfo = planData[shop.shopName];
				const quantityMap =
					typeof planInfo === "object" && planInfo?.dataQuantity
						? planInfo.dataQuantity
						: undefined;
				if (!quantityMap) continue;
				for (const [productName, quantityRaw] of Object.entries(quantityMap)) {
					const qty = Number(quantityRaw || 0);
					if (!Number.isFinite(qty) || qty <= 0) continue;
					plannedQtyByProduct.set(
						productName,
						(plannedQtyByProduct.get(productName) || 0) + qty,
					);
				}
			}

			const actualByProduct = new Map(
				(currentData.topProducts || []).map((item) => [item.productName, item]),
			);
			const losses = Array.from(plannedQtyByProduct.entries())
				.map(([productName, planQty]) => {
					const actual = actualByProduct.get(productName);
					const actualQty = Number(actual?.netQuantity ?? actual?.quantity ?? 0);
					const avgPrice =
						Number(actual?.averagePrice || 0) > 0
							? Number(actual?.averagePrice || 0)
							: actualQty > 0
								? Number(actual?.netRevenue || 0) / actualQty
								: 0;
					const lostQty = Math.max(0, planQty - actualQty);
					const lostRevenue = lostQty * Math.max(0, avgPrice);
					return { productName, planQty, actualQty, lostQty, lostRevenue };
				})
				.filter((row) => row.lostQty > 0 && row.lostRevenue > 0)
				.sort((a, b) => b.lostRevenue - a.lostRevenue)
				.slice(0, 6);

			const fallbackLosses =
				losses.length > 0
					? losses
					: (currentData.topProducts || []).slice(0, 6).map((item) => {
							const impliedLostQty = Math.max(1, Math.round((item.netQuantity || 1) * 0.15));
							return {
								productName: item.productName,
								planQty: (item.netQuantity || 0) + impliedLostQty,
								actualQty: item.netQuantity || 0,
								lostQty: impliedLostQty,
								lostRevenue: impliedLostQty * Math.max(0, item.averagePrice || 0),
							};
						});
			const totalLoss = fallbackLosses.reduce((sum, row) => sum + row.lostRevenue, 0);

			c.header("x-data-source", mode);
			return c.json({
				since: payload.since,
				until: payload.until,
				previous: { since: prevSince, until: prevUntil },
				insights: {
					risk: {
						networkProbability: weightedRisk,
						redShops,
					},
					actions: {
						top3: topActions.slice(0, 3),
						checklist: checklistShops,
					},
					forecast: {
						value: forecastValue,
						lower: forecastLower,
						upper: forecastUpper,
						confidence,
						factors: forecastFactors,
					},
					drop: {
						salesDeltaPct,
						mainReason,
						byShop: dropByShop,
					},
					anomalies: {
						incidents: incidents.slice(0, 8),
					},
					losses: {
						totalLoss,
						skus: fallbackLosses,
					},
					context: {
						checksDeltaPct,
						avgCheckDeltaPct,
						refundRate: currentRefundRate,
						refundDeltaPp,
					},
				},
				bestShop: {
					dayRows: dayShopKpiRows,
					weekRows: weekShopKpiRows,
					dayLeader,
					weekLeader,
				},
				meta: buildDataModeMeta(mode),
			});
		} catch (error) {
			logger.error("Dashboard home insights failed", { error });
			return c.json({
				since: "",
				until: "",
				previous: { since: "", until: "" },
				insights: {
					risk: {
						networkProbability: 0,
						redShops: [],
					},
					actions: {
						top3: [],
						checklist: [],
					},
					forecast: {
						value: 0,
						lower: 0,
						upper: 0,
						confidence: 0,
						factors: [],
					},
					drop: {
						salesDeltaPct: 0,
						mainReason: "Недостаточно данных",
						byShop: [],
					},
					anomalies: {
						incidents: [],
					},
					losses: {
						totalLoss: 0,
						skus: [],
					},
					context: {
						checksDeltaPct: 0,
						avgCheckDeltaPct: 0,
						refundRate: 0,
						refundDeltaPp: 0,
					},
				},
				bestShop: {
					dayRows: [],
					weekRows: [],
					dayLeader: null,
					weekLeader: null,
				},
				meta: buildDataModeMeta("DB"),
				error: "DASHBOARD_HOME_INSIGHTS_FAILED",
			});
		}
	})

	.get("/financial", async (c) => {
		try {
			const startDate = c.req.query("since");
			const endDate = c.req.query("until");
			const requestedShopUuid = c.req.query("shopUuid")?.trim() || "";
			const scopedShopUuid = await resolveScopedShopUuidForFinancial(c);
			const effectiveShopUuid = requestedShopUuid || scopedShopUuid || "";
			const kv = c.env.KV;
			const mode = await getDataModeOrDefault(c.env);

			if (!startDate || !endDate) {
				return c.json({ error: "since и until обязательны" }, 400);
			}

			const tzOffsetMinutes = Number(c.env.ALERT_TZ_OFFSET_MINUTES ?? 180);
			const { todayKey, yesterdayKey } =
				getLocalTodayAndYesterdayKeys(tzOffsetMinutes);
			const isSingleDay = startDate === endDate;
			const scopeShopId = effectiveShopUuid || "all";
			const financialCacheVersion = "v3";
			const cacheKey = isSingleDay
				? `sales:${financialCacheVersion}:mode:${mode}:${buildSalesDayKey(scopeShopId, startDate)}`
				: `sales:${financialCacheVersion}:mode:${mode}:store:${scopeShopId}:day:${startDate}-${endDate}`;
			const ttlSeconds = isSingleDay
				? startDate === todayKey
					? 120
					: startDate === yesterdayKey
						? 900
						: 600
				: 600;

			const { data: financialData, cacheHit } = await getCachedJson(
				kv,
				cacheKey,
				ttlSeconds,
				async () => {
					const { since, until } = buildUtcRangeForLocalDates(
						startDate,
						endDate,
						tzOffsetMinutes,
					);
					return await loadFinancialDataByMode({
						c,
						mode,
						effectiveShopUuid,
						since,
						until,
						startDate,
						endDate,
						todayKey,
					});
				},
			);
			c.header("x-cache", cacheHit ? "hit" : "miss");
			c.header("x-data-source", mode);

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

			return c.json({
				...financialData,
				meta: buildDataModeMeta(mode),
			});
		} catch (error) {
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})
	.get("/financial/today", async (c) => {
		try {
			const kv = c.env.KV;
			const requestedShopUuid = c.req.query("shopUuid")?.trim() || "";
			const scopedShopUuid = await resolveScopedShopUuidForFinancial(c);
			const effectiveShopUuid = requestedShopUuid || scopedShopUuid || "";
			const mode = await getDataModeOrDefault(c.env);

			const tzOffsetMinutes = Number(c.env.ALERT_TZ_OFFSET_MINUTES ?? 180);
			const todayKey = getLocalDateKey(new Date(), tzOffsetMinutes);
			const scopeShopId = effectiveShopUuid || "all";
			const financialCacheVersion = "v3";
			const { data: financialData, cacheHit } = await getCachedJson(
				kv,
				`sales:${financialCacheVersion}:mode:${mode}:${buildSalesDayKey(scopeShopId, todayKey)}`,
				120,
				async () => {
					const localTodayKey = getLocalDateKey(new Date(), tzOffsetMinutes);
					const { since, until } = buildUtcRangeForLocalDates(
						localTodayKey,
						localTodayKey,
						tzOffsetMinutes,
					);
					return await loadFinancialDataByMode({
						c,
						mode,
						effectiveShopUuid,
						since,
						until,
						startDate: localTodayKey,
						endDate: localTodayKey,
						todayKey: localTodayKey,
					});
				},
			);
				c.header("x-cache", cacheHit ? "hit" : "miss");
				c.header("x-data-source", mode);
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
				return c.json({
					...financialData,
					meta: buildDataModeMeta(mode),
				});
		} catch (error) {
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})
	.post("/financial/today/direct", async (c) => {
		try {
			const employeeRole = await resolveEmployeeRole(c);

			if (employeeRole !== "SUPERADMIN") {
				return c.json({ error: "Доступ только для SUPERADMIN" }, 403);
			}

			const evo = c.var.evotor;
			const now = new Date();
			const since = formatDateWithTime(now, false);
			const until = formatDateWithTime(now, true);
				const shopUuids = await getShopUuidsWithFallback(c, evo);
				const mode: DataMode = "ELVATOR";
				const financialData = await getFinancialDataDirectFromEvotor(
					evo,
					shopUuids,
				since,
				until,
			);

			return c.json({
				...financialData,
				meta: buildDataModeMeta(mode),
			});
		} catch (error) {
			logger.error("Ошибка при прямом запросе финансовых данных:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})
	.post("/index/warm", async (c) => {
		try {
			const employeeRole = await resolveEmployeeRole(c);

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
			const employeeRole = await resolveEmployeeRole(c);

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
			const employeeRole = await resolveEmployeeRole(c);

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
	.post("/employee-kpi/backfill-index-range", async (c) => {
		try {
			const employeeRole = await resolveEmployeeRole(c);

			if (employeeRole !== "SUPERADMIN") {
				return c.json({ error: "Доступ только для SUPERADMIN" }, 403);
			}

			const payload = await c.req.json().catch(() => ({}));
			const sinceDate = String(payload?.since || "").trim();
			const untilDate = String(payload?.until || "").trim();
			if (
				!/^\d{4}-\d{2}-\d{2}$/.test(sinceDate) ||
				!/^\d{4}-\d{2}-\d{2}$/.test(untilDate)
			) {
				return c.json(
					{ error: "since/until are required (YYYY-MM-DD)" },
					400,
				);
			}
			if (sinceDate > untilDate) {
				return c.json({ error: "since must be <= until" }, 400);
			}

			const db = c.get("db");
			const tzOffsetMinutes = Number(c.env.ALERT_TZ_OFFSET_MINUTES ?? 180);
			const { since, until } = buildUtcRangeForLocalDates(
				sinceDate,
				untilDate,
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
			const touchedShopDates = new Set<string>();

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
				if (!docs || docs.length === 0) continue;

				const normalized = normalizeDocuments(docs);
				await upsertReceipts(db, normalized.receipts);
				await upsertReceiptPositions(db, normalized.positions);
				await upsertReferenceSets(db, normalized.sets);

				rebuiltReceipts += normalized.receipts.length;
				rebuiltPositions += normalized.positions.length;
				for (const value of normalized.sets.shopDates) {
					touchedShopDates.add(value);
				}
			}

			const shopDates = Array.from(touchedShopDates).map((value) => {
				const [shopId, date] = value.split(":");
				return { shopId, date };
			});
			await recomputeEmployeeKpiDailyForShopDates(db, shopDates);

			return c.json({
				ok: true,
				since: sinceDate,
				until: untilDate,
				shops: shopUuids.length,
				shopDatesRecomputed: shopDates.length,
				deletedReceipts,
				deletedPositions,
				rebuiltReceipts,
				rebuiltPositions,
			});
		} catch (error) {
			logger.error("Employee KPI backfill from index range failed", { error });
			return c.json({ error: "EMPLOYEE_KPI_BACKFILL_FROM_INDEX_FAILED" }, 500);
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

	.post("/order-v2", async (c) => {
		try {
			const payload = validate(OrderV2Schema, await c.req.json().catch(() => ({})));
			const result = await buildOrderForecastV2({
				db: c.get("db"),
				evotor: c.var.evotor,
				shopUuid: payload.shopUuid,
				groups: payload.groups,
				startDate: payload.startDate,
				endDate: payload.endDate,
				forecastHorizonDays: payload.forecastHorizonDays ?? 7,
				leadTimeDays: payload.leadTimeDays ?? 2,
				serviceLevel: (payload.serviceLevel ?? 0.95) as 0.8 | 0.9 | 0.95 | 0.98,
				budgetLimit: payload.budgetLimit ?? null,
			});
			return c.json(result);
		} catch (error) {
			logger.error("Ошибка при обработке запроса order-v2:", error);
			const { status, body } = toApiErrorPayload(error, {
				code: "ORDER_V2_REPORT_FAILED",
				message: "Произошла ошибка при обработке запроса order-v2.",
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

			let productUuids = await c.var.evotor.getProductsByGroup(shopUuid, groups);

			if (!productUuids || productUuids.length === 0) {
				logger.warn("salesResult: Evotor products empty, fallback to DB", {
					shopUuid,
					groupsCount: groups.length,
				});
				productUuids = await getProductsByGroup(c.get("db"), shopUuid, groups);
			}

			if (!productUuids || productUuids.length === 0) {
				return c.json(
					{
						error:
							"По выбранным группам не найдены товары. Проверьте магазин/группы.",
						code: "SALES_RESULT_PRODUCTS_NOT_FOUND",
					},
					422,
				);
			}

			const allowed = new Set(productUuids);
			const documents = await c.var.evotor.getDocuments(shopUuid, since, until);
			const salesData: Record<string, { quantitySale: number; sum: number }> = {};

			for (const doc of documents) {
				if (!["SELL", "PAYBACK"].includes(doc.type)) continue;

				for (const trans of doc.transactions || []) {
					if (trans.type !== "REGISTER_POSITION") continue;
					if (!allowed.has(trans.commodityUuid)) continue;

					const productName = trans.commodityName || trans.commodityUuid;
					if (!salesData[productName]) {
						salesData[productName] = { quantitySale: 0, sum: 0 };
					}
					salesData[productName].quantitySale += Number(trans.quantity || 0);
					salesData[productName].sum += Number(trans.sum || 0);
				}
			}

			// const sortedSalesDataByValue = sortSalesSummary(salesData, sortCriteria);

			const shopName = await c.var.evotor.getShopName(shopUuid);

			return c.json({ salesData, shopName, startDate, endDate });
		} catch (error) {
			logger.error("SalesResult failed:", error);
			const { status, body } = toApiErrorPayload(error, {
				code: "SALES_RESULT_FAILED",
				message: "Не удалось сформировать отчёт по продажам",
			});
			return c.json(body, status as 200);
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

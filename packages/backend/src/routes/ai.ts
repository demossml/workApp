import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import {
	AiInsightsRequestSchema,
	AiDirectorAlertsRequestSchema,
	AiDirectorForecastRequestSchema,
	AiDirectorChatRequestSchema,
	AiDirectorStoreRatingRequestSchema,
	AiDirectorEmployeeAnalysisRequestSchema,
	AiDirectorEmployeeDeepAnalysisRequestSchema,
	AiDirectorDemandForecastRequestSchema,
	AiDirectorExplainSalesRequestSchema,
	AiDirectorHeatmapRequestSchema,
	AiDirectorReportRequestSchema,
	AiDirectorRecommendationsRequestSchema,
	AiDirectorSummaryRequestSchema,
	AiDirectorStockMonitorRequestSchema,
	AiDirectorVelocityRequestSchema,
	DashboardSummary2InsightsRequestSchema,
	EmployeeShiftKpiSchema,
	OpeningPhotoDigestRequestSchema,
	ProcurementRecommendationsSchema,
	validate,
} from "../validation";
import {
	assert,
	buildSinceUntilFromDocuments,
	formatDateWithTime,
	getPeriodRangeEvotor,
	getTodayRangeEvotor,
} from "../utils";
import { getPreviousPeriodDates } from "../ai/dataEnrichment";
import {
	getLatestCloseDates,
	saveNewIndexDocuments,
} from "../db/repositories/indexDocuments";
import {
	getLatestUserOpeningForDate,
	getOpeningsByDate,
} from "../db/repositories/openStores";
import {
	listActiveTgSubscriptions,
	touchTgSubscriptionLastSentAt,
} from "../db/repositories/tgSubscriptions";
import {
	getOpeningPhotoDigestCache,
	saveOpeningPhotoDigestCache,
} from "../db/repositories/openingPhotoDigestCache";
import {
	analyzeDocsStaffTask,
	getHoroscopeByDateTask,
	analyzeDocsInsightsTask,
	analyzeDocsAnomaliesTask,
	analyzeDocsPatternsTask,
} from "../ai";
import type { IndexDocument, Product } from "../evotor/types";
import { getDocumentsFromIndexFirst } from "../services/indexDocumentsFallback";
import { sendTelegramMessage } from "../../utils/sendTelegramMessage";
import { buildAiReportKey } from "../utils/kvCache";
import { getSalesHourly } from "../db/repositories/salesHourly";
import { getWeatherSummary, weatherDemandFactor } from "../utils/weather";
import { buildEmployeeKpiNarrative } from "../ai/employeeKpiNarrative";
import {
	listAiAlerts,
	listAiShiftSummaries,
} from "../db/repositories/aiHistory";

const toIsoDate = (date: Date) => date.toISOString().split("T")[0];

const buildEvotorDayRange = (dateKey: string): [string, string] => [
	`${dateKey}T03:00:00.000+0000`,
	`${dateKey}T21:00:00.000+0000`,
];

const formatEvotorTimestamp = (date: Date) => {
	const pad = (num: number, size = 2) => String(num).padStart(size, "0");
	const year = date.getUTCFullYear();
	const month = pad(date.getUTCMonth() + 1);
	const day = pad(date.getUTCDate());
	const hours = pad(date.getUTCHours());
	const minutes = pad(date.getUTCMinutes());
	const seconds = pad(date.getUTCSeconds());
	const ms = pad(date.getUTCMilliseconds(), 3);
	const fractional = `${ms}000`.slice(0, 6);
	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${fractional}+0000`;
};

const shiftDateKey = (dateKey: string, deltaDays: number) => {
	const date = new Date(`${dateKey}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + deltaDays);
	return toIsoDate(date);
};

type DirectorMetrics = {
	revenue: number;
	checks: number;
	averageCheck: number;
	costOfGoods: number;
	profit: number;
	refunds: number;
	refundChecks: number;
};

type DirectorPeriodResult = {
	since: string;
	until: string;
	metrics: DirectorMetrics;
};

type DirectorAlert = {
	code: string;
	severity: "high" | "medium" | "low";
	title: string;
	details: string;
	shopUuid?: string;
	shopName?: string;
	category?: string;
	meta?: Record<string, unknown>;
};

type VelocityEntry = {
	id: string;
	name: string;
	quantity: number;
	revenue: number;
	velocityPerDay: number;
	velocityPerHour: number;
};

type RecommendationItem = {
	type: "procurement" | "dead_stock" | "abc";
	id: string;
	name: string;
	category?: string;
	priorityScore: number;
	priority: "high" | "medium" | "low";
	details: string;
	metrics?: Record<string, number | string | null>;
};

const aggregateDirectorMetrics = (docs: IndexDocument[]): DirectorMetrics => {
	let sellRevenue = 0;
	let refundRevenue = 0;
	let sellCost = 0;
	let refundCost = 0;
	let sellChecks = 0;
	let refundChecks = 0;

	for (const doc of docs) {
		if (doc.type === "SELL") sellChecks += 1;
		if (doc.type === "PAYBACK") refundChecks += 1;

		for (const trans of doc.transactions || []) {
			if (trans.type === "PAYMENT") {
				const rawSum = Number(trans.sum || 0);
				if (!Number.isFinite(rawSum) || rawSum === 0) continue;
				if (doc.type === "PAYBACK") {
					refundRevenue += Math.abs(rawSum);
				} else if (doc.type === "SELL") {
					sellRevenue += rawSum;
				}
			}

			if (trans.type === "REGISTER_POSITION") {
				const lineCost =
					Number(trans.costPrice || 0) * Number(trans.quantity || 0);
				if (!Number.isFinite(lineCost) || lineCost === 0) continue;
				if (doc.type === "PAYBACK") {
					refundCost += lineCost;
				} else if (doc.type === "SELL") {
					sellCost += lineCost;
				}
			}
		}
	}

	const revenue = sellRevenue - refundRevenue;
	const costOfGoods = sellCost - refundCost;
	const profit = revenue - costOfGoods;
	const averageCheck = sellChecks > 0 ? revenue / sellChecks : 0;

	return {
		revenue,
		checks: sellChecks,
		averageCheck,
		costOfGoods,
		profit,
		refunds: refundRevenue,
		refundChecks,
	};
};

const averageDirectorMetrics = (metrics: DirectorMetrics[]): DirectorMetrics => {
	if (metrics.length === 0) {
		return {
			revenue: 0,
			checks: 0,
			averageCheck: 0,
			costOfGoods: 0,
			profit: 0,
			refunds: 0,
			refundChecks: 0,
		};
	}

	const totals = metrics.reduce(
		(acc, item) => ({
			revenue: acc.revenue + item.revenue,
			checks: acc.checks + item.checks,
			averageCheck: acc.averageCheck + item.averageCheck,
			costOfGoods: acc.costOfGoods + item.costOfGoods,
			profit: acc.profit + item.profit,
			refunds: acc.refunds + item.refunds,
			refundChecks: acc.refundChecks + item.refundChecks,
		}),
		{
			revenue: 0,
			checks: 0,
			averageCheck: 0,
			costOfGoods: 0,
			profit: 0,
			refunds: 0,
			refundChecks: 0,
		},
	);

	const denom = metrics.length;

	return {
		revenue: totals.revenue / denom,
		checks: totals.checks / denom,
		averageCheck: totals.averageCheck / denom,
		costOfGoods: totals.costOfGoods / denom,
		profit: totals.profit / denom,
		refunds: totals.refunds / denom,
		refundChecks: totals.refundChecks / denom,
	};
};

const calcChangePct = (current: number, previous: number) => {
	if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
		return null;
	}
	return (current - previous) / previous;
};

const getMskHour = (date: Date) => {
	const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
	return shifted.getUTCHours();
};

const isWeekend = (dateKey: string) => {
	const date = new Date(`${dateKey}T00:00:00Z`);
	const day = date.getUTCDay();
	return day === 0 || day === 6;
};

const listDateKeysInclusive = (since: string, until: string) => {
	const keys: string[] = [];
	const start = new Date(`${since}T00:00:00Z`);
	const end = new Date(`${until}T00:00:00Z`);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return keys;
	const cursor = new Date(start);
	while (cursor <= end) {
		keys.push(toIsoDate(cursor));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return keys;
};

const percentileValue = (values: number[], pct: number) => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const idx = Math.min(
		sorted.length - 1,
		Math.max(0, Math.floor((pct / 100) * sorted.length)),
	);
	return sorted[idx];
};

const applyPriorityByScore = (items: RecommendationItem[]): RecommendationItem[] => {
	if (items.length === 0) return items;
	const scores = items.map((item) => item.priorityScore);
	const highThreshold = percentileValue(scores, 80);
	const mediumThreshold = percentileValue(scores, 50);
	return items.map((item) => ({
		...item,
		priority:
			item.priorityScore >= highThreshold
				? "high"
				: item.priorityScore >= mediumThreshold
					? "medium"
					: "low",
	})) as RecommendationItem[];
};

const collectCommodityUuids = (docs: IndexDocument[]) => {
	const uuids = new Set<string>();
	for (const doc of docs) {
		for (const tx of doc.transactions || []) {
			if (tx.type !== "REGISTER_POSITION") continue;
			if (tx.commodityUuid) uuids.add(tx.commodityUuid);
		}
	}
	return Array.from(uuids);
};

const fetchCategoryMapForShop = async (
	db: IEnv["Bindings"]["DB"],
	shopId: string,
	productUuids: string[],
) => {
	if (productUuids.length === 0) return new Map<string, string>();

	const placeholders = productUuids.map(() => "?").join(", ");
	const productQuery = `
		SELECT uuid, parentUuid
		FROM shopProduct
		WHERE shopId = ? AND uuid IN (${placeholders})
	`;

	const productRows = await db
		.prepare(productQuery)
		.bind(shopId, ...productUuids)
		.all();

	const productParent = new Map<string, string>();
	const parentUuids = new Set<string>();

	for (const row of productRows.results || []) {
		const uuid = String((row as { uuid?: unknown }).uuid || "");
		const parentUuid = String((row as { parentUuid?: unknown }).parentUuid || "");
		if (!uuid) continue;
		productParent.set(uuid, parentUuid);
		if (parentUuid) parentUuids.add(parentUuid);
	}

	if (parentUuids.size === 0) return new Map<string, string>();

	const parentList = Array.from(parentUuids);
	const parentPlaceholders = parentList.map(() => "?").join(", ");
	const parentQuery = `
		SELECT uuid, name
		FROM shopProduct
		WHERE shopId = ? AND product_group = 1 AND uuid IN (${parentPlaceholders})
	`;

	const parentRows = await db
		.prepare(parentQuery)
		.bind(shopId, ...parentList)
		.all();

	const parentName = new Map<string, string>();
	for (const row of parentRows.results || []) {
		const uuid = String((row as { uuid?: unknown }).uuid || "");
		const name = String((row as { name?: unknown }).name || "");
		if (!uuid || !name) continue;
		parentName.set(uuid, name);
	}

	const categoryMap = new Map<string, string>();
	for (const [productUuid, parentUuid] of productParent.entries()) {
		const name = parentUuid ? parentName.get(parentUuid) : undefined;
		if (name) categoryMap.set(productUuid, name);
	}

	return categoryMap;
};

const buildCategoryRevenueByShop = async (
	db: IEnv["Bindings"]["DB"],
	shopId: string,
	docs: IndexDocument[],
) => {
	const warnings: string[] = [];
	const commodityUuids = collectCommodityUuids(docs);
	if (commodityUuids.length === 0) {
		return { revenueByCategory: new Map<string, number>(), warnings };
	}

	let categoryMap = new Map<string, string>();
	try {
		categoryMap = await fetchCategoryMapForShop(db, shopId, commodityUuids);
	} catch (error) {
		warnings.push("category_map_unavailable");
	}

	const revenueByCategory = new Map<string, number>();

	for (const doc of docs) {
		const isRefund = doc.type === "PAYBACK";
		for (const tx of doc.transactions || []) {
			if (tx.type !== "REGISTER_POSITION") continue;
			const amount = Number(tx.sum || 0);
			if (!Number.isFinite(amount) || amount === 0) continue;
			const key = tx.commodityUuid
				? categoryMap.get(tx.commodityUuid) || "Без категории"
				: "Без категории";
			const prev = revenueByCategory.get(key) || 0;
			revenueByCategory.set(
				key,
				prev + (isRefund ? -Math.abs(amount) : amount),
			);
		}
	}

	return { revenueByCategory, warnings };
};

const buildCategoryStatsByShop = async (
	db: IEnv["Bindings"]["DB"],
	shopId: string,
	docs: IndexDocument[],
) => {
	const warnings: string[] = [];
	const commodityUuids = collectCommodityUuids(docs);
	if (commodityUuids.length === 0) {
		return {
			quantityByCategory: new Map<string, number>(),
			revenueByCategory: new Map<string, number>(),
			warnings,
		};
	}

	let categoryMap = new Map<string, string>();
	try {
		categoryMap = await fetchCategoryMapForShop(db, shopId, commodityUuids);
	} catch (error) {
		warnings.push("category_map_unavailable");
	}

	const quantityByCategory = new Map<string, number>();
	const revenueByCategory = new Map<string, number>();

	for (const doc of docs) {
		const isRefund = doc.type === "PAYBACK";
		for (const tx of doc.transactions || []) {
			if (tx.type !== "REGISTER_POSITION") continue;
			const qty = Number(tx.quantity || 0);
			const sum = Number(tx.sum || 0);
			if (!Number.isFinite(qty) && !Number.isFinite(sum)) continue;
			const key = tx.commodityUuid
				? categoryMap.get(tx.commodityUuid) || "Без категории"
				: "Без категории";
			if (Number.isFinite(qty) && qty !== 0) {
				const prevQty = quantityByCategory.get(key) || 0;
				quantityByCategory.set(
					key,
					prevQty + (isRefund ? -Math.abs(qty) : qty),
				);
			}
			if (Number.isFinite(sum) && sum !== 0) {
				const prevSum = revenueByCategory.get(key) || 0;
				revenueByCategory.set(
					key,
					prevSum + (isRefund ? -Math.abs(sum) : sum),
				);
			}
		}
	}

	return { quantityByCategory, revenueByCategory, warnings };
};

const buildSkuStats = (
	docs: IndexDocument[],
	categoryMap: Map<string, string>,
) => {
	const skuMap = new Map<
		string,
		{
			name: string;
			category: string | null;
			quantity: number;
			revenue: number;
			lastSaleAt: string | null;
		}
	>();

	for (const doc of docs) {
		const isRefund = doc.type === "PAYBACK";
		for (const tx of doc.transactions || []) {
			if (tx.type !== "REGISTER_POSITION") continue;
			const skuKey = tx.commodityUuid || tx.commodityName || "UNKNOWN";
			const entry = skuMap.get(skuKey) || {
				name: tx.commodityName || skuKey,
				category: tx.commodityUuid
					? categoryMap.get(tx.commodityUuid) || "Без категории"
					: "Без категории",
				quantity: 0,
				revenue: 0,
				lastSaleAt: null,
			};

			const qty = Number(tx.quantity || 0);
			if (Number.isFinite(qty) && qty !== 0) {
				entry.quantity += isRefund ? -Math.abs(qty) : qty;
			}

			const sum = Number(tx.sum || 0);
			if (Number.isFinite(sum) && sum !== 0) {
				entry.revenue += isRefund ? -Math.abs(sum) : sum;
			}

			if (doc.type === "SELL" && doc.closeDate) {
				if (!entry.lastSaleAt || doc.closeDate > entry.lastSaleAt) {
					entry.lastSaleAt = doc.closeDate;
				}
			}

			skuMap.set(skuKey, entry);
		}
	}

	return skuMap;
};

const buildDirectorReportFallback = (input: {
	date: string;
	today: DirectorMetrics;
	yesterday: DirectorMetrics;
	salesChange: number | null;
	alerts: DirectorAlert[];
	forecast: number;
}) => {
	const topAlert = input.alerts[0];
	const happenedLines = [
		`Выручка сегодня: ${compactMoney(input.today.revenue)} ₽, чеков: ${Math.round(input.today.checks)}.`,
		`Изменение к вчера: ${formatPct(input.salesChange)}.`,
	];
	if (topAlert) {
		happenedLines.push(`Главный сигнал: ${topAlert.title}.`);
	}

	const whyLines = [
		`Если тренд сохранится, риск недовыполнения выручки высокий.`,
		`Прогноз на день: ${compactMoney(input.forecast)} ₽.`,
	];

	const actions = [
		"Проверьте топ-3 магазина по выручке и включите усиленные продажи в пиковые часы.",
		"Проверьте наличие ключевых SKU и актуальность цен.",
		"Сфокусируйтесь на причинах падения по категориям с наибольшей долей выручки.",
	];

	return {
		happened: happenedLines.join(" "),
		whyImportant: whyLines.join(" "),
		whatToDo: actions,
	};
};

const getDirectorPeriodMetrics = async (
	db: IEnv["Bindings"]["DB"],
	evo: IEnv["Variables"]["evotor"],
	shopUuids: string[],
	since: string,
	until: string,
): Promise<DirectorPeriodResult> => {
	const docsByShop = await Promise.all(
		shopUuids.map((shopUuid) =>
			getDocumentsFromIndexFirst(db, evo, shopUuid, since, until, {
				types: ["SELL", "PAYBACK"],
				skipFetchIfStale: true,
			}),
		),
	);
	const docs = docsByShop.flat();
	return {
		since,
		until,
		metrics: aggregateDirectorMetrics(docs),
	};
};

const getStoreUuidsFromDb = async (db: IEnv["Bindings"]["DB"]): Promise<string[]> => {
	try {
		const rows = await db
			.prepare("SELECT store_uuid FROM stores")
			.all<{ store_uuid: string }>();
		return (rows.results || []).map((row) => row.store_uuid).filter(Boolean);
	} catch (error) {
		logger.warn("AI director: stores DB lookup failed", { error });
		return [];
	}
};

const resolveDirectorShopUuids = async (
	db: IEnv["Bindings"]["DB"],
	evo: IEnv["Variables"]["evotor"],
	shopUuids?: string[],
): Promise<string[]> => {
	if (shopUuids && shopUuids.length > 0) return shopUuids;
	try {
		return await evo.getShopUuids();
	} catch (error) {
		logger.warn("AI director: getShopUuids failed, using DB fallback", { error });
		return await getStoreUuidsFromDb(db);
	}
};

const resolveDirectorShopNamesMap = async (
	db: IEnv["Bindings"]["DB"],
	evo: IEnv["Variables"]["evotor"],
): Promise<Record<string, string>> => {
	try {
		return (await evo.getShopNameUuidsDict()) || {};
	} catch (error) {
		logger.warn("AI director: getShopNameUuidsDict failed, using DB fallback", {
			error,
		});
		try {
			const rows = await db
				.prepare("SELECT store_uuid, name FROM stores")
				.all<{ store_uuid: string; name: string | null }>();
			const map: Record<string, string> = {};
			for (const row of rows.results || []) {
				if (!row.store_uuid) continue;
				map[row.store_uuid] = row.name || row.store_uuid;
			}
			return map;
		} catch (dbError) {
			logger.warn("AI director: stores names DB lookup failed", {
				error: dbError,
			});
			return {};
		}
	}
};

const daysInRangeInclusive = (startDate: string, endDate: string) => {
	const start = new Date(startDate);
	const end = new Date(endDate);
	const ms = end.getTime() - start.getTime();
	return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
};

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

const getShiftName = (hour: number) => {
	if (hour >= 6 && hour < 14) return "morning";
	if (hour >= 14 && hour < 22) return "evening";
	return "night";
};

const PHOTO_DESCRIBE_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const PHOTO_SUMMARIZE_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const DASHBOARD_SUMMARY2_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const OPENING_DIGEST_TTL_MS = 6 * 60 * 60 * 1000;
const DIRECTOR_REPORT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

const toDDMMYYYY = (isoDate: string) => {
	const [yyyy, mm, dd] = isoDate.split("-");
	return `${dd}-${mm}-${yyyy}`;
};

const toBase64 = (buffer: ArrayBuffer) => {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
};

const extractAiText = (result: unknown): string => {
	if (typeof result === "string") return result.trim();
	if (!result || typeof result !== "object") return "";
	const asAny = result as Record<string, unknown>;
	if (typeof asAny.response === "string") return asAny.response.trim();
	if (typeof asAny.result === "string") return asAny.result.trim();
	if (
		asAny.result &&
		typeof asAny.result === "object" &&
		typeof (asAny.result as Record<string, unknown>).response === "string"
	) {
		return ((asAny.result as Record<string, unknown>).response as string).trim();
	}
	return "";
};

type DashboardSummary2Metrics = {
	networkRisk: number;
	redShops: Array<{
		shopName: string;
		risk: number;
		progress: number;
		missing: number;
	}>;
	salesDeltaPct: number;
	checksDeltaPct: number;
	avgCheckDeltaPct: number;
	refundRate: number;
	refundDeltaPp: number;
	forecast: {
		value: number;
		lower: number;
		upper: number;
		confidence: number;
	};
	incidents: Array<{
		shopName: string;
		type: string;
		details: string;
		severity: number;
	}>;
	losses: Array<{
		productName: string;
		lostQty: number;
		lostRevenue: number;
	}>;
};

type DashboardSummary2AiText = {
	riskSummary: string;
	actions: string[];
	forecastSummary: string;
	dropMainReason: string;
	anomaliesSummary: string;
	lossesSummary: string;
	dailyDigest: string;
};

const compactMoney = (value: number) =>
	new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
		Math.round(value || 0),
	);

const formatPct = (value: number | null) => {
	if (value == null || !Number.isFinite(value)) return "н/д";
	return `${(value * 100).toFixed(1)}%`;
};

const normalizeLine = (value: unknown, fallback: string, maxLen = 220) => {
	if (typeof value !== "string") return fallback;
	const clean = value.replace(/\s+/g, " ").trim();
	if (!clean) return fallback;
	return clean.slice(0, maxLen);
};

const extractJsonObject = (rawText: string): unknown | null => {
	const raw = rawText.trim();
	if (!raw) return null;
	const withoutFence = raw
		.replace(/^```json/i, "")
		.replace(/^```/i, "")
		.replace(/```$/i, "")
		.trim();
	try {
		return JSON.parse(withoutFence);
	} catch {
		const first = withoutFence.indexOf("{");
		const last = withoutFence.lastIndexOf("}");
		if (first < 0 || last <= first) return null;
		const jsonFragment = withoutFence.slice(first, last + 1);
		try {
			return JSON.parse(jsonFragment);
		} catch {
			return null;
		}
	}
};

const buildDashboardSummary2Fallback = (
	metrics: DashboardSummary2Metrics,
): DashboardSummary2AiText => {
	const topRiskShop = metrics.redShops[0];
	const riskSummary = topRiskShop
		? `Критичная точка: ${topRiskShop.shopName}, риск ${topRiskShop.risk.toFixed(0)}%, отставание ${compactMoney(topRiskShop.missing)} ₽.`
		: `Риск по сети ${metrics.networkRisk.toFixed(1)}%, критичных магазинов сейчас нет.`;

	const actions: string[] = [];
	if (topRiskShop) {
		actions.push(
			`Закрыть отставание в ${topRiskShop.shopName}: минимум ${compactMoney(topRiskShop.missing)} ₽ за ближайший час.`,
		);
	}
	if (metrics.refundRate > 8 || metrics.refundDeltaPp > 1) {
		actions.push(
			`Снизить возвраты: проверить причины и отмены, текущая доля ${metrics.refundRate.toFixed(1)}%.`,
		);
	}
	if (metrics.salesDeltaPct < -5) {
		actions.push(
			`Вернуть темп продаж: сеть просела на ${Math.abs(metrics.salesDeltaPct).toFixed(1)}% к прошлому периоду.`,
		);
	}
	while (actions.length < 3) {
		actions.push("Проверить остатки топ-SKU и усилить допродажу на кассе.");
	}

	const dropMainReason =
		metrics.salesDeltaPct >= 0
			? "Существенной просадки нет: динамика стабильная или положительная."
			: Math.abs(metrics.checksDeltaPct) >= Math.abs(metrics.avgCheckDeltaPct)
				? "Основной фактор просадки: снижение трафика (количества чеков)."
				: "Основной фактор просадки: снижение среднего чека.";

	const anomaliesSummary =
		metrics.incidents.length > 0
			? `Обнаружено аномалий: ${metrics.incidents.length}. Приоритетно проверить магазины из списка инцидентов.`
			: "Критичных аномалий чеков и возвратов не найдено.";

	const totalLoss = metrics.losses.reduce((sum, row) => sum + row.lostRevenue, 0);
	const lossesSummary =
		metrics.losses.length > 0
			? `Потенциальные потери: ${compactMoney(totalLoss)} ₽. Срочно пополнить минимум ${metrics.losses.length} SKU.`
			: "По текущим данным критичных потерь из-за отсутствия товара не видно.";

	const dailyDigest = [
		`Риск срыва плана по сети ${metrics.networkRisk.toFixed(1)}%.`,
		`Прогноз выручки ${compactMoney(metrics.forecast.value)} ₽, диапазон ${compactMoney(metrics.forecast.lower)}-${compactMoney(metrics.forecast.upper)} ₽.`,
		metrics.salesDeltaPct < 0
			? `Ключевой фокус: остановить просадку ${Math.abs(metrics.salesDeltaPct).toFixed(1)}% к прошлому периоду.`
			: "Ключевой фокус: удержать текущий темп и снизить операционные риски.",
	].join(" ");

	return {
		riskSummary,
		actions: actions.slice(0, 3),
		forecastSummary: `Прогноз до конца дня ${compactMoney(metrics.forecast.value)} ₽, диапазон ${compactMoney(metrics.forecast.lower)}-${compactMoney(metrics.forecast.upper)} ₽.`,
		dropMainReason,
		anomaliesSummary,
		lossesSummary,
		dailyDigest,
	};
};

const normalizeDashboardSummary2AiText = (
	raw: unknown,
	fallback: DashboardSummary2AiText,
): DashboardSummary2AiText => {
	if (!raw || typeof raw !== "object") return fallback;
	const source = raw as Record<string, unknown>;

	const actionsRaw = Array.isArray(source.actions) ? source.actions : [];
	const actions = actionsRaw
		.map((item, index) =>
			normalizeLine(item, fallback.actions[index] || fallback.actions[0]),
		)
		.filter(Boolean)
		.slice(0, 3);

	while (actions.length < 3) {
		actions.push(fallback.actions[actions.length] || fallback.actions[0]);
	}

	return {
		riskSummary: normalizeLine(source.riskSummary, fallback.riskSummary),
		actions,
		forecastSummary: normalizeLine(
			source.forecastSummary,
			fallback.forecastSummary,
		),
		dropMainReason: normalizeLine(source.dropMainReason, fallback.dropMainReason),
		anomaliesSummary: normalizeLine(
			source.anomaliesSummary,
			fallback.anomaliesSummary,
		),
		lossesSummary: normalizeLine(source.lossesSummary, fallback.lossesSummary),
		dailyDigest: normalizeLine(source.dailyDigest, fallback.dailyDigest, 320),
	};
};

const getCurrentIsoDate = () => {
	const now = new Date();
	const yyyy = now.getFullYear();
	const mm = String(now.getMonth() + 1).padStart(2, "0");
	const dd = String(now.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
};

const describeOpeningPhoto = async (
	c: any,
	imageBase64: string,
	mimeType: string,
	category: string,
) => {
	const result = await c.env.AI.run(PHOTO_DESCRIBE_MODEL as any, {
		max_tokens: 220,
		temperature: 0.2,
		messages: [
				{
					role: "system",
					content:
						"Ты анализируешь фото открытия магазина. Пиши только о видимом состоянии магазина на фото: чистота, выкладка, кассовая зона, порядок. Не упоминай скорость анализа, ПО, систему ИИ, обучение, данные или процессы вне кадра. Ответ 2-4 коротких предложения на русском.",
				},
			{
				role: "user",
				content: [
					{
						type: "text",
						text: `Категория фото: ${category}. Опиши видимые факты, состояние чистоты, выкладки, кассы и проблемы.`,
					},
					{
						type: "image_url",
						image_url: {
							url: `data:${mimeType};base64,${imageBase64}`,
						},
					},
				],
			},
		],
	});
	return extractAiText(result);
};

const summarizeShopPhotos = async (
	c: any,
	shopName: string,
	descriptions: Array<{ category: string; text: string }>,
) => {
	const listText = descriptions
		.map(
			(item, idx) =>
				`${idx + 1}. [${item.category}] ${item.text || "описание отсутствует"}`,
		)
		.join("\n");

	const result = await c.env.AI.run(PHOTO_SUMMARIZE_MODEL as any, {
		max_tokens: 300,
		temperature: 0.2,
		messages: [
				{
					role: "system",
					content:
						"Ты руководитель розницы. Составь краткий дайджест открытия магазина только по фактам из описаний фото: общая оценка состояния, 2-4 конкретные проблемы в магазине, 1-3 практических действия для точки. Не давай советы про ИИ, скорость анализа, ПО или обучение сотрудников. Ответ на русском в 3-6 предложениях.",
				},
			{
				role: "user",
				content: `Магазин: ${shopName}\nОписание фото:\n${listText}`,
			},
		],
	});

	return extractAiText(result);
};

export const aiRoutes = new Hono<IEnv>()

	.post("/director/alerts", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const {
				date,
				shopUuids,
				salesDropThresholdPct,
				categoryDropThresholdPct,
				minCategoryRevenue,
			} = validate(AiDirectorAlertsRequestSchema, payload);

			const targetDate = date ?? toIsoDate(new Date());
			const evo = c.var.evotor;
			const db = c.get("db");
			const resolvedShopUuids = await resolveDirectorShopUuids(
				db,
				evo,
				shopUuids,
			);
			const shopNamesMap = await resolveDirectorShopNamesMap(db, evo);

			const [todaySince, todayUntil] = buildEvotorDayRange(targetDate);
			const yesterdayKey = shiftDateKey(targetDate, -1);
			const [yesterdaySince, yesterdayUntil] =
				buildEvotorDayRange(yesterdayKey);

			const salesThreshold =
				Math.max(1, Math.abs(salesDropThresholdPct ?? 30)) / 100;
			const categoryThreshold =
				Math.max(1, Math.abs(categoryDropThresholdPct ?? 30)) / 100;
			const minCategoryBase = Math.max(0, minCategoryRevenue ?? 0);

			const [todayDocsByShop, yesterdayDocsByShop] = await Promise.all([
				Promise.all(
					resolvedShopUuids.map((shopUuid) =>
						getDocumentsFromIndexFirst(
							db,
							evo,
							shopUuid,
							todaySince,
							todayUntil,
							{
								types: ["SELL", "PAYBACK", "CLOSE_SESSION", "Z_REPORT"],
								skipFetchIfStale: true,
							},
						),
					),
				),
				Promise.all(
					resolvedShopUuids.map((shopUuid) =>
						getDocumentsFromIndexFirst(
							db,
							evo,
							shopUuid,
							yesterdaySince,
							yesterdayUntil,
							{ types: ["SELL", "PAYBACK"], skipFetchIfStale: true },
						),
					),
				),
			]);

			const alerts: DirectorAlert[] = [];
			const warnings: string[] = [];
			const todayCategoryTotals = new Map<string, number>();
			const yesterdayCategoryTotals = new Map<string, number>();

			const todayAll = todayDocsByShop.flat().filter((doc) =>
				["SELL", "PAYBACK"].includes(doc.type),
			);
			const yesterdayAll = yesterdayDocsByShop.flat();

			const todayMetrics = aggregateDirectorMetrics(todayAll);
			const yesterdayMetrics = aggregateDirectorMetrics(yesterdayAll);

			const salesChange = calcChangePct(
				todayMetrics.revenue,
				yesterdayMetrics.revenue,
			);

			if (todayMetrics.revenue <= 0) {
				alerts.push({
					code: "no_sales",
					severity: "high",
					title: "Нулевые продажи",
					details: "За сегодня нет выручки по сети.",
					meta: { revenue: todayMetrics.revenue },
				});
			}

			if (todayMetrics.checks <= 0) {
				alerts.push({
					code: "no_checks",
					severity: "high",
					title: "Нулевые чеки",
					details: "За сегодня нет чеков по сети.",
					meta: { checks: todayMetrics.checks },
				});
			}

				for (let i = 0; i < resolvedShopUuids.length; i += 1) {
					const shopUuid = resolvedShopUuids[i];
					const shopName = shopNamesMap[shopUuid] || shopUuid;
					const todayDocs = todayDocsByShop[i] || [];
					const yesterdayDocs = yesterdayDocsByShop[i] || [];

				const todayShopMetrics = aggregateDirectorMetrics(
					todayDocs.filter((doc) => ["SELL", "PAYBACK"].includes(doc.type)),
				);
				if (todayShopMetrics.revenue <= 0) {
					alerts.push({
						code: "shop_no_sales",
						severity: "high",
						title: "Нулевые продажи магазина",
						details: `Магазин ${shopName} не имеет выручки сегодня.`,
						shopUuid,
						shopName,
					});
				}

				if (todayShopMetrics.checks <= 0) {
					alerts.push({
						code: "shop_no_checks",
						severity: "high",
						title: "Нулевые чеки магазина",
						details: `Магазин ${shopName} не имеет чеков сегодня.`,
						shopUuid,
						shopName,
					});
				}

				const hasCloseSession = todayDocs.some((doc) =>
					["CLOSE_SESSION", "Z_REPORT"].includes(doc.type),
				);
				if (!hasCloseSession) {
					alerts.push({
						code: "no_close_session",
						severity: "medium",
						title: "Нет закрытия смены",
						details: `За сегодня нет закрытия смены в магазине ${shopName}.`,
						shopUuid,
						shopName,
					});
				}

				const { revenueByCategory: todayCategories, warnings: todayWarnings } =
					await buildCategoryRevenueByShop(db, shopUuid, todayDocs);
				const {
					revenueByCategory: yesterdayCategories,
					warnings: yesterdayWarnings,
				} = await buildCategoryRevenueByShop(db, shopUuid, yesterdayDocs);

				warnings.push(...todayWarnings, ...yesterdayWarnings);

				for (const [category, value] of todayCategories.entries()) {
					todayCategoryTotals.set(
						category,
						(todayCategoryTotals.get(category) || 0) + value,
					);
				}
				for (const [category, value] of yesterdayCategories.entries()) {
					yesterdayCategoryTotals.set(
						category,
						(yesterdayCategoryTotals.get(category) || 0) + value,
					);
				}

				for (const [category, yesterdayValue] of yesterdayCategories.entries()) {
					if (!Number.isFinite(yesterdayValue) || yesterdayValue <= minCategoryBase)
						continue;
					const todayValue = todayCategories.get(category) || 0;
					const change = calcChangePct(todayValue, yesterdayValue);
					if (change !== null && change <= -categoryThreshold) {
						alerts.push({
							code: "category_drop",
							severity: "medium",
							title: "Падение категории",
							details: `Категория «${category}» снизилась на ${(Math.abs(change) * 100).toFixed(1)}% в ${shopName}.`,
							shopUuid,
							shopName,
							category,
							meta: {
								today: todayValue,
								yesterday: yesterdayValue,
								thresholdPct: categoryThreshold * 100,
							},
						});
					}
				}

				// Детектор нулевых продаж за последние 60 минут
				const nowTs = Date.now();
				const cutoff = nowTs - 60 * 60 * 1000;
				const lastHourDocs = todayDocs.filter((doc) => {
					const ts = new Date(doc.closeDate).getTime();
					return Number.isFinite(ts) && ts >= cutoff;
				});
				const lastHourMetrics = aggregateDirectorMetrics(
					lastHourDocs.filter((doc) =>
						["SELL", "PAYBACK"].includes(doc.type),
					),
				);
				if (lastHourMetrics.revenue <= 0) {
					alerts.push({
						code: "shop_no_sales_60m",
						severity: "high",
						title: "Нет продаж 60 минут",
						details: `Магазин ${shopName} не имеет продаж за последний час.`,
						shopUuid,
						shopName,
					});
				}
			}

			if (salesChange !== null && salesChange <= -salesThreshold) {
				let mainCategory: string | null = null;
				let mainDrop = 0;
				for (const [category, yesterdayValue] of yesterdayCategoryTotals.entries()) {
					const todayValue = todayCategoryTotals.get(category) || 0;
					const change = calcChangePct(todayValue, yesterdayValue);
					if (change !== null && change < mainDrop) {
						mainDrop = change;
						mainCategory = category;
					}
				}

				const reason =
					mainCategory && mainDrop < 0
						? ` Основная причина: категория «${mainCategory}».`
						: "";

				alerts.push({
					code: "sales_drop",
					severity: "high",
					title: "Падение продаж",
					details: `Выручка снизилась на ${(Math.abs(salesChange) * 100).toFixed(1)}% относительно вчера.${reason}`,
					meta: {
						today: todayMetrics.revenue,
						yesterday: yesterdayMetrics.revenue,
						thresholdPct: salesThreshold * 100,
						mainCategory: mainCategory || undefined,
					},
				});
			}

			// Детектор нулевых продаж за последний час по сети
			const networkCutoff = Date.now() - 60 * 60 * 1000;
			const networkLastHourDocs = todayAll.filter((doc) => {
				const ts = new Date(doc.closeDate).getTime();
				return Number.isFinite(ts) && ts >= networkCutoff;
			});
			const networkLastHourMetrics = aggregateDirectorMetrics(networkLastHourDocs);
			if (networkLastHourMetrics.revenue <= 0) {
				alerts.push({
					code: "network_no_sales_60m",
					severity: "high",
					title: "Нет продаж по сети 60 минут",
					details: "По сети не было продаж за последний час.",
				});
			}

			return c.json({
				date: targetDate,
				shopUuids: resolvedShopUuids,
				thresholds: {
					salesDropPct: salesThreshold * 100,
					categoryDropPct: categoryThreshold * 100,
					minCategoryRevenue: minCategoryBase,
				},
				alerts,
				warnings: Array.from(new Set(warnings)),
			});
		} catch (error) {
			logger.error("AI director alerts failed", { error });
			return c.json({ error: "AI_DIRECTOR_ALERTS_FAILED" }, 500);
		}
	})

	.post("/director/summary", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { date, shopUuids, avgDays } = validate(
				AiDirectorSummaryRequestSchema,
				payload,
			);

			const targetDate = date ?? toIsoDate(new Date());
			const evo = c.var.evotor;
			const db = c.get("db");
			const resolvedShopUuids = await resolveDirectorShopUuids(
				db,
				evo,
				shopUuids,
			);

			const [todaySince, todayUntil] = buildEvotorDayRange(targetDate);
			const yesterdayKey = shiftDateKey(targetDate, -1);
			const weekAgoKey = shiftDateKey(targetDate, -7);
			const [yesterdaySince, yesterdayUntil] =
				buildEvotorDayRange(yesterdayKey);
			const [weekAgoSince, weekAgoUntil] = buildEvotorDayRange(weekAgoKey);

			const [today, yesterday, weekAgo] = await Promise.all([
				getDirectorPeriodMetrics(db, evo, resolvedShopUuids, todaySince, todayUntil),
				getDirectorPeriodMetrics(
					db,
					evo,
					resolvedShopUuids,
					yesterdaySince,
					yesterdayUntil,
				),
				getDirectorPeriodMetrics(
					db,
					evo,
					resolvedShopUuids,
					weekAgoSince,
					weekAgoUntil,
				),
			]);

			const avgWindow = Math.min(Math.max(avgDays ?? 7, 1), 31);
			const avgRanges = Array.from({ length: avgWindow }, (_, idx) => {
				const dayKey = shiftDateKey(targetDate, -(idx + 1));
				return buildEvotorDayRange(dayKey);
			});

			const avgMetricsList = await Promise.all(
				avgRanges.map(([since, until]) =>
					getDirectorPeriodMetrics(db, evo, resolvedShopUuids, since, until),
				),
			);

			const avgMetrics = averageDirectorMetrics(
				avgMetricsList.map((item) => item.metrics),
			);

			return c.json({
				date: targetDate,
				shopUuids: resolvedShopUuids,
				periods: {
					today,
					yesterday,
					weekAgo,
					avg: {
						days: avgWindow,
						metrics: avgMetrics,
					},
				},
			});
		} catch (error) {
			logger.error("AI director summary failed", { error });
			return c.json(
				{ error: "AI_DIRECTOR_SUMMARY_FAILED" },
				500,
			);
		}
	})

	.post("/director/forecast", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const {
				date,
				shopUuids,
				openHour,
				workingHoursWeekday,
				workingHoursWeekend,
			} = validate(AiDirectorForecastRequestSchema, payload);

			const targetDate = date ?? toIsoDate(new Date());
			const evo = c.var.evotor;
			const db = c.get("db");
			const resolvedShopUuids = await resolveDirectorShopUuids(
				db,
				evo,
				shopUuids,
			);

			const weekdayHours = workingHoursWeekday ?? 12;
			const weekendHours = workingHoursWeekend ?? 10;
			const workingHours = isWeekend(targetDate) ? weekendHours : weekdayHours;

			let resolvedOpenHour = openHour ?? null;
			const openingsDate = toDDMMYYYY(targetDate);
			if (resolvedOpenHour == null) {
				const openings = await getOpeningsByDate(db, openingsDate);
				const hours = openings
					.map((row) => {
						const d = new Date(row.date);
						if (Number.isNaN(d.getTime())) return null;
						return getMskHour(d);
					})
					.filter((hour): hour is number => hour !== null);
				if (hours.length > 0) {
					resolvedOpenHour = Math.min(...hours);
				}
			}
			if (resolvedOpenHour == null) resolvedOpenHour = 7;

			const [daySince, dayUntil] = buildEvotorDayRange(targetDate);
			const now = new Date();
			const isToday = targetDate === toIsoDate(now);
			const until = isToday ? formatEvotorTimestamp(now) : dayUntil;

			const period = await getDirectorPeriodMetrics(
				db,
				evo,
				resolvedShopUuids,
				daySince,
				until,
			);
			const metrics = period.metrics;

			const hoursPassed = isToday
				? Math.max(0, Math.min(getMskHour(now) - resolvedOpenHour, workingHours))
				: workingHours;

			const forecast =
				hoursPassed > 0
					? (metrics.revenue / hoursPassed) * workingHours
					: 0;

			return c.json({
				date: targetDate,
				shopUuids: resolvedShopUuids,
				openHour: resolvedOpenHour,
				workingHours,
				hoursPassed,
				revenueToNow: metrics.revenue,
				forecast,
			});
		} catch (error) {
			logger.error("AI director forecast failed", { error });
			return c.json({ error: "AI_DIRECTOR_FORECAST_FAILED" }, 500);
		}
	})

	.post("/director/velocity", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const {
				since,
				until,
				shopUuids,
				workingHoursWeekday,
				workingHoursWeekend,
				limit,
			} = validate(AiDirectorVelocityRequestSchema, payload);

			const evo = c.var.evotor;
			const db = c.get("db");
			const resolvedShopUuids = await resolveDirectorShopUuids(
				db,
				evo,
				shopUuids,
			);

			const weekdayHours = workingHoursWeekday ?? 12;
			const weekendHours = workingHoursWeekend ?? 10;

			const dateKeys = listDateKeysInclusive(since, until);
			const effectiveHours = dateKeys.reduce(
				(sum, key) => sum + (isWeekend(key) ? weekendHours : weekdayHours),
				0,
			);
			const effectiveDays =
				weekdayHours > 0 ? effectiveHours / weekdayHours : 0;

			const [rangeSince, rangeUntil] = [
				buildEvotorDayRange(since)[0],
				buildEvotorDayRange(until)[1],
			];

			const docsByShop = await Promise.all(
				resolvedShopUuids.map(async (shopUuid) => {
					try {
						return await getDocumentsFromIndexFirst(
							db,
							evo,
							shopUuid,
							rangeSince,
							rangeUntil,
							{
								types: ["SELL", "PAYBACK"],
								skipFetchIfStale: true,
							},
						);
					} catch (error) {
						logger.warn("AI director velocity: docs fetch failed", {
							shopUuid,
							rangeSince,
							rangeUntil,
							error,
						});
						return [];
					}
				}),
			);

			const skuMap = new Map<
				string,
				{ name: string; quantity: number; revenue: number }
			>();
			const categoryMap = new Map<
				string,
				{ quantity: number; revenue: number }
			>();
			const warnings: string[] = [];

			for (let i = 0; i < resolvedShopUuids.length; i += 1) {
				const shopUuid = resolvedShopUuids[i];
				const docs = docsByShop[i] || [];
				const { quantityByCategory, revenueByCategory, warnings: categoryWarnings } =
					await buildCategoryStatsByShop(db, shopUuid, docs);
				warnings.push(...categoryWarnings);

				for (const doc of docs) {
					const isRefund = doc.type === "PAYBACK";
					for (const tx of doc.transactions || []) {
						if (tx.type !== "REGISTER_POSITION") continue;
						const qty = Number(tx.quantity || 0);
						const sum = Number(tx.sum || 0);
						const skuKey = tx.commodityUuid || tx.commodityName || "UNKNOWN";
						const sku = skuMap.get(skuKey) || {
							name: tx.commodityName || skuKey,
							quantity: 0,
							revenue: 0,
						};
						if (Number.isFinite(qty) && qty !== 0) {
							sku.quantity += isRefund ? -Math.abs(qty) : qty;
						}
						if (Number.isFinite(sum) && sum !== 0) {
							sku.revenue += isRefund ? -Math.abs(sum) : sum;
						}
						skuMap.set(skuKey, sku);
					}
				}

				for (const [category, qty] of quantityByCategory.entries()) {
					const existing = categoryMap.get(category) || {
						quantity: 0,
						revenue: 0,
					};
					existing.quantity += qty;
					existing.revenue += revenueByCategory.get(category) || 0;
					categoryMap.set(category, existing);
				}
			}

			const maxItems = limit ?? 100;
			const skuVelocity: VelocityEntry[] = Array.from(skuMap.entries())
				.map(([id, data]) => ({
					id,
					name: data.name,
					quantity: data.quantity,
					revenue: data.revenue,
					velocityPerHour:
						effectiveHours > 0 ? data.quantity / effectiveHours : 0,
					velocityPerDay:
						effectiveDays > 0 ? data.quantity / effectiveDays : 0,
				}))
				.sort((a, b) => b.velocityPerDay - a.velocityPerDay)
				.slice(0, maxItems);

			const categoryVelocity: VelocityEntry[] = Array.from(categoryMap.entries())
				.map(([name, data]) => ({
					id: name,
					name,
					quantity: data.quantity,
					revenue: data.revenue,
					velocityPerHour:
						effectiveHours > 0 ? data.quantity / effectiveHours : 0,
					velocityPerDay:
						effectiveDays > 0 ? data.quantity / effectiveDays : 0,
				}))
				.sort((a, b) => b.velocityPerDay - a.velocityPerDay)
				.slice(0, maxItems);

			return c.json({
				since,
				until,
				shopUuids: resolvedShopUuids,
				effectiveHours,
				weekdayHours,
				weekendHours,
				velocity: {
					sku: skuVelocity,
					categories: categoryVelocity,
				},
				warnings: Array.from(new Set(warnings)),
			});
		} catch (error) {
			logger.error("AI director velocity failed", { error });
			return c.json({ error: "AI_DIRECTOR_VELOCITY_FAILED" }, 500);
		}
	})

	.post("/director/recommendations", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const {
				since,
				until,
				shopUuids,
				planningDays,
				deadStockDays,
				lookbackDays,
				limit,
			} = validate(AiDirectorRecommendationsRequestSchema, payload);

			const evo = c.var.evotor;
			const db = c.get("db");
			const resolvedShopUuids = await resolveDirectorShopUuids(
				db,
				evo,
				shopUuids,
			);

			const weekdayHours = 12;
			const weekendHours = 10;
			const dateKeys = listDateKeysInclusive(since, until);
			const effectiveHours = dateKeys.reduce(
				(sum, key) => sum + (isWeekend(key) ? weekendHours : weekdayHours),
				0,
			);
			const effectiveDays =
				weekdayHours > 0 ? effectiveHours / weekdayHours : 0;

			const [rangeSince, rangeUntil] = [
				buildEvotorDayRange(since)[0],
				buildEvotorDayRange(until)[1],
			];

			const docsByShop = await Promise.all(
				resolvedShopUuids.map(async (shopUuid) => {
					try {
						return await getDocumentsFromIndexFirst(
							db,
							evo,
							shopUuid,
							rangeSince,
							rangeUntil,
							{
								types: ["SELL", "PAYBACK"],
								skipFetchIfStale: true,
							},
						);
					} catch (error) {
						logger.warn("AI director recommendations: docs fetch failed", {
							shopUuid,
							rangeSince,
							rangeUntil,
							error,
						});
						return [];
					}
				}),
			);

			const warnings: string[] = [];
			const skuStats = new Map<
				string,
				{
					name: string;
					category: string | null;
					quantity: number;
					revenue: number;
					lastSaleAt: string | null;
				}
			>();

			for (let i = 0; i < resolvedShopUuids.length; i += 1) {
				const shopUuid = resolvedShopUuids[i];
				const docs = docsByShop[i] || [];
				const commodityUuids = collectCommodityUuids(docs);
				let categoryMap = new Map<string, string>();
				if (commodityUuids.length > 0) {
					try {
						categoryMap = await fetchCategoryMapForShop(
							db,
							shopUuid,
							commodityUuids,
						);
					} catch (error) {
						warnings.push("category_map_unavailable");
					}
				}

				const shopSkuStats = buildSkuStats(docs, categoryMap);
				for (const [sku, entry] of shopSkuStats.entries()) {
					const existing = skuStats.get(sku) || {
						name: entry.name,
						category: entry.category,
						quantity: 0,
						revenue: 0,
						lastSaleAt: null,
					};
					existing.quantity += entry.quantity;
					existing.revenue += entry.revenue;
					if (!existing.category && entry.category) {
						existing.category = entry.category;
					}
					if (!existing.lastSaleAt || (entry.lastSaleAt && entry.lastSaleAt > existing.lastSaleAt)) {
						existing.lastSaleAt = entry.lastSaleAt;
					}
					skuStats.set(sku, existing);
				}
			}

			const lookbackWindow = Math.max(
				deadStockDays ?? 30,
				lookbackDays ?? 60,
			);
			const lookbackSinceKey = shiftDateKey(until, -(lookbackWindow - 1));
			if (lookbackSinceKey !== since) {
				const lookbackSince = buildEvotorDayRange(lookbackSinceKey)[0];
				const lookbackUntil = buildEvotorDayRange(until)[1];
				const lookbackDocsByShop = await Promise.all(
					resolvedShopUuids.map(async (shopUuid) => {
						try {
							return await getDocumentsFromIndexFirst(
								db,
								evo,
								shopUuid,
								lookbackSince,
								lookbackUntil,
								{ types: ["SELL"], skipFetchIfStale: true },
							);
						} catch (error) {
							logger.warn(
								"AI director recommendations: lookback docs fetch failed",
								{
									shopUuid,
									lookbackSince,
									lookbackUntil,
									error,
								},
							);
							return [];
						}
					}),
				);

				for (const docs of lookbackDocsByShop) {
					for (const doc of docs) {
						for (const tx of doc.transactions || []) {
							if (tx.type !== "REGISTER_POSITION") continue;
							const sku = tx.commodityUuid || tx.commodityName || "UNKNOWN";
							const entry = skuStats.get(sku);
							if (!entry) continue;
							if (!entry.lastSaleAt || doc.closeDate > entry.lastSaleAt) {
								entry.lastSaleAt = doc.closeDate;
							}
							skuStats.set(sku, entry);
						}
					}
				}
			}

			const planning = planningDays ?? 7;
			const deadDays = deadStockDays ?? 30;
			const maxItems = limit ?? 100;
			const endDate = new Date(`${until}T23:59:59Z`);

			const procurement: RecommendationItem[] = [];
			const deadStock: RecommendationItem[] = [];
			const abc: RecommendationItem[] = [];

			const revenueList = Array.from(skuStats.entries())
				.map(([id, entry]) => ({
					id,
					entry,
					revenue: Math.max(0, entry.revenue),
				}))
				.sort((a, b) => b.revenue - a.revenue);

			const totalRevenue = revenueList.reduce(
				(sum, item) => sum + item.revenue,
				0,
			);

			let cumulative = 0;
			const abcMap = new Map<string, "A" | "B" | "C">();
			for (const item of revenueList) {
				cumulative += item.revenue;
				const share = totalRevenue > 0 ? cumulative / totalRevenue : 0;
				const group: "A" | "B" | "C" =
					share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C";
				abcMap.set(item.id, group);
			}

			for (const [id, entry] of skuStats.entries()) {
				const velocityPerDay =
					effectiveDays > 0 ? entry.quantity / effectiveDays : 0;
				const recommendedStock = velocityPerDay * planning;

				if (velocityPerDay > 0) {
					procurement.push({
						type: "procurement",
						id,
						name: entry.name,
						category: entry.category ?? undefined,
						priorityScore: recommendedStock,
						priority: "low",
						details: `Рекомендованный запас: ${recommendedStock.toFixed(2)}`,
						metrics: {
							velocity_per_day: velocityPerDay,
							planning_days: planning,
						},
					});
				}

				const lastSaleAt = entry.lastSaleAt
					? new Date(entry.lastSaleAt)
					: null;
				const daysSinceSale = lastSaleAt
					? Math.floor(
							(endDate.getTime() - lastSaleAt.getTime()) /
								(1000 * 60 * 60 * 24),
						)
					: lookbackWindow;

				if (daysSinceSale >= deadDays) {
					deadStock.push({
						type: "dead_stock",
						id,
						name: entry.name,
						category: entry.category ?? undefined,
						priorityScore: daysSinceSale,
						priority: "low",
						details: `Нет продаж ${daysSinceSale} дней`,
						metrics: {
							days_since_last_sale: daysSinceSale,
							dead_stock_days: deadDays,
						},
					});
				}

				const abcGroup = abcMap.get(id);
				if (abcGroup && entry.revenue > 0) {
					abc.push({
						type: "abc",
						id,
						name: entry.name,
						category: entry.category ?? undefined,
						priorityScore:
							entry.revenue * (abcGroup === "A" ? 3 : abcGroup === "B" ? 2 : 1),
						priority: "low",
						details: `ABC категория ${abcGroup}`,
						metrics: {
							revenue: entry.revenue,
							abc: abcGroup,
						},
					});
				}
			}

			const procurementSorted = applyPriorityByScore(
				procurement.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, maxItems),
			);
			const deadStockSorted = applyPriorityByScore(
				deadStock.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, maxItems),
			);
			const abcSorted = applyPriorityByScore(
				abc.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, maxItems),
			);

			const recommendations = applyPriorityByScore(
				[
					...procurementSorted,
					...deadStockSorted,
					...abcSorted,
				].sort((a, b) => b.priorityScore - a.priorityScore),
			);

			return c.json({
				since,
				until,
				shopUuids: resolvedShopUuids,
				planningDays: planning,
				deadStockDays: deadDays,
				lookbackDays: lookbackWindow,
				recommendations,
				procurement: procurementSorted,
				dead_stock: deadStockSorted,
				abc: abcSorted,
				warnings: Array.from(new Set(warnings)),
			});
		} catch (error) {
			logger.error("AI director recommendations failed", { error });
			return c.json({ error: "AI_DIRECTOR_RECOMMENDATIONS_FAILED" }, 500);
		}
	})

	.post("/director/report", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { date, shopUuids, sendTelegram } = validate(
				AiDirectorReportRequestSchema,
				payload,
			);

			const targetDate = date ?? toIsoDate(new Date());
			const kv = c.env.KV;
			const scopeKey =
				shopUuids && shopUuids.length > 0
					? [...shopUuids].sort((a, b) => a.localeCompare(b)).join(",")
					: "all";
			const cacheKey = buildAiReportKey(scopeKey, targetDate);
			if (!sendTelegram && kv) {
				const cached = await kv.get(cacheKey);
				if (cached) {
					try {
						c.header("x-cache", "hit");
						return c.json(JSON.parse(cached));
					} catch (error) {
						logger.warn("AI director report cache parse failed, ignoring cache", {
							cacheKey,
							error,
						});
						try {
							await kv.delete(cacheKey);
						} catch (deleteError) {
							logger.warn("AI director report cache delete failed", {
								cacheKey,
								error: deleteError,
							});
						}
					}
				}
			}
			const evo = c.var.evotor;
			const db = c.get("db");
			let resolvedShopUuids: string[] = [];
			if (shopUuids && shopUuids.length > 0) {
				resolvedShopUuids = shopUuids;
			} else {
				try {
					resolvedShopUuids = await evo.getShopUuids();
				} catch (error) {
					logger.warn(
						"AI director report: getShopUuids failed, using DB fallback",
						{ error },
					);
					const rows = await db
						.prepare("SELECT store_uuid FROM stores")
						.all<{ store_uuid: string }>();
					resolvedShopUuids = (rows.results || [])
						.map((row) => row.store_uuid)
						.filter(Boolean);
				}
			}

			const [todaySince, todayUntil] = buildEvotorDayRange(targetDate);
			const yesterdayKey = shiftDateKey(targetDate, -1);
			const [yesterdaySince, yesterdayUntil] =
				buildEvotorDayRange(yesterdayKey);

			const [todayResult, yesterdayResult] = await Promise.all([
				getDirectorPeriodMetrics(db, evo, resolvedShopUuids, todaySince, todayUntil),
				getDirectorPeriodMetrics(
					db,
					evo,
					resolvedShopUuids,
					yesterdaySince,
					yesterdayUntil,
				),
			]);

			const salesChange = calcChangePct(
				todayResult.metrics.revenue,
				yesterdayResult.metrics.revenue,
			);

			const alerts: DirectorAlert[] = [];

			const now = new Date();
			const workingHours = isWeekend(targetDate) ? 10 : 12;
			const hoursPassed = Math.max(1, Math.min(getMskHour(now) - 7, workingHours));
			const forecast = (todayResult.metrics.revenue / hoursPassed) * workingHours;

			let report = buildDirectorReportFallback({
				date: targetDate,
				today: todayResult.metrics,
				yesterday: yesterdayResult.metrics,
				salesChange,
				alerts,
				forecast,
			});

			try {
				const aiResult = await c.env.AI.run(DIRECTOR_REPORT_MODEL as any, {
					max_tokens: 700,
					temperature: 0.2,
					messages: [
						{
							role: "system",
							content:
								"Ты операционный директор розничной сети. Верни только валидный JSON без markdown и комментариев. Формат ответа строго: {\"happened\":\"...\",\"whyImportant\":\"...\",\"whatToDo\":[\"...\",\"...\",\"...\"]}. Требования: 1) Используй только входные данные. 2) happened и whyImportant по 1-3 предложения. 3) whatToDo — ровно 3 пункта, императив, конкретные действия.",
						},
						{
							role: "user",
							content: JSON.stringify({
								date: targetDate,
								metrics: {
									today: todayResult.metrics,
									yesterday: yesterdayResult.metrics,
									salesChange,
									forecast,
								},
								alerts,
							}),
						},
					],
				});

				const text = extractAiText(aiResult);
				const parsed = extractJsonObject(text);
				if (parsed && typeof parsed === "object") {
					const normalized = parsed as {
						happened?: string;
						whyImportant?: string;
						whatToDo?: string[];
					};
					if (
						typeof normalized.happened === "string" &&
						typeof normalized.whyImportant === "string" &&
						Array.isArray(normalized.whatToDo) &&
						normalized.whatToDo.length === 3
					) {
						report = {
							happened: normalizeLine(normalized.happened, report.happened),
							whyImportant: normalizeLine(
								normalized.whyImportant,
								report.whyImportant,
							),
							whatToDo: normalized.whatToDo.map((line) =>
								normalizeLine(line, line),
							),
						};
					}
				}
			} catch (error) {
				logger.warn("AI director report fallback used", { error });
			}

			const textBlocks = [
				`Что случилось: ${report.happened}`,
				`Почему важно: ${report.whyImportant}`,
				`Что делать:`,
				...report.whatToDo.map((line, idx) => `${idx + 1}. ${line}`),
			];
			const fullText = textBlocks.join("\n");

			let telegramSent = 0;
			if (sendTelegram) {
				const subs = await listActiveTgSubscriptions(c.get("drizzle"));
				for (const sub of subs) {
					try {
						await sendTelegramMessage(sub.chatId, fullText, c.env.BOT_TOKEN);
						await touchTgSubscriptionLastSentAt(
							c.get("drizzle"),
							sub.userId,
							sub.chatId,
						);
						telegramSent += 1;
					} catch (error) {
						logger.warn("Failed to send director report to Telegram", {
							chatId: sub.chatId,
						});
					}
				}
			}

			const responsePayload = {
				date: targetDate,
				shopUuids: resolvedShopUuids,
				blocks: report,
				text: fullText,
				telegram: {
					sent: telegramSent,
				},
			};

			if (!sendTelegram && kv) {
				try {
					await kv.put(cacheKey, JSON.stringify(responsePayload), {
						expirationTtl: 12 * 60 * 60,
					});
				} catch (error) {
					logger.warn("AI director report cache write failed", {
						cacheKey,
						error,
					});
				}
			}

			return c.json(responsePayload);
		} catch (error) {
			logger.error("AI director report failed", { error });
			return c.json({ error: "AI_DIRECTOR_REPORT_FAILED" }, 500);
		}
	})

	.post("/director/explain-sales", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { date, shopUuids } = validate(
				AiDirectorExplainSalesRequestSchema,
				payload,
			);

			const targetDate = date ?? toIsoDate(new Date());
			const kv = c.env.KV;
			const cacheKey = `ai:explain:all:${targetDate}`;
			if (kv) {
				const cached = await kv.get(cacheKey);
				if (cached) {
					c.header("x-cache", "hit");
					return c.json(JSON.parse(cached));
				}
			}

			const evo = c.var.evotor;
			const db = c.get("db");
			const resolvedShopUuids =
				shopUuids && shopUuids.length > 0
					? shopUuids
					: await evo.getShopUuids();

			const [todaySince, todayUntil] = buildEvotorDayRange(targetDate);
			const yesterdayKey = shiftDateKey(targetDate, -1);
			const [yesterdaySince, yesterdayUntil] =
				buildEvotorDayRange(yesterdayKey);

			const [todayDocsByShop, yesterdayDocsByShop] = await Promise.all([
				Promise.all(
					resolvedShopUuids.map((shopUuid) =>
						getDocumentsFromIndexFirst(
							db,
							evo,
							shopUuid,
							todaySince,
							todayUntil,
							{ types: ["SELL", "PAYBACK"], skipFetchIfStale: true },
						),
					),
				),
				Promise.all(
					resolvedShopUuids.map((shopUuid) =>
						getDocumentsFromIndexFirst(
							db,
							evo,
							shopUuid,
							yesterdaySince,
							yesterdayUntil,
							{ types: ["SELL", "PAYBACK"], skipFetchIfStale: true },
						),
					),
				),
			]);

			const todayAll = todayDocsByShop.flat();
			const yesterdayAll = yesterdayDocsByShop.flat();
			const todayMetrics = aggregateDirectorMetrics(todayAll);
			const yesterdayMetrics = aggregateDirectorMetrics(yesterdayAll);

			const todayCategoryTotals = new Map<string, number>();
			const yesterdayCategoryTotals = new Map<string, number>();

			for (let i = 0; i < resolvedShopUuids.length; i += 1) {
				const shopUuid = resolvedShopUuids[i];
				const todayDocs = todayDocsByShop[i] || [];
				const yesterdayDocs = yesterdayDocsByShop[i] || [];

				const { revenueByCategory: todayCategories } =
					await buildCategoryRevenueByShop(db, shopUuid, todayDocs);
				const { revenueByCategory: yesterdayCategories } =
					await buildCategoryRevenueByShop(db, shopUuid, yesterdayDocs);

				for (const [category, value] of todayCategories.entries()) {
					todayCategoryTotals.set(
						category,
						(todayCategoryTotals.get(category) || 0) + value,
					);
				}
				for (const [category, value] of yesterdayCategories.entries()) {
					yesterdayCategoryTotals.set(
						category,
						(yesterdayCategoryTotals.get(category) || 0) + value,
					);
				}
			}

			const categoryChanges = Array.from(yesterdayCategoryTotals.entries())
				.map(([category, yesterdayValue]) => {
					const todayValue = todayCategoryTotals.get(category) || 0;
					const change = calcChangePct(todayValue, yesterdayValue) ?? 0;
					return { category, today: todayValue, yesterday: yesterdayValue, change };
				})
				.sort((a, b) => a.change - b.change)
				.slice(0, 3);

			let explanation =
				categoryChanges.length > 0
					? `Падение продаж связано с категорией ${categoryChanges[0].category}.`
					: "Недостаточно данных по категориям.";

			try {
				const aiResult = await c.env.AI.run(DIRECTOR_REPORT_MODEL as any, {
					max_tokens: 200,
					temperature: 0.2,
					messages: [
						{
							role: "system",
							content:
								"Ты управляющий магазином. Объясни причины изменения продаж в 1-3 предложениях. Только текст, без markdown.",
						},
						{
							role: "user",
							content: JSON.stringify({
								date: targetDate,
								todaySales: todayMetrics.revenue,
								yesterdaySales: yesterdayMetrics.revenue,
								categories: categoryChanges,
							}),
						},
					],
				});
				const text = extractAiText(aiResult);
				if (text) explanation = text;
			} catch (error) {
				logger.warn("AI explain sales fallback used", { error });
			}

			const responsePayload = {
				date: targetDate,
				shopUuids: resolvedShopUuids,
				categories: categoryChanges,
				explanation,
			};

			if (kv) {
				await kv.put(cacheKey, JSON.stringify(responsePayload), {
					expirationTtl: 12 * 60 * 60,
				});
			}

			return c.json(responsePayload);
		} catch (error) {
			logger.error("AI director explain sales failed", { error });
			return c.json({ error: "AI_DIRECTOR_EXPLAIN_FAILED" }, 500);
		}
	})

	.post("/director/heatmap", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { shopUuids } = validate(AiDirectorHeatmapRequestSchema, payload);
			const db = c.get("db");
			const rows = await getSalesHourly(db, shopUuids);
			return c.json({ rows });
		} catch (error) {
			logger.error("AI director heatmap failed", { error });
			return c.json({ error: "AI_DIRECTOR_HEATMAP_FAILED" }, 500);
		}
	})

	.post("/director/stock-monitor", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { since, until, shopUuids, limit } = validate(
				AiDirectorStockMonitorRequestSchema,
				payload,
			);

			const evo = c.var.evotor;
			const db = c.get("db");
			const resolvedShopUuids =
				shopUuids && shopUuids.length > 0
					? shopUuids
					: await evo.getShopUuids();
			const shopNamesMap = (await evo.getShopNameUuidsDict()) || {};

			const todayKey = toIsoDate(new Date());
			const resolvedUntil = until ?? todayKey;
			const resolvedSince = since ?? shiftDateKey(resolvedUntil, -6);
			const daysCount = daysInRangeInclusive(resolvedSince, resolvedUntil);

			const [rangeSince, rangeUntil] = [
				buildEvotorDayRange(resolvedSince)[0],
				buildEvotorDayRange(resolvedUntil)[1],
			];

			const docsByShop = await Promise.all(
				resolvedShopUuids.map((shopUuid) =>
					getDocumentsFromIndexFirst(db, evo, shopUuid, rangeSince, rangeUntil, {
						types: ["SELL", "PAYBACK"],
						skipFetchIfStale: true,
					}),
				),
			);

			const stockAlerts: Array<{
				shopUuid: string;
				shopName: string;
				sku: string;
				name: string;
				stock: number;
				velocityPerDay: number;
				recommendedMin: number;
			}> = [];

			for (let i = 0; i < resolvedShopUuids.length; i += 1) {
				const shopUuid = resolvedShopUuids[i];
				const shopName = shopNamesMap[shopUuid] || shopUuid;
				const docs = docsByShop[i] || [];
				const salesBySku = new Map<string, { name: string; qty: number }>();

				for (const doc of docs) {
					const isRefund = doc.type === "PAYBACK";
					for (const tx of doc.transactions || []) {
						if (tx.type !== "REGISTER_POSITION") continue;
						const sku = tx.commodityUuid || tx.commodityName || "UNKNOWN";
						const name = tx.commodityName || sku;
						const qty = Number(tx.quantity || 0);
						if (!Number.isFinite(qty) || qty === 0) continue;
						const entry = salesBySku.get(sku) || { name, qty: 0 };
						entry.qty += isRefund ? -Math.abs(qty) : qty;
						salesBySku.set(sku, entry);
					}
				}

				const productsResponse = await evo.getProducts(shopUuid);
				const products = Array.isArray(productsResponse)
					? productsResponse
					: Array.isArray((productsResponse as any).items)
						? (productsResponse as any).items
						: [];

				const stockMap = new Map<
					string,
					{ name: string; quantity: number }
				>();
				for (const prod of products as any[]) {
					if (prod.group) continue;
					const uuid = String(prod.uuid || prod.id || "");
					if (!uuid) continue;
					const quantity = Number(
						prod.quantity ?? prod.quantityBalance ?? prod.quantity_balance ?? 0,
					);
					stockMap.set(uuid, {
						name: String(prod.name || ""),
						quantity: Number.isFinite(quantity) ? quantity : 0,
					});
				}

				for (const [sku, entry] of salesBySku.entries()) {
					const velocityPerDay = entry.qty / Math.max(1, daysCount);
					if (velocityPerDay <= 0) continue;
					const stock = stockMap.get(sku)?.quantity ?? 0;
					const recommendedMin = velocityPerDay * 2;
					if (stock < recommendedMin) {
						stockAlerts.push({
							shopUuid,
							shopName,
							sku,
							name: entry.name,
							stock,
							velocityPerDay,
							recommendedMin,
						});
					}
				}
			}

			const limited = stockAlerts
				.sort((a, b) => a.stock - b.stock)
				.slice(0, limit ?? 200);

			return c.json({
				since: resolvedSince,
				until: resolvedUntil,
				shopUuids: resolvedShopUuids,
				items: limited,
			});
		} catch (error) {
			logger.error("AI director stock monitor failed", { error });
			return c.json({ error: "AI_DIRECTOR_STOCK_MONITOR_FAILED" }, 500);
		}
	})

	.post("/director/store-rating", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { date, since, until, shopUuids } = validate(
				AiDirectorStoreRatingRequestSchema,
				payload,
			);

			const evo = c.var.evotor;
			const db = c.get("db");
			const resolvedShopUuids =
				shopUuids && shopUuids.length > 0
					? shopUuids
					: await (async () => {
							try {
								const rows = await db
									.prepare("SELECT store_uuid FROM stores")
									.all<{ store_uuid: string }>();
								const fromDb = (rows.results || [])
									.map((row) => row.store_uuid)
									.filter(Boolean);
								if (fromDb.length > 0) return fromDb;
							} catch (err) {
								logger.warn("AI director store rating: stores DB lookup failed", {
									error: err,
								});
							}
							return [];
						})();
			const shopNamesMap = await (async () => {
				try {
					const rows = await db
						.prepare("SELECT store_uuid, name FROM stores")
						.all<{ store_uuid: string; name: string | null }>();
					const map: Record<string, string> = {};
					for (const row of rows.results || []) {
						if (!row.store_uuid) continue;
						if (row.name) map[row.store_uuid] = row.name;
					}
					return map;
				} catch (err) {
					logger.warn("AI director store rating: stores names DB lookup failed", {
						error: err,
					});
					return {};
				}
			})();

			const targetDate = date ?? toIsoDate(new Date());
			const resolvedSince = since ?? targetDate;
			const resolvedUntil = until ?? targetDate;
			const [rangeSince, rangeUntil] = [
				buildEvotorDayRange(resolvedSince)[0],
				buildEvotorDayRange(resolvedUntil)[1],
			];

			if (resolvedShopUuids.length === 0) {
				return c.json({
					since: resolvedSince,
					until: resolvedUntil,
					rating: [],
					warning: "SHOP_UUIDS_UNAVAILABLE",
				});
			}

			const docsByShop = await Promise.all(
				resolvedShopUuids.map((shopUuid) =>
					getDocumentsFromIndexFirst(db, evo, shopUuid, rangeSince, rangeUntil, {
						types: ["SELL", "PAYBACK"],
						skipFetchIfStale: true,
					}),
				),
			);

			const rating = resolvedShopUuids
				.map((shopUuid, idx) => {
					const docs = docsByShop[idx] || [];
					const metrics = aggregateDirectorMetrics(docs);
					return {
						shopUuid,
						shopName: shopNamesMap[shopUuid] || shopUuid,
						revenue: metrics.revenue,
						checks: metrics.checks,
						averageCheck: metrics.averageCheck,
					};
				})
				.sort((a, b) => b.revenue - a.revenue);

			return c.json({
				since: resolvedSince,
				until: resolvedUntil,
				rating,
			});
		} catch (error) {
			logger.error("AI director store rating failed", { error });
			return c.json({ error: "AI_DIRECTOR_STORE_RATING_FAILED" }, 500);
		}
	})

	.post("/director/employee-analysis", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { since, until, shopUuids, limit } = validate(
				AiDirectorEmployeeAnalysisRequestSchema,
				payload,
			);

			const evo = c.var.evotor;
			const db = c.get("db");
			const resolvedShopUuids =
				shopUuids && shopUuids.length > 0
					? shopUuids
					: await (async () => {
							try {
								const rows = await db
									.prepare("SELECT store_uuid FROM stores")
									.all<{ store_uuid: string }>();
								const fromDb = (rows.results || [])
									.map((row) => row.store_uuid)
									.filter(Boolean);
								if (fromDb.length > 0) return fromDb;
							} catch (err) {
								logger.warn(
									"AI director employee analysis: stores DB lookup failed",
									{ error: err },
								);
							}
							try {
								return await evo.getShopUuids();
							} catch (err) {
								logger.warn(
									"AI director employee analysis: getShopUuids failed",
									{ error: err },
								);
								return [];
							}
						})();
			const employeeNames = await (async () => {
				try {
					const rows = await db
						.prepare(
							"SELECT uuid, id, user_id, name, last_name FROM employees_details",
						)
						.all<{
							uuid: string | null;
							id: string | null;
							user_id: string | null;
							name: string | null;
							last_name: string | null;
						}>();
					const map: Record<string, string> = {};
					const putName = (key: string | null | undefined, value: string) => {
						if (!key) return;
						const normalized = key.trim();
						if (!normalized) return;
						map[normalized] = value;
						map[normalized.toLowerCase()] = value;
					};
					for (const row of rows.results || []) {
						const resolvedName =
							typeof row.name === "string" ? row.name.trim() : "";
						if (!resolvedName) continue;
						putName(row.uuid, resolvedName);
						putName(row.id, resolvedName);
						putName(row.user_id, resolvedName);
					}
					return map;
				} catch (err) {
					logger.warn(
						"AI director employee analysis: employees_details DB lookup failed",
						{ error: err },
					);
					return {};
				}
			})();
			const employeeNamesFromApi = await (async () => {
				try {
					const employees = await evo.getEmployees();
					const map: Record<string, string> = {};
					const putName = (key: string | null | undefined, value: string) => {
						if (!key) return;
						const normalized = key.trim();
						if (!normalized) return;
						map[normalized] = value;
						map[normalized.toLowerCase()] = value;
					};
					for (const employee of employees || []) {
						const resolvedName =
							typeof employee.name === "string" ? employee.name.trim() : "";
						if (!resolvedName) continue;
						putName(employee.uuid, resolvedName);
						putName(employee.id, resolvedName);
						putName(employee.user_id, resolvedName);
					}
					return map;
				} catch (err) {
					logger.warn(
						"AI director employee analysis: getEmployees fallback failed",
						{ error: err },
					);
					return {};
				}
			})();

			const todayKey = toIsoDate(new Date());
			const resolvedSince = since ?? shiftDateKey(todayKey, -6);
			const resolvedUntil = until ?? todayKey;
			const [rangeSince, rangeUntil] = [
				buildEvotorDayRange(resolvedSince)[0],
				buildEvotorDayRange(resolvedUntil)[1],
			];

			if (resolvedShopUuids.length === 0) {
				return c.json({
					since: resolvedSince,
					until: resolvedUntil,
					employees: [],
					warning: "SHOP_UUIDS_UNAVAILABLE",
				});
			}

			const docsByShop = await Promise.all(
				resolvedShopUuids.map(async (shopUuid) => {
					try {
						return await getDocumentsFromIndexFirst(
							db,
							evo,
							shopUuid,
							rangeSince,
							rangeUntil,
							{
								types: ["SELL", "PAYBACK"],
								skipFetchIfStale: true,
							},
						);
					} catch (err) {
						logger.warn("AI director employee analysis: docs fetch failed", {
							shopUuid,
							rangeSince,
							rangeUntil,
							error: err,
						});
						return [];
					}
				}),
			);

			const stats = new Map<
				string,
				{
					employeeUuid: string;
					name: string;
					revenue: number;
					checks: number;
				}
			>();

			for (const docs of docsByShop) {
				for (const doc of docs) {
					const employeeUuid = doc.openUserUuid || "unknown";
					const name =
						employeeNames?.[employeeUuid] ||
						employeeNames?.[employeeUuid.toLowerCase()] ||
						employeeNamesFromApi?.[employeeUuid] ||
						employeeNamesFromApi?.[employeeUuid.toLowerCase()] ||
						"Неизвестный сотрудник";
					const entry = stats.get(employeeUuid) || {
						employeeUuid,
						name,
						revenue: 0,
						checks: 0,
					};
					if (doc.type === "SELL" || doc.type === "PAYBACK") {
						entry.checks += 1;
					}
					for (const tx of doc.transactions || []) {
						if (tx.type !== "PAYMENT") continue;
						const raw = Number(tx.sum || 0);
						if (!Number.isFinite(raw) || raw === 0) continue;
						entry.revenue += doc.type === "PAYBACK" ? -Math.abs(raw) : raw;
					}
					stats.set(employeeUuid, entry);
				}
			}

			const rows = Array.from(stats.values())
				.map((entry) => ({
					...entry,
					averageCheck: entry.checks > 0 ? entry.revenue / entry.checks : 0,
				}))
				.sort((a, b) => b.revenue - a.revenue)
				.slice(0, limit ?? 200);

			return c.json({
				since: resolvedSince,
				until: resolvedUntil,
				employees: rows,
			});
		} catch (error) {
			logger.error("AI director employee analysis failed", { error });
			return c.json({ error: "AI_DIRECTOR_EMPLOYEE_ANALYSIS_FAILED" }, 500);
		}
	})

	.post("/director/employee-deep-analysis", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const {
				since,
				until,
				shopUuids,
				employeeUuids,
				limit,
				analysisDepth,
				historyDays,
				focusAreas,
				riskSensitivity,
			} = validate(
				AiDirectorEmployeeDeepAnalysisRequestSchema,
				payload,
			);

			const evo = c.var.evotor;
			const db = c.get("db");
			const resolvedShopUuids = await resolveDirectorShopUuids(
				db,
				evo,
				shopUuids,
			);

			const todayKey = toIsoDate(new Date());
			const resolvedSince = since ?? shiftDateKey(todayKey, -6);
			const resolvedUntil = until ?? todayKey;
			const [rangeSince, rangeUntil] = [
				buildEvotorDayRange(resolvedSince)[0],
				buildEvotorDayRange(resolvedUntil)[1],
			];

			if (resolvedShopUuids.length === 0) {
				return c.json({
					since: resolvedSince,
					until: resolvedUntil,
					employees: [],
					warning: "SHOP_UUIDS_UNAVAILABLE",
				});
			}

			const selectedEmployees =
				employeeUuids && employeeUuids.length > 0
					? new Set(employeeUuids.map((item) => item.trim().toLowerCase()))
					: null;
			const days = daysInRangeInclusive(resolvedSince, resolvedUntil);
			const previousUntil = shiftDateKey(resolvedSince, -1);
			const previousSince = shiftDateKey(previousUntil, -(days - 1));
			const depth = analysisDepth ?? "standard";
			const sensitivity = riskSensitivity ?? "normal";
			const thresholdMultiplier =
				sensitivity === "high" ? 1.25 : sensitivity === "low" ? 0.8 : 1;
			const defaultFocusAreas = [
				"revenue_trend",
				"avg_check",
				"refunds",
				"traffic",
				"peer_comparison",
				"stability",
			] as const;
			const enabledFocuses = new Set<string>(
				(focusAreas && focusAreas.length > 0 ? focusAreas : defaultFocusAreas).map(
					(item) => item.toLowerCase(),
				),
			);
			const isFocusEnabled = (focus: (typeof defaultFocusAreas)[number]) =>
				enabledFocuses.has(focus);
			const depthHistoryDaysMap: Record<typeof depth, number> = {
				lite: 28,
				standard: 56,
				deep: 112,
			};
			const effectiveHistoryDays = historyDays ?? depthHistoryDaysMap[depth];
			const historyUntil = shiftDateKey(resolvedSince, -1);
			const historySince = shiftDateKey(historyUntil, -(effectiveHistoryDays - 1));
			const [prevRangeSince, prevRangeUntil] = [
				buildEvotorDayRange(previousSince)[0],
				buildEvotorDayRange(previousUntil)[1],
			];
			const [historyRangeSince, historyRangeUntil] = [
				buildEvotorDayRange(historySince)[0],
				buildEvotorDayRange(historyUntil)[1],
			];
			const tzOffsetHours = Math.round(
				Number(c.env.ALERT_TZ_OFFSET_MINUTES ?? 180) / 60,
			);

			const buildEmployeeMapFromRows = (
				rows: Array<{
					employeeUuid: string | null;
					shopUuid: string | null;
					totalSell: number | null;
					totalRefund: number | null;
					checks: number | null;
				}>,
			) => {
				const result = new Map<
					string,
					{
						employeeUuid: string;
						revenue: number;
						sell: number;
						refunds: number;
						checks: number;
						shopUuids: Set<string>;
						shopCount: number;
						soldQty: number;
						shiftHours: number;
					}
				>();
				for (const row of rows) {
					const employeeUuid = String(row.employeeUuid || "").trim();
					if (!employeeUuid) continue;
					if (selectedEmployees && !selectedEmployees.has(employeeUuid.toLowerCase())) {
						continue;
					}
						const current = result.get(employeeUuid) || {
							employeeUuid,
							revenue: 0,
							sell: 0,
							refunds: 0,
							checks: 0,
							shopUuids: new Set<string>(),
							shopCount: 0,
							soldQty: 0,
							shiftHours: 0,
						};
					const sell = Number(row.totalSell || 0);
					const refunds = Number(row.totalRefund || 0);
					const checks = Number(row.checks || 0);
					current.sell += sell;
					current.refunds += refunds;
					current.revenue += sell - refunds;
					current.checks += checks;
					if (row.shopUuid) current.shopUuids.add(row.shopUuid);
					result.set(employeeUuid, current);
				}
					return result;
				};

				const queryEmployeeAgg = async (sinceTs: string, untilTs: string) => {
				const placeholders = resolvedShopUuids.map(() => "?").join(", ");
				const stmt = db.prepare(
					`SELECT
						open_user_uuid as employeeUuid,
						shop_id as shopUuid,
						SUM(CASE WHEN type = 'SELL' THEN total ELSE 0 END) as totalSell,
						SUM(CASE WHEN type = 'PAYBACK' THEN ABS(total) ELSE 0 END) as totalRefund,
						SUM(CASE WHEN type IN ('SELL','PAYBACK') THEN 1 ELSE 0 END) as checks
					FROM receipts
					WHERE close_date >= ? AND close_date <= ?
						AND shop_id IN (${placeholders})
						AND open_user_uuid IS NOT NULL
						AND open_user_uuid != ''
					GROUP BY open_user_uuid, shop_id`,
				);
				const agg = await stmt
					.bind(sinceTs, untilTs, ...resolvedShopUuids)
					.all<{
						employeeUuid: string | null;
						shopUuid: string | null;
						totalSell: number | null;
						totalRefund: number | null;
						checks: number | null;
					}>();
					return buildEmployeeMapFromRows(agg.results || []);
				};

				const queryEmployeeKpiAgg = async (sinceDate: string, untilDate: string) => {
					try {
						const placeholders = resolvedShopUuids.map(() => "?").join(", ");
						const filters: unknown[] = [sinceDate, untilDate, ...resolvedShopUuids];
						let employeeFilterSql = "";
						if (selectedEmployees && selectedEmployees.size > 0) {
							const selected = Array.from(selectedEmployees);
							employeeFilterSql = ` AND lower(employee_uuid) IN (${selected.map(() => "?").join(",")})`;
							filters.push(...selected);
						}
						const stmt = db.prepare(
							`SELECT
								employee_uuid as employeeUuid,
								SUM(revenue) as revenue,
								SUM(checks) as checks,
								SUM(refunds) as refunds,
								SUM(sold_qty) as soldQty,
								SUM(shift_hours) as shiftHours,
								COUNT(DISTINCT shop_uuid) as shopCount
							FROM employee_kpi_daily
							WHERE date >= ? AND date <= ?
								AND shop_uuid IN (${placeholders})
								${employeeFilterSql}
							GROUP BY employee_uuid`,
						);
						const rows = await stmt.bind(...filters).all<{
							employeeUuid: string | null;
							revenue: number | null;
							checks: number | null;
							refunds: number | null;
							soldQty: number | null;
							shiftHours: number | null;
							shopCount: number | null;
						}>();
						const map = new Map<
							string,
							{
								employeeUuid: string;
								revenue: number;
								sell: number;
								refunds: number;
								checks: number;
								shopUuids: Set<string>;
								shopCount: number;
								soldQty: number;
								shiftHours: number;
							}
						>();
						for (const row of rows.results || []) {
							const employeeUuid = String(row.employeeUuid || "").trim();
							if (!employeeUuid) continue;
							const revenue = Number(row.revenue || 0);
							const refunds = Number(row.refunds || 0);
							map.set(employeeUuid, {
								employeeUuid,
								revenue,
								sell: revenue + refunds,
								refunds,
								checks: Number(row.checks || 0),
								shopUuids: new Set<string>(),
								shopCount: Number(row.shopCount || 0),
								soldQty: Number(row.soldQty || 0),
								shiftHours: Number(row.shiftHours || 0),
							});
						}
						return map;
					} catch (error) {
						logger.warn(
							"AI director employee deep analysis: employee_kpi_daily lookup failed",
							{ error },
						);
						return null;
					}
				};

				const queryEmployeeKpiWeekdayAgg = async (
					sinceDate: string,
					untilDate: string,
				) => {
					try {
						const placeholders = resolvedShopUuids.map(() => "?").join(", ");
						const filters: unknown[] = [sinceDate, untilDate, ...resolvedShopUuids];
						let employeeFilterSql = "";
						if (selectedEmployees && selectedEmployees.size > 0) {
							const selected = Array.from(selectedEmployees);
							employeeFilterSql = ` AND lower(employee_uuid) IN (${selected.map(() => "?").join(",")})`;
							filters.push(...selected);
						}
						const stmt = db.prepare(
							`SELECT
								employee_uuid as employeeUuid,
								shop_uuid as shopUuid,
								CAST(strftime('%w', date) AS INTEGER) as weekday,
								SUM(revenue) as revenue,
								SUM(checks) as checks,
								COUNT(DISTINCT date) as days
							FROM employee_kpi_daily
							WHERE date >= ? AND date <= ?
								AND shop_uuid IN (${placeholders})
								${employeeFilterSql}
							GROUP BY employee_uuid, shop_uuid, weekday`,
						);
						const rows = await stmt.bind(...filters).all<{
							employeeUuid: string | null;
							shopUuid: string | null;
							weekday: number | null;
							revenue: number | null;
							checks: number | null;
							days: number | null;
						}>();
						return (rows.results || []).flatMap((row) => {
							const employeeUuid = String(row.employeeUuid || "").trim();
							const shopUuid = String(row.shopUuid || "").trim();
							if (!employeeUuid || !shopUuid) return [];
							const weekday = Number(row.weekday);
							if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) {
								return [];
							}
							return [
								{
									employeeUuid,
									shopUuid,
									weekday,
									revenue: Number(row.revenue || 0),
									checks: Number(row.checks || 0),
									days: Math.max(1, Number(row.days || 0)),
								},
							];
						});
					} catch (error) {
						logger.warn(
							"AI director employee deep analysis: employee_kpi_daily weekday lookup failed",
							{ error },
						);
						return null;
					}
				};

				type WeekdayAggRow = {
					employeeUuid: string;
					shopUuid: string;
					weekday: number;
					revenue: number;
					checks: number;
					days: number;
				};

				type SegmentAggRow = {
					employeeUuid: string;
					shopUuid: string;
					weekday: number;
					hourBucket: number;
					revenue: number;
					checks: number;
					periods: number;
				};

				const queryEmployeeReceiptsWeekdayAgg = async (
					sinceTs: string,
					untilTs: string,
				): Promise<WeekdayAggRow[] | null> => {
					try {
						const placeholders = resolvedShopUuids.map(() => "?").join(", ");
						const filters: unknown[] = [sinceTs, untilTs, ...resolvedShopUuids];
						let employeeFilterSql = "";
						if (selectedEmployees && selectedEmployees.size > 0) {
							const selected = Array.from(selectedEmployees);
							employeeFilterSql = ` AND lower(open_user_uuid) IN (${selected.map(() => "?").join(",")})`;
							filters.push(...selected);
						}
						const stmt = db.prepare(
							`SELECT
								open_user_uuid as employeeUuid,
								shop_id as shopUuid,
								substr(close_date, 1, 10) as dateKey,
								SUM(CASE WHEN type = 'SELL' THEN total ELSE 0 END)
									- SUM(CASE WHEN type = 'PAYBACK' THEN ABS(total) ELSE 0 END) as revenue,
								SUM(CASE WHEN type IN ('SELL','PAYBACK') THEN 1 ELSE 0 END) as checks
							FROM receipts
							WHERE close_date >= ? AND close_date <= ?
								AND shop_id IN (${placeholders})
								AND open_user_uuid IS NOT NULL
								AND open_user_uuid != ''
								${employeeFilterSql}
							GROUP BY open_user_uuid, shop_id, substr(close_date, 1, 10)`,
						);
						const rows = await stmt.bind(...filters).all<{
							employeeUuid: string | null;
							shopUuid: string | null;
							dateKey: string | null;
							revenue: number | null;
							checks: number | null;
						}>();
						const byEmployeeShopWeekday = new Map<string, WeekdayAggRow>();
						for (const row of rows.results || []) {
							const employeeUuid = String(row.employeeUuid || "").trim();
							const shopUuid = String(row.shopUuid || "").trim();
							const dateKey = String(row.dateKey || "").trim();
							if (!employeeUuid || !shopUuid || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
								continue;
							}
							const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
							if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) continue;
							const key = `${employeeUuid}|${shopUuid}|${weekday}`;
							const current = byEmployeeShopWeekday.get(key) || {
								employeeUuid,
								shopUuid,
								weekday,
								revenue: 0,
								checks: 0,
								days: 0,
							};
							current.revenue += Number(row.revenue || 0);
							current.checks += Number(row.checks || 0);
							current.days += 1;
							byEmployeeShopWeekday.set(key, current);
						}
						return Array.from(byEmployeeShopWeekday.values());
					} catch (error) {
						logger.warn(
							"AI director employee deep analysis: receipts weekday lookup failed",
							{ error },
						);
						return null;
					}
				};

				const queryEmployeeReceiptsSegmentAgg = async (
					sinceTs: string,
					untilTs: string,
				): Promise<SegmentAggRow[] | null> => {
					try {
						const placeholders = resolvedShopUuids.map(() => "?").join(", ");
						const filters: unknown[] = [sinceTs, untilTs, ...resolvedShopUuids];
						let employeeFilterSql = "";
						if (selectedEmployees && selectedEmployees.size > 0) {
							const selected = Array.from(selectedEmployees);
							employeeFilterSql = ` AND lower(open_user_uuid) IN (${selected.map(() => "?").join(",")})`;
							filters.push(...selected);
						}
						const stmt = db.prepare(
							`SELECT
								open_user_uuid as employeeUuid,
								shop_id as shopUuid,
								substr(close_date, 1, 10) as dateKey,
								CAST(substr(close_date, 12, 2) AS INTEGER) as hourUtc,
								SUM(CASE WHEN type = 'SELL' THEN total ELSE 0 END)
									- SUM(CASE WHEN type = 'PAYBACK' THEN ABS(total) ELSE 0 END) as revenue,
								SUM(CASE WHEN type IN ('SELL','PAYBACK') THEN 1 ELSE 0 END) as checks
							FROM receipts
							WHERE close_date >= ? AND close_date <= ?
								AND shop_id IN (${placeholders})
								AND open_user_uuid IS NOT NULL
								AND open_user_uuid != ''
								${employeeFilterSql}
							GROUP BY open_user_uuid, shop_id, substr(close_date, 1, 10), CAST(substr(close_date, 12, 2) AS INTEGER)`,
						);
						const rows = await stmt.bind(...filters).all<{
							employeeUuid: string | null;
							shopUuid: string | null;
							dateKey: string | null;
							hourUtc: number | null;
							revenue: number | null;
							checks: number | null;
						}>();
						const bySegment = new Map<string, SegmentAggRow>();
						for (const row of rows.results || []) {
							const employeeUuid = String(row.employeeUuid || "").trim();
							const shopUuid = String(row.shopUuid || "").trim();
							const dateKey = String(row.dateKey || "").trim();
							if (!employeeUuid || !shopUuid || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
								continue;
							}
							const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
							if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) continue;
							const hourUtc = Number(row.hourUtc);
							if (!Number.isFinite(hourUtc) || hourUtc < 0 || hourUtc > 23) continue;
							const hourLocal = (hourUtc + tzOffsetHours + 24) % 24;
							const hourBucket = Math.floor(hourLocal / 6);
							const key = `${employeeUuid}|${shopUuid}|${weekday}|${hourBucket}`;
							const current = bySegment.get(key) || {
								employeeUuid,
								shopUuid,
								weekday,
								hourBucket,
								revenue: 0,
								checks: 0,
								periods: 0,
							};
							current.revenue += Number(row.revenue || 0);
							current.checks += Number(row.checks || 0);
							current.periods += 1;
							bySegment.set(key, current);
						}
						return Array.from(bySegment.values());
					} catch (error) {
						logger.warn(
							"AI director employee deep analysis: receipts segment lookup failed",
							{ error },
						);
						return null;
					}
				};

				const buildComparisonMap = (
					currentWeekdayRows: WeekdayAggRow[],
					historyWeekdayRows: WeekdayAggRow[],
				) => {
					const result = new Map<
						string,
						{
							primaryShopUuid: string;
							historyDays: number;
							weekdays: Array<{
								weekday: number;
								currentAvgRevenue: number;
								currentAvgChecks: number;
								ownHistoryAvgRevenue: number | null;
								peerAvgRevenue: number | null;
								vsOwnHistoryPct: number | null;
								vsPeersPct: number | null;
							}>;
							summary: {
								avgVsOwnHistoryPct: number | null;
								avgVsPeersPct: number | null;
								bestWeekday: number | null;
								weakestWeekday: number | null;
							};
						}
					>();

					const employeeShopRevenue = new Map<string, Map<string, number>>();
					for (const row of currentWeekdayRows) {
						const byShop =
							employeeShopRevenue.get(row.employeeUuid) || new Map<string, number>();
						byShop.set(row.shopUuid, (byShop.get(row.shopUuid) || 0) + row.revenue);
						employeeShopRevenue.set(row.employeeUuid, byShop);
					}

					const historyByEmployeeShopWeekday = new Map<
						string,
						{ revenue: number; checks: number; days: number }
					>();
					const historyByShopWeekday = new Map<
						string,
						{ revenue: number; checks: number; days: number }
					>();
					for (const row of historyWeekdayRows) {
						const employeeKey = `${row.employeeUuid}|${row.shopUuid}|${row.weekday}`;
						historyByEmployeeShopWeekday.set(employeeKey, {
							revenue: row.revenue,
							checks: row.checks,
							days: row.days,
						});
						const shopKey = `${row.shopUuid}|${row.weekday}`;
						const total = historyByShopWeekday.get(shopKey) || {
							revenue: 0,
							checks: 0,
							days: 0,
						};
						total.revenue += row.revenue;
						total.checks += row.checks;
						total.days += row.days;
						historyByShopWeekday.set(shopKey, total);
					}

					for (const current of currentMap.values()) {
						const revenueByShop = employeeShopRevenue.get(current.employeeUuid);
						if (!revenueByShop || revenueByShop.size === 0) continue;
						const primaryShopUuid = Array.from(revenueByShop.entries()).sort(
							(a, b) => b[1] - a[1],
						)[0][0];

						const ownCurrentRows = currentWeekdayRows.filter(
							(row) =>
								row.employeeUuid === current.employeeUuid &&
								row.shopUuid === primaryShopUuid,
						);
						if (ownCurrentRows.length === 0) continue;

						const ownVsHistory: number[] = [];
						const ownVsPeers: number[] = [];
						const weekdays = ownCurrentRows
							.map((row) => {
								const currentAvgRevenue = row.revenue / Math.max(1, row.days);
								const currentAvgChecks = row.checks / Math.max(1, row.days);
								const ownHistory = historyByEmployeeShopWeekday.get(
									`${current.employeeUuid}|${primaryShopUuid}|${row.weekday}`,
								);
								const ownHistoryAvgRevenue = ownHistory
									? ownHistory.revenue / Math.max(1, ownHistory.days)
									: null;
								const shopHistoryTotal = historyByShopWeekday.get(
									`${primaryShopUuid}|${row.weekday}`,
								);
								let peerAvgRevenue: number | null = null;
								if (shopHistoryTotal) {
									const peerRevenue =
										shopHistoryTotal.revenue - (ownHistory?.revenue || 0);
									const peerDays = shopHistoryTotal.days - (ownHistory?.days || 0);
									if (peerDays > 0) peerAvgRevenue = peerRevenue / peerDays;
								}
								const vsOwnHistoryPct =
									ownHistoryAvgRevenue !== null
										? calcChangePct(currentAvgRevenue, ownHistoryAvgRevenue)
										: null;
								const vsPeersPct =
									peerAvgRevenue !== null
										? calcChangePct(currentAvgRevenue, peerAvgRevenue)
										: null;
								if (vsOwnHistoryPct !== null) ownVsHistory.push(vsOwnHistoryPct);
								if (vsPeersPct !== null) ownVsPeers.push(vsPeersPct);
								return {
									weekday: row.weekday,
									currentAvgRevenue,
									currentAvgChecks,
									ownHistoryAvgRevenue,
									peerAvgRevenue,
									vsOwnHistoryPct,
									vsPeersPct,
								};
							})
							.sort((a, b) => a.weekday - b.weekday);

						const pickExtremeWeekday = (
							items: typeof weekdays,
							field: "vsPeersPct" | "vsOwnHistoryPct",
							pick: "max" | "min",
						): number | null => {
							const filtered = items.filter(
								(item) => item[field] !== null && Number.isFinite(item[field]),
							);
							if (filtered.length === 0) return null;
							const sorted = filtered.sort((a, b) =>
								pick === "max"
									? Number(b[field]) - Number(a[field])
									: Number(a[field]) - Number(b[field]),
							);
							return sorted[0]?.weekday ?? null;
						};

						const avg = (values: number[]) =>
							values.length > 0
								? values.reduce((sum, value) => sum + value, 0) / values.length
								: null;

						result.set(current.employeeUuid, {
							primaryShopUuid,
							historyDays: effectiveHistoryDays,
							weekdays,
							summary: {
								avgVsOwnHistoryPct: avg(ownVsHistory),
								avgVsPeersPct: avg(ownVsPeers),
								bestWeekday:
									pickExtremeWeekday(weekdays, "vsPeersPct", "max") ??
									pickExtremeWeekday(weekdays, "vsOwnHistoryPct", "max"),
								weakestWeekday:
									pickExtremeWeekday(weekdays, "vsPeersPct", "min") ??
									pickExtremeWeekday(weekdays, "vsOwnHistoryPct", "min"),
							},
						});
					}

					return result;
				};

				const buildFairComparisonMap = (
					currentSegmentRows: SegmentAggRow[],
					historySegmentRows: SegmentAggRow[],
				) => {
					const result = new Map<
						string,
						{
							primaryShopUuid: string;
							normalizers: ["shop", "weekday", "hour_bucket"];
							segments: Array<{
								weekday: number;
								hourBucket: number;
								currentAvgRevenue: number;
								currentAvgChecks: number;
								ownHistoryAvgRevenue: number | null;
								peerAvgRevenue: number | null;
								vsOwnHistoryPct: number | null;
								vsPeersPct: number | null;
							}>;
							summary: {
								avgVsOwnHistoryPct: number | null;
								avgVsPeersPct: number | null;
								bestSegment: { weekday: number; hourBucket: number } | null;
								weakestSegment: { weekday: number; hourBucket: number } | null;
							};
						}
					>();

					const employeeShopRevenue = new Map<string, Map<string, number>>();
					for (const row of currentSegmentRows) {
						const byShop =
							employeeShopRevenue.get(row.employeeUuid) || new Map<string, number>();
						byShop.set(row.shopUuid, (byShop.get(row.shopUuid) || 0) + row.revenue);
						employeeShopRevenue.set(row.employeeUuid, byShop);
					}

					const historyByEmployeeSegment = new Map<
						string,
						{ revenue: number; checks: number; periods: number }
					>();
					const historyByShopSegment = new Map<
						string,
						{ revenue: number; checks: number; periods: number }
					>();
					for (const row of historySegmentRows) {
						const employeeKey = `${row.employeeUuid}|${row.shopUuid}|${row.weekday}|${row.hourBucket}`;
						historyByEmployeeSegment.set(employeeKey, {
							revenue: row.revenue,
							checks: row.checks,
							periods: row.periods,
						});
						const shopKey = `${row.shopUuid}|${row.weekday}|${row.hourBucket}`;
						const total = historyByShopSegment.get(shopKey) || {
							revenue: 0,
							checks: 0,
							periods: 0,
						};
						total.revenue += row.revenue;
						total.checks += row.checks;
						total.periods += row.periods;
						historyByShopSegment.set(shopKey, total);
					}

					for (const current of currentMap.values()) {
						const revenueByShop = employeeShopRevenue.get(current.employeeUuid);
						if (!revenueByShop || revenueByShop.size === 0) continue;
						const primaryShopUuid = Array.from(revenueByShop.entries()).sort(
							(a, b) => b[1] - a[1],
						)[0][0];

						const ownCurrentRows = currentSegmentRows.filter(
							(row) =>
								row.employeeUuid === current.employeeUuid &&
								row.shopUuid === primaryShopUuid,
						);
						if (ownCurrentRows.length === 0) continue;

						const ownVsHistory: number[] = [];
						const ownVsPeers: number[] = [];
						const segments = ownCurrentRows
							.map((row) => {
								const currentAvgRevenue = row.revenue / Math.max(1, row.periods);
								const currentAvgChecks = row.checks / Math.max(1, row.periods);
								const ownHistory = historyByEmployeeSegment.get(
									`${current.employeeUuid}|${primaryShopUuid}|${row.weekday}|${row.hourBucket}`,
								);
								const ownHistoryAvgRevenue = ownHistory
									? ownHistory.revenue / Math.max(1, ownHistory.periods)
									: null;
								const shopHistory = historyByShopSegment.get(
									`${primaryShopUuid}|${row.weekday}|${row.hourBucket}`,
								);
								let peerAvgRevenue: number | null = null;
								if (shopHistory) {
									const peerRevenue =
										shopHistory.revenue - (ownHistory?.revenue || 0);
									const peerPeriods =
										shopHistory.periods - (ownHistory?.periods || 0);
									if (peerPeriods > 0) {
										peerAvgRevenue = peerRevenue / peerPeriods;
									}
								}
								const vsOwnHistoryPct =
									ownHistoryAvgRevenue !== null
										? calcChangePct(currentAvgRevenue, ownHistoryAvgRevenue)
										: null;
								const vsPeersPct =
									peerAvgRevenue !== null
										? calcChangePct(currentAvgRevenue, peerAvgRevenue)
										: null;
								if (vsOwnHistoryPct !== null) ownVsHistory.push(vsOwnHistoryPct);
								if (vsPeersPct !== null) ownVsPeers.push(vsPeersPct);
								return {
									weekday: row.weekday,
									hourBucket: row.hourBucket,
									currentAvgRevenue,
									currentAvgChecks,
									ownHistoryAvgRevenue,
									peerAvgRevenue,
									vsOwnHistoryPct,
									vsPeersPct,
								};
							})
							.sort(
								(a, b) =>
									a.weekday - b.weekday || a.hourBucket - b.hourBucket,
							);

						const avg = (values: number[]) =>
							values.length > 0
								? values.reduce((sum, value) => sum + value, 0) / values.length
								: null;

						const sortedByPeers = segments
							.filter(
								(item) =>
									item.vsPeersPct !== null && Number.isFinite(item.vsPeersPct),
							)
							.sort((a, b) => Number(b.vsPeersPct) - Number(a.vsPeersPct));
						const sortedByHistory = segments
							.filter(
								(item) =>
									item.vsOwnHistoryPct !== null &&
									Number.isFinite(item.vsOwnHistoryPct),
							)
							.sort(
								(a, b) => Number(b.vsOwnHistoryPct) - Number(a.vsOwnHistoryPct),
							);

						const bestSegmentSource = sortedByPeers[0] || sortedByHistory[0] || null;
						const weakestSegmentSource =
							sortedByPeers[sortedByPeers.length - 1] ||
							sortedByHistory[sortedByHistory.length - 1] ||
							null;

						result.set(current.employeeUuid, {
							primaryShopUuid,
							normalizers: ["shop", "weekday", "hour_bucket"],
							segments,
							summary: {
								avgVsOwnHistoryPct: avg(ownVsHistory),
								avgVsPeersPct: avg(ownVsPeers),
								bestSegment: bestSegmentSource
									? {
											weekday: bestSegmentSource.weekday,
											hourBucket: bestSegmentSource.hourBucket,
										}
									: null,
								weakestSegment: weakestSegmentSource
									? {
											weekday: weakestSegmentSource.weekday,
											hourBucket: weakestSegmentSource.hourBucket,
										}
									: null,
							},
						});
					}

					return result;
				};

				const [currentFromKpi, previousFromKpi] = await Promise.all([
					queryEmployeeKpiAgg(resolvedSince, resolvedUntil),
					queryEmployeeKpiAgg(previousSince, previousUntil),
				]);
				const useKpi =
					currentFromKpi !== null &&
					previousFromKpi !== null &&
					currentFromKpi.size > 0;
				const [currentMap, previousMap] = useKpi
					? [currentFromKpi, previousFromKpi]
					: await Promise.all([
							queryEmployeeAgg(rangeSince, rangeUntil),
							queryEmployeeAgg(prevRangeSince, prevRangeUntil),
						]);

			let comparisonByEmployee = new Map<
				string,
				{
					primaryShopUuid: string;
					historyDays: number;
					weekdays: Array<{
						weekday: number;
						currentAvgRevenue: number;
						currentAvgChecks: number;
						ownHistoryAvgRevenue: number | null;
						peerAvgRevenue: number | null;
						vsOwnHistoryPct: number | null;
						vsPeersPct: number | null;
					}>;
					summary: {
						avgVsOwnHistoryPct: number | null;
						avgVsPeersPct: number | null;
						bestWeekday: number | null;
						weakestWeekday: number | null;
					};
				}
			>();

			const getComparableEmployeesCount = (
				map: typeof comparisonByEmployee,
			): number =>
				Array.from(map.values()).filter(
					(item) =>
						item.summary.avgVsOwnHistoryPct !== null ||
						item.summary.avgVsPeersPct !== null,
				).length;

			if (useKpi) {
				const [currentWeekdayRows, historyWeekdayRows] = await Promise.all([
					queryEmployeeKpiWeekdayAgg(resolvedSince, resolvedUntil),
					queryEmployeeKpiWeekdayAgg(historySince, historyUntil),
				]);

				if (currentWeekdayRows && historyWeekdayRows) {
					comparisonByEmployee = buildComparisonMap(
						currentWeekdayRows,
						historyWeekdayRows,
					);
				}

				if (getComparableEmployeesCount(comparisonByEmployee) === 0) {
					const [currentWeekdayRowsFromReceipts, historyWeekdayRowsFromReceipts] =
						await Promise.all([
							queryEmployeeReceiptsWeekdayAgg(rangeSince, rangeUntil),
							queryEmployeeReceiptsWeekdayAgg(
								historyRangeSince,
								historyRangeUntil,
							),
						]);
					if (
						currentWeekdayRowsFromReceipts &&
						historyWeekdayRowsFromReceipts &&
						currentWeekdayRowsFromReceipts.length > 0 &&
						historyWeekdayRowsFromReceipts.length > 0
					) {
						comparisonByEmployee = buildComparisonMap(
							currentWeekdayRowsFromReceipts,
							historyWeekdayRowsFromReceipts,
						);
					}
				}
			} else {
				const [currentWeekdayRowsFromReceipts, historyWeekdayRowsFromReceipts] =
					await Promise.all([
						queryEmployeeReceiptsWeekdayAgg(rangeSince, rangeUntil),
						queryEmployeeReceiptsWeekdayAgg(historyRangeSince, historyRangeUntil),
					]);
				if (
					currentWeekdayRowsFromReceipts &&
					historyWeekdayRowsFromReceipts &&
					currentWeekdayRowsFromReceipts.length > 0 &&
					historyWeekdayRowsFromReceipts.length > 0
				) {
					comparisonByEmployee = buildComparisonMap(
						currentWeekdayRowsFromReceipts,
						historyWeekdayRowsFromReceipts,
					);
				}
			}

			const [currentSegmentRowsFromReceipts, historySegmentRowsFromReceipts] =
				await Promise.all([
					queryEmployeeReceiptsSegmentAgg(rangeSince, rangeUntil),
					queryEmployeeReceiptsSegmentAgg(historyRangeSince, historyRangeUntil),
				]);
			const fairComparisonByEmployee =
				currentSegmentRowsFromReceipts && historySegmentRowsFromReceipts
					? buildFairComparisonMap(
							currentSegmentRowsFromReceipts,
							historySegmentRowsFromReceipts,
						)
					: new Map<
							string,
							{
								primaryShopUuid: string;
								normalizers: ["shop", "weekday", "hour_bucket"];
								segments: Array<{
									weekday: number;
									hourBucket: number;
									currentAvgRevenue: number;
									currentAvgChecks: number;
									ownHistoryAvgRevenue: number | null;
									peerAvgRevenue: number | null;
									vsOwnHistoryPct: number | null;
									vsPeersPct: number | null;
								}>;
								summary: {
									avgVsOwnHistoryPct: number | null;
									avgVsPeersPct: number | null;
									bestSegment: { weekday: number; hourBucket: number } | null;
									weakestSegment: { weekday: number; hourBucket: number } | null;
								};
							}
						>();

			const employeeNames = await (async () => {
				try {
					const rows = await db
						.prepare("SELECT uuid, id, user_id, name FROM employees_details")
						.all<{
							uuid: string | null;
							id: string | null;
							user_id: string | null;
							name: string | null;
						}>();
					const map: Record<string, string> = {};
					const putName = (key: string | null | undefined, value: string) => {
						if (!key) return;
						const normalized = key.trim();
						if (!normalized) return;
						map[normalized] = value;
						map[normalized.toLowerCase()] = value;
					};
					for (const row of rows.results || []) {
						const resolvedName = typeof row.name === "string" ? row.name.trim() : "";
						if (!resolvedName) continue;
						putName(row.uuid, resolvedName);
						putName(row.id, resolvedName);
						putName(row.user_id, resolvedName);
					}
					return map;
				} catch (error) {
					logger.warn(
						"AI director employee deep analysis: employees_details lookup failed",
						{ error },
					);
					return {};
				}
			})();

			const items = Array.from(currentMap.values())
				.map((current) => {
					const previous = previousMap.get(current.employeeUuid);
					const comparison = comparisonByEmployee.get(current.employeeUuid) || null;
					const fairComparison =
						fairComparisonByEmployee.get(current.employeeUuid) || null;
					const fairVsPeersPct = fairComparison?.summary.avgVsPeersPct ?? null;
					const revenueTrendPct = calcChangePct(
						current.revenue,
						previous?.revenue ?? 0,
					);
					const refundRatePct =
						current.sell > 0 ? (current.refunds / current.sell) * 100 : 0;
					const averageCheck =
						current.checks > 0 ? current.revenue / current.checks : 0;
					const reasons: string[] = [];
					const recommendations: string[] = [];
					let riskScore = 0;
					const weekdayRevenue = (comparison?.weekdays || []).map((item) =>
						Number(item.currentAvgRevenue || 0),
					);
					const avgWeekdayRevenue =
						weekdayRevenue.length > 0
							? weekdayRevenue.reduce((sum, value) => sum + value, 0) /
								weekdayRevenue.length
							: 0;
					const stdWeekdayRevenue =
						weekdayRevenue.length > 1
							? Math.sqrt(
									weekdayRevenue.reduce(
										(sum, value) =>
											sum + (value - avgWeekdayRevenue) * (value - avgWeekdayRevenue),
										0,
									) / weekdayRevenue.length,
								)
							: 0;
					const weekdayRevenueCv =
						avgWeekdayRevenue > 0 ? stdWeekdayRevenue / avgWeekdayRevenue : 0;

					if (
						isFocusEnabled("refunds") &&
						refundRatePct >= 8 / Math.max(0.5, thresholdMultiplier)
					) {
						riskScore += 35;
						reasons.push("Высокая доля возвратов");
						recommendations.push(
							"Проверить причины возвратов и скрипт продажи по проблемным категориям",
						);
					}
					if (
						isFocusEnabled("revenue_trend") &&
						revenueTrendPct !== null &&
						revenueTrendPct <= -0.2 / Math.max(0.5, thresholdMultiplier)
					) {
						riskScore += 35;
						reasons.push("Резкое падение выручки к прошлому периоду");
						recommendations.push(
							"Разобрать смены с минимальной выручкой и усилить допродажи на кассе",
						);
					}
					if (
						isFocusEnabled("avg_check") &&
						averageCheck > 0 &&
						averageCheck < 350 * thresholdMultiplier
					) {
						riskScore += 20;
						reasons.push("Низкий средний чек");
						recommendations.push(
							"Добавить обязательное предложение 1-2 сопутствующих товаров в каждом чеке",
						);
					}
					if (
						isFocusEnabled("traffic") &&
						current.checks < 20 * thresholdMultiplier
					) {
						riskScore += 10;
						reasons.push("Низкий поток чеков");
						recommendations.push(
							"Перераспределить часы сотрудника на более трафиковые интервалы",
						);
					}
					if (
						isFocusEnabled("peer_comparison") &&
						(fairVsPeersPct ?? comparison?.summary.avgVsPeersPct) !== null &&
						(fairVsPeersPct ?? comparison?.summary.avgVsPeersPct) !== undefined &&
						Number(fairVsPeersPct ?? comparison?.summary.avgVsPeersPct) <=
							-0.15 / Math.max(0.5, thresholdMultiplier)
					) {
						riskScore += 15;
						reasons.push(
							"Ниже коллег в похожих сменах (магазин/день недели/час)",
						);
					}
					if (
						isFocusEnabled("stability") &&
						weekdayRevenue.length >= 3 &&
						weekdayRevenueCv >= 0.45 / Math.max(0.5, thresholdMultiplier)
					) {
						riskScore += 10;
						reasons.push("Нестабильная выручка по дням недели");
						recommendations.push(
							"Стабилизировать результат: единый скрипт допродаж и контроль выполнения по чек-листу смены",
						);
					}
					if (fairComparison?.summary.weakestSegment) {
						const weekdayLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
						const segmentLabels = [
							"00:00-05:59",
							"06:00-11:59",
							"12:00-17:59",
							"18:00-23:59",
						];
						const dayLabel =
							weekdayLabels[fairComparison.summary.weakestSegment.weekday] ||
							"пиковые дни";
						const segmentLabel =
							segmentLabels[fairComparison.summary.weakestSegment.hourBucket] ||
							"часовой слот";
						recommendations.push(
							`Провести разбор похожих смен: ${dayLabel}, ${segmentLabel} (сравнение с коллегами этого же слота)`,
						);
					} else if (
						comparison?.summary.weakestWeekday !== null &&
						comparison?.summary.weakestWeekday !== undefined
					) {
						const weekdayLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
						const dayLabel =
							weekdayLabels[comparison.summary.weakestWeekday] || "пиковые дни";
						recommendations.push(
							`Провести разбор смен в ${dayLabel}: чек-лист допродаж и контроль скрипта кассы`,
						);
					}

					const employeeName =
						employeeNames[current.employeeUuid] ||
						employeeNames[current.employeeUuid.toLowerCase()] ||
						current.employeeUuid;

					return {
						employeeUuid: current.employeeUuid,
						name: employeeName,
						revenue: current.revenue,
						checks: current.checks,
						averageCheck,
						refunds: current.refunds,
						refundRatePct,
						revenueTrendPct,
						riskScore: Math.max(0, Math.min(100, riskScore)),
						reasons:
							reasons.length > 0 ? reasons : ["Стабильные показатели без критичных рисков"],
						recommendations:
							recommendations.length > 0
								? recommendations.slice(0, 3)
								: ["Продолжать текущую модель продаж и контролировать возвраты"],
						shopCount:
							current.shopCount > 0 ? current.shopCount : current.shopUuids.size,
						comparison,
						fairComparison,
						};
					})
				.sort((a, b) => b.riskScore - a.riskScore || b.revenue - a.revenue)
				.slice(0, limit ?? 200);

				const comparableEmployees = items.filter((item) => {
					const fairPeers = item.fairComparison?.summary?.avgVsPeersPct;
					const fairHistory = item.fairComparison?.summary?.avgVsOwnHistoryPct;
					const avgVsPeers = item.comparison?.summary?.avgVsPeersPct;
					const avgVsHistory = item.comparison?.summary?.avgVsOwnHistoryPct;
					return (
						fairPeers !== null ||
						fairHistory !== null ||
						avgVsPeers !== null ||
						avgVsHistory !== null
					);
				}).length;
				const comparisonWarning =
					useKpi && comparableEmployees === 0
						? "INSUFFICIENT_HISTORY_FOR_WEEKDAY_COMPARISON"
						: null;

				return c.json({
					since: resolvedSince,
					until: resolvedUntil,
					previousSince,
					previousUntil,
					source: useKpi ? "employee_kpi_daily" : "receipts",
					analysisDepth: depth,
					historyDays: effectiveHistoryDays,
					appliedFocusAreas: Array.from(enabledFocuses),
					riskSensitivity: sensitivity,
					historyWindow: {
						since: historySince,
						until: historyUntil,
					},
					comparisonMode: "fair_shop_weekday_hour",
					comparisonCoverage: {
						totalEmployees: items.length,
						comparableEmployees,
					},
					warning: comparisonWarning,
					employees: items,
				});
		} catch (error) {
			logger.error("AI director employee deep analysis failed", { error });
			return c.json({ error: "AI_DIRECTOR_EMPLOYEE_DEEP_ANALYSIS_FAILED" }, 500);
		}
	})

	.post("/director/demand-forecast", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { date, shopUuids } = validate(
				AiDirectorDemandForecastRequestSchema,
				payload,
			);

			const evo = c.var.evotor;
			const db = c.get("db");
			const resolvedShopUuids =
				shopUuids && shopUuids.length > 0
					? shopUuids
					: await (async () => {
							try {
								return await evo.getShopUuids();
							} catch (err) {
								logger.warn(
									"AI director demand forecast: getShopUuids failed, using DB fallback",
									{ error: err },
								);
								const rows = await db
									.prepare("SELECT store_uuid FROM stores")
									.all<{ store_uuid: string }>();
								return (rows.results || [])
									.map((row) => row.store_uuid)
									.filter(Boolean);
							}
						})();

			const targetDate = date ?? toIsoDate(new Date());
			const targetDay = new Date(`${targetDate}T00:00:00Z`).getUTCDay();
			const lat = Number(c.env.WEATHER_DEFAULT_LAT || "");
			const lon = Number(c.env.WEATHER_DEFAULT_LON || "");
			let weather = null;
			if (Number.isFinite(lat) && Number.isFinite(lon)) {
				try {
					weather = await getWeatherSummary(lat, lon, targetDate, c.env.KV);
				} catch (err) {
					logger.warn("AI director demand forecast: weather lookup failed", {
						error: err,
					});
				}
			}
			const weatherFactor = weatherDemandFactor(weather);

			const weekOffsets = [7, 14, 21, 28];
			const ranges = weekOffsets.map((offset) => {
				const dayKey = shiftDateKey(targetDate, -offset);
				return buildEvotorDayRange(dayKey);
			});

			const getRevenueFromReceipts = async (since: string, until: string) => {
				if (resolvedShopUuids.length === 0) {
					return { revenue: 0, checks: 0, refunds: 0 };
				}
				const placeholders = resolvedShopUuids.map(() => "?").join(", ");
				const stmt = db.prepare(
					`SELECT
						SUM(CASE WHEN type = 'SELL' THEN total ELSE 0 END) as totalSell,
						SUM(CASE WHEN type = 'PAYBACK' THEN ABS(total) ELSE 0 END) as totalRefund,
						SUM(CASE WHEN type IN ('SELL','PAYBACK') THEN 1 ELSE 0 END) as checksCount
					FROM receipts
					WHERE close_date >= ? AND close_date <= ?
						AND shop_id IN (${placeholders})`,
				);
				const row = await stmt
					.bind(since, until, ...resolvedShopUuids)
					.first<{
						totalSell: number | null;
						totalRefund: number | null;
						checksCount: number | null;
					}>();
				const totalSell = Number(row?.totalSell || 0);
				const totalRefund = Number(row?.totalRefund || 0);
				const checks = Number(row?.checksCount || 0);
				return {
					revenue: totalSell - totalRefund,
					checks,
					refunds: totalRefund,
				};
			};

			const historyMetrics = await Promise.all(
				ranges.map(async ([since, until]) => getRevenueFromReceipts(since, until)),
			);
			let historySource: "receipts" | "index" = "receipts";
			let effectiveHistory = historyMetrics;
			const hasReceiptsHistory = historyMetrics.some(
				(item) => Math.abs(item.revenue) > 0.01 || item.checks > 0,
			);
			if (!hasReceiptsHistory && resolvedShopUuids.length > 0) {
				historySource = "index";
				effectiveHistory = await Promise.all(
					ranges.map(async ([since, until]) => {
						const period = await getDirectorPeriodMetrics(
							db,
							evo,
							resolvedShopUuids,
							since,
							until,
						);
						return {
							revenue: period.metrics.revenue,
							checks: period.metrics.checks,
							refunds: period.metrics.refunds,
						};
					}),
				);
			}

			const nonZeroHistory = effectiveHistory.filter((item) => item.revenue > 0);
			const avgRevenue =
				(nonZeroHistory.length > 0 ? nonZeroHistory : effectiveHistory).reduce(
					(sum, item) => sum + item.revenue,
					0,
				) /
				Math.max(1, (nonZeroHistory.length > 0 ? nonZeroHistory : effectiveHistory).length);

			const forecast = avgRevenue * weatherFactor;
			const responsePayload = {
				date: targetDate,
				weekday: targetDay,
				forecast,
				weather,
				weatherFactor,
				history: effectiveHistory,
				historySource,
				warning:
					resolvedShopUuids.length === 0
						? "SHOP_UUIDS_UNAVAILABLE"
						: effectiveHistory.every((item) => Math.abs(item.revenue) <= 0.01)
							? "NO_HISTORY_REVENUE"
							: null,
			};

			return c.json(responsePayload);
		} catch (error) {
			logger.error("AI director demand forecast failed", { error });
			return c.json({ error: "AI_DIRECTOR_DEMAND_FORECAST_FAILED" }, 500);
		}
	})

	.post("/director/chat", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { message, date, since, until, shopUuids } = validate(
				AiDirectorChatRequestSchema,
				payload,
			);

			const evo = c.var.evotor;
			const db = c.get("db");
			const resolvedShopUuids =
				shopUuids && shopUuids.length > 0
					? shopUuids
					: await evo.getShopUuids();

			const targetDate = date ?? toIsoDate(new Date());
			const resolvedSince = since ?? targetDate;
			const resolvedUntil = until ?? targetDate;
			const [rangeSince, rangeUntil] = [
				buildEvotorDayRange(resolvedSince)[0],
				buildEvotorDayRange(resolvedUntil)[1],
			];

			const docsByShop = await Promise.all(
				resolvedShopUuids.map((shopUuid) =>
					getDocumentsFromIndexFirst(db, evo, shopUuid, rangeSince, rangeUntil, {
						types: ["SELL", "PAYBACK"],
						skipFetchIfStale: true,
					}),
				),
			);
			const docs = docsByShop.flat();
			const metrics = aggregateDirectorMetrics(docs);

			let reply = "Недостаточно данных для ответа.";
			try {
				const aiResult = await c.env.AI.run(DIRECTOR_REPORT_MODEL as any, {
					max_tokens: 400,
					temperature: 0.2,
					messages: [
						{
							role: "system",
							content:
								"Ты AI директор магазина. Отвечай кратко и по делу, 2-6 предложений. Используй только предоставленные данные.",
						},
						{
							role: "user",
							content: JSON.stringify({
								question: message,
								period: { since: resolvedSince, until: resolvedUntil },
								metrics,
							}),
						},
					],
				});
				const text = extractAiText(aiResult);
				if (text) reply = text;
			} catch (error) {
				logger.warn("AI director chat fallback used", { error });
				reply = `Показатели за период: выручка ${metrics.revenue.toFixed(
					0,
				)} ₽, чеков ${metrics.checks}, средний чек ${metrics.averageCheck.toFixed(
					0,
				)} ₽.`;
			}

			return c.json({
				message,
				reply,
				metrics,
			});
		} catch (error) {
			logger.error("AI director chat failed", { error });
			return c.json({ error: "AI_DIRECTOR_CHAT_FAILED" }, 500);
		}
	})

	.get("/documents", async (c) => {
		logger.debug("Fetching documents");
		const db = c.get("db");
		const shopsUuid = await c.var.evotor.getShopUuids();
		const newDate = new Date();
		const sevenDaysAgo = new Date(newDate.getTime() - 5 * 24 * 60 * 60 * 1000);

		const since = formatDateWithTime(sevenDaysAgo, false);
		const until = formatDateWithTime(sevenDaysAgo, true);

		const shopQueries = shopsUuid.map((shopId) => ({
			shopId,
			since,
			until,
		}));

		const documents = await c.var.evotor.getDocumentsIndexForShops(shopQueries);
		await saveNewIndexDocuments(db, documents);

		logger.debug("Documents fetched", { count: documents.length });

		const latestCloseDates = await getLatestCloseDates(db, shopsUuid);

		const resultData = buildSinceUntilFromDocuments(latestCloseDates);
		const documents_ = await c.var.evotor.getDocumentsIndexForShops(resultData);

		await saveNewIndexDocuments(db, documents_);

		assert(documents_, "not an employee");
		return c.json({ cashOutcomeData: documents_ });
	})

	.get("/by-grammar", async (c) => {
		const result = getHoroscopeByDateTask(c, { date: "08-06-2025" });

		return c.json({ result });
	})

	.get("/aiReport", async (c) => {
		logger.info("AI report request received");
		const evo = c.var.evotor;

		const [start, end] = getTodayRangeEvotor();

		const shopUuids = await evo.getShopUuids();
		const docsByShop = await Promise.all(
			shopUuids.map((shopUuid) =>
				getDocumentsFromIndexFirst(c.get("db"), evo, shopUuid, start, end, {
					types: ["SELL", "PAYBACK"],
				}),
			),
		);
		const docs = docsByShop.flat();

		const docFiltered = await evo.extractSalesInfo(docs as any);

		const result = await analyzeDocsStaffTask(c, docFiltered);

		return c.json({ result });
	})

	.get("/aiAssociationRules", async (c) => {
		logger.info("AI association rules request received");
		const evo = c.var.evotor;

		const [start, end] = getPeriodRangeEvotor(3);
		logger.debug("Period range", { start, end });

		const shopUuids = await evo.getShopUuids();
		const docsByShop = await Promise.all(
			shopUuids.map((shopUuid) =>
				getDocumentsFromIndexFirst(c.get("db"), evo, shopUuid, start, end, {
					types: ["SELL", "PAYBACK"],
				}),
			),
		);
		const docs = docsByShop.flat();

		const docFiltered = await evo.extractSalesInfo(docs as any);

		const result = await analyzeDocsStaffTask(c, docFiltered);

		return c.json({ result });
	})

	.post("/insights", async (c) => {
		try {
			const data = await c.req.json();
			const { startDate, endDate, shopUuid } = validate(
				AiInsightsRequestSchema,
				data,
			);

			logger.info("AI insights request", { startDate, endDate, shopUuid });

			const db = c.get("drizzle");
			const evo = c.var.evotor;

			// Проверяем кэш
			const { getAiInsightsFromCache, saveAiInsightsToCache } = await import(
				"../db/repositories/aiInsightsCache.js"
			);
			const cachedResult = await getAiInsightsFromCache(
				db,
				shopUuid,
				startDate,
				endDate,
			);

			if (cachedResult) {
				logger.info("AI insights cache hit", { startDate, endDate, shopUuid });
				return c.json({
					...cachedResult,
					cached: true,
				});
			}

			logger.info("AI insights cache miss, running analysis", {
				startDate,
				endDate,
				shopUuid,
			});

			const since = formatDateWithTime(new Date(startDate), false);
			const until = formatDateWithTime(new Date(endDate), true);

			const docs = await getDocumentsFromIndexFirst(
				c.get("db"),
				evo,
				shopUuid,
				since,
				until,
				{ types: ["SELL", "PAYBACK"] },
			);

			if (!docs || docs.length === 0) {
				return c.json(
					{
						insights: [],
						anomalies: [],
						patterns: [],
						message: "Нет данных за указанный период",
					},
					200,
				);
			}

			const salesInfo = await evo.extractSalesInfo(docs as any);

			const {
				calculateSalesMetrics,
				calculateTopProducts,
				getTimeContext,
				getPreviousPeriodDates,
			} = await import("../ai/dataEnrichment.js");

			const currentMetrics = calculateSalesMetrics(salesInfo);
			const topProducts = calculateTopProducts(salesInfo);
			const timeContext = salesInfo[0]
				? getTimeContext(salesInfo[0].closeDate)
				: undefined;

			const { previousStart, previousEnd } = getPreviousPeriodDates(
				startDate,
				endDate,
			);
			const prevSince = formatDateWithTime(new Date(previousStart), false);
			const prevUntil = formatDateWithTime(new Date(previousEnd), true);

			let previousMetrics:
				| {
						revenue: number;
						transactionsCount: number;
						averageCheck: number;
						margin: number;
				  }
				| undefined;
			try {
				const prevDocs = await getDocumentsFromIndexFirst(
					c.get("db"),
					evo,
					shopUuid,
					prevSince,
					prevUntil,
					{ types: ["SELL", "PAYBACK"] },
				);
				if (prevDocs && prevDocs.length > 0) {
					const prevSalesInfo = await evo.extractSalesInfo(prevDocs as any);
					const prevStats = calculateSalesMetrics(prevSalesInfo);
					previousMetrics = {
						revenue: prevStats.totalRevenue,
						transactionsCount: prevStats.totalTransactions,
						averageCheck: prevStats.averageCheck,
						margin: prevStats.totalMargin,
					};
				}
			} catch (error) {
				logger.warn("Could not fetch previous period data", error);
			}

			const enrichedData = {
				currentPeriod: {
					salesInfo,
					...currentMetrics,
				},
				previousPeriod: previousMetrics,
				topProducts,
				timeContext,
			};

			const [insightsResult, anomaliesResult, patternsResult] =
				await Promise.all([
					analyzeDocsInsightsTask(c, enrichedData),
					analyzeDocsAnomaliesTask(c, enrichedData),
					analyzeDocsPatternsTask(c, enrichedData),
				]);

			const result = {
				insights: insightsResult.insights,
				anomalies: anomaliesResult.anomalies,
				patterns: patternsResult.patterns,
				documentsCount: docs.length,
			};

			await saveAiInsightsToCache(db, shopUuid, startDate, endDate, result);

			return c.json({
				...result,
				cached: false,
			});
		} catch (error) {
			logger.error("AI insights error:", error);
			return c.json(
				{
					error: error instanceof Error ? error.message : "AI analysis failed",
				},
				500,
			);
		}
	})

	.post("/procurement-recommendations", async (c) => {
		try {
			const payload = validate(
				ProcurementRecommendationsSchema,
				await c.req.json(),
			);
			const evo = c.var.evotor;
			const coverDays = payload.coverDays ?? 7;
			const minStockDays = payload.minStockDays ?? 3;
			const rangeDays = daysInRangeInclusive(payload.startDate, payload.endDate);
			const previous = getPreviousPeriodDates(payload.startDate, payload.endDate);
			const previousRangeDays = daysInRangeInclusive(
				previous.previousStart,
				previous.previousEnd,
			);

			const [docs, previousDocs, productsRaw] = await Promise.all([
				getDocumentsFromIndexFirst(
					c.get("db"),
					evo,
					payload.shopUuid,
					formatDateWithTime(new Date(payload.startDate), false),
					formatDateWithTime(new Date(payload.endDate), true),
					{ types: ["SELL", "PAYBACK"] },
				),
				getDocumentsFromIndexFirst(
					c.get("db"),
					evo,
					payload.shopUuid,
					formatDateWithTime(new Date(previous.previousStart), false),
					formatDateWithTime(new Date(previous.previousEnd), true),
					{ types: ["SELL", "PAYBACK"] },
				),
				evo.getProducts(payload.shopUuid),
			]);

			if (!Array.isArray(productsRaw)) {
				throw new Error("Некорректный формат списка товаров");
			}

			const products = productsRaw.filter(
				(item: Product) =>
					!item.group &&
					item.parentUuid &&
					payload.groups.includes(item.parentUuid),
			);
			const productByUuid = new Map(products.map((p) => [p.uuid, p]));

			const aggregateSales = (
				documents: Array<{
					type: string;
					transactions?: Array<{
						type?: string;
						commodityUuid?: string;
						quantity?: number;
						sum?: number;
						costPrice?: number;
					}>;
				}>,
			) => {
				const acc = new Map<
					string,
					{ quantity: number; revenue: number; cost: number }
				>();
				for (const doc of documents) {
					if (!["SELL", "PAYBACK"].includes(doc.type)) continue;
					const sign = doc.type === "SELL" ? 1 : -1;
					for (const tx of doc.transactions || []) {
						if (tx.type !== "REGISTER_POSITION") continue;
						const commodityUuid = tx.commodityUuid;
						if (!commodityUuid || !productByUuid.has(commodityUuid)) continue;
						const current = acc.get(commodityUuid) || {
							quantity: 0,
							revenue: 0,
							cost: 0,
						};
						const quantity = Number(tx.quantity || 0) * sign;
						current.quantity += quantity;
						current.revenue += Number(tx.sum || 0) * sign;
						current.cost += Number(tx.costPrice || 0) * Number(tx.quantity || 0) * sign;
						acc.set(commodityUuid, current);
					}
				}
				return acc;
			};

			const currentStats = aggregateSales(docs);
			const previousStats = aggregateSales(previousDocs);

			const recommendations = products.map((product) => {
				const stats = currentStats.get(product.uuid) || {
					quantity: 0,
					revenue: 0,
					cost: 0,
				};
				const prevStats = previousStats.get(product.uuid) || {
					quantity: 0,
					revenue: 0,
					cost: 0,
				};

				const soldQty = Math.max(0, stats.quantity);
				const prevSoldQty = Math.max(0, prevStats.quantity);
				const dailySales = soldQty / rangeDays;
				const prevDailySales = prevSoldQty / previousRangeDays;
				const seasonalityRatio =
					prevDailySales > 0 ? dailySales / prevDailySales : null;
				const stockQty = Math.max(0, Number(product.quantity || 0));
				const minStock = Math.ceil(dailySales * minStockDays);
				const targetStock = Math.ceil(dailySales * coverDays);
				const recommendedOrder = Math.max(0, targetStock - stockQty);
				const turnoverDays = dailySales > 0 ? stockQty / dailySales : null;

				const reasons: string[] = [];
				if (dailySales === 0) {
					reasons.push("Продажи в периоде отсутствуют");
				}
				if (stockQty < minStock) {
					reasons.push("Остаток ниже минимального страхового уровня");
				}
				if (seasonalityRatio !== null && seasonalityRatio >= 1.2) {
					reasons.push("Спрос растет относительно предыдущего периода");
				}
				if (seasonalityRatio !== null && seasonalityRatio <= 0.8) {
					reasons.push("Спрос ниже предыдущего периода");
				}
				if (turnoverDays !== null && turnoverDays > 45) {
					reasons.push("Низкая оборачиваемость (более 45 дней)");
				}

				const priority =
					recommendedOrder > 0 && stockQty < minStock
						? "high"
						: recommendedOrder > 0
							? "medium"
							: "low";

				return {
					productUuid: product.uuid,
					productName: product.name,
					stockQty,
					soldQty: Number(soldQty.toFixed(2)),
					dailySales: Number(dailySales.toFixed(3)),
					turnoverDays:
						turnoverDays === null ? null : Number(turnoverDays.toFixed(1)),
					minStock,
					targetStock,
					recommendedOrder,
					estimatedOrderCost: Number(
						(recommendedOrder * Number(product.costPrice || 0)).toFixed(2),
					),
					seasonalityRatio:
						seasonalityRatio === null
							? null
							: Number(seasonalityRatio.toFixed(2)),
					priority,
					reasons,
				};
			});

			const summary = {
				period: {
					startDate: payload.startDate,
					endDate: payload.endDate,
					previousStartDate: previous.previousStart,
					previousEndDate: previous.previousEnd,
				},
				coverDays,
				minStockDays,
				totalProducts: recommendations.length,
				needOrderCount: recommendations.filter(
					(item) => item.recommendedOrder > 0,
				).length,
				highPriorityCount: recommendations.filter(
					(item) => item.priority === "high",
				).length,
			};

			return c.json({
				summary,
				recommendations: recommendations.sort(
					(a, b) => b.recommendedOrder - a.recommendedOrder,
				),
			});
		} catch (error) {
			logger.error("Procurement recommendations error:", error);
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to build procurement recommendations",
				},
				500,
			);
		}
	})

	.post("/employee-shift-kpi", async (c) => {
		try {
			const payload = validate(EmployeeShiftKpiSchema, await c.req.json());
			const evo = c.var.evotor;
			const periodDays = daysInRangeInclusive(payload.startDate, payload.endDate);
			const docs = await getDocumentsFromIndexFirst(
				c.get("db"),
				evo,
				payload.shopUuid,
				formatDateWithTime(new Date(payload.startDate), false),
				formatDateWithTime(new Date(payload.endDate), true),
				{ types: ["SELL", "PAYBACK"] },
			);

			const employeeAgg = new Map<
				string,
				{
					revenue: number;
					checks: number;
					returns: number;
					itemsQty: number;
					cost: number;
				}
			>();
			const shiftAgg = new Map<
				string,
				{
					revenue: number;
					checks: number;
					returns: number;
					itemsQty: number;
					cost: number;
				}
			>();
			const employeeIds = new Set<string>();

			for (const doc of docs) {
				if (!["SELL", "PAYBACK"].includes(doc.type)) continue;
				const employeeId = doc.openUserUuid || "unknown";
				employeeIds.add(employeeId);
				const hour = new Date(doc.closeDate).getHours();
				const shift = getShiftName(hour);
				const isSell = doc.type === "SELL";
				const sign = isSell ? 1 : -1;

				const e = employeeAgg.get(employeeId) || {
					revenue: 0,
					checks: 0,
					returns: 0,
					itemsQty: 0,
					cost: 0,
				};
				const s = shiftAgg.get(shift) || {
					revenue: 0,
					checks: 0,
					returns: 0,
					itemsQty: 0,
					cost: 0,
				};
				if (isSell) {
					e.checks += 1;
					s.checks += 1;
				} else {
					e.returns += 1;
					s.returns += 1;
				}

				for (const tx of doc.transactions || []) {
					if (tx.type !== "REGISTER_POSITION") continue;
					const qty = Number(tx.quantity || 0) * sign;
					const revenue = Number(tx.sum || 0) * sign;
					const cost =
						Number(tx.costPrice || 0) * Number(tx.quantity || 0) * sign;

					e.revenue += revenue;
					e.itemsQty += qty;
					e.cost += cost;

					s.revenue += revenue;
					s.itemsQty += qty;
					s.cost += cost;
				}

				employeeAgg.set(employeeId, e);
				shiftAgg.set(shift, s);
			}

			const namesMap =
				employeeIds.size > 0
					? await evo.getEmployeeNamesByUuids(Array.from(employeeIds))
					: {};

			const finalize = (agg: {
				revenue: number;
				checks: number;
				returns: number;
				itemsQty: number;
				cost: number;
			}) => {
				const avgCheck = agg.checks > 0 ? agg.revenue / agg.checks : 0;
				const returnRate =
					agg.checks + agg.returns > 0
						? (agg.returns / (agg.checks + agg.returns)) * 100
						: 0;
				const marginPercent =
					agg.revenue > 0 ? ((agg.revenue - agg.cost) / agg.revenue) * 100 : 0;
				return {
					...agg,
					avgCheck,
					returnRate,
					marginPercent,
					checksPerDay: agg.checks / periodDays,
				};
			};

			const employeeRows = Array.from(employeeAgg.entries()).map(([id, agg]) => ({
				employeeUuid: id,
				employeeName: namesMap[id] || id,
				...finalize(agg),
			}));
			const shiftRows = Array.from(shiftAgg.entries()).map(([shift, agg]) => ({
				shift,
				...finalize(agg),
			}));

			const overall = finalize(
				employeeRows.reduce(
					(acc, item) => ({
						revenue: acc.revenue + item.revenue,
						checks: acc.checks + item.checks,
						returns: acc.returns + item.returns,
						itemsQty: acc.itemsQty + item.itemsQty,
						cost: acc.cost + item.cost,
					}),
					{ revenue: 0, checks: 0, returns: 0, itemsQty: 0, cost: 0 },
				),
			);

			const maxRevenue = Math.max(1, ...employeeRows.map((r) => r.revenue));
			const maxAvgCheck = Math.max(1, ...employeeRows.map((r) => r.avgCheck));

			const withScoreAndReasons = employeeRows.map((row) => {
				const revenueNorm = row.revenue / maxRevenue;
				const avgCheckNorm = row.avgCheck / maxAvgCheck;
				const returnPenalty = 1 - clamp(row.returnRate / 15, 0, 1);
				const marginNorm = clamp(row.marginPercent / 100, 0, 1);
				const score = Math.round(
					100 *
						(0.4 * revenueNorm +
							0.2 * avgCheckNorm +
							0.25 * returnPenalty +
							0.15 * marginNorm),
				);

				const reasons: string[] = [];
				if (row.returnRate > Math.max(5, overall.returnRate * 1.2)) {
					reasons.push("Повышенная доля возвратов относительно среднего");
				}
				if (row.avgCheck < overall.avgCheck * 0.85) {
					reasons.push("Средний чек ниже среднего по магазину");
				}
				if (row.checksPerDay < overall.checksPerDay * 0.8) {
					reasons.push("Низкая интенсивность продаж по чекам");
				}
				if (row.marginPercent < overall.marginPercent * 0.85) {
					reasons.push("Маржинальность ниже базового уровня");
				}
				if (reasons.length === 0 && score >= 75) {
					reasons.push("Стабильные показатели без критических отклонений");
				}

				return {
					...row,
					score,
					reasons,
				};
			});

			const shiftSummary = shiftRows.map((row) => {
				const reasons: string[] = [];
				if (row.avgCheck < overall.avgCheck * 0.85) {
					reasons.push("Средний чек ниже общего уровня");
				}
				if (row.returnRate > Math.max(5, overall.returnRate * 1.2)) {
					reasons.push("Доля возвратов выше средней");
				}
				if (row.checksPerDay < overall.checksPerDay * 0.8) {
					reasons.push("Низкий поток чеков");
				}
				return { ...row, reasons };
			});

			const sortedEmployees = withScoreAndReasons.sort((a, b) => b.score - a.score);
			let narrative: string | null = null;
			try {
				const aiModel = c.env.AI_MODEL;
				const aiMaxTokens = Number(c.env.AI_MAX_TOKENS || "1000");
				const aiResult = await buildEmployeeKpiNarrative({
					ai: c.var.ai,
					model: aiModel,
					maxTokens: Number.isFinite(aiMaxTokens) ? aiMaxTokens : 1000,
					data: {
						period: {
							startDate: payload.startDate,
							endDate: payload.endDate,
							days: periodDays,
						},
						overall: {
							revenue: overall.revenue,
							checks: overall.checks,
							avgCheck: overall.avgCheck,
							returnRate: overall.returnRate,
							marginPercent: overall.marginPercent,
						},
						topEmployees: sortedEmployees.slice(0, 3).map((row) => ({
							employeeName: row.employeeName,
							score: row.score,
							avgCheck: row.avgCheck,
							returnRate: row.returnRate,
							reasons: row.reasons,
						})),
						problemEmployees: [...sortedEmployees]
							.sort((a, b) => a.score - b.score)
							.slice(0, 3)
							.map((row) => ({
								employeeName: row.employeeName,
								score: row.score,
								avgCheck: row.avgCheck,
								returnRate: row.returnRate,
								reasons: row.reasons,
							})),
						shiftSummary: shiftSummary.map((row) => ({
							shift: row.shift,
							avgCheck: row.avgCheck,
							returnRate: row.returnRate,
							reasons: row.reasons,
						})),
					},
				});
				narrative = aiResult.narrative;
			} catch (aiError) {
				logger.warn("Employee KPI narrative generation failed", {
					error: aiError instanceof Error ? aiError.message : String(aiError),
				});
			}

			return c.json({
				period: {
					startDate: payload.startDate,
					endDate: payload.endDate,
					days: periodDays,
					generatedAt: toIsoDate(new Date()),
				},
				overall,
				employees: sortedEmployees,
				shifts: shiftSummary,
				narrative,
			});
		} catch (error) {
			logger.error("Employee/shift KPI error:", error);
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to calculate employee KPI",
				},
				500,
			);
		}
	})
	.post("/opening-photo-digest", async (c) => {
		try {
			const payload = validate(
				OpeningPhotoDigestRequestSchema,
				await c.req.json().catch(() => ({})),
			);
			const isoDate = payload.date || getCurrentIsoDate();
			const dateDDMMYYYY = toDDMMYYYY(isoDate);
			const userId = c.var.userId || "";
			const roleFromEvotor = userId
				? await c.var.evotor.getEmployeeRole(userId)
				: null;
			const isSuperAdmin =
				userId === "5700958253" ||
				userId === "475039971" ||
				roleFromEvotor === "SUPERADMIN";

			const openings = await getOpeningsByDate(c.env.DB, dateDDMMYYYY);
			const openingByShop = new Map<
				string,
				{ shopUuid: string; userId: string; openedByName: string | null; date: string }
			>();
			for (const row of openings) {
				if (!openingByShop.has(row.shopUuid)) {
					openingByShop.set(row.shopUuid, row);
				}
			}

			let selectedOpenings = Array.from(openingByShop.values());
			if (!isSuperAdmin) {
				let allowedShopUuid =
					(await getLatestUserOpeningForDate(c.env.DB, userId, dateDDMMYYYY))
						?.shopUuid || null;
				if (!allowedShopUuid) {
					const employeeData = await c.var.evotor.getEmployeesByLastName(userId);
					const employeeUuid = employeeData?.[0]?.uuid;
					if (employeeUuid) {
						const since = formatDateWithTime(new Date(isoDate), false);
						const until = formatDateWithTime(new Date(isoDate), true);
						allowedShopUuid = await c.var.evotor.getFirstOpenSession(
							since,
							until,
							employeeUuid,
						);
					}
				}
				selectedOpenings = allowedShopUuid
					? selectedOpenings.filter((row) => row.shopUuid === allowedShopUuid)
					: [];
			}

			if (selectedOpenings.length === 0) {
				return c.json({
					date: isoDate,
					shops: [],
					models: {
						describe: PHOTO_DESCRIBE_MODEL,
						summarize: PHOTO_SUMMARIZE_MODEL,
					},
				});
			}

			const shops = await c.var.evotor.getShopNameUuids();
			const shopNameMap = new Map((shops || []).map((item) => [item.uuid, item.name]));

			const listPhotosByPrefix = async (prefix: string) => {
				let cursor: string | undefined;
				const keys: Array<{ key: string; category: string }> = [];
				do {
					const listed = await c.env.R2.list({ prefix, cursor });
					for (const obj of listed.objects) {
						const rel = obj.key.slice(prefix.length);
						if (!rel) continue;
						const category = rel.split("/")[0] || "other";
						keys.push({ key: obj.key, category });
					}
					cursor = listed.truncated ? listed.cursor : undefined;
				} while (cursor);
				return keys;
			};

			const shopDigests: Array<{
				shopUuid: string;
				shopName: string;
				openedAt: string;
				openedByName: string | null;
				photoCount: number;
				digest: string;
				photos: Array<{
					key: string;
					category: string;
					description: string;
				}>;
			}> = [];

			for (const opening of selectedOpenings) {
				const newPrefix = `evotor/opening/${dateDDMMYYYY}/${opening.shopUuid}/${opening.userId}/`;
				const legacyPrefix = `opening/${dateDDMMYYYY}/${opening.shopUuid}/${opening.userId}/`;
				const [newKeys, legacyKeys] = await Promise.all([
					listPhotosByPrefix(newPrefix),
					listPhotosByPrefix(legacyPrefix),
				]);
				const dedup = new Map<string, { key: string; category: string }>();
				for (const item of [...newKeys, ...legacyKeys]) {
					if (!dedup.has(item.key)) {
						dedup.set(item.key, item);
					}
				}

				const photoKeys = Array.from(dedup.values())
					.sort((a, b) => a.key.localeCompare(b.key))
					.slice(0, 16);
				const keysHash = photoKeys.map((item) => item.key).join("|");

					const cached = await getOpeningPhotoDigestCache(
						c.env.DB,
						isoDate,
						opening.shopUuid,
						opening.userId,
					);
					if (cached && cached.keysHash === keysHash) {
						const age = Date.now() - new Date(cached.updatedAt).getTime();
						const hasLegacyPhotoErrors = (cached.photos || []).some(
							(item) => item.description === "Ошибка анализа фото",
						);
						if (
							Number.isFinite(age) &&
							age < OPENING_DIGEST_TTL_MS &&
							!hasLegacyPhotoErrors
						) {
							shopDigests.push({
								shopUuid: opening.shopUuid,
								shopName: shopNameMap.get(opening.shopUuid) || opening.shopUuid,
								openedAt: opening.date,
							openedByName: opening.openedByName || opening.userId,
							photoCount: cached.photoCount,
							digest: cached.digest,
							photos: cached.photos,
						});
						continue;
					}
				}

				const photoResults: Array<{
					key: string;
					category: string;
					description: string;
				}> = [];
				for (const photo of photoKeys) {
					try {
						const object = await c.env.R2.get(photo.key);
						if (!object) continue;
						const isAvif = /\.avif$/i.test(photo.key);
						const mimeType =
							object.httpMetadata?.contentType ||
							(isAvif ? "image/avif" : "image/jpeg");
						if (isAvif || mimeType === "image/avif") {
							photoResults.push({
								key: photo.key,
								category: photo.category,
								description:
									"Формат AVIF не поддерживается для AI-анализа. Перезагрузите фото в JPG/PNG.",
							});
							continue;
						}
						const content = await object.arrayBuffer();
						const base64 = toBase64(content);
						const description = await describeOpeningPhoto(
							c,
							base64,
							mimeType,
							photo.category,
						);
						photoResults.push({
							key: photo.key,
							category: photo.category,
							description: description || "Не удалось получить описание фото",
						});
					} catch (photoError) {
						const isAvif = /\.avif$/i.test(photo.key);
						logger.warn("Opening photo AI analyze failed", {
							key: photo.key,
							error:
								photoError instanceof Error
									? photoError.message
									: String(photoError),
						});
						photoResults.push({
							key: photo.key,
							category: photo.category,
							description: isAvif
								? "Формат AVIF не поддерживается для AI-анализа. Перезагрузите фото в JPG/PNG."
								: "Ошибка анализа фото",
						});
					}
				}

				const digest = photoResults.length
					? await summarizeShopPhotos(
							c,
							shopNameMap.get(opening.shopUuid) || opening.shopUuid,
							photoResults.map((item) => ({
								category: item.category,
								text: item.description,
							})),
						)
					: "Фото не найдены за выбранную дату.";

				await saveOpeningPhotoDigestCache(c.env.DB, {
					date: isoDate,
					shopUuid: opening.shopUuid,
					openedByUserId: opening.userId,
					openedAt: opening.date,
					photoCount: photoResults.length,
					keysHash,
					digest: digest || "Не удалось собрать дайджест",
					photos: photoResults,
					modelDescribe: PHOTO_DESCRIBE_MODEL,
					modelSummarize: PHOTO_SUMMARIZE_MODEL,
				});

				shopDigests.push({
					shopUuid: opening.shopUuid,
					shopName: shopNameMap.get(opening.shopUuid) || opening.shopUuid,
					openedAt: opening.date,
					openedByName: opening.openedByName || opening.userId,
					photoCount: photoResults.length,
					digest: digest || "Не удалось собрать дайджест",
					photos: photoResults,
				});
			}

			return c.json({
				date: isoDate,
				models: {
					describe: PHOTO_DESCRIBE_MODEL,
					summarize: PHOTO_SUMMARIZE_MODEL,
				},
				shops: shopDigests,
			});
		} catch (error) {
			logger.error("Opening photo digest error:", error);
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to build opening photo digest",
				},
				500,
			);
		}
	})
	.post("/dashboard-summary2-insights", async (c) => {
		try {
			const payload = validate(
				DashboardSummary2InsightsRequestSchema,
				await c.req.json(),
			);
			const fallbackInsights = buildDashboardSummary2Fallback(
				payload.metrics as DashboardSummary2Metrics,
			);

			let fallbackUsed = true;
			let aiError: string | null = null;
			let insights = fallbackInsights;

			try {
				const result = await c.env.AI.run(DASHBOARD_SUMMARY2_MODEL as any, {
					max_tokens: 700,
					temperature: 0.1,
					messages: [
						{
							role: "system",
							content:
								"Ты операционный аналитик розничной сети. Твоя задача — дать краткие, прикладные и численно точные выводы только по входным данным. Верни только валидный JSON без markdown и комментариев. Формат ответа строго: {\"riskSummary\":\"...\",\"actions\":[\"...\",\"...\",\"...\"],\"forecastSummary\":\"...\",\"dropMainReason\":\"...\",\"anomaliesSummary\":\"...\",\"lossesSummary\":\"...\",\"dailyDigest\":\"...\"}. Требования: 1) Никаких выдуманных данных, только факты из metrics. 2) actions — ровно 3 пункта, каждый в повелительном наклонении и с числовым ориентиром, где возможно. 3) riskSummary — 1-2 коротких предложения, обязательно укажи риск сети и критичную точку при наличии. 4) forecastSummary — обязательно упомяни forecast value, lower-upper и confidence. 5) dropMainReason — выбери главную причину из: трафик, средний чек, возвраты, либо 'просадки нет'. 6) anomaliesSummary — укажи количество инцидентов и где приоритет проверки. 7) lossesSummary — укажи оценку потерь и приоритет по SKU. 8) dailyDigest — 3 коротких предложения: общий статус, ключевой риск, фокус на ближайший час. 9) Пиши по-русски, деловым стилем, без воды, без упоминаний ИИ, промптов и внутренних правил.",
						},
						{
							role: "user",
							content: JSON.stringify({
								period: { since: payload.since, until: payload.until },
								metrics: payload.metrics,
								rules: {
									maxSentenceLength: 180,
									actionsCount: 3,
									style: "операционный, конкретный, краткий",
									outputKeys: [
										"riskSummary",
										"actions",
										"forecastSummary",
										"dropMainReason",
										"anomaliesSummary",
										"lossesSummary",
										"dailyDigest",
									],
								},
							}),
						},
					],
				});

				const aiText = extractAiText(result);
				const aiJson = extractJsonObject(aiText);
				if (aiJson) {
					insights = normalizeDashboardSummary2AiText(aiJson, fallbackInsights);
					fallbackUsed = false;
				}
			} catch (error) {
				aiError = error instanceof Error ? error.message : String(error);
				logger.warn("DashboardSummary2 AI generation failed", {
					error: aiError,
				});
			}

			return c.json({
				since: payload.since,
				until: payload.until,
				model: DASHBOARD_SUMMARY2_MODEL,
				fallbackUsed,
				...(aiError ? { aiError } : {}),
				generatedAt: new Date().toISOString(),
				insights,
			});
		} catch (error) {
			logger.error("DashboardSummary2 insights endpoint failed:", error);
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to build dashboard summary insights",
				},
				500,
			);
		}
	})
	.get("/history/shift-summaries", async (c) => {
		try {
			const shopUuid = c.req.query("shopUuid") || undefined;
			const date = c.req.query("date") || undefined;
			const limitRaw = Number(c.req.query("limit") || "30");
			const limit = Number.isFinite(limitRaw) ? limitRaw : 30;

			const items = await listAiShiftSummaries(c.env.DB, {
				shopUuid,
				date,
				limit,
			});

			return c.json({
				items,
				filters: { shopUuid: shopUuid || null, date: date || null, limit },
				total: items.length,
			});
		} catch (error) {
			logger.error("AI shift summaries history endpoint failed:", error);
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to load shift summaries history",
				},
				500,
			);
		}
	})
	.get("/history/alerts", async (c) => {
		try {
			const shopUuid = c.req.query("shopUuid") || undefined;
			const alertTypeRaw = c.req.query("alertType") || undefined;
			const alertType =
				alertTypeRaw === "tempo_alert" ||
				alertTypeRaw === "anomaly" ||
				alertTypeRaw === "dead_stock"
					? alertTypeRaw
					: undefined;
			const limitRaw = Number(c.req.query("limit") || "50");
			const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

			const items = await listAiAlerts(c.env.DB, {
				shopUuid,
				alertType,
				limit,
			});

			return c.json({
				items,
				filters: {
					shopUuid: shopUuid || null,
					alertType: alertType || null,
					limit,
				},
				total: items.length,
			});
		} catch (error) {
			logger.error("AI alerts history endpoint failed:", error);
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to load alerts history",
				},
				500,
			);
		}
	});

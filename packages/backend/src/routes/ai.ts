import { Hono, type Next } from "hono";
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
	AiDirectorBriefingRequestSchema,
	AiDirectorExplainSalesRequestSchema,
	AiDirectorHeatmapRequestSchema,
	AiDirectorOverviewRequestSchema,
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
	AiDirectorDashboardRequestSchema,
	AiDirectorDashboardResponseSchema,
} from "../contracts/aiDirectorDashboard";
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
import {
	buildDataModeMeta,
	getDataModeOrDefault,
} from "../dataMode";

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

const parseKpiNarrativeSections = (narrative: string | null) => {
	const source = (narrative || "").trim();
	if (!source) {
		return {
			strengths: [] as string[],
			growth: [] as string[],
			actions: [] as string[],
			raw: "",
		};
	}

	const lines = source
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	const normalize = (line: string) =>
		line
			.replace(/^[\d\)\.\-\s•]+/, "")
			.trim();

	const strengths: string[] = [];
	const growth: string[] = [];
	const actions: string[] = [];

	let mode: "strengths" | "growth" | "actions" | null = null;
	for (const line of lines) {
		const lower = line.toLowerCase();
		if (lower.includes("сильн")) {
			mode = "strengths";
			continue;
		}
		if (lower.includes("зон") || lower.includes("рост")) {
			mode = "growth";
			continue;
		}
		if (lower.includes("действ") || lower.includes("следующ")) {
			mode = "actions";
			continue;
		}

		const item = normalize(line);
		if (!item) continue;
		if (mode === "strengths") strengths.push(item);
		else if (mode === "growth") growth.push(item);
		else if (mode === "actions") actions.push(item);
	}

	return { strengths, growth, actions, raw: source };
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

const ensureAiAvailable = async (
	c: {
		env: IEnv["Bindings"];
		json: (
			body: unknown,
			status?: number,
			headers?: Record<string, string>,
		) => Response;
	},
	next: Next,
) => {
	const mode = await getDataModeOrDefault(c.env);
	if (mode === "ELVATOR") {
		return c.json(
			{
				code: "AI_UNAVAILABLE_FOR_DATA_MODE",
				message: "AI недоступен при работе через ELVATOR",
				meta: buildDataModeMeta(mode),
			},
			503,
			{
				"x-error-code": "AI_UNAVAILABLE_FOR_DATA_MODE",
			},
		);
	}
	return next();
};

const isFlagEnabled = (value?: string): boolean => {
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes";
};

const ensureAiDirectorEnabled = async (
	c: {
		env: IEnv["Bindings"];
		json: (
			body: unknown,
			status?: number,
			headers?: Record<string, string>,
		) => Response;
	},
	next: Next,
) => {
	if (isFlagEnabled(c.env.DISABLE_AI_DIRECTOR)) {
		return c.json(
			{
				code: "AI_DIRECTOR_DISABLED",
				message: "AI Director временно отключен",
			},
			503,
			{
				"x-error-code": "AI_DIRECTOR_DISABLED",
			},
		);
	}
	return next();
};

export const aiRoutes = new Hono<IEnv>()
	.use("/*", ensureAiAvailable)
	.use("/director/*", ensureAiDirectorEnabled)

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

	.post("/director/overview", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { date, since, until, shopUuids, limit } = validate(
				AiDirectorOverviewRequestSchema,
				payload,
			);

			const targetDate = date ?? toIsoDate(new Date());
			const resolvedSince = since ?? targetDate;
			const resolvedUntil = until ?? targetDate;
			const resolvedLimit = limit ?? 50;

			const baseUrl = new URL(c.req.url);
			const forwardHeaders = new Headers();
			for (const headerName of [
				"initData",
				"telegram-id",
				"authorization",
				"cookie",
			]) {
				const value = c.req.header(headerName);
				if (value) forwardHeaders.set(headerName, value);
			}
			forwardHeaders.set("content-type", "application/json");

			const postInternal = async (path: string, body: Record<string, unknown>) => {
				const url = new URL(`/api/ai${path}`, baseUrl.origin);
				const response = await fetch(url.toString(), {
					method: "POST",
					headers: forwardHeaders,
					body: JSON.stringify(body),
				});
				const json = (await response.json().catch(() => null)) as
					| Record<string, unknown>
					| null;
				if (!response.ok) {
					const reason =
						typeof json?.error === "string"
							? json.error
							: typeof json?.message === "string"
								? json.message
								: `HTTP_${response.status}`;
					throw new Error(`${path}:${reason}`);
				}
				return (json || {}) as Record<string, unknown>;
			};

			const scopedShops = shopUuids ? { shopUuids } : {};

			const jobs = [
				{
					key: "summary",
					label: "summary",
					path: "/director/summary",
					body: { date: targetDate, ...scopedShops },
				},
				{
					key: "alerts",
					label: "alerts",
					path: "/director/alerts",
					body: { date: targetDate, ...scopedShops },
				},
				{
					key: "forecast",
					label: "forecast",
					path: "/director/forecast",
					body: { date: targetDate, ...scopedShops },
				},
				{
					key: "velocity",
					label: "velocity",
					path: "/director/velocity",
					body: {
						since: resolvedSince,
						until: resolvedUntil,
						limit: resolvedLimit,
						...scopedShops,
					},
				},
				{
					key: "recommendations",
					label: "recommendations",
					path: "/director/recommendations",
					body: {
						since: resolvedSince,
						until: resolvedUntil,
						limit: resolvedLimit,
						...scopedShops,
					},
				},
				{
					key: "report",
					label: "report",
					path: "/director/report",
					body: { date: targetDate, sendTelegram: false, ...scopedShops },
				},
			] as const;

			const settled = await Promise.allSettled(
				jobs.map((job) => postInternal(job.path, job.body)),
			);

			const responsePayload: {
				date: string;
				since: string;
				until: string;
				summary: Record<string, unknown> | null;
				alerts: Record<string, unknown> | null;
				forecast: Record<string, unknown> | null;
				velocity: Record<string, unknown> | null;
				recommendations: Record<string, unknown> | null;
				report: Record<string, unknown> | null;
				errors: string[];
			} = {
				date: targetDate,
				since: resolvedSince,
				until: resolvedUntil,
				summary: null,
				alerts: null,
				forecast: null,
				velocity: null,
				recommendations: null,
				report: null,
				errors: [],
			};

			for (let index = 0; index < jobs.length; index += 1) {
				const job = jobs[index];
				const entry = settled[index];
				if (entry.status === "fulfilled") {
					responsePayload[job.key] = entry.value;
					continue;
				}
				responsePayload.errors.push(
					`Не удалось загрузить ${job.label}`,
				);
			}

			const status = responsePayload.errors.length === jobs.length ? 500 : 200;
			return c.json(responsePayload, status);
		} catch (error) {
			logger.error("AI director overview failed", { error });
			return c.json({ error: "AI_DIRECTOR_OVERVIEW_FAILED" }, 500);
		}
	})

	.post("/director/heatmap", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { shopUuids } = validate(AiDirectorHeatmapRequestSchema, payload);
			const db = c.get("db");
			const rows = await getSalesHourly(db, shopUuids);

			// Fallback: if sales_hourly is empty, compute from receipts directly
			if (rows.length === 0) {
				const ninetyDaysAgo = new Date();
				ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
				const sinceStr = ninetyDaysAgo.toISOString().slice(0, 19).replace("T", " ");
				const rawRows = await db.prepare(
					`SELECT r.shop_id, r.close_date, r.type, r.total
					FROM receipts r
					WHERE r.close_date >= ? AND r.type = 'SELL'`
				).bind(sinceStr).all<{ shop_id: string; close_date: string; type: string; total: number }>();
				const cellMap = new Map<string, { shopId: string; dayOfWeek: number; hour: number; revenue: number; checks: number }>();
				for (const row of (rawRows.results || [])) {
					const d = new Date(row.close_date);
					if (isNaN(d.getTime())) continue;
					const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
					const hour = d.getHours();
					const key = `${row.shop_id}|${dayOfWeek}|${hour}`;
					const existing = cellMap.get(key);
					if (existing) {
						existing.revenue += Number(row.total || 0);
						existing.checks += 1;
					} else {
						cellMap.set(key, {
							shopId: String(row.shop_id),
							dayOfWeek,
							hour,
							revenue: Number(row.total || 0),
							checks: 1,
						});
					}
				}
				return c.json({ rows: Array.from(cellMap.values()) });
			}

			return c.json({ rows });
		} catch (error) {
			logger.error("AI director heatmap failed", { error });
			return c.json({ error: "AI_DIRECTOR_HEATMAP_FAILED" }, 500);
		}
	})

	.post("/director/stock-health", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const days = Math.max(1, Math.min(90, Number(payload.days) || 14));
			const kv = c.env.KV;
			const cacheKey = `stock-health:d${days}`;

			const cached = await kv.get(cacheKey);
			if (cached) return c.json(JSON.parse(cached));

			const db = c.get("db");

			const stores = await db.prepare(
				"SELECT DISTINCT store_uuid, store_name FROM product_stock"
			).all<{ store_uuid: string; store_name: string }>();
			const storeList = stores.results || [];

			const since = new Date();
			since.setDate(since.getDate() - days);
			const sinceStr = since.toISOString().slice(0, 10);

			// Get all sales in the period
			const salesRows = await db.prepare(
				`SELECT s.store_uuid, p.product_name, CAST(SUM(p.quantity) AS DOUBLE) as totalQty,
				        CAST(SUM(p.sum) AS DOUBLE) as totalRevenue
				 FROM sells s
				 JOIN positions p ON p.doc_id = s.doc_id
				 WHERE s.close_date >= ?
				 GROUP BY s.store_uuid, p.product_name`
			).bind(sinceStr).all<{ store_uuid: string; product_name: string; totalQty: number; totalRevenue: number }>();

			// Build sales map: store_uuid → product_name → {qty, revenue}
			const salesMap = new Map<string, Map<string, { qty: number; revenue: number }>>();
			for (const row of (salesRows.results || [])) {
				if (!salesMap.has(row.store_uuid)) salesMap.set(row.store_uuid, new Map());
				salesMap.get(row.store_uuid)!.set(row.product_name, { qty: row.totalQty, revenue: row.totalRevenue });
			}

			// Get current stock
			const stockRows = await db.prepare(
				"SELECT store_uuid, store_name, name, CAST(COALESCE(quantity, 0) AS DOUBLE) as quantity FROM product_stock"
			).all<{ store_uuid: string; store_name: string; name: string; quantity: number }>();

			type StockItem = { name: string; quantity: number; shopName: string };
			type OutItem = { name: string; soldQty: number; velocity: number; lostRevenuePerDay: number; shopName: string };
			const deadStock: StockItem[] = [];
			const lowStock: StockItem[] = [];
			const outOfStock: OutItem[] = [];
			const byShop = new Map<string, { shopUuid: string; shopName: string; deadStock: StockItem[]; lowStock: StockItem[]; outOfStock: OutItem[] }>();

			for (const row of (stockRows.results || [])) {
				const storeSales = salesMap.get(row.store_uuid);
				const prodSales = storeSales?.get(row.name);
				const soldQty = prodSales?.qty || 0;
				const velocity = soldQty / days;

				if (!byShop.has(row.store_uuid)) {
					byShop.set(row.store_uuid, {
						shopUuid: row.store_uuid,
						shopName: row.store_name || row.store_uuid,
						deadStock: [],
						lowStock: [],
						outOfStock: [],
					});
				}
				const shop = byShop.get(row.store_uuid)!;

				if (row.quantity === 0 && soldQty > 0) {
					const lostPerDay = (prodSales?.revenue || 0) / days;
					const item: OutItem = {
						name: row.name,
						soldQty: Math.round(soldQty),
						velocity: Math.round(velocity * 100) / 100,
						lostRevenuePerDay: Math.round(lostPerDay),
						shopName: row.store_name || row.store_uuid,
					};
					outOfStock.push(item);
					shop.outOfStock.push(item);
				} else if (row.quantity > 0 && soldQty === 0) {
					const item: StockItem = { name: row.name, quantity: row.quantity, shopName: row.store_name || row.store_uuid };
					deadStock.push(item);
					shop.deadStock.push(item);
				} else if (row.quantity > 0 && velocity > 0) {
					const daysLeft = row.quantity / velocity;
					if (daysLeft < 7) {
						const item: StockItem = { name: row.name, quantity: row.quantity, shopName: row.store_name || row.store_uuid };
						lowStock.push(item);
						shop.lowStock.push(item);
					}
				}
			}

			deadStock.sort((a, b) => b.quantity - a.quantity);
			lowStock.sort((a, b) => a.quantity - b.quantity);
			outOfStock.sort((a, b) => b.lostRevenuePerDay - a.lostRevenuePerDay);

			for (const [, s] of byShop) {
				s.deadStock.sort((a, b) => b.quantity - a.quantity);
				s.deadStock = s.deadStock.slice(0, 10);
				s.lowStock.sort((a, b) => a.quantity - b.quantity);
				s.lowStock = s.lowStock.slice(0, 10);
				s.outOfStock.sort((a, b) => b.lostRevenuePerDay - a.lostRevenuePerDay);
				s.outOfStock = s.outOfStock.slice(0, 10);
			}

			const totalProductsResult = await db.prepare(
				"SELECT COUNT(*) as cnt FROM product_stock"
			).all<{ cnt: number }>();
			const totalProducts = Number((totalProductsResult.results?.[0]?.cnt) ?? 0);

			const totalProblems = deadStock.length + lowStock.length + outOfStock.length;
			const stockScore = totalProducts > 0
				? Math.round(Math.max(0, 100 - (totalProblems / totalProducts) * 100))
				: 100;

			const result = {
				date: new Date().toISOString().slice(0, 10),
				deadStockCount: deadStock.length,
				lowStockCount: lowStock.length,
				outOfStockCount: outOfStock.length,
				totalProducts,
				totalProblems,
				stockScore,
				totalLostPerDay: Math.round(outOfStock.reduce((s, i) => s + i.lostRevenuePerDay, 0)),
				deadStock: deadStock,
				lowStock: lowStock,
				outOfStock: outOfStock,
				byShop: Array.from(byShop.values()),
			};

			await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });
			return c.json(result);
		} catch (error: any) {
			logger.error("stock-health failed", { error: String(error), stack: error?.stack, message: error?.message });
			return c.json({ error: "STOCK_HEALTH_FAILED" }, 500);
		}
	})

	.post("/director/stock-transfer", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const days = Math.max(1, Math.min(90, Number(payload.days) || 14));
			const kv = c.env.KV;
			const cacheKey = `stock-transfer:d${days}`;

			const cached = await kv.get(cacheKey);
			if (cached) return c.json(JSON.parse(cached));

			const db = c.get("db");

			const since = new Date();
			since.setDate(since.getDate() - days);
			const sinceStr = since.toISOString().slice(0, 10);

			// All sales in period
			const salesRows = await db.prepare(
				`SELECT s.store_uuid, st.store_name, p.product_name, CAST(SUM(p.quantity) AS DOUBLE) as totalQty
				 FROM sells s
				 JOIN positions p ON p.doc_id = s.doc_id
				 LEFT JOIN (SELECT DISTINCT store_uuid, store_name FROM product_stock) st ON st.store_uuid = s.store_uuid
				 WHERE s.close_date >= ?
				 GROUP BY s.store_uuid, st.store_name, p.product_name`
			).bind(sinceStr).all<{ store_uuid: string; store_name: string; product_name: string; totalQty: number }>();

			// salesMap: product_name → store_uuid → {storeName, qty}
			const salesByProduct = new Map<string, Map<string, { storeName: string; qty: number }>>();
			for (const row of (salesRows.results || [])) {
				if (!salesByProduct.has(row.product_name)) {
					salesByProduct.set(row.product_name, new Map());
				}
				salesByProduct.get(row.product_name)!.set(row.store_uuid, {
					storeName: row.store_name || row.store_uuid,
					qty: row.totalQty,
				});
			}

			// All stock
			const stockRows = await db.prepare(
				"SELECT store_uuid, store_name, name, CAST(COALESCE(quantity, 0) AS DOUBLE) as quantity FROM product_stock WHERE quantity > 0"
			).all<{ store_uuid: string; store_name: string; name: string; quantity: number }>();

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
			const recommendations: TransferRec[] = [];

			for (const stock of (stockRows.results || [])) {
				const productSales = salesByProduct.get(stock.name);
				if (!productSales) continue;
				const ownSales = productSales.get(stock.store_uuid);
				if (ownSales && ownSales.qty > 0) continue; // not dead in this store

				// Find other stores where this product sells
				for (const [otherUuid, otherData] of productSales.entries()) {
					if (otherUuid === stock.store_uuid) continue;
					if (otherData.qty <= 0) continue;

					// Check stock in target store
					const targetStockRow = (stockRows.results || []).find(
						r => r.store_uuid === otherUuid && r.name === stock.name
					);

					recommendations.push({
						productName: stock.name,
						fromShop: stock.store_uuid,
						fromShopName: stock.store_name || stock.store_uuid,
						deadQuantity: stock.quantity,
						toShop: otherUuid,
						toShopName: otherData.storeName,
						soldQty14d: Math.round(otherData.qty),
						velocity: Math.round(otherData.qty / days * 100) / 100,
						toShopQuantity: targetStockRow?.quantity || 0,
					});
				}
			}

			recommendations.sort((a, b) => b.soldQty14d - a.soldQty14d);

			const result = {
				date: new Date().toISOString().slice(0, 10),
				recommendations: recommendations.slice(0, 30),
			};

			await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });
			return c.json(result);
		} catch (error) {
			logger.error("stock-transfer failed", { error });
			return c.json({ error: "STOCK_TRANSFER_FAILED" }, 500);
		}
	})

	.post("/director/deadstock-export", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { items } = payload as { items?: Array<{ name: string; quantity: number; shopName: string }> };

			if (!items || !Array.isArray(items) || items.length === 0) {
				return c.json({ error: "No items provided" }, 400);
			}

			const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
			const filename = `deadstock-export-${timestamp}.json`;
			const exportData = {
				exportedAt: new Date().toISOString(),
				totalItems: items.length,
				items: items.map(item => ({
					name: item.name,
					quantity: item.quantity,
					shopName: item.shopName,
				})),
			};

			return c.json(exportData);
		} catch (error) {
			logger.error("deadstock-export failed", { error });
			return c.json({ error: "DEADSTOCK_EXPORT_FAILED" }, 500);
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

			let rating = resolvedShopUuids
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

			// Fallback: if index documents returned all zeros, query receipts directly
			const totalFromIndex = rating.reduce((sum, r) => sum + r.revenue, 0);
			if (totalFromIndex === 0) {
				const receiptSql = db.prepare(
					`SELECT
						r.shop_id as store_uuid,
						s.name as store_name,
						COALESCE(SUM(CASE WHEN r.type = 'SELL' THEN r.total ELSE 0 END), 0) as revenue,
						COALESCE(SUM(CASE WHEN r.type = 'SELL' THEN 1 ELSE 0 END), 0) as checks
					FROM receipts r
					JOIN stores s ON s.store_uuid = r.shop_id
					WHERE r.close_date >= ? AND r.close_date <= ?
					GROUP BY r.shop_id, s.name
					ORDER BY revenue DESC`
				);
				const receiptRows = await receiptSql.bind(
					`${resolvedSince}T00:00:00.000+0000`,
					`${resolvedUntil}T23:59:59.000+0000`,
				).all<{ store_uuid: string; store_name: string; revenue: number; checks: number }>();
				if ((receiptRows.results || []).length > 0) {
					rating = (receiptRows.results || []).map((row) => ({
						shopUuid: row.store_uuid,
						shopName: row.store_name || shopNamesMap[row.store_uuid] || row.store_uuid,
						revenue: Number(row.revenue || 0),
						checks: Number(row.checks || 0),
						averageCheck: Number(row.checks || 0) > 0 ? Number(row.revenue || 0) / Number(row.checks || 0) : 0,
					})).sort((a, b) => b.revenue - a.revenue);
				}
			}

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
				resolvedShopUuids.map(async (shopUuid: any) => {
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

	.post("/director/briefing", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { date, shopUuids, refresh } = validate(
				AiDirectorBriefingRequestSchema,
				payload,
			);

			const today = toIsoDate(new Date());
			const targetDate = date ?? today;

			// KV cache: return cached briefing unless refresh=true
			const kv = (c.env as any).KV;
			const cacheKey = `briefing:${targetDate}`;
			if (!refresh && kv) {
				try {
					const cached = await kv.get(cacheKey);
					if (cached) {
						const parsed = JSON.parse(cached);
						return c.json(parsed);
					}
				} catch (_) { /* miss — generate fresh */ }
			}
			const yesterday = shiftDateKey(targetDate, -1);
			const weekAgoKey = shiftDateKey(targetDate, -7);

			const db = c.get("db");
			const baseUrl = new URL(c.req.url);
			const forwardHeaders = new Headers();
			for (const headerName of ["initData", "telegram-id", "authorization", "cookie"]) {
				const value = c.req.header(headerName);
				if (value) forwardHeaders.set(headerName, value);
			}
			forwardHeaders.set("content-type", "application/json");

			const postInternal = async (path: string, body: Record<string, unknown>) => {
				const url = new URL(`/api/ai${path}`, baseUrl.origin);
				const response = await fetch(url.toString(), {
					method: "POST",
					headers: forwardHeaders,
					body: JSON.stringify(body),
				});
				if (!response.ok) {
					logger.warn("Briefing internal call failed", { path, status: response.status });
					return {};
				}
				return (await response.json()) as Record<string, any>;
			};

			// Query receipts directly (bypasses broken index document path)
			const queryDayRevenue = async (dateKey: string) => {
				const since = `${dateKey}T00:00:00.000+0000`;
				const until = `${dateKey}T23:59:59.000+0000`;
				const stmt = db.prepare(
					`SELECT
						s.store_uuid,
						s.name as store_name,
						COALESCE(SUM(CASE WHEN r.type = 'SELL' THEN r.total ELSE 0 END), 0) as revenue,
						COALESCE(SUM(CASE WHEN r.type = 'SELL' THEN 1 ELSE 0 END), 0) as checks,
						COALESCE(SUM(CASE WHEN r.type = 'PAYBACK' THEN ABS(r.total) ELSE 0 END), 0) as refunds
					FROM receipts r
					JOIN stores s ON s.store_uuid = r.shop_id
					WHERE r.close_date >= ? AND r.close_date <= ?
					GROUP BY s.store_uuid, s.name
					ORDER BY revenue DESC`
				);
				const result = await stmt.bind(since, until).all<{
					store_uuid: string;
					store_name: string;
					revenue: number;
					checks: number;
					refunds: number;
				}>();
				return (result.results || []).map((row) => ({
					shopUuid: row.store_uuid,
					shopName: row.store_name,
					revenue: Number(row.revenue || 0),
					checks: Number(row.checks || 0),
					averageCheck: Number(row.checks || 0) > 0 ? Number(row.revenue || 0) / Number(row.checks || 0) : 0,
					refunds: Number(row.refunds || 0),
				}));
			};

			// Gather data in parallel
			const [todayRatings, yesterdayRatings, weekAgoRatings, forecastRaw, stockRaw] = await Promise.all([
				queryDayRevenue(targetDate),
				queryDayRevenue(yesterday),
				queryDayRevenue(weekAgoKey),
				postInternal("/director/demand-forecast", { date: targetDate, ...(shopUuids ? { shopUuids } : {}) }).catch(() => ({})),
				postInternal("/director/stock-health", { days: 14 }).catch(() => ({})),
			]);

			const forecast = forecastRaw as Record<string, any>;
			const stockHealth = stockRaw as Record<string, any>;

			const formatHumanDate = (iso: string) => {
				const d = new Date(`${iso}T00:00:00Z`);
				return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
			};

			// Build structured context for LLM
			const context = {
				date: formatHumanDate(targetDate),
				dayOfWeek: new Date(`${targetDate}T00:00:00Z`).toLocaleDateString("ru-RU", { weekday: "long" }),
				today: { rating: todayRatings },
				yesterday: { rating: yesterdayRatings },
				weekAgo: { rating: weekAgoRatings },
				employees: [] as any[],
				forecast: {
					forecast: Number(forecast.forecast || 0),
					weather: forecast.weather || null,
					weatherFactor: typeof forecast.weatherFactor === "number" ? forecast.weatherFactor : undefined,
					warning: typeof forecast.warning === "string" ? forecast.warning : null,
				},
				stock: {
					deadCount: Array.isArray((stockHealth as any).deadStock) ? (stockHealth as any).deadStock.length : 0,
					lowCount: Array.isArray((stockHealth as any).lowStock) ? (stockHealth as any).lowStock.length : 0,
					outCount: Array.isArray((stockHealth as any).outOfStock) ? (stockHealth as any).outOfStock.length : 0,
					topDead: Array.isArray((stockHealth as any).deadStock)
						? (stockHealth as any).deadStock.slice(0, 5)
						: [],
					topOut: Array.isArray((stockHealth as any).outOfStock)
						? (stockHealth as any).outOfStock.slice(0, 5)
						: [],
				},
			};

			const systemPrompt = `Ты AI-директор сети розничных магазинов. Твоя задача — составлять короткий, но содержательный брифинг для владельца бизнеса на указанную дату.

**Формат брифинга (строго соблюдай, каждый раздел с заголовком и эмодзи):**

📊 **Сводка за ${context.date} (${context.dayOfWeek})**
Одной строкой: общая выручка, чеков, средний чек. Сравнение со вчерашним днём (рост/падение в %). Если данных за вчера нет — сравнивай с ближайшим доступным днём.

🏪 **Магазины**
Топ-3 по выручке с цифрами. Если какой-то магазин просел >15% — выдели отдельно с причиной.

👥 **Сотрудники**
Лучший сотрудник по выручке. Если у кого-то возвраты >5% или другие проблемы — отметь. Если данных по сотрудникам нет — напиши «Нет данных по сотрудникам (требуется синхронизация с Эвотор)».

📦 **Товары**
Сколько dead stock, сколько out-of-stock, сколько на исходе. 2-3 конкретные позиции, требующие внимания.

🌤 **Прогноз на сегодня**
Прогноз выручки (с учётом погоды). Если погода влияет — как именно.

⚡ **Главное сегодня**
2-3 самых важных действия на день: что проверить, кому позвонить, что заказать.

**Правила:**
- КРАТКО. Владелец читает это за 30 секунд утром с телефона.
- ТОЛЬКО цифры из данных. Никаких домыслов.
- Если данных по какому-то разделу нет — пропусти раздел.
- Используй названия магазинов, имена сотрудников, названия товаров как есть в данных.
- Сравнения: сегодня vs вчера, сегодня vs неделю назад.`;

			const userMessage = JSON.stringify(context);

			let briefing = "";
			try {
				const deepseekKey = (c.env as any).DEEPSEEK_API_KEY as string | undefined;
				if (!deepseekKey) {
					logger.warn("Briefing: DEEPSEEK_API_KEY not set, using Cloudflare AI fallback");
					throw new Error("DEEPSEEK_API_KEY missing");
				}

				const deepseekRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Authorization": `Bearer ${deepseekKey}`,
					},
					body: JSON.stringify({
						model: "deepseek-chat",
						max_tokens: 1500,
						temperature: 0.3,
						messages: [
							{ role: "system", content: systemPrompt },
							{ role: "user", content: userMessage },
						],
					}),
				});

				if (!deepseekRes.ok) {
					const errText = await deepseekRes.text().catch(() => "");
					logger.warn("Briefing DeepSeek API failed", { status: deepseekRes.status, error: errText.slice(0, 200) });
					throw new Error(`DeepSeek API ${deepseekRes.status}`);
				}

				const deepseekJson = await deepseekRes.json() as Record<string, any>;
				const choice = deepseekJson?.choices?.[0]?.message?.content;
				if (typeof choice === "string" && choice.trim()) {
					briefing = choice.trim();
				}
			} catch (err) {
				logger.warn("Briefing LLM failed, falling back to structured data", { error: err });
			}

			if (!briefing) {
				// Fallback: return structured data without LLM
				const todayRatingArr = todayRatings;
				const totalRevenue = todayRatingArr.reduce((sum: number, r: any) => sum + (Number(r.revenue) || 0), 0);
				const totalChecks = todayRatingArr.reduce((sum: number, r: any) => sum + (Number(r.checks) || 0), 0);
				const yesterdayRatingArr = yesterdayRatings;
				const yesterdayRevenue = yesterdayRatingArr.reduce((sum: number, r: any) => sum + (Number(r.revenue) || 0), 0);
				const changePct = yesterdayRevenue > 0 ? ((totalRevenue - yesterdayRevenue) / yesterdayRevenue * 100).toFixed(1) : "—";

				briefing = [
					`📊 **Сводка за ${context.date} (${context.dayOfWeek})**`,
					`Выручка: ${totalRevenue.toFixed(0)} ₽ | Чеков: ${totalChecks} | Средний чек: ${totalChecks > 0 ? (totalRevenue / totalChecks).toFixed(0) : 0} ₽`,
					yesterdayRevenue > 0 ? `vs ${context.yesterday?.rating?.[0] ? 'вчера' : 'предыдущий день'}: ${changePct}%` : '',
					"",
					`🏪 **Магазины:**`,
					...todayRatingArr.slice(0, 3).map((r: any) => `  • ${r.shopName}: ${Number(r.revenue || 0).toFixed(0)} ₽ (${r.checks} чеков)`),
					"",
					`📦 **Склад:** dead: ${context.stock.deadCount}, out: ${context.stock.outCount}, low: ${context.stock.lowCount}`,
					"",
					`🌤 **Прогноз:** ${context.forecast.forecast.toFixed(0)} ₽`,
				].join("\n");
			}

			const result = {
				date: targetDate,
				briefing,
				context,
			};

			// Cache for 24h
			if (kv) {
				try {
					await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 86400 });
				} catch (_) { /* non-critical */ }
			}

			return c.json(result);
		} catch (error) {
			logger.error("AI director briefing failed", { error });
			return c.json({ error: "AI_DIRECTOR_BRIEFING_FAILED" }, 500);
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

		const shopQueries = shopsUuid.map((shopId: any) => ({
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
			shopUuids.map((shopUuid: any) =>
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
			shopUuids.map((shopUuid: any) =>
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

			const db = c.get("db");
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

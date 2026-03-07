import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import {
	AiInsightsRequestSchema,
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
import type { Document, Product } from "../evotor/types";

const toIsoDate = (date: Date) => date.toISOString().split("T")[0];

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

		const docs = await evo.getAllDocumentsByTypes(start, end);

		const docFiltered = await evo.extractSalesInfo(docs);

		const result = await analyzeDocsStaffTask(c, docFiltered);

		return c.json({ result });
	})

	.get("/aiAssociationRules", async (c) => {
		logger.info("AI association rules request received");
		const evo = c.var.evotor;

		const [start, end] = getPeriodRangeEvotor(3);
		logger.debug("Period range", { start, end });

		const docs = await evo.getAllDocumentsByTypes(start, end);

		const docFiltered = await evo.extractSalesInfo(docs);

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

			const docs = await evo.getDocumentsBySellPayback(shopUuid, since, until);

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

			const salesInfo = await evo.extractSalesInfo(docs);

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
				const prevDocs = await evo.getDocumentsBySellPayback(
					shopUuid,
					prevSince,
					prevUntil,
				);
				if (prevDocs && prevDocs.length > 0) {
					const prevSalesInfo = await evo.extractSalesInfo(prevDocs);
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
				evo.getDocumentsBySellPayback(
					payload.shopUuid,
					formatDateWithTime(new Date(payload.startDate), false),
					formatDateWithTime(new Date(payload.endDate), true),
				),
				evo.getDocumentsBySellPayback(
					payload.shopUuid,
					formatDateWithTime(new Date(previous.previousStart), false),
					formatDateWithTime(new Date(previous.previousEnd), true),
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

			const aggregateSales = (documents: Document[]) => {
				const acc = new Map<
					string,
					{ quantity: number; revenue: number; cost: number }
				>();
				for (const doc of documents) {
					if (!["SELL", "PAYBACK"].includes(doc.type)) continue;
					const sign = doc.type === "SELL" ? 1 : -1;
					for (const tx of doc.transactions || []) {
						if (tx.type !== "REGISTER_POSITION") continue;
						if (!productByUuid.has(tx.commodityUuid)) continue;
						const current = acc.get(tx.commodityUuid) || {
							quantity: 0,
							revenue: 0,
							cost: 0,
						};
						const quantity = Number(tx.quantity || 0) * sign;
						current.quantity += quantity;
						current.revenue += Number(tx.sum || 0) * sign;
						current.cost += Number(tx.costPrice || 0) * Number(tx.quantity || 0) * sign;
						acc.set(tx.commodityUuid, current);
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
			const docs = await evo.getDocumentsBySellPayback(
				payload.shopUuid,
				formatDateWithTime(new Date(payload.startDate), false),
				formatDateWithTime(new Date(payload.endDate), true),
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

			return c.json({
				period: {
					startDate: payload.startDate,
					endDate: payload.endDate,
					days: periodDays,
					generatedAt: toIsoDate(new Date()),
				},
				overall,
				employees: withScoreAndReasons.sort((a, b) => b.score - a.score),
				shifts: shiftSummary,
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
	});

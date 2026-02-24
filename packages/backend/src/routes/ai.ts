import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import { AiInsightsRequestSchema, validate } from "../validation";
import {
	assert,
	buildSinceUntilFromDocuments,
	formatDateWithTime,
	getPeriodRangeEvotor,
	getTodayRangeEvotor,
} from "../utils";
import {
	getLatestCloseDates,
	saveNewIndexDocuments,
} from "../db/repositories/indexDocuments";
import {
	analyzeDocsStaffTask,
	getHoroscopeByDateTask,
	analyzeDocsInsightsTask,
	analyzeDocsAnomaliesTask,
	analyzeDocsPatternsTask,
} from "../ai";

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
	});

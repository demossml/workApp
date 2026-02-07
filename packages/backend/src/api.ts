import { Hono } from "hono";
import { cors } from "hono/cors";
// import path from "path";
// import fs from "fs";
// import os from "os";
import type { IEnv, SaveDeadStocksRequest } from "./types";
import { logger } from "./logger";
import {
	EmployeeByShopSchema,
	SchedulesTableSchema,
	SchedulesTableViewSchema,
	GetFileSchema,
	RegisterSchema,
	SalarySchema,
	SalesResultSchema,
	DeadStockSchema,
	OpenStoreSchema,
	IsOpenStoreSchema,
	GroupsByShopSchema,
	SubmitGroupsSchema,
	StockReportSchema,
	OrderSchema,
	SalesGardenReportSchema,
	ProfitReportSchema,
	AiInsightsRequestSchema,
	validate,
} from "./validation";
// import { createWorkersAI } from 'workers-ai-provider';
// import { Ai } from "@cloudflare/ai";
// import { z } from 'zod';
// import jwt from "jsonwebtoken";

// const JWT_SECRET = "your_secret_key"; // Секретный ключ для подписи токена

import {
	analyzeDocsStaffTask,
	getHoroscopeByDateTask,
	analyzeDocsInsightsTask,
	analyzeDocsAnomaliesTask,
	analyzeDocsPatternsTask,
} from "./ai";
import type { ShopUuidName } from "./evotor/types";
import {
	assert,
	buildSinceUntilFromDocuments,
	calculateTotalSum,
	createAccessoriesTable,
	createPlanTable,
	createSalaryBonusTable,
	createScheduleTable,
	formatDate,
	formatDateWithTime,
	getAllUuid,
	getData,
	getGroupsByNameUuid,
	getIntervals,
	getIsoTimestamp,
	getLatestCloseDates,
	getMonthStartAndEnd,
	getPeriodRangeEvotor,
	getPlan,
	getProductsByGroup,
	getSalaryData,
	getScheduleByPeriod,
	getScheduleByPeriodAndShopId,
	getTelegramFile,
	getTodayRangeEvotor,
	getUuidsByParentUuidList,
	getOpenStoreDetails,
	replaceUuidsWithNames,
	saveFileToR2,
	saveNewIndexDocuments,
	saveOpenStorsTable,
	saveOrUpdateUUIDs,
	saveSalaryAndBonus,
	transformScheduleDataD,
	updateOpenStore,
	updatePlan,
	updateSchedule,
} from "./utils";
// import type { CandleBinance } from "./utils";
import {
	getDocumentsByCashOutcomeData,
	getSalesDataG,
	getSalesgardenReportData,
	getTopProductsData,
} from "./evotor/utils";
import { saveDeadStocks } from "./db/repositories/saveDeadStocks";
import { sendDeadStocksToTelegram } from "../utils/sendDeadStocksToTelegram";
// import { start } from "node:repl";

export const api = new Hono<IEnv>()

	.use("*", cors())

	.get("/api/user", (c) => {
		return c.json(c.var.user);
	})

	// get currently logged in evo toremployee

	.get("/api/employee-name", async (c) => {
		const employeeName = await c.var.evotor.getEmployeeLastName(c.var.userId);

		assert(employeeName, "not an employee");
		return c.json({ employeeName });
	})

	.get("/api/by-last-name-uuid", async (c) => {
		const employeeNameAndUuid = await c.var.evotor.getEmployeesByLastName(
			c.var.user.id.toString(),
		);
		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.get("/api/documents", async (c) => {
		logger.debug("Fetching documents");
		const db = c.get("db");
		const shopsUuid = await c.var.evotor.getShopUuids();
		const newDate = new Date(); // Получаем текущую дату
		const sevenDaysAgo = new Date(newDate.getTime() - 5 * 24 * 60 * 60 * 1000);

		const since = formatDateWithTime(sevenDaysAgo, false);
		const until = formatDateWithTime(sevenDaysAgo, true);

		const shopQueries = shopsUuid.map((shopId) => ({
			shopId,
			since,
			until,
		}));
		// await createIndexDocumentsTable(db);
		// await createIndexOnType(db);

		const documents = await c.var.evotor.getDocumentsIndexForShops(shopQueries);
		await saveNewIndexDocuments(db, documents);

		logger.debug("Documents fetched", { count: documents.length });

		const latestCloseDates = await getLatestCloseDates(db, shopsUuid);

		const resultData = buildSinceUntilFromDocuments(latestCloseDates);
		const documents_ = await c.var.evotor.getDocumentsIndexForShops(resultData);

		await saveNewIndexDocuments(db, documents_);

		// const results = await getDocumentsByPeriod(db, shopsUuid[0], since, until);
		// const cashOutcomeData = await getSalesgardenReportData(
		// 	db,
		// 	c.var.evotor,
		// 	shopsUuid,
		// 	since,
		// 	until,
		// );

		assert(documents_, "not an employee");
		return c.json({ cashOutcomeData: documents_ });
	})

	.get("/api/by-grammar", async (c) => {
		// const result = await createSloveneGrammarTask(c, {
		// 	topic: "спряжение глаголов",
		// 	level: "продвинутый",
		// 	count: 5,
		// });
		const result = getHoroscopeByDateTask(c, { date: "08-06-2025" });

		return c.json({ result });
	})

	.get("/api/employee/name-uuid", async (c) => {
		const employeeNameAndUuid =
			await c.var.evotor.getEmployeesLastNameAndUuid();

		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.post("/api/employee/and-store/name-uuid", async (c) => {
		try {
			const data = await c.req.json();
			const { shop } = validate(EmployeeByShopSchema, data);

			const employeeNameAndUuid = await c.var.evotor.getEmployeesByShopId(shop);

			assert(employeeNameAndUuid, "not an employee");
			return c.json({ employeeNameAndUuid });
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	})

	// Новый endpoint для отчёта за произвольный период
	.post("/api/evotor/report/financial", async (c) => {
		try {
			const db = c.get("db");
			const evo = c.var.evotor;
			const startDate = c.req.query("since");
			const endDate = c.req.query("until");
			// console.log(
			// 	"[financial report] Received request with startDate and endDate",
			// 	{
			// 		startDate,
			// 		endDate,
			// 	},
			// );

			if (!startDate || !endDate) {
				return c.json({ error: "since и until обязательны" }, 400);
			}

			// Конвертируем YYYY-MM-DD в формат Evotor API
			const since = formatDateWithTime(new Date(startDate), false);
			const until = formatDateWithTime(new Date(endDate), true);
			// console.log("[financial report] Converted dates", { since, until });
			const shopUuids = await evo.getShopUuids();
			const {
				salesDataByShopName,
				grandTotalSell,
				grandTotalRefund,
				totalChecks,
			} = await getSalesgardenReportData(db, evo, shopUuids, since, until);
			const cashOutcomeData = await getDocumentsByCashOutcomeData(
				db,
				evo,
				shopUuids,
				since,
				until,
			);
			const topProducts = await getTopProductsData(
				evo,
				shopUuids,
				since,
				until,
			);
			const grandTotalCashOutcome = calculateTotalSum(cashOutcomeData);

			// console.log("[financial report] Calculated values:", {
			// 	grandTotalSell,
			// 	grandTotalRefund,
			// 	netSales: grandTotalSell - grandTotalRefund,
			// 	totalChecks,
			// 	shopCount: Object.keys(salesDataByShopName).length,
			// });

			return c.json({
				salesDataByShopName,
				grandTotalSell,
				grandTotalRefund,
				grandTotalCashOutcome,
				cashOutcomeData,
				totalChecks,
				topProducts,
			});
		} catch (error) {
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.post(
		"/api/evotor/accessories-sales:role/:role/userId::userId",
		async (c) => {
			try {
				const db = c.get("db");
				const evo = c.var.evotor;

				// Если что-то пришло в теле, можно логировать
				const data = await c.req.json().catch(() => null);
				// Получаем role и userId из параметров маршрута
				const role = data.role;
				const userId = data.userId;
				// console.log("[accessories-sales] role и userId из URL", {
				// 	role,
				// 	userId,
				// });
				// console.log("[accessories-sales] Request body", data);

				// Даты: из тела запроса или сегодня
				let since: string;
				let until: string;
				if (data?.since && data?.until) {
					const startData = data.since;
					const endData = data.until;
					// Конвертируем YYYY-MM-DD в формат Evotor API
					since = formatDateWithTime(new Date(startData), false);
					until = formatDateWithTime(new Date(endData), true);
				} else {
					const today = new Date();
					since = formatDateWithTime(today, false);
					until = formatDateWithTime(today, true);
				}
				// console.log("[accessories-sales] Даты", { since, until });

				// Получаем UUID групп аксессуаров
				const groupIdsAks = await getAllUuid(db);
				// console.log("[accessories-sales] groupIdsAks", { groupIdsAks });

				const response: any = {};
				if (role === "SUPERADMIN") {
					// Получаем список UUID всех магазинов
					const shopUuids = await evo.getShopUuids();
					// console.log("[accessories-sales] shopUuids", { shopUuids });
					// Получаем UUID всех аксессуаров по каждому магазину
					const shopProductsPromises = shopUuids.map((shopId) =>
						getProductsByGroup(db, shopId, groupIdsAks),
					);
					const shopProductsResults = await Promise.all(shopProductsPromises);
					// console.log("[accessories-sales] shopProductsResults", {
					// 	shopProductsResults,
					// });
					// Получаем названия магазинов
					const shopNamesMap = await evo.getShopNamesByUuids(shopUuids);
					// console.log("[accessories-sales] shopNamesMap", { shopNamesMap });
					// Собираем данные по продажам аксессуаров для каждого магазина
					const salesPromises = shopUuids.map(async (shopId, idx) => {
						const productUuids = shopProductsResults[idx];
						const salesData = await evo.getSalesSumQuantitySum(
							db,
							shopId,
							since,
							until,
							productUuids,
						);
						// console.log("[accessories-sales] salesData", { shopId, salesData });
						return {
							shopId,
							shopName: shopNamesMap[shopId] || shopId,
							sales: salesData,
						};
					});
					const salesResults = await Promise.all(salesPromises);
					// console.log("[accessories-sales] salesResults", { salesResults });
					response.byShop = salesResults.map(({ shopId, shopName, sales }) => ({
						shopId,
						shopName,
						sales: Object.entries(sales).map(([name, data]) => ({
							name,
							quantity: data.quantitySale,
							sum: data.sum,
						})),
					}));
					// Суммарно по всем магазинам
					const total: Record<string, { quantity: number; sum: number }> = {};
					for (const { sales } of salesResults) {
						for (const [name, data] of Object.entries(sales)) {
							if (!total[name]) total[name] = { quantity: 0, sum: 0 };
							total[name].quantity += data.quantitySale;
							total[name].sum += data.sum;
						}
					}
					response.total = Object.entries(total).map(([name, data]) => ({
						name,
						quantity: data.quantity,
						sum: data.sum,
					}));
					// console.log("[accessories-sales] response.total", {
					// total: response.total,
					// });
				} else {
					// Для кассира: определяем магазин, где он сегодня работает
					const shopUuid = await evo.getFirstOpenSession(
						since,
						until,
						userId || "",
					);
					// console.log("[accessories-sales] shopUuid", { shopUuid });
					if (!shopUuid) {
						logger.warn(
							"[accessories-sales] Не найден открытый магазин для пользователя",
							{ userId },
						);
						return c.json(
							{ error: "Сегодня не найден открытый магазин для пользователя" },
							404,
						);
					}
					const shopName = await evo.getShopName(shopUuid);
					// console.log("[accessories-sales] shopName", { shopName });
					const productUuids = await getProductsByGroup(
						db,
						shopUuid,
						groupIdsAks,
					);
					// console.log("[accessories-sales] productUuids", { productUuids });
					const salesData = await evo.getSalesSumQuantitySum(
						db,
						shopUuid,
						since,
						until,
						productUuids,
					);
					// console.log("[accessories-sales] salesData (cashier)", { salesData });
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
					// console.log("[accessories-sales] response.total (cashier)", {
					// 	total: response.total,
					// });
				}

				// logger.info("[acce/ssories-sales] Финальный ответ", { response });
				return c.json(response);
			} catch (error) {
				logger.error(
					"Ошибка при получении данных о продажах аксессуаров",
					error,
				);
				return c.json(
					{ error: "Ошибка при получении данных о продажах аксессуаров" },
					500,
				);
			}
		},
	)

	.post("/api/schedules/table", async (c) => {
		try {
			const db = c.get("db");
			// Получаем данные из тела запроса
			const data = await c.req.json();
			const { month, year, schedules } = validate(SchedulesTableSchema, data);
			logger.debug("Processing schedules table", { month, year });

			// await deleteScheduleTable(db);

			await createScheduleTable(db);

			const { start, end } = getMonthStartAndEnd(year, month); // Май 2025

			const data_r = await transformScheduleDataD(schedules);

			await updateSchedule(db, data_r);

			const result = await getScheduleByPeriod(db, start, end);

			const evo = c.var.evotor;
			if (!result) {
				return c.json({ error: "No schedule data found" }, 404);
			}
			const scheduleTable = await replaceUuidsWithNames(result, evo);

			// Возвращаем успешный ответ
			return c.json({ scheduleTable });
		} catch (error) {
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Ошибка при обработке данных" }, 500);
		}
	})

	.post("/api/schedules/table-view", async (c) => {
		try {
			const db = c.get("db");
			// Получаем данные из тела запроса
			const data = await c.req.json();
			const { month, year, shopId } = validate(SchedulesTableViewSchema, data);

			const { start, end } = getMonthStartAndEnd(year, month);

			const result = await getScheduleByPeriodAndShopId(db, start, end, shopId);

			const evo = c.var.evotor;
			if (!result) {
				return c.json({ error: "No schedule data found" }, 404);
			}
			const scheduleTable = await replaceUuidsWithNames(result, evo);

			// Возвращаем успешный ответ
			return c.json({ scheduleTable });
		} catch (error) {
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Ошибка при обработке данных" }, 500);
		}
	})

	.get("/api/ai-report", async (c) => {
		logger.info("AI report request received");
		const evo = c.var.evotor;

		// const shopsUuid = await c.var.evotor.getShopUuids();
		const [start, end] = getTodayRangeEvotor();

		const docs = await evo.getAllDocumentsByTypes(start, end);

		const docFiltered = await evo.extractSalesInfo(docs);

		const result = await analyzeDocsStaffTask(c, docFiltered);

		// const result = await sum2Numbers(c, { a: 1, b: 2 });
		return c.json({ result });
	})

	.get("/api/ai-association-rules", async (c) => {
		logger.info("AI association rules request received");
		const evo = c.var.evotor;

		// const shopsUuid = await c.var.evotor.getShopUuids();
		const [start, end] = getPeriodRangeEvotor(3);
		logger.debug("Period range", { start, end });

		const docs = await evo.getAllDocumentsByTypes(start, end);

		const docFiltered = await evo.extractSalesInfo(docs);

		const result = await analyzeDocsStaffTask(c, docFiltered);

		// const result = await sum2Numbers(c, { a: 1, b: 2 });
		return c.json({ result });
	})

	.post("/api/ai/insights", async (c) => {
		try {
			const data = await c.req.json();
			const { startDate, endDate, shopUuid } = validate(
				AiInsightsRequestSchema,
				data,
			);

			logger.info("AI insights request", { startDate, endDate, shopUuid });

			const db = c.get("drizzle");
			const evo = c.var.evotor;

			// 🔹 Проверяем кэш
			const { getAiInsightsFromCache, saveAiInsightsToCache } = await import(
				"./db/repositories/aiInsightsCache.js"
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

			// Конвертируем YYYY-MM-DD в формат Evotor API
			const since = formatDateWithTime(new Date(startDate), false);
			const until = formatDateWithTime(new Date(endDate), true);

			// Получаем документы за указанный период для конкретного магазина
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

			// Извлекаем информацию о продажах
			const salesInfo = await evo.extractSalesInfo(docs);

			// 🔹 Обогащаем данные дополнительным контекстом
			const {
				calculateSalesMetrics,
				calculateTopProducts,
				getTimeContext,
				getPreviousPeriodDates,
			} = await import("./ai/dataEnrichment.js");

			// Текущий период
			const currentMetrics = calculateSalesMetrics(salesInfo);
			const topProducts = calculateTopProducts(salesInfo);
			const timeContext = salesInfo[0]
				? getTimeContext(salesInfo[0].closeDate)
				: undefined;

			// Получаем данные за предыдущий период для сравнения
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

			// Формируем расширенные данные для AI
			const enrichedData = {
				currentPeriod: {
					salesInfo,
					...currentMetrics,
				},
				previousPeriod: previousMetrics,
				topProducts,
				timeContext,
			};

			// Запускаем параллельно все AI-анализы с расширенными данными
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

			// 🔹 Сохраняем в кэш
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

	.get("/api/schedules", async (c) => {
		const date = formatDate(new Date());
		const shopsUuid = await c.var.evotor.getShopUuids();

		// Оптимизация: получаем все названия магазинов за один батч-запрос
		const shopNamesMap = await c.var.evotor.getShopNamesByUuids(shopsUuid);

		// Оптимизация: получаем данные для всех магазинов параллельно
		const dataPromises = shopsUuid.map((uuid) =>
			getData(date, uuid, c.get("db")),
		);
		const dataResults = await Promise.all(dataPromises);

		// Собираем уникальные userIds для батч-запроса имен сотрудников
		const userIds = [
			...new Set(
				dataResults
					.filter((data): data is NonNullable<typeof data> => data !== null)
					.map((data) => data.userId as string),
			),
		];

		// Оптимизация: получаем все имена сотрудников за один батч-запрос
		const employeeNamesMap =
			userIds.length > 0
				? await c.var.evotor.getEmployeeNamesByUuids(userIds)
				: {};

		// Формируем результат
		const dataReport: Record<string, string> = {};
		for (let i = 0; i < shopsUuid.length; i++) {
			const uuid = shopsUuid[i];
			const shopName = shopNamesMap[uuid];
			const data = dataResults[i];

			if (data) {
				const date = new Date(data.dateTime);
				date.setHours(date.getHours() + 3);

				const userId = data.userId as string;
				const employeeName =
					employeeNamesMap[userId] || "Неизвестный сотрудник";
				dataReport[shopName] =
					`${employeeName} открыта в  ${date.toISOString().slice(11, 16)}`;
			} else {
				dataReport[shopName] = "ЕЩЕ НЕ ОТКРЫТА!!!";
			}
		}

		// Проверка наличия employeeNameAndUuid
		if (!dataReport) {
			throw new Error("not an employee");
		}

		return c.json({ dataReport });
	})

	.get("/api/shops", async (c) => {
		const shopsNameAndUuid = await c.var.evotor.getShopNameUuids();
		assert(shopsNameAndUuid, "not an shopsNameAndUuid");
		return c.json({ shopsNameAndUuid });
	})

	.post("/api/get-file", async (c) => {
		try {
			const data = await c.req.json();
			const { date, shop } = validate(GetFileSchema, data);

			const sinceDateOpening: string = formatDate(new Date(date));

			const dataOpening = await getData(sinceDateOpening, shop, c.get("db"));

			const dataUrlPhoto: string[] = [];

			const keysPhoto = [
				"photoCashRegisterPhoto",
				"photoСabinetsPhoto",
				"photoShowcasePhoto1",
				"photoShowcasePhoto2",
				"photoShowcasePhoto3",
				"photoMRCInputput",
				"photoTerritory1",
				"photoTerritory2",
			];

			const dataReport: Record<string, string> = {};

			// Формируем данные о пересчёте денег
			const countingMoneyKeyBase = "РСХОЖДЕНИЙ ПО КАССЕ (ПЕРЕСЧЕТ ДЕНЕГ)";

			if (dataOpening !== null) {
				for (const [key, value] of Object.entries(dataOpening)) {
					if (keysPhoto.includes(key)) {
						if (value !== null) {
							const urlFile = await getTelegramFile(value, c.env.BOT_TOKEN);
							dataUrlPhoto.push(urlFile); // Добавляем значение в результат
						}
					}

					if (
						dataOpening?.countingMoney === null ||
						String(dataOpening?.countingMoney) === "converge"
					) {
						dataReport[`✅${countingMoneyKeyBase}`] = "НЕТ";
					}
					if (
						dataOpening?.countingMoney === null ||
						String(dataOpening?.countingMoney) === "more"
					) {
						const diffSign = "+";
						dataReport[`🔴${countingMoneyKeyBase}`] =
							`${diffSign}${dataOpening.CountingMoneyMessage}`;
					}
					if (
						dataOpening?.countingMoney === null ||
						String(dataOpening?.countingMoney) === "less"
					) {
						const diffSign = "-";
						dataReport[`🔴${countingMoneyKeyBase}`] =
							`${diffSign}${dataOpening.CountingMoneyMessage}`;
					}

					// Дополнительная информация
					const shopName = await c.var.evotor.getShopName(shop); // Получаем имя магазина
					const employeeName = await c.var.evotor.getEmployeeLastName(
						dataOpening.userId,
					);

					dataReport["МАГАЗИН:"] = shopName;
					dataReport["СОТРУДНИК:"] = employeeName || "Нет данных";
					const date = new Date(dataOpening.dateTime);
					date.setHours(date.getHours() + 3);
					dataReport["ВРЕМЯ ОТКРЫТИЯ TT"] = date.toISOString().slice(11, 16);
				}
			}

			assert(dataReport, "not an employee");
			assert(dataUrlPhoto, "not an employee");

			return c.json({ dataReport, dataUrlPhoto });
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	})

	.get("/api/employee-role", async (c) => {
		const userId = c.var.user.id.toString();

		const employeeRoleEvo = await c.var.evotor.getEmployeeRole(userId);

		const employeeRole =
			userId === "5700958253" || userId === "475039971"
				? "SUPERADMIN"
				: employeeRoleEvo;
		logger.debug("Employee role retrieved", { userId, employeeRole });

		assert(employeeRole, "not an employee");
		return c.json({ employeeRole });
	})

	.post("/api/register", async (c) => {
		try {
			const data = await c.req.json(); // Разбор JSON тела

			// Извлекаем данные из JSON
			const { userId } = validate(RegisterSchema, data);
			c.set("userId", String(userId));

			const employeeRoleEvo = await c.var.evotor.getEmployeeRole(userId);
			const employeeRole = employeeRoleEvo !== null;
			logger.debug("User registration attempt", { userId, employeeRole });

			if (!employeeRole) {
				return c.json({ success: false, message: "not an employee" }, 403);
			}

			assert(employeeRole, "not an employee");
			return c.json({ success: true, employeeRole });
		} catch (error) {
			return c.json(
				{
					success: false,
					message:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	})

	.post("/api/upload-photos-batch", async (c) => {
		try {
			const formData = await c.req.formData();

			// --- USER ID ---
			const userId = formData.get("userId")?.toString();
			if (!userId) {
				return c.json({ success: false, error: "Missing userId" }, 400);
			}

			// --- ПОЛУчАЕМ МАССИВЫ ---
			const files = formData.getAll("files") as unknown as File[];
			const categories = formData.getAll("categories").map(String);
			const fileKeys = formData.getAll("fileKeys").map(String);

			if (files.length === 0) {
				return c.json({ success: false, error: "No files uploaded" }, 400);
			}

			if (
				files.length !== categories.length ||
				files.length !== fileKeys.length
			) {
				logger.warn("Invalid batch structure in FormData");
				return c.json(
					{ success: false, error: "Invalid batch structure" },
					400,
				);
			}

			const allowed = ["area", "stock", "cash", "mrc"];

			// --- Генерируем дату ---
			const now = new Date();
			const dd = String(now.getDate()).padStart(2, "0");
			const mm = String(now.getMonth() + 1).padStart(2, "0");
			const yyyy = now.getFullYear();

			const dateFolder = `opening/${dd}-${mm}-${yyyy}/${userId}`;

			const saved: { key: string; category: string; fileKey: string }[] = [];

			// --- СОХРАНЯЕМ ВСЕ ФАЙЛЫ ---
			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const category = categories[i];
				const fileKey = fileKeys[i];

				if (!allowed.includes(category)) {
					logger.warn("Invalid category", { category });
					continue;
				}

				if (!(file instanceof File)) {
					logger.warn("Invalid file object");
					continue;
				}

				const key = `${dateFolder}/${category}/${file.name}`;

				logger.debug("Saving file", { index: i + 1, total: files.length, key });

				await saveFileToR2(c.env.R2, file, key);

				logger.debug("File saved", { key });

				saved.push({ key, category, fileKey });
			}

			return c.json({
				success: true,
				saved,
			});
		} catch (error) {
			logger.error("Batch upload error", error);
			return c.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Upload failed",
				},
				500,
			);
		}
	})

	.post("/api/upload-photos", async (c) => {
		try {
			const formData = await c.req.formData();

			const file = formData.get("file") as File | null;
			const category = formData.get("category")?.toString();
			const userId = formData.get("userId")?.toString();
			const fileKey = formData.get("fileKey")?.toString();

			if (!userId) {
				return c.json({ success: false, error: "Missing userId" }, 400);
			}

			if (!file) {
				return c.json({ success: false, error: "Missing file" }, 400);
			}

			if (!category) {
				return c.json({ success: false, error: "Missing category" }, 400);
			}

			if (!fileKey) {
				return c.json({ success: false, error: "Missing fileKey" }, 400);
			}

			const allowed = ["area", "stock", "cash", "mrc"] as const;
			type AllowedCategory = (typeof allowed)[number];
			if (!allowed.includes(category as AllowedCategory)) {
				return c.json({ success: false, error: "Invalid category" }, 400);
			}

			const now = new Date();
			const dd = String(now.getDate()).padStart(2, "0");
			const mm = String(now.getMonth() + 1).padStart(2, "0");
			const yyyy = now.getFullYear();

			const folder = `opening/${dd}-${mm}-${yyyy}/${userId}/${category}`;
			const uniqueName = `${Date.now()}_${file.name}`;
			const key = `${folder}/${uniqueName}`;

			logger.debug("Saving file", { fileName: file.name, key });

			await saveFileToR2(c.env.R2, file, key);

			logger.debug("File saved successfully", { key });

			return c.json({
				success: true,
				fileKey,
				category,
				key,
			});
		} catch (err) {
			logger.error("Upload photos error", err);
			return c.json({ success: false, error: "Server error" }, 500);
		}
	})

	.post("/api/upload", async (c) => {
		const formData = await c.req.formData();
		logger.debug("Upload request", {
			entriesCount: Array.from(formData.entries()).length,
		});

		const file = formData.get("photos") as File | null;
		if (!file || !(file instanceof File)) {
			return c.json({ error: "Нет файла для загрузки" }, 400);
		}

		// const baseUrl = c.env.R2_PUBLIC_URL;

		try {
			const savedKey = `uploads/${crypto.randomUUID()}_${file.name}`;
			const arrayBuffer = await file.arrayBuffer();
			logger.debug("Processing file", {
				name: file.name,
				type: file.type,
				size: file.size,
			});

			await c.env.R2.put(savedKey, arrayBuffer, {
				httpMetadata: { contentType: file.type || "application/octet-stream" },
			});

			// const publicUrl = `${baseUrl}/${savedKey}`;
			const publicUrl = `https://pub-a1a3c60dd9754ffba505cb0039a032fa.r2.dev/${savedKey}`;
			logger.debug("File saved to R2", { publicUrl });

			return c.json({
				url: publicUrl,
				name: file.name,
			});
		} catch (error) {
			logger.error("Error saving file", { fileName: file.name, error });
			return c.json({ error: `Ошибка сохранения файла: ${error}` }, 500);
		}
	})

	.get("/api/evotor/sales-today", async (c) => {
		const salesData = await c.var.evotor.getSalesToday();

		assert(salesData, "No sales data found");

		return c.json({ salesData });
	})

	.get("/api/evotor/current-work-shop", async (c) => {
		try {
			const userId = c.var.userId;
			const evo = c.var.evotor;

			// Получаем сегодняшнюю дату
			const today = new Date();
			const since = formatDateWithTime(today, false);
			const until = formatDateWithTime(today, true);

			// Получаем фамилию сотрудника по userId (telegram ID)
			const employeeData = await evo.getEmployeesByLastName(userId);

			if (!employeeData || employeeData.length === 0) {
				return c.json({
					uuid: "",
					name: "",
					isWorkingToday: false,
				});
			}

			const employeeUuid = employeeData[0].uuid;

			// Получаем UUID магазина, где сотрудник открыл смену сегодня
			const shopUuid = await evo.getFirstOpenSession(
				since,
				until,
				employeeUuid,
			);

			if (!shopUuid) {
				return c.json({
					uuid: "",
					name: "",
					isWorkingToday: false,
				});
			}

			// Получаем информацию о магазине
			const shops = await evo.getShops();
			const currentShop = shops.find((shop) => shop.uuid === shopUuid);

			if (!currentShop) {
				return c.json({
					uuid: shopUuid,
					name: "",
					isWorkingToday: true,
				});
			}

			return c.json({
				uuid: currentShop.uuid,
				name: currentShop.name,
				isWorkingToday: true,
			});
		} catch (error) {
			logger.error("Ошибка при получении текущего магазина:", error);
			return c.json(
				{
					uuid: "",
					name: "",
					isWorkingToday: false,
				},
				500,
			);
		}
	})

	.get("/api/evotor/sales-today-graf", async (c) => {
		const db = c.get("db"); // Получаем подключение к базе данных
		const evo = c.var.evotor;

		const shopUuids = await c.var.evotor.getShopUuids();

		const nowDate = new Date(); // Получаем текущую дату
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

	.get("/api/evotor/plan-for-today", async (c) => {
		try {
			interface SalesData {
				[shopName: string]: {
					datePlan: number;
					dataSales: number;
					dataQuantity: { [productName: string]: number } | null;
				} | null;
			}

			const db = c.get("db"); // Получаем подключение к базе данных
			const newDate: Date = new Date();
			const datePlan: string = formatDate(newDate);
			let salesData: SalesData = {};

			const since = formatDateWithTime(newDate, false); // Начало дня
			const until = formatDateWithTime(newDate, true); // Конец дня

			// Создаем таблицу, если она не существует
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

			// Получение всех UUID продуктов
			const productUuids = await getUuidsByParentUuidList(db, groupIdsVape);

			// Получение плана продаж
			const plan = await getPlan(datePlan, db);
			let datPlan: Record<string, number> = {};

			if (!plan) {
				logger.debug("План не найден, генерируем новый");
				datPlan = await c.var.evotor.getPlan(newDate, productUuids);
				await updatePlan(datPlan, datePlan, db);
			} else {
				datPlan = plan;
			}

			// Получение списка магазинов
			const shopUuids: string[] = await c.var.evotor.getShopUuids();
			salesData = {};

			// Оптимизация: получаем все названия магазинов за один батч-запрос
			const shopNamesMap = await c.var.evotor.getShopNamesByUuids(shopUuids);

			// Оптимизация: параллельно получаем UUID продуктов для всех магазинов
			const shopProductsPromises = shopUuids.map((shopId) =>
				getProductsByGroup(c.get("db"), shopId, groupIdsVape),
			);
			const shopProductsResults = await Promise.all(shopProductsPromises);

			// Оптимизация: параллельно получаем данные продаж для всех магазинов
			const salesPromises = shopUuids.map(async (shopId, index) => {
				try {
					const shopProductUuids = shopProductsResults[index];

					// Получение данных продаж и количества проданных товаров
					const [sumSalesData, podQuantity] = await Promise.all([
						c.var.evotor.getSalesSum(shopId, since, until, shopProductUuids),
						c.var.evotor.getSalesSumQuantity(
							shopId,
							since,
							until,
							shopProductUuids,
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

			// Формируем результат
			for (const { shopId, sumSalesData, podQuantity } of salesResults) {
				const shopName = shopNamesMap[shopId];
				salesData[shopName] = {
					datePlan: datPlan[shopId] || 0,
					dataSales: sumSalesData || 0,
					dataQuantity: podQuantity || {},
				};
			}

			return c.json({ salesData });
		} catch (err) {
			logger.error("Ошибка при обработке запроса plan-for-today", err);
			return c.json(
				{ error: "Ошибка при обработке запроса. Проверьте логи." },
				500,
			);
		}
	})

	.get("/api/evotor/groups", async (c) => {
		// Получаем UUID магазинов
		const shopIds: string[] = await c.var.evotor.getShopUuids();

		// Получаем группы по UUID первого магазина
		const groups = await c.var.evotor.getGroupsByNameUuid(shopIds[0]);

		return c.json({ groups });
	})

	.post("/api/evotor/groups-by-shop", async (c) => {
		try {
			const data = await c.req.json();
			const { shopUuid } = validate(GroupsByShopSchema, data);
			// await createProductsTableIfNotExists(c.get("db"));

			// const shopUuids = await c.var.evotor.getShopUuids();

			// for (const shopU of shopUuids) {
			// 	const test = await c.var.evotor.getProductsShopUuidsT(shopU);
			// 	console.log(test);
			// 	await updateOrInsertData(test, c.get("db"));
			// }

			const groupsData = await getGroupsByNameUuid(c.get("db"), shopUuid);
			// Получение списка магазинов
			// const groupsData = await c.var.evotor.getGroupsByNameUuid(shopUuid);
			if (groupsData) {
				const excludedUuids = [
					"3f51bb7f-f3a2-11e8-b973-ccb0da458b5a",
					"be7939b7-d6e6-11ea-b9a5-ccb0da458b5a",
				];

				const groups = groupsData.filter(
					(group) => !excludedUuids.includes(group.uuid),
				);

				assert(groups, "not an result");

				return c.json({ groups });
			}
			return c.json({ error: "No data found" }, 404);
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	})

	.post("/api/evotor/salary", async (c) => {
		try {
			const data = await c.req.json();
			const { employee, startDate, endDate } = validate(SalarySchema, data);
			const db = c.get("db");

			const sincetDate = formatDateWithTime(new Date(startDate), false);
			const untilDate = formatDateWithTime(new Date(endDate), true);
			const dates = getIntervals(sincetDate, untilDate, "days", 1);

			const groupIdsAks = await getAllUuid(db);
			const employeeName = await c.var.evotor.getEmployeeByUuid(employee);

			// Константа для Vape групп
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
			const productUuidsVape = await getUuidsByParentUuidList(db, groupIdsVape);

			const totalReport = {
				employeeName,
				startDate: formatDate(new Date(startDate)),
				endDate: formatDate(new Date(endDate)),
				totalBonusAccessories: 0,
				totalBonusPlan: 0,
				totalBonus: 0,
			};

			const result = [];

			// Оптимизация: сначала собираем все openShopUuids параллельно
			const sessionPromises = dates.map((date_) => {
				const date = new Date(date_);
				const since = formatDateWithTime(date, false);
				const until = formatDateWithTime(date, true);
				return c.var.evotor.getFirstOpenSession(since, until, employee);
			});
			const openShopUuids = await Promise.all(sessionPromises);

			// Получаем уникальные UUID магазинов
			const uniqueShopUuids = [
				...new Set(openShopUuids.filter(Boolean) as string[]),
			];

			// Оптимизация: получаем все названия магазинов за один батч-запрос
			const shopNamesMap =
				uniqueShopUuids.length > 0
					? await c.var.evotor.getShopNamesByUuids(uniqueShopUuids)
					: {};

			// Обрабатываем результаты
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
					if (!plan || Object.keys(plan).length === 0) {
						plan = await c.var.evotor.getPlan(date, productUuidsVape);
						await updatePlan(plan, datePlan, db);
					}

					const currentPlan = Number.isFinite(plan[openShopUuid])
						? plan[openShopUuid]
						: 0;

					// Бонусы по аксессуарам
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
					);
					const bonusAccessories = Math.floor(salesDataAks * 0.05);

					// Продажи Vape
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

				// Обновление общего отчета
				totalReport.totalBonusAccessories += dataReport.bonusAccessories;
				totalReport.totalBonusPlan += dataReport.bonusPlan;
				totalReport.totalBonus += dataReport.totalBonus;
			}

			return c.json({ result, totalReport });
		} catch (error) {
			logger.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.post("/api/evotor/submit-groups", async (c) => {
		try {
			const data = await c.req.json(); // Разбор JSON тела

			// Извлекаем данные из JSON
			const { groups, salary, bonus } = validate(SubmitGroupsSchema, data);
			const newDate = new Date();
			const date = formatDate(newDate);
			await createSalaryBonusTable(c.get("db"));
			await saveSalaryAndBonus(date, salary, bonus, c.get("db"));

			await createAccessoriesTable(c.get("db"));
			await saveOrUpdateUUIDs(groups, c.get("db"));
			const uuid = await getAllUuid(c.get("db"));

			// Получаем UUID магазинов
			const shopIds: string[] = await c.var.evotor.getShopUuids();

			// Фильтруем ненужные UUID
			const filteredUuids = shopIds.filter(
				(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
			);
			const groupsName = await c.var.evotor.getGroupsByName(
				filteredUuids[0],
				uuid,
			);

			// Можно добавить логику обработки данных здесь

			return c.json({ groupsName, salary, bonus });
		} catch (error) {
			logger.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.post("/api/evotor/shops", async (c) => {
		// Объект для хранения сопоставления shopUuid -> shopName
		const shopOptions: Record<string, string> = {};

		// Получение списка магазинов
		const shops: ShopUuidName[] | null = await c.var.evotor.getShopNameUuids();
		if (shops) {
			// Добавление магазинов в shopOptions
			shops.forEach((shop) => {
				shopOptions[shop.uuid] = shop.name;
			});
		}

		assert(shopOptions, "not an shopOptions");

		return c.json({ shopOptions });
	})

	.get("/api/evotor/shops-names", async (c) => {
		// Получение списка магазинов
		const shopsName = await c.var.evotor.getShopsName();

		assert(shopsName, "not an shopOptions");

		return c.json({ shopsName });
	})

	.get("/api/evotor/sales-report", async (c) => {
		// Получаем список магазинов
		const shops = await c.var.evotor.getShops();

		const shopOptions: Record<string, string> = shops.reduce(
			(acc, shop) => {
				acc[shop.uuid] = shop.name;
				return acc;
			},
			{} as Record<string, string>,
		);

		// Получаем UUID магазинов
		const shopIds: string[] = await c.var.evotor.getShopUuids();

		// Фильтруем ненужные UUID
		const filteredUuids = shopIds.filter(
			(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
		);

		// Получаем группы по UUID первого магазина
		const groups = await c.var.evotor.getGroupsByNameUuid(filteredUuids[0]);

		return c.json({ shopOptions, groups });
	})

	.post("/api/evotor/sales-result", async (c) => {
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

	.post("/api/evotor/dead-stock", async (c) => {
		try {
			const data = await c.req.json(); // Разбор JSON тела
			const { startDate, endDate, shopUuid, groups } = validate(
				DeadStockSchema,
				data,
			);

			const sincetDate = new Date(startDate); // Преобразуем в объект Date
			const untilDate = new Date(endDate); // Преобразуем в объект Date

			const since = formatDateWithTime(sincetDate, false); // Форматируем начальную дату
			const until = formatDateWithTime(untilDate, true); // Форматируем конечную дату

			const params = { shopId: shopUuid, groups, since, until };

			// Продукты по группам
			const salesData = await c.var.evotor.getSalesSummary(params); // Получаем данные по продажам

			const shopName = await c.var.evotor.getShopName(shopUuid);

			logger.debug("Sales data retrieved", { salesData });

			return c.json({
				salesData: salesData, // МАССИВ элементов
				shopName,
				startDate,
				endDate,
			});
		} catch (error) {
			logger.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.get("/api/evotor/shops", async (c) => {
		// Получаем список магазинов
		const shops = await c.var.evotor.getShops();

		const shopOptions: Record<string, string> = shops.reduce(
			(acc, shop) => {
				acc[shop.uuid] = shop.name;
				return acc;
			},
			{} as Record<string, string>,
		);

		return c.json({ shopOptions });
	})

	.post("/api/evotor/stock-report", async (c) => {
		try {
			// Получаем данные из запроса
			const data = await c.req.json();
			const { shopUuid, groups } = validate(StockReportSchema, data);

			// Получаем список товаров для заданных групп
			const stockDataResponse = await c.var.evotor.getStockByGroup(
				shopUuid,
				groups,
				"price",
			);

			// Проверяем, что данные о товарах получены
			if (!stockDataResponse || Object.keys(stockDataResponse).length === 0) {
				return c.json({ error: "Не удалось получить данные о товаре." }, 500);
			}

			// // Сортируем данные о товарах
			// const sortedStockData = sortStockData(stockDataResponse, sortCriteria);
			// // console.log("Отсортированные данные:", sortedStockData);
			const shopName = await c.var.evotor.getShopName(shopUuid);

			// Отправляем ответ
			return c.json({ stockData: stockDataResponse, shopName });
		} catch (error) {
			// Логируем ошибку и возвращаем 500
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Произошла ошибка при обработке запроса." }, 500);
		}
	})

	.post("/api/evotor/order", async (c) => {
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

			const order = await c.var.evotor.getOrder(params);

			// Проверяем, что данные о товарах получены
			if (!order || Object.keys(order).length === 0) {
				return c.json({ error: "Не удалось получить данные заказа." }, 500);
			}

			const shopName = await c.var.evotor.getShopName(shopUuid);

			// Отправляем ответ
			return c.json({ order, startDate, endDate, shopName });
		} catch (error) {
			// Логируем ошибку и возвращаем 500
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Произошла ошибка при обработке запроса." }, 500);
		}
	})

	.get("/api/evotor/report/financial/today", async (c) => {
		try {
			const db = c.get("db");
			const evo = c.var.evotor;
			const now = new Date();

			const since = formatDateWithTime(now, false);
			const until = formatDateWithTime(now, true);

			const shopUuids = await evo.getShopUuids();

			const {
				salesDataByShopName,
				grandTotalSell,
				grandTotalRefund,
				totalChecks,
			} = await getSalesgardenReportData(db, evo, shopUuids, since, until);

			const cashOutcomeData = await getDocumentsByCashOutcomeData(
				db,
				evo,
				shopUuids,
				since,
				until,
			);

			const topProducts = await getTopProductsData(
				evo,
				shopUuids,
				since,
				until,
			);

			const grandTotalCashOutcome = calculateTotalSum(cashOutcomeData);

			return c.json({
				salesDataByShopName,
				grandTotalSell,
				grandTotalRefund,
				grandTotalCashOutcome,
				cashOutcomeData,
				totalChecks,
				topProducts,
			});
		} catch (error) {
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})
	.post("/api/evotor/sales-garden-report", async (c) => {
		try {
			const data = await c.req.json(); // Разбор JSON тела
			const { startDate, endDate } = validate(SalesGardenReportSchema, data);

			const shopUuids = await c.var.evotor.getShopUuids();

			const sincetDate = new Date(startDate); // Преобразуем в объект Date
			const untilDate = new Date(endDate); // Преобразуем в объект Date

			const since = formatDateWithTime(sincetDate, false); // Форматируем начальную дату
			const until = formatDateWithTime(untilDate, true); // Форматируем конечную дату

			// const filteredUuids = shopUuids.filter(
			// 	(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
			// );

			const { salesDataByShopName, grandTotalSell, grandTotaRefund } =
				await c.var.evotor.getSalesgardenReportData(shopUuids, since, until);

			const cashOutcomeData = await c.var.evotor.getDocumentsByCashOutcomeData(
				shopUuids,
				since,
				until,
			);

			// const aiWithRun = c.var.ai as any;
			// const evo = c.var.evotor;

			// 			const docs = await evo.getDocuments(shopUuids[2], since, until);

			// 			const salesAnalysisSchema = {
			// 				name: "sales-analysis",
			// 				prompt: (docs: Document[]) => `
			//     Проанализируй эти документы: ${JSON.stringify(docs)}
			//     Верни результат в формате: { "summary": string }
			//   `,
			// 				outputSchema: z.object({
			// 					summary: z.string(),
			// 				}),
			// 			};

			// const d = await c.var.evotor.getDocuments(shopUuids[2], since, until);

			// const f = prepareDocumentsForAI(d);

			// const aiWithRun = c.var.ai as any;

			// const response = await analyzeSalesDocuments(f, aiWithRun);

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

				// Чистая прибыль = Валовая прибыль - расходы Evo + расходы 1С
				const netProfit =
					(data1C.grossProfit || 0) -
					(evoShopData.total || 0) +
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

	.post("/api/is-open-store", async (c) => {
		try {
			const data = await c.req.json();
			const { userId, date } = validate(IsOpenStoreSchema, data); // date в формате "dd-mm-yyyy"

			const db = c.env.DB;

			// Получаем детальную информацию об открытии
			const details = await getOpenStoreDetails(db, userId, date);

			if (!details) {
				return c.json(
					{ exists: false, error: "Ошибка при получении данных" },
					500,
				);
			}

			return c.json(details);
		} catch (err) {
			logger.error("Ошибка в /api/is-open-store:", err);
			return c.json({ exists: false, error: "Ошибка сервера" }, 500);
		}
	})
	.post("/api/open-store", async (c) => {
		try {
			const data = await c.req.json();
			const { userId, timestamp } = validate(OpenStoreSchema, data);

			const db = c.env.DB;

			// Создаём таблицу, если её нет
			// await createOpenStorsTable(db);

			// Сохраняем новую строку открытия магазина
			await saveOpenStorsTable(db, {
				date: timestamp,
				userId,
				cash: null, // пока нет данных кассы
				sign: null, // открытие
				ok: null, // ещё не проверено
			});

			return c.json({ ok: true });
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	})
	.post("/api/dead-stocks/update", async (c) => {
		try {
			const db = c.get("drizzle");

			const { shopUuid, items } = await c.req.json<
				SaveDeadStocksRequest & { userId: number }
			>();

			if (!shopUuid || !items || !Array.isArray(items)) {
				return c.json({ success: false, error: "Invalid request data" }, 400);
			}

			// ID группы Telegram (из env)
			const TELEGRAM_GROUP_ID = "5700958253";

			// 1️⃣ ОТПРАВКА В TELEGRAM (ДО сохранения)
			try {
				await sendDeadStocksToTelegram(
					{
						chatId: TELEGRAM_GROUP_ID,
						shopUuid,
						items,
					},
					c.env.BOT_TOKEN,
					c.var.evotor,
				);
			} catch (telegramError) {
				logger.error("Failed to send to Telegram", telegramError);
				// Продолжаем выполнение даже если Telegram недоступен
			}

			// 2️⃣ СОХРАНЕНИЕ В БД
			await saveDeadStocks(db, shopUuid, items);

			return c.json({ success: true });
		} catch (error) {
			logger.error("Dead stocks update failed", error);
			return c.json(
				{
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Failed to update dead stocks",
				},
				500,
			);
		}
	})
	.post("/api/finish-opening", async (c) => {
		try {
			const db = c.env.DB;

			const data = await c.req.json();

			const { ok, discrepancy, userId } = data;

			if (!userId) {
				return c.json({ success: false, error: "Missing userId" }, 400);
			}

			logger.debug("Processing discrepancy data", { discrepancy, ok });

			let cash = null;
			let sign = null;

			if (!ok && discrepancy) {
				cash = Number(discrepancy.amount);
				sign = discrepancy.type; // "+" или "-"
			}

			await updateOpenStore(db, userId, { cash, sign });

			return c.json({ success: true });
		} catch (error) {
			logger.error("Finish opening failed", error);
			return c.json(
				{
					success: false,
					error:
						error instanceof Error ? error.message : "Failed to finish opening",
				},
				500,
			);
		}
	});

export type IAPI = typeof api;

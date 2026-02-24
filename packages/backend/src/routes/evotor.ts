import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import {
	GroupsByShopSchema,
	OrderSchema,
	ProfitReportSchema,
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
	formatDate,
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
import { createPlanTable, getPlan, updatePlan } from "../db/repositories/plan";
import {
	createSalaryBonusTable,
	saveSalaryAndBonus,
} from "../db/repositories/salaryBonus";
import { getSalaryData } from "../db/repositories/salaryData";
import {
	getProductsByGroup,
	getUuidsByParentUuidList,
} from "../db/repositories/products";
import {
	getDocumentsByCashOutcomeData,
	getSalesDataG,
	getSalesgardenReportData,
	getTopProductsData,
} from "../evotor/utils";
import { jsonError, toApiErrorPayload } from "../errors";

export const evotorRoutes = new Hono<IEnv>()

	.get("/sales-today", async (c) => {
		const salesData = await c.var.evotor.getSalesToday();
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
				return c.json({ uuid: "", name: "", isWorkingToday: false });
			}
			const employeeUuid = employeeData[0].uuid;
			const shopUuid = await evo.getFirstOpenSession(
				since,
				until,
				employeeUuid,
			);
			if (!shopUuid) {
				return c.json({ uuid: "", name: "", isWorkingToday: false });
			}
			const shops = await evo.getShops();
			const currentShop = shops.find((shop) => shop.uuid === shopUuid);
			if (!currentShop) {
				return c.json({ uuid: shopUuid, name: "", isWorkingToday: true });
			}
			return c.json({
				uuid: currentShop.uuid,
				name: currentShop.name,
				isWorkingToday: true,
			});
		} catch (error) {
			logger.error("Ошибка при получении текущего магазина:", error);
			return c.json({ uuid: "", name: "", isWorkingToday: false }, 500);
		}
	})
	.get("/sales-today-graf", async (c) => {
		const db = c.get("db");
		const evo = c.var.evotor;
		const shopUuids = await c.var.evotor.getShopUuids();
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

			const response: any = {};
			if (role === "SUPERADMIN") {
				const shopUuids = await evo.getShopUuids();
				const shopProductsPromises = shopUuids.map((shopId) =>
					getProductsByGroup(db, shopId, groupIdsAks),
				);
				const shopProductsResults = await Promise.all(shopProductsPromises);
				const shopNamesMap = await evo.getShopNamesByUuids(shopUuids);
				const salesPromises = shopUuids.map(async (shopId, idx) => {
					const productUuids = shopProductsResults[idx];
					const salesData = await evo.getSalesSumQuantitySum(
						db,
						shopId,
						since,
						until,
						productUuids,
					);
					return {
						shopId,
						shopName: shopNamesMap[shopId] || shopId,
						sales: salesData,
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
				const salesData = await evo.getSalesSumQuantitySum(
					db,
					shopUuid,
					since,
					until,
					productUuids,
				);
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
				return jsonError(
					c,
					502,
					"TELEGRAM_SEND_FAILED",
					telegramPayload.description || "Telegram API rejected the request",
				);
			}

			return c.json({
				success: true,
				messageId: telegramPayload.result?.message_id || null,
			});
		} catch (error) {
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

			const productUuids = await getUuidsByParentUuidList(db, groupIdsVape);

			const plan = await getPlan(datePlan, db);
			let datPlan: Record<string, number> = {};

			if (!plan) {
				logger.debug("План не найден, генерируем новый");
				datPlan = await c.var.evotor.getPlan(newDate, productUuids);
				await updatePlan(datPlan, datePlan, db);
			} else {
				datPlan = plan;
			}

			const shopUuids: string[] = await c.var.evotor.getShopUuids();
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
	.get("/groups", async (c) => {
		const shopIds: string[] = await c.var.evotor.getShopUuids();

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
					if (!plan || Object.keys(plan).length === 0) {
						plan = await c.var.evotor.getPlan(date, productUuidsVape);
						await updatePlan(plan, datePlan, db);
					}

					const currentPlan = Number.isFinite(plan[openShopUuid])
						? plan[openShopUuid]
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

			const shopIds: string[] = await c.var.evotor.getShopUuids();

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

		const shopIds: string[] = await c.var.evotor.getShopUuids();

		const filteredUuids = shopIds.filter(
			(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
		);

		const groups = await c.var.evotor.getGroupsByNameUuid(filteredUuids[0]);

		return c.json({ shopOptions, groups });
	})

	.get("/financial", async (c) => {
		try {
			const db = c.get("db");
			console.log("[financial] Получение финансового отчёта с параметрами:", {
				query: c.req.query(),
			});
			const evo = c.var.evotor;
			const startDate = c.req.query("since");
			const endDate = c.req.query("until");

			if (!startDate || !endDate) {
				return c.json({ error: "since и until обязательны" }, 400);
			}

			// Конвертируем YYYY-MM-DD в формат Evotor API
			const since = formatDateWithTime(new Date(startDate), false);
			const until = formatDateWithTime(new Date(endDate), true);
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

			// console.log("[financial] Сформированные данные для ответа:", {
			// 	salesDataByShopName,
			// 	grandTotalSell,
			// 	grandTotalRefund,
			// 	grandTotalCashOutcome,
			// 	cashOutcomeData,
			// 	totalChecks,
			// 	topProducts,
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
	.get("/financial/today", async (c) => {
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

			const order = await c.var.evotor.getOrder(params);
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

	.post("/stock-report", async (c) => {
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
			const shopName = await c.var.evotor.getShopName(shopUuid);

			// Отправляем ответ
			return c.json({ stockData: stockDataResponse, shopName });
		} catch (error) {
			// Логируем ошибку и возвращаем 500
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
	});

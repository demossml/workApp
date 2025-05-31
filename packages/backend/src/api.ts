import { Hono } from "hono";
import { cors } from "hono/cors";
// import path from "path";
// import fs from "fs";
// import os from "os";
import { IEnv } from "./types";
// import { createWorkersAI } from 'workers-ai-provider';
// import { Ai } from "@cloudflare/ai";
// import { z } from 'zod';

import {
	assert,
	createAccessoriesTable,
	createPlanTable,
	createSalaryBonusTable,
	formatDate,
	formatDateWithTime,
	getAllUuid,
	getIntervals,
	getPlan,
	getSalaryAndBonus,
	saveOrUpdateUUIDs,
	saveSalaryAndBonus,
	updatePlan,
	// sortSalesData,
	getUuidsByParentUuidList,
	getSalaryData,
	calculateTotalSum,
	getData,
	getTelegramFile,
	// getTelegramFileUpl,
	// sendToTelegram,
	// sortStockData,
	// sortSalesSummary,
	// getSalesDataByDate,
	// createProductsTableIfNotExists,
	// updateOrInsertData,
	getGroupsByNameUuid,
	getProductsByGroup,
	// transformScheduleData,
	createScheduleTable,
	updateSchedule,
	// getSchedule,
	replaceUuidsWithNames,
	getScheduleByPeriod,
	getMonthStartAndEnd,
	getScheduleByPeriodAndShopId,
	// deleteScheduleTable,
	transformScheduleDataD,
	// analyzeSalesDocuments,
	// prepareDocumentsForAI,

	// generateLLMPromptFromDocuments,
} from "./utils";
import { Document, ShopUuidName } from "./evotor/types";
import { z } from "zod";
import { analyzeWithAI } from "./ai";

export const api = new Hono<IEnv>()

	.use("*", cors())

	.get("/api/user", (c) => {
		// console.log(c.var.user);
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
		// console.log(employeeNameAndUuid);
		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.get("/api/employee/name-uuid", async (c) => {
		const employeeNameAndUuid =
			await c.var.evotor.getEmployeesLastNameAndUuid();

		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.post("/api/employee/and-store/name-uuid", async (c) => {
		const data = await c.req.json();
		const { shop } = data;

		const employeeNameAndUuid = await c.var.evotor.getEmployeesByShopId(shop);
		// console.log("employeeNameAndUuid:", employeeNameAndUuid);

		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.post("/api/schedules/table", async (c) => {
		try {
			const db = c.get("db");
			// Получаем данные из тела запроса
			const data = await c.req.json();
			const { month, year, schedules } = data;
			console.log(month, year);

			// await deleteScheduleTable(db);

			await createScheduleTable(db);

			const { start, end } = getMonthStartAndEnd(year, month); // Май 2025
			// console.log(`Начало месяца: ${start}`); // Ожидается: "2025-05-01"
			// console.log(`Конец месяца: ${end}`);

			const data_r = await transformScheduleDataD(schedules);
			// console.log("data_r:", data_r);

			await updateSchedule(db, data_r);

			const result = await getScheduleByPeriod(db, start, end);
			// console.log("result:", result);

			const evo = c.var.evotor;
			if (!result) {
				return c.json({ error: "No schedule data found" }, 404);
			}
			const scheduleTable = await replaceUuidsWithNames(result, evo);

			// Возвращаем успешный ответ
			return c.json({ scheduleTable });
		} catch (error) {
			console.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Ошибка при обработке данных" }, 500);
		}
	})

	.post("/api/schedules/table-view", async (c) => {
		try {
			const db = c.get("db");
			// Получаем данные из тела запроса
			const data = await c.req.json();
			const { month, year, shopId } = data;

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
			console.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Ошибка при обработке данных" }, 500);
		}
	})

	.get("/api/schedules", async (c) => {
		const date = formatDate(new Date());

		const evo = c.var.evotor;

		const salesAnalysisSchema = {
			name: "sales-analysis",
			prompt: (docs: Document[]) => `
			Проанализируй документы и верни JSON вида: 
			{ "summary": "итог анализа" }
			Пример: { "summary": "За день продано 42 товара" }
			
			Документы: ${JSON.stringify(docs.slice(0, 3))} [и еще ${docs.length - 3}...]
		`,
			outputSchema: z.object({
				summary: z.string(),
			}),
		};

		const shopsUuid = await c.var.evotor.getShopUuids();
		const aiWithRun = c.var.ai as any;

		const docs = await evo.getDocuments(
			shopsUuid[2],
			"2025-05-31T00:56:03.000+0000",
			"2025-05-31T14:56:03.000+0000",
		);

		const aiData = await analyzeWithAI(
			evo,
			salesAnalysisSchema,
			docs,
			aiWithRun,
		);

		console.log("AI Data:", aiData);

		const dataReport: Record<string, string> = {};

		for (const uuid of shopsUuid) {
			const shopName = await c.var.evotor.getShopName(uuid);
			const data = await getData(date, uuid, c.get("db"));

			if (data) {
				const date = new Date(data.dateTime);
				date.setHours(date.getHours() + 3);

				// Явное приведение типа data.userId к строке
				const userId = data.userId as string;
				const employeeName = await c.var.evotor.getEmployeeLastName(userId);
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
		const data = await c.req.json();

		const { date, shop } = data;
		// console.log(data);

		const sinceDateOpening: string = formatDate(new Date(date));

		const dataOpening = await getData(sinceDateOpening, shop, c.get("db"));

		// console.log(dataOpening);

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
		// console.log(dataReport);
		// console.log(dataUrlPhoto);

		assert(dataReport, "not an employee");
		assert(dataUrlPhoto, "not an employee");

		return c.json({ dataReport, dataUrlPhoto });
	})

	.get("/api/employee-role", async (c) => {
		const employeeRole = await c.var.evotor.getEmployeeRole(
			c.var.user.id.toString(),
		);

		// console.log(employeeRole);

		assert(employeeRole, "not an employee");
		return c.json({ employeeRole });
	})

	.get("/api/evotor/sales-today", async (c) => {
		const salesData = await c.var.evotor.getSalesToday();

		assert(salesData, "No sales data found");

		return c.json({ salesData });
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

			// Попытка получить данные продаж за текущую дату
			// let salesData = await getSalesDataByDate(datePlan, db);
			// if (salesData) {
			// 	console.log("Данные продаж найдены:", salesData);
			// 	return c.json({ salesData });
			// }

			// Если данных нет, создаем их
			// console.log("Данные продаж не найдены. Генерируем новый план...");

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
			let plan = await getPlan(datePlan, db);
			let datPlan: Record<string, number> = {};

			if (!plan) {
				console.log("План не найден, генерируем новый...");
				datPlan = await c.var.evotor.getPlan(newDate, productUuids);
				await updatePlan(datPlan, datePlan, db);
			} else {
				datPlan = plan;
			}

			// Получение списка магазинов
			const shopUuids: string[] = await c.var.evotor.getShopUuids();
			salesData = {};

			// Сбор данных продаж для каждого магазина
			for (const shopId of shopUuids) {
				try {
					// Получение UUID продуктов для магазина
					const shopProductUuids: string[] = await getProductsByGroup(
						c.get("db"),
						shopId,
						groupIdsVape,
					);

					// Получение названия магазина
					const shopName = await c.var.evotor.getShopName(shopId);

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

					// Формирование данных для магазина
					salesData[shopName] = {
						datePlan: datPlan[shopId] || 0, // План на день
						dataSales: sumSalesData || 0, // Сумма продаж
						dataQuantity: podQuantity || {}, // Количество проданных товаров
					};
				} catch (err) {
					console.error(`Ошибка при обработке магазина ${shopId}:`, err);
				}
			}

			// Проверка на наличие данных
			if (Object.keys(salesData).length === 0) {
				throw new Error("Не удалось получить данные продаж.");
			}

			// console.log("Данные продаж успешно сформированы:", salesData);
			return c.json({ salesData });
		} catch (err) {
			console.error("Ошибка при обработке запроса:", err);
			return c.json(
				{ error: "Ошибка при обработке запроса. Проверьте логи." },
				500,
			);
		}
	})

	// .post("/api/evotor/generate-pdf", async (c) => {
	// 	try {
	// 		const formData = await c.req.formData();
	// 		const file = formData.get("file");
	// 		console.log(file);

	// 		if (!file || !(file instanceof File)) {
	// 			return c.json({ error: "Файл не найден или неверный формат" }, 400);
	// 		}

	// 		// Преобразуем File в Blob
	// 		const blob = new Blob([await file.arrayBuffer()], { type: file.type });

	// 		// Отправляем в Telegram
	// 		const response = await sendToTelegram(
	// 			blob,
	// 			"5405385673:AAFvJDIlR4BqQmnXDBGS8XOzEGSpVmE1w84",
	// 			"490899906",
	// 		);

	// 		return c.json({ success: true, response });
	// 	} catch (error) {
	// 		console.error("Ошибка:", error);
	// 		return c.json(
	// 			{
	// 				error:
	// 					error instanceof Error ? error.message : "Ошибка обработки файла",
	// 			},
	// 			500,
	// 		);
	// 	}
	// })

	.get("/api/evotor/groups", async (c) => {
		// Получаем UUID магазинов
		const shopIds: string[] = await c.var.evotor.getShopUuids();

		// Получаем группы по UUID первого магазина
		const groups = await c.var.evotor.getGroupsByNameUuid(shopIds[0]);

		return c.json({ groups });
	})

	.post("/api/evotor/groups-by-shop", async (c) => {
		const data = await c.req.json();
		const { shopUuid } = data;
		// console.log("Полученные данные:", data);
		// await createProductsTableIfNotExists(c.get("db"));

		// const shopUuids = await c.var.evotor.getShopUuids();
		// console.log(shopUuids);

		// for (const shopU of shopUuids) {
		// 	const test = await c.var.evotor.getProductsShopUuidsT(shopU);
		// 	console.log(test);
		// 	await updateOrInsertData(test, c.get("db"));
		// }

		const groupsData = await getGroupsByNameUuid(c.get("db"), shopUuid);
		// console.log(groupsData);
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
	})

	.post("/api/evotor/salary", async (c) => {
		try {
			const data = await c.req.json(); // Разбор JSON тела
			// console.log(data);

			// Извлекаем данные из JSON
			const { employee, startDate, endDate } = data;
			// console.log(employee);

			const star = new Date(startDate);
			const end = new Date(endDate);

			const sincetDate = formatDateWithTime(star, false);
			const untilDate = formatDateWithTime(end, true);

			const dates = getIntervals(sincetDate, untilDate, "days", 1);

			const groupIdsAks = await getAllUuid(c.get("db"));

			const employeeName = await c.var.evotor.getEmployeeByUuid(employee);

			// Интерфейс для описания структуры отчета
			interface TotalReport {
				employeeName: string | null; // Имя сотрудника
				startDate: string; // Начальная дата
				endDate: string; // Конечная дата
				totalBonusAccessories: number; // Общая сумма бонусов по аксессуарам
				totalBonusPlan: number; // Общая сумма плановых бонусов
				totalBonus: number; // Общая сумма бонусов
			}

			// Создание объекта totalReport с типизацией
			let totalReport: TotalReport = {
				employeeName: employeeName, // Имя сотрудника
				startDate: formatDate(star), // Начальная дата
				endDate: formatDate(end), // Конечная дата
				totalBonusAccessories: 0, // Инициализация
				totalBonusPlan: 0, // Инициализация
				totalBonus: 0, // Инициализация
			};

			let result = [];

			for (const date_ of dates) {
				const date = new Date(date_);
				const since = formatDateWithTime(date, false);
				const until = formatDateWithTime(date, true);
				// console.log("since:", since);
				const salaryDate: string = formatDate(date);

				const openShopUuid = await c.var.evotor.getFirstOpenSession(
					since,
					until,
					employee,
				);
				// console.log(openShopUuid);

				// Задаем ID групп продуктов для Vape

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
				const productUuids = await getUuidsByParentUuidList(
					c.get("db"),
					groupIdsVape,
				);

				if (openShopUuid) {
					const datePlan: string = formatDate(date);
					const dataReport = {
						date: datePlan,
						shopName: "",
						bonusAccessories: 0,
						dataPlan: 0,
						salesDataVape: 0,
						bonusPlan: 0,
						totalBonus: 0,
					};

					const salaryData = await getSalaryData(
						employee,
						salaryDate,
						until,
						c.get("db"),
					);
					if (salaryData) {
						// console.log(salaryData);
						const shopName = await c.var.evotor.getShopName(openShopUuid);

						dataReport.shopName = shopName;
						dataReport.date = salaryData.date;
						dataReport.bonusAccessories = salaryData.bonusAccessories;
						dataReport.dataPlan = salaryData.dataPlan;
						dataReport.salesDataVape = salaryData.salesDataVape;
						dataReport.bonusPlan = salaryData.bonusPlan;
						dataReport.totalBonus = salaryData.totalBonus;
					} else {
						const salaryAndBonus = await getSalaryAndBonus(
							datePlan,
							c.get("db"),
						);

						await createPlanTable(c.get("db"));

						let plan = await getPlan(datePlan, c.get("db"));

						let datPlan: Record<string, number> = {};

						if (!plan) {
							const datPlan = await c.var.evotor.getPlan(date, productUuids);

							await updatePlan(datPlan, datePlan, c.get("db"));
						} else {
							datPlan = plan;
						}
						// console.log(datPlan);
						const shopName = await c.var.evotor.getShopName(openShopUuid);

						const porodUuidAks = await getProductsByGroup(
							c.get("db"),
							openShopUuid,
							groupIdsAks,
						);

						const salesDataAks = await c.var.evotor.getSalesSum(
							openShopUuid,
							since,
							until,
							porodUuidAks,
						); // Данные о продажах
						const bonusAccessories = Math.floor(salesDataAks * 0.05);

						const porodUuidVape = await getProductsByGroup(
							c.get("db"),
							openShopUuid,
							groupIdsVape,
						);

						const salesDataVape = await c.var.evotor.getSalesSum(
							openShopUuid,
							since,
							until,
							porodUuidVape,
						);

						const bonus = salaryAndBonus?.bonus;
						console.log("bonus:", bonus);
						// console.log(openShopUuid);
						// console.log(datPlan[openShopUuid] ?? 0);

						const currentPlan = datPlan[openShopUuid] ?? 0;
						// План на сегодня (значение по умолчанию 0, если null или undefined)
						const bonusPlan = salesDataVape >= currentPlan ? 450 : 0; // Форми

						// console.log("salesDataVape:", salesDataVape);
						// console.log("currentPlan:", currentPlan);
						// console.log("bonusPlan:", bonusPlan);

						dataReport.shopName = shopName;
						dataReport.bonusAccessories = bonusAccessories;
						dataReport.dataPlan = currentPlan;
						dataReport.salesDataVape = salesDataVape;
						dataReport.bonusPlan = bonusPlan;

						dataReport.totalBonus =
							dataReport.bonusAccessories + dataReport.bonusPlan;
					}

					result.push(dataReport);

					// Обновление значений в totalReport
					totalReport.totalBonusAccessories += dataReport.bonusAccessories;
					totalReport.totalBonusPlan += dataReport.bonusPlan;
					totalReport.totalBonus += dataReport.totalBonus;
				}
			}

			return c.json({ result, totalReport });
		} catch (error) {
			console.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.post("/api/evotor/submit-groups", async (c) => {
		try {
			const data = await c.req.json(); // Разбор JSON тела

			// Извлекаем данные из JSON
			const { groups, salary, bonus } = data;
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
			console.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.post("/api/evotor/shops", async (c) => {
		// const data = await c.req.json();
		// console.log("Полученные данные:", data);

		// const { userId } = data;

		// Получение токенов авторизации

		// Объект для хранения сопоставления shopUuid -> shopName
		const shopOptions: Record<string, string> = {};

		// Получение списка магазинов
		const shops: ShopUuidName[] | null = await c.var.evotor.getShopNameUuids();
		if (shops) {
			// console.log(shops);
			// Добавление магазинов в shopOptions
			shops.forEach((shop) => {
				shopOptions[shop.uuid] = shop.name;
			});
		}

		assert(shopOptions, "not an shopOptions");

		return c.json({ shopOptions });
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
			// console.log(data);

			// Извлекаем данные из JSON
			const { startDate, endDate, shopUuid, groups } = data;

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
				shopUuid,
				since,
				until,
				productUuids,
			); // Получаем данные по продажам

			// const sortedSalesDataByValue = sortSalesSummary(salesData, sortCriteria);
			// console.log(sortedSalesDataByValue);

			const shopName = await c.var.evotor.getShopName(shopUuid);

			return c.json({ salesData, shopName, startDate, endDate });
		} catch (error) {
			console.error("Ошибка при разборе JSON:", error);
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
		// console.log(shopOptions);

		return c.json({ shopOptions });
	})

	.post("/api/evotor/stock-report", async (c) => {
		try {
			// Получаем данные из запроса
			const data = await c.req.json();
			// console.log("Полученные данные:", data);

			const { shopUuid, groups } = data;

			// Получаем список товаров для заданных групп
			const stockDataResponse = await c.var.evotor.getStockByGroup(
				shopUuid,
				groups,
				"price",
			);
			// console.log("данные:", stockDataResponse);

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
			console.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Произошла ошибка при обработке запроса." }, 500);
		}
	})

	.post("/api/evotor/order", async (c) => {
		try {
			// Получаем данные из запроса
			const data = await c.req.json();

			const { startDate, endDate, shopUuid, groups, period } = data;
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
			// console.log("данные:", order);

			// Проверяем, что данные о товарах получены
			if (!order || Object.keys(order).length === 0) {
				return c.json({ error: "Не удалось получить данные заказа." }, 500);
			}

			// console.log("данные:", order);

			const shopName = await c.var.evotor.getShopName(shopUuid);

			// Отправляем ответ
			return c.json({ order, startDate, endDate, shopName });
		} catch (error) {
			// Логируем ошибку и возвращаем 500
			console.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Произошла ошибка при обработке запроса." }, 500);
		}
	})

	.post("/api/evotor/sales-garden-report", async (c) => {
		try {
			const data = await c.req.json(); // Разбор JSON тела

			const { startDate, endDate } = data;
			// console.log(data);

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
			// console.log("Результат анализа:", response);

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
			console.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	});

export type IAPI = typeof api;

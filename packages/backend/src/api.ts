import { Hono } from "hono";
import { cors } from "hono/cors";
// import path from "path";
// import fs from "fs";
// import os from "os";
import type { IEnv, SaveDeadStocksRequest } from "./types";
// import { createWorkersAI } from 'workers-ai-provider';
// import { Ai } from "@cloudflare/ai";
// import { z } from 'zod';
// import jwt from "jsonwebtoken";

// const JWT_SECRET = "your_secret_key"; // Секретный ключ для подписи токена

import { analyzeDocsStaffTask, getHoroscopeByDateTask } from "./ai";
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
	isOpenStoreExists,
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
} from "./evotor/utils";
import { saveDeadStocks } from "./db/repositories/saveDeadStocks";
import { sendDeadStocksToTelegram } from "../utils/sendDeadStocksToTelegram";

export const api = new Hono<IEnv>()

	.use("*", cors())

	.get("/api/user", (c) => {
		// console.log(c.var.user);
		return c.json(c.var.user);
	})

	// get currently logged in evo toremployee

	.get("/api/employee-name", async (c) => {
		const employeeName = await c.var.evotor.getEmployeeLastName(c.var.userId);
		// console.log("employeeName:", employeeName);

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

	.get("/api/documents", async (c) => {
		console.log("documents");
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

		console.log("documents:", documents);

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

		// console.log(employeeNameAndUuid);
		return c.json({ result });
	})

	.get("/api/employee/name-uuid", async (c) => {
		const employeeNameAndUuid =
			await c.var.evotor.getEmployeesLastNameAndUuid();
		// console.log("employeeNameAndUuid:", employeeNameAndUuid);

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

	.get("/api/ai-report", async (c) => {
		console.log("AI report request received");
		const evo = c.var.evotor;

		// const shopsUuid = await c.var.evotor.getShopUuids();
		const [start, end] = getTodayRangeEvotor();

		const docs = await evo.getAllDocumentsByTypes(start, end);

		const docFiltered = await evo.extractSalesInfo(docs);
		// console.log("docs:", JSON.stringify(docFiltered, null, 2));

		const result = await analyzeDocsStaffTask(c, docFiltered);
		// console.log({ result });

		// const result = await sum2Numbers(c, { a: 1, b: 2 });
		return c.json({ result });
	})

	.get("/api/ai-association-rules", async (c) => {
		console.log("AI report request received");
		const evo = c.var.evotor;

		// const shopsUuid = await c.var.evotor.getShopUuids();
		const [start, end] = getPeriodRangeEvotor(3);
		console.log("start:", start, "end:", end);

		const docs = await evo.getAllDocumentsByTypes(start, end);

		const docFiltered = await evo.extractSalesInfo(docs);
		// console.log("docs:", JSON.stringify(docFiltered, null, 2));

		const result = await analyzeDocsStaffTask(c, docFiltered);
		// console.log({ result });

		// const result = await sum2Numbers(c, { a: 1, b: 2 });
		return c.json({ result });
	})

	.get("/api/schedules", async (c) => {
		const date = formatDate(new Date());
		const shopsUuid = await c.var.evotor.getShopUuids();
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
		const userId = c.var.user.id.toString();

		const employeeRoleEvo = await c.var.evotor.getEmployeeRole(userId);

		const employeeRole =
			userId === "5700958253" || userId === "475039971"
				? "SUPERADMIN"
				: employeeRoleEvo;
		console.log("employeeRole:", employeeRole);

		assert(employeeRole, "not an employee");
		return c.json({ employeeRole });
	})

	.post("/api/register", async (c) => {
		const data = await c.req.json(); // Разбор JSON тела
		// console.log("user", c.var.user.id.toString());

		// Извлекаем данные из JSON
		const { userId } = data;
		c.set("userId", String(userId));

		const employeeRoleEvo = await c.var.evotor.getEmployeeRole(userId);
		const employeeRole = employeeRoleEvo !== null;
		console.log("employeeRole:", employeeRole);

		if (!employeeRole) {
			return c.json({ success: false, message: "not an employee" }, 403);
		}

		assert(employeeRole, "not an employee");
		return c.json({ success: true, employeeRole });
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
				console.log("❌ Ошибка структуры FormData");
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
					console.log("❌ Неверная категория:", category);
					continue;
				}

				if (!(file instanceof File)) {
					console.log("❌ Не файл:", file);
					continue;
				}

				const key = `${dateFolder}/${category}/${file.name}`;

				console.log(`➡️ Сохранение файла ${i + 1}/${files.length}:`, key);

				await saveFileToR2(c.env.R2, file, key);

				console.log(`✅ Сохранено: ${key}`);

				saved.push({ key, category, fileKey });
			}

			return c.json({
				success: true,
				saved,
			});
		} catch (error) {
			console.error("🔥 Ошибка batch загрузки:", error);
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
			if (!allowed.includes(category as any)) {
				return c.json({ success: false, error: "Invalid category" }, 400);
			}

			const now = new Date();
			const dd = String(now.getDate()).padStart(2, "0");
			const mm = String(now.getMonth() + 1).padStart(2, "0");
			const yyyy = now.getFullYear();

			const folder = `opening/${dd}-${mm}-${yyyy}/${userId}/${category}`;
			const uniqueName = `${Date.now()}_${file.name}`;
			const key = `${folder}/${uniqueName}`;

			console.log(`📁 Сохраняем файл ${file.name} → ${key}`);

			await saveFileToR2(c.env.R2, file, key);

			console.log("✅ Файл успешно сохранён:", key);

			return c.json({
				success: true,
				fileKey,
				category,
				key,
			});
		} catch (err) {
			console.error("❌ Ошибка upload-photos:", err);
			return c.json({ success: false, error: "Server error" }, 500);
		}
	})

	.post("/api/upload", async (c) => {
		const formData = await c.req.formData();
		console.log("formData entries:", Array.from(formData.entries()));

		const file = formData.get("photos") as File | null;
		if (!file || !(file instanceof File)) {
			return c.json({ error: "Нет файла для загрузки" }, 400);
		}

		// const baseUrl = c.env.R2_PUBLIC_URL;

		try {
			const savedKey = `uploads/${crypto.randomUUID()}_${file.name}`;
			const arrayBuffer = await file.arrayBuffer();
			console.log(
				"Processing file:",
				file.name,
				"type:",
				file.type,
				"size:",
				file.size,
			);

			await c.env.R2.put(savedKey, arrayBuffer, {
				httpMetadata: { contentType: file.type || "application/octet-stream" },
			});

			// const publicUrl = `${baseUrl}/${savedKey}`;
			const publicUrl = `https://pub-a1a3c60dd9754ffba505cb0039a032fa.r2.dev/${savedKey}`;
			console.log("Saved:", publicUrl);

			return c.json({
				url: publicUrl,
				name: file.name,
			});
		} catch (error) {
			console.error("Error saving file:", file.name, error);
			return c.json({ error: `Ошибка сохранения файла: ${error}` }, 500);
		}
	})

	.get("/api/evotor/sales-today", async (c) => {
		const salesData = await c.var.evotor.getSalesToday();

		assert(salesData, "No sales data found");

		return c.json({ salesData });
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
			const { employee, startDate, endDate } = await c.req.json();
			console.log("data:", await c.req.json());
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

			for (const date_ of dates) {
				const date = new Date(date_);
				const since = formatDateWithTime(date, false);
				const until = formatDateWithTime(date, true);
				const datePlan = formatDate(date);

				const openShopUuid = await c.var.evotor.getFirstOpenSession(
					since,
					until,
					employee,
				);
				if (!openShopUuid) continue;

				const dataReport = {
					date: datePlan,
					shopName: await c.var.evotor.getShopName(openShopUuid),
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
				c.env.DB,
				shopUuid,
				since,
				until,
				productUuids,
			); // Получаем данные по продажам

			// const sortedSalesDataByValue = sortSalesSummary(salesData, sortCriteria);
			// console.log(salesData);

			const shopName = await c.var.evotor.getShopName(shopUuid);

			return c.json({ salesData, shopName, startDate, endDate });
		} catch (error) {
			console.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.post("/api/evotor/dead-stock", async (c) => {
		try {
			const data = await c.req.json(); // Разбор JSON тела
			// console.log(data);

			// Извлекаем данные из JSON
			const { startDate, endDate, shopUuid, groups } = data;

			const sincetDate = new Date(startDate); // Преобразуем в объект Date
			const untilDate = new Date(endDate); // Преобразуем в объект Date

			const since = formatDateWithTime(sincetDate, false); // Форматируем начальную дату
			const until = formatDateWithTime(untilDate, true); // Форматируем конечную дату

			const params = { shopId: shopUuid, groups, since, until };

			// Продукты по группам
			const salesData = await c.var.evotor.getSalesSummary(params); // Получаем данные по продажам

			const shopName = await c.var.evotor.getShopName(shopUuid);

			console.log(salesData);

			return c.json({
				salesData: salesData, // МАССИВ элементов
				shopName,
				startDate,
				endDate,
			});
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

	.get("/api/evotor/report/financial/today", async (c) => {
		try {
			const db = c.get("db");
			const evo = c.var.evotor;
			const now = new Date();

			const since = formatDateWithTime(now, false);
			const until = formatDateWithTime(now, true);

			const shopUuids = await evo.getShopUuids();

			const { salesDataByShopName, grandTotalSell, grandTotalRefund } =
				await getSalesgardenReportData(db, evo, shopUuids, since, until);

			const cashOutcomeData = await getDocumentsByCashOutcomeData(
				db,
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
			});
		} catch (error) {
			console.error("Ошибка при обработке запроса:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
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
	})

	.post("/api/profit-report", async (c) => {
		try {
			// Получаем данные из запроса
			const body = await c.req.json<{
				shopUuids: string[];
				since: string;
				until: string;
				dataFrom1C: Record<string, { expenses: number; grossProfit: number }>; // { shopUuid: {expenses, grossProfit} }
			}>();

			const { shopUuids, since, until, dataFrom1C } = body;

			if (!Array.isArray(shopUuids) || shopUuids.length === 0) {
				return c.json({ error: "Не переданы UUID магазинов" }, 400);
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
			console.error("Ошибка при формировании отчета:", error);
			return c.json({ error: "Ошибка при формировании отчета" }, 500);
		}
	})

	.post("/api/is-open-store", async (c) => {
		try {
			const data = await c.req.json();
			const { userId, date } = data; // date в формате "dd-mm-yyyy"

			const db = c.env.DB;

			// Разбираем дату и проверяем наличие записи
			const exists = await isOpenStoreExists(db, userId, date);

			return c.json({ exists });
		} catch (err) {
			console.error("Ошибка в /api/is-open-store:", err);
			return c.json({ exists: false, error: "Ошибка сервера" }, 500);
		}
	})
	.post("/api/open-store", async (c) => {
		const data = await c.req.json();
		const { userId, timestamp } = data;

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
	})
	.post("/api/dead-stocks/update", async (c) => {
		const db = c.get("drizzle");

		const { shopUuid, items } = await c.req.json<
			SaveDeadStocksRequest & { userId: number }
		>();

		// ID группы Telegram (из env)
		const TELEGRAM_GROUP_ID = "5700958253";

		// 1️⃣ ОТПРАВКА В TELEGRAM (ДО сохранения)
		await sendDeadStocksToTelegram(
			{
				chatId: TELEGRAM_GROUP_ID,
				shopUuid,
				items,
			},
			c.env.BOT_TOKEN,
			c.var.evotor,
		);

		// 2️⃣ СОХРАНЕНИЕ В БД
		await saveDeadStocks(db, shopUuid, items);

		return c.json({ success: true });
	})
	.post("/api/finish-opening", async (c) => {
		const db = c.env.DB;

		const data = await c.req.json();

		const { ok, discrepancy, userId } = data;
		console.log("discrepancy:", discrepancy);
		console.log("ok:", ok);

		let cash = null;
		let sign = null;

		if (!ok && discrepancy) {
			cash = Number(discrepancy.amount);
			sign = discrepancy.type; // "+" или "-"
		}

		await updateOpenStore(db, userId, { cash, sign });

		return c.json({ success: true });
	});

export type IAPI = typeof api;

import { Hono } from "hono";
import type { IEnv, SaveDeadStocksRequest } from "../types";
import { logger } from "../logger";
import {
	GetFileSchema,
	IsOpenStoreSchema,
	OpenStoreSchema,
	validate,
} from "../validation";
import {
	assert,
	formatDate,
	getTelegramFile,
} from "../utils";
import { saveDeadStocks } from "../db/repositories/saveDeadStocks";
import { sendDeadStocksToTelegram } from "../../utils/sendDeadStocksToTelegram";
import { getData } from "../db/repositories/openShops";
import {
	getOpenStoreDetails,
	saveOpenStorsTable,
	updateOpenStore,
} from "../db/repositories/openStores";

export const storesRoutes = new Hono<IEnv>()

	.get("/shops", async (c) => {
		const shopsNameAndUuid = await c.var.evotor.getShopNameUuids();
		assert(shopsNameAndUuid, "not an shopsNameAndUuid");
		return c.json({ shopsNameAndUuid });
	})

	.get("/shops-names", async (c) => {
		const shopsName = await c.var.evotor.getShopsName();

		assert(shopsName, "not an shopOptions");

		return c.json({ shopsName });
	})

	.post("/get-file", async (c) => {
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

			const countingMoneyKeyBase = "РСХОЖДЕНИЙ ПО КАССЕ (ПЕРЕСЧЕТ ДЕНЕГ)";

			if (dataOpening !== null) {
				for (const [key, value] of Object.entries(dataOpening)) {
					if (keysPhoto.includes(key)) {
						if (value !== null) {
							const urlFile = await getTelegramFile(value, c.env.BOT_TOKEN);
							dataUrlPhoto.push(urlFile);
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

					const shopName = await c.var.evotor.getShopName(shop);
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

	.post("/is-open-store", async (c) => {
		try {
			const data = await c.req.json();
			const { userId, date } = validate(IsOpenStoreSchema, data);

			const db = c.env.DB;

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

	.post("/open-store", async (c) => {
		try {
			const data = await c.req.json();
			const { userId, timestamp } = validate(OpenStoreSchema, data);

			const db = c.env.DB;

			await saveOpenStorsTable(db, {
				date: timestamp,
				userId,
				cash: null,
				sign: null,
				ok: null,
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

	.post("/dead-stocks/update", async (c) => {
		try {
			const db = c.get("drizzle");

			const { shopUuid, items } = await c.req.json<
				SaveDeadStocksRequest & { userId: number }
			>();

			if (!shopUuid || !items || !Array.isArray(items)) {
				return c.json({ success: false, error: "Invalid request data" }, 400);
			}

			const TELEGRAM_GROUP_ID = "5700958253";

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
			}

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

	.post("/finish-opening", async (c) => {
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
				sign = discrepancy.type;
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

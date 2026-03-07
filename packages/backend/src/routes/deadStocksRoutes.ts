import { Hono } from "hono";
import type { IEnv, SaveDeadStocksRequest } from "../types";
import { logger } from "../logger";
import { sendDeadStocksToTelegram } from "../../utils/sendDeadStocksToTelegram";
import { formatDateWithTime } from "../utils";
import { saveDeadStocks } from "../db/repositories/saveDeadStocks";
import { DeadStockSchema, validate } from "../validation";
import { jsonError, toApiErrorPayload } from "../errors";
import { trackAppEvent } from "../analytics/track";

export const deadStocksRoutes = new Hono<IEnv>()
	.post("/update", async (c) => {
		try {
			const db = c.get("drizzle");

			const payload = await c.req
				.json<SaveDeadStocksRequest & { userId: number }>()
				.catch(() => null);
			if (!payload) {
				return jsonError(c, 400, "INVALID_JSON", "Invalid JSON body");
			}
			const { shopUuid, items } = payload;
			await trackAppEvent(c, "deadstock_save_started", {
				shopUuid,
				props: { itemsCount: Array.isArray(items) ? items.length : 0 },
			});

			if (!shopUuid || !items || !Array.isArray(items)) {
				await trackAppEvent(c, "deadstock_save_failed", {
					shopUuid: shopUuid || undefined,
					props: { reason: "invalid_request_data" },
				});
				return jsonError(c, 400, "VALIDATION_ERROR", "Invalid request data");
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
			await trackAppEvent(c, "deadstock_save_success", {
				shopUuid,
				props: { itemsCount: items.length },
			});

			return c.json({ success: true });
		} catch (error) {
			await trackAppEvent(c, "deadstock_save_failed", {
				props: {
					reason:
						error instanceof Error ? error.message : "dead_stocks_update_failed",
				},
			});
			logger.error("Dead stocks update failed", error);
			const { status, body } = toApiErrorPayload(error, {
				code: "DEAD_STOCKS_UPDATE_FAILED",
				message: "Failed to update dead stocks",
			});
			return c.json(body, status as 200);
		}
	})

	.post("/data", async (c) => {
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
			const { status, body } = toApiErrorPayload(error, {
				code: "DEAD_STOCKS_DATA_FAILED",
				message: "Ошибка обработки данных",
			});
			return c.json(body, status as 200);
		}
	});

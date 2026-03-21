import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import { formatDateWithTime } from "../utils";
import { DeadStockSchema, validate } from "../validation";
import { toApiErrorPayload } from "../errors";
import { handleDeadStocksUpdate } from "../services/deadStocksUpdate";

export const deadStocksRoutes = new Hono<IEnv>()
	.post("/update", async (c) => handleDeadStocksUpdate(c))

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

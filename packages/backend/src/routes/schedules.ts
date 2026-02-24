import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import {
	SchedulesTableSchema,
	SchedulesTableViewSchema,
	validate,
} from "../validation";
import {
	formatDate,
	getMonthStartAndEnd,
	replaceUuidsWithNames,
	transformScheduleDataD,
} from "../utils";
import { getData } from "../db/repositories/openShops";
import {
	createScheduleTable,
	getScheduleByPeriod,
	getScheduleByPeriodAndShopId,
	updateSchedule,
} from "../db/repositories/schedule";

export const schedulesRoutes = new Hono<IEnv>()

	.post("/table", async (c) => {
		try {
			const db = c.get("db");
			const data = await c.req.json();
			const { month, year, schedules } = validate(SchedulesTableSchema, data);
			logger.debug("Processing schedules table", { month, year });

			await createScheduleTable(db);

			const { start, end } = getMonthStartAndEnd(year, month);

			const data_r = await transformScheduleDataD(schedules);

			await updateSchedule(db, data_r);

			const result = await getScheduleByPeriod(db, start, end);

			const evo = c.var.evotor;
			if (!result) {
				return c.json({ error: "No schedule data found" }, 404);
			}
			const scheduleTable = await replaceUuidsWithNames(result, evo);

			return c.json({ scheduleTable });
		} catch (error) {
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Ошибка при обработке данных" }, 500);
		}
	})

	.post("/table-view", async (c) => {
		try {
			const db = c.get("db");
			const data = await c.req.json();
			const { month, year, shopId } = validate(SchedulesTableViewSchema, data);

			const { start, end } = getMonthStartAndEnd(year, month);

			const result = await getScheduleByPeriodAndShopId(db, start, end, shopId);

			const evo = c.var.evotor;
			if (!result) {
				return c.json({ error: "No schedule data found" }, 404);
			}
			const scheduleTable = await replaceUuidsWithNames(result, evo);

			return c.json({ scheduleTable });
		} catch (error) {
			logger.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Ошибка при обработке данных" }, 500);
		}
	})

	.get("/schedule", async (c) => {
		const date = formatDate(new Date());
		const shopsUuid = await c.var.evotor.getShopUuids();

		const shopNamesMap = await c.var.evotor.getShopNamesByUuids(shopsUuid);

		const dataPromises = shopsUuid.map((uuid) =>
			getData(date, uuid, c.get("db")),
		);
		const dataResults = await Promise.all(dataPromises);

		const userIds = [
			...new Set(
				dataResults
					.filter((data): data is NonNullable<typeof data> => data !== null)
					.map((data) => data.userId as string),
			),
		];

		const employeeNamesMap =
			userIds.length > 0
				? await c.var.evotor.getEmployeeNamesByUuids(userIds)
				: {};

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

		if (!dataReport) {
			throw new Error("not an employee");
		}

		return c.json({ dataReport });
	});

import type { D1Database } from "@cloudflare/workers-types";

interface TransformedSchedule {
	id?: number;
	shopUuid: string;
	employeeUuid: string;
	date: string;
	shiftType: string;
}

export async function createScheduleTable(db: D1Database): Promise<void> {
	try {
		const createTableSQL = `
            CREATE TABLE IF NOT EXISTS schedule (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shopUuid TEXT NOT NULL,
                employeeUuid TEXT NULL,
                date TEXT NOT NULL,
                shiftType TEXT NULL
            );
        `;
		await db.prepare(createTableSQL).run();

		await db
			.prepare(
				`
		        CREATE INDEX IF NOT EXISTS idx_schedule_shopUuid
		        ON schedule (shopUuid)
		        `,
			)
			.run();

		await db
			.prepare(
				`
		        CREATE INDEX IF NOT EXISTS idx_schedule_date
		        ON schedule (date)
		        `,
			)
			.run();
	} catch (err) {
		console.error("Ошибка при создании таблицы 'schedule':", err);
	}
}

export async function deleteScheduleTable(db: D1Database): Promise<void> {
	try {
		const deleteQuery = `
            DROP TABLE IF EXISTS schedule;
        `;
		await db.prepare(deleteQuery).run();
	} catch (err) {
		console.error("Ошибка при удалении таблицы 'schedule':", err);
	}
}

export async function updateSchedule(
	db: D1Database,
	schedules: TransformedSchedule[],
): Promise<void> {
	try {
		const checkQuery = `
            SELECT id 
            FROM schedule
            WHERE shopUuid = ? AND date = ?;
        `;

		const updateQuery = `
            UPDATE schedule
            SET employeeUuid = ?, shiftType = ?
            WHERE shopUuid = ? AND date = ?;
        `;

		const insertQuery = `
            INSERT INTO schedule (shopUuid, employeeUuid, date, shiftType)
            VALUES (?, ?, ?, ?);
        `;

		for (const schedule of schedules) {
			const checkStatement = db.prepare(checkQuery);
			const existingRecord = await checkStatement
				.bind(schedule.shopUuid, schedule.date)
				.first();

			if (existingRecord) {
				const updateStatement = db.prepare(updateQuery);
				await updateStatement
					.bind(
						schedule.employeeUuid,
						schedule.shiftType,
						schedule.shopUuid,
						schedule.date,
					)
					.run();
			} else {
				const insertStatement = db.prepare(insertQuery);
				await insertStatement
					.bind(
						schedule.shopUuid,
						schedule.employeeUuid,
						schedule.date,
						schedule.shiftType,
					)
					.run();
			}
		}
	} catch (err) {
		console.error("Ошибка при обновлении расписания:", err);
	}
}

export async function getScheduleByPeriodAndShopId(
	db: D1Database,
	dateStart: string,
	dateEnd: string,
	shopUuid: string,
): Promise<TransformedSchedule[] | null> {
	try {
		const query = `
            SELECT * 
            FROM schedule
            WHERE date BETWEEN ?1 AND ?2 AND shopUuid = ?3;
        `;

		const result = await db
			.prepare(query)
			.bind(dateStart, dateEnd, shopUuid)
			.all();

		if (result.results && result.results.length > 0) {
			return result.results as unknown as TransformedSchedule[];
		}
		return null;
	} catch (err) {
		console.error(
			`Ошибка при получении расписания за период с ${dateStart} по ${dateEnd} и магазина ${shopUuid}:`,
			err instanceof Error ? err.message : err,
		);
		throw err;
	}
}

export async function getSchedule(
	db: D1Database,
	date: string,
	shopUuid: string,
): Promise<TransformedSchedule[] | null> {
	try {
		const query = `
      SELECT * 
      FROM schedule
      WHERE date = ?1 AND shopUuid = ?2;
    `;

		const result = await db.prepare(query).bind(date, shopUuid).all();

		if (result.results && result.results.length > 0) {
			return result.results as unknown as TransformedSchedule[];
		}
		return null;
	} catch (err) {
		console.error(
			`Ошибка при получении расписания (${date}, ${shopUuid}):`,
			err instanceof Error ? err.message : err,
		);
		throw err;
	}
}

export async function getScheduleByPeriod(
	db: D1Database,
	dateStart: string,
	dateEnd: string,
): Promise<TransformedSchedule[] | null> {
	try {
		const query = `
            SELECT * 
            FROM schedule
            WHERE date BETWEEN ?1 AND ?2;
        `;

		const result = await db.prepare(query).bind(dateStart, dateEnd).all();

		if (result.results && result.results.length > 0) {
			return result.results as unknown as TransformedSchedule[];
		}
		return null;
	} catch (err) {
		console.error(
			`Ошибка при получении расписания за период с ${dateStart} по ${dateEnd}:`,
			err instanceof Error ? err.message : err,
		);
		throw err;
	}
}

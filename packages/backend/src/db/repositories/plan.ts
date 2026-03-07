import type { D1Database } from "@cloudflare/workers-types";

interface PlanByShops {
	[shopUuid: string]: number;
}

interface PlanItem {
	shopUuid: string;
	sum: number;
}

export async function createPlanTable(db: D1Database): Promise<void> {
	try {
		const createTableQuery = `
            CREATE TABLE IF NOT EXISTS plan (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                shopUuid TEXT NOT NULL,
                sum REAL NOT NULL
            );
        `;
		await db.prepare(createTableQuery).run();
	} catch (err) {
		console.error("Ошибка при создании таблицы:", err);
	}
}

export async function updatePlan(
	planByShops: PlanByShops,
	date: string,
	db: D1Database,
): Promise<void> {
	try {
		const entries = Object.entries(planByShops);
		if (entries.length === 0) return;

		const existingRows = await db
			.prepare(
				`
				SELECT shopUuid
				FROM plan
				WHERE date = ?;
			`,
			)
			.bind(date)
			.all<{ shopUuid: string }>();

		const existingShopUuids = new Set(
			(existingRows.results || []).map((row) => row.shopUuid),
		);

		const updateStatement = db.prepare(
			`
			UPDATE plan
			SET sum = ?
			WHERE date = ? AND shopUuid = ?;
		`,
		);
		const insertStatement = db.prepare(
			`
			INSERT INTO plan (date, shopUuid, sum)
			VALUES (?, ?, ?);
		`,
		);

		for (const [shopUuid, sum] of entries) {
			if (existingShopUuids.has(shopUuid)) {
				await updateStatement.bind(sum, date, shopUuid).run();
				continue;
			}
			await insertStatement.bind(date, shopUuid, sum).run();
		}
	} catch (err) {
		console.error("Ошибка при обновлении плана:", err);
	}
}

export async function getPlan(
	date: string,
	db: D1Database,
): Promise<Record<string, number> | null> {
	try {
		const query = `
            SELECT * 
            FROM plan
            WHERE date = ?;
        `;

		const statement = db.prepare(query);
		const result = await statement.bind(date).all<PlanItem>();
		const results = result.results;

		if (!results || results.length === 0) {
			return null;
		}

		const planByShops: Record<string, number> = {};
		for (const item of results) {
			planByShops[item.shopUuid] = item.sum;
		}

		return planByShops;
	} catch (err) {
		console.error(`Ошибка при получении плана для даты ${date}:`, err);
		return null;
	}
}

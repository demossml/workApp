import type { D1Database } from "@cloudflare/workers-types";

export async function createAccessoriesTable(db: D1Database): Promise<void> {
	try {
		const createTableQuery = `
            CREATE TABLE IF NOT EXISTS accessories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
		await db.prepare(createTableQuery).run();
	} catch (err) {
		console.error("Ошибка при создании таблицы:", err);
	}
}

export async function saveOrUpdateUUIDs(
	uuids: string[],
	db: D1Database,
): Promise<void> {
	try {
		const deleteQuery = `
            DELETE FROM accessories;
        `;
		await db.prepare(deleteQuery).run();

		const insertQuery = `
            INSERT INTO accessories (uuid, created_at)
            VALUES (?, CURRENT_TIMESTAMP);
        `;
		const insertStatement = db.prepare(insertQuery);

		for (const uuid of uuids) {
			await insertStatement.bind(uuid).run();
		}
	} catch (err) {
		console.error("Ошибка при сохранении UUID:", err);
	}
}

export async function getAllUuid(db: D1Database): Promise<string[]> {
	try {
		const selectQuery = `
            SELECT uuid
            FROM accessories;
        `;

		const statement = db.prepare(selectQuery);
		const result = await statement.all();

		if (result.success && Array.isArray(result.results)) {
			const uuids = result.results as Array<{ uuid: string }>;
			return uuids.map((row) => row.uuid);
		}
		console.error(
			"Не удалось получить UUID, структура результата некорректна:",
			result,
		);
		return [];
	} catch (err) {
		console.error("Ошибка при получении UUID:", err);
		return [];
	}
}

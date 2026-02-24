import type { D1Database } from "@cloudflare/workers-types";

export async function getUuidsByParentUuidList(
	db: D1Database,
	parentUuids: string[],
): Promise<string[]> {
	try {
		const placeholders = parentUuids.map(() => "?").join(", ");
		const query = `
            SELECT uuid
            FROM products
            WHERE parentUuid IN (${placeholders});
        `;
		const statement = db.prepare(query);
		const result = await statement.bind(...parentUuids).all<{ uuid: string }>();
		const uuids = result.results?.map((row) => row.uuid) || [];
		return uuids;
	} catch (err) {
		console.error("Ошибка при получении UUIDs:", err);
		throw err;
	}
}

export async function createProductsTableIfNotExists(db: D1Database) {
	try {
		const createTableSQL = `
            CREATE TABLE IF NOT EXISTS shopProduct (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shopId TEXT NOT NULL,
                uuid TEXT NOT NULL,
                product_group INTEGER NOT NULL,
                parentUuid TEXT,
                name TEXT
            );
        `;

		await db.prepare(createTableSQL).run();

		await db
			.prepare(
				`
		    CREATE INDEX IF NOT EXISTS idx_shopProduct_shopId
		    ON shopProduct (shopId)
		`,
			)
			.run();

		await db
			.prepare(
				`
		    CREATE INDEX IF NOT EXISTS idx_shopProduct_uuid
		    ON shopProduct (uuid)
		`,
			)
			.run();
	} catch (error) {
		console.error("Ошибка при создании таблицы или индексов:", error);
	}
}

export async function updateOrInsertData(
	data: {
		uuid: string;
		group: boolean;
		parentUuid: string;
		shopId: string;
		name: string;
	}[],
	db: D1Database,
): Promise<void> {
	try {
		const insertQuery = `
            INSERT INTO shopProduct (uuid, product_group, parentUuid, shopId, name)
            SELECT ?1, ?2, ?3, ?4, ?5
            WHERE NOT EXISTS (
                SELECT 1 
                FROM shopProduct 
                WHERE shopId = ?4 AND uuid = ?1
            );
        `;

		const statement = db.prepare(insertQuery);
		const batch = data.map((item) =>
			statement.bind(
				item.uuid,
				item.group ? 1 : 0,
				item.parentUuid,
				item.shopId,
				item.name,
			),
		);

		await db.batch(batch);
	} catch (err) {
		console.error("Ошибка при вставке данных:", err);
		throw err;
	}
}

export async function getGroupsByNameUuid(
	db: D1Database,
	shopId: string,
): Promise<{ name: string; uuid: string }[] | null> {
	try {
		const query = `
			SELECT name, uuid 
			FROM shopProduct 
			WHERE shopId = ?1 AND product_group = 1;
		`;

		const result = await db.prepare(query).bind(shopId).all();

		if (!result || !result.results || result.results.length === 0) {
			return null;
		}

		return result.results as { name: string; uuid: string }[];
	} catch (err) {
		console.error(
			`Ошибка при получении групп продуктов для магазина ${shopId}:`,
			err,
		);
		return null;
	}
}

export async function getProductsByGroup(
	db: D1Database,
	shopId: string,
	groupIds: string[],
): Promise<string[]> {
	try {
		if (groupIds.length === 0) {
			return [];
		}

		const query = `
			SELECT uuid 
			FROM shopProduct 
			WHERE shopId = ?1 AND parentUuid IN (${groupIds.map(() => "?").join(", ")});
		`;

		const result = await db
			.prepare(query)
			.bind(shopId, ...groupIds)
			.all();

		if (!result || !result.results || result.results.length === 0) {
			return [];
		}

		return (result.results as { uuid: string }[]).map((row) => row.uuid);
	} catch (err) {
		console.error(
			`Ошибка при получении продуктов по группам для магазина ${shopId}:`,
			err,
		);
		throw err;
	}
}

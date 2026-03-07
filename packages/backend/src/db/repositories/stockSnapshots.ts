import type { D1Database } from "@cloudflare/workers-types";

export type StockSnapshotData = Record<string, { sum: number; quantity: number }>;

let schemaEnsured = false;

const ensureSchema = async (db: D1Database) => {
	if (schemaEnsured) return;

	await db
		.prepare(
			"CREATE TABLE IF NOT EXISTS stock_snapshots (" +
				"id INTEGER PRIMARY KEY AUTOINCREMENT, " +
				"shopUuid TEXT NOT NULL, " +
				"groupsKey TEXT NOT NULL, " +
				"payloadJson TEXT NOT NULL, " +
				"updatedAt TEXT NOT NULL, " +
				"UNIQUE(shopUuid, groupsKey)" +
				");",
		)
		.run();

	await db
		.prepare(
			"CREATE INDEX IF NOT EXISTS idx_stock_snapshots_shop_uuid " +
				"ON stock_snapshots (shopUuid);",
		)
		.run();

	await db
		.prepare(
			"CREATE INDEX IF NOT EXISTS idx_stock_snapshots_updated_at " +
				"ON stock_snapshots (updatedAt);",
		)
		.run();

	schemaEnsured = true;
};

export const createStockSnapshotsTable = async (db: D1Database) => {
	await ensureSchema(db);
};

export const getStockSnapshot = async (
	db: D1Database,
	shopUuid: string,
	groupsKey: string,
): Promise<{ stockData: StockSnapshotData; updatedAt: string } | null> => {
	await ensureSchema(db);

	const row = await db
		.prepare(
			`SELECT payloadJson, updatedAt
			 FROM stock_snapshots
			 WHERE shopUuid = ? AND groupsKey = ?
			 LIMIT 1`,
		)
		.bind(shopUuid, groupsKey)
		.first<{ payloadJson: string; updatedAt: string }>();

	if (!row) return null;

	try {
		return {
			stockData: JSON.parse(row.payloadJson || "{}") as StockSnapshotData,
			updatedAt: row.updatedAt,
		};
	} catch (error) {
		console.error("Ошибка парсинга stock_snapshots payloadJson:", error);
		return null;
	}
};

export const saveStockSnapshot = async (
	db: D1Database,
	input: {
		shopUuid: string;
		groupsKey: string;
		stockData: StockSnapshotData;
	},
) => {
	await ensureSchema(db);
	const updatedAt = new Date().toISOString();

	await db
		.prepare(
			`INSERT INTO stock_snapshots (shopUuid, groupsKey, payloadJson, updatedAt)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(shopUuid, groupsKey) DO UPDATE SET
				payloadJson = excluded.payloadJson,
				updatedAt = excluded.updatedAt`,
		)
		.bind(
			input.shopUuid,
			input.groupsKey,
			JSON.stringify(input.stockData),
			updatedAt,
		)
		.run();
};

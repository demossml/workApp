import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import type {
	NormalizedPosition,
	NormalizedReceipt,
	NormalizedSets,
} from "../../analytics/normalize";

export async function ensureNormalizedTables(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(
			"CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, number TEXT NOT NULL, shop_id TEXT NOT NULL, close_date TEXT NOT NULL, open_user_uuid TEXT, type TEXT, total REAL NOT NULL DEFAULT 0)",
		),
		db.prepare(
			"CREATE INDEX IF NOT EXISTS idx_receipts_shop_date ON receipts (shop_id, close_date)",
		),
		db.prepare(
			"CREATE TABLE IF NOT EXISTS receipt_positions (id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_id TEXT NOT NULL, shop_id TEXT NOT NULL, close_date TEXT NOT NULL, commodity_uuid TEXT NOT NULL, commodity_name TEXT, quantity REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0, cost_price REAL NOT NULL DEFAULT 0, sum REAL NOT NULL DEFAULT 0)",
		),
		db.prepare(
			"CREATE INDEX IF NOT EXISTS idx_receipt_positions_shop_date ON receipt_positions (shop_id, close_date)",
		),
		db.prepare(
			"CREATE INDEX IF NOT EXISTS idx_receipt_positions_commodity ON receipt_positions (commodity_uuid)",
		),
		db.prepare(
			"CREATE TABLE IF NOT EXISTS products_catalog (commodity_uuid TEXT PRIMARY KEY, name TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
		),
		db.prepare(
			"CREATE TABLE IF NOT EXISTS employees (employee_uuid TEXT PRIMARY KEY, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
		),
		db.prepare(
			"CREATE TABLE IF NOT EXISTS stores (store_uuid TEXT PRIMARY KEY, name TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
		),
	]);
}

export async function upsertReceipts(
	db: D1Database,
	receipts: NormalizedReceipt[],
): Promise<void> {
	if (receipts.length === 0) return;
	const stmt = db.prepare(
		"INSERT OR IGNORE INTO receipts (id, number, shop_id, close_date, open_user_uuid, type, total) VALUES (?, ?, ?, ?, ?, ?, ?)",
	);
	const statements = receipts.map((row) =>
		stmt.bind(
			row.id,
			row.number,
			row.shopId,
			row.closeDate,
			row.openUserUuid,
			row.type,
			row.total,
		),
	);
	await db.batch(statements);
}

export async function upsertReceiptPositions(
	db: D1Database,
	positions: NormalizedPosition[],
): Promise<void> {
	if (positions.length === 0) return;
	const stmt = db.prepare(
		"INSERT OR IGNORE INTO receipt_positions (receipt_id, shop_id, close_date, commodity_uuid, commodity_name, quantity, price, cost_price, sum) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
	);
	const statements = positions.map((row) =>
		stmt.bind(
			row.receiptId,
			row.shopId,
			row.closeDate,
			row.commodityUuid,
			row.commodityName,
			row.quantity,
			row.price,
			row.costPrice,
			row.sum,
		),
	);
	await db.batch(statements);
}

export async function upsertReferenceSets(
	db: D1Database,
	sets: NormalizedSets,
): Promise<void> {
	const statements: D1PreparedStatement[] = [];

	if (sets.products.size > 0) {
		const stmt = db.prepare(
			"INSERT INTO products_catalog (commodity_uuid, name, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(commodity_uuid) DO UPDATE SET name = excluded.name, updated_at = datetime('now')",
		);
		for (const [uuid, name] of sets.products.entries()) {
			statements.push(stmt.bind(uuid, name));
		}
	}

	if (sets.employees.size > 0) {
		const stmt = db.prepare(
			"INSERT INTO employees (employee_uuid, updated_at) VALUES (?, datetime('now')) ON CONFLICT(employee_uuid) DO UPDATE SET updated_at = datetime('now')",
		);
		for (const uuid of sets.employees.values()) {
			statements.push(stmt.bind(uuid));
		}
	}

	if (sets.stores.size > 0) {
		const stmt = db.prepare(
			"INSERT INTO stores (store_uuid, updated_at) VALUES (?, datetime('now')) ON CONFLICT(store_uuid) DO UPDATE SET updated_at = datetime('now')",
		);
		for (const uuid of sets.stores.values()) {
			statements.push(stmt.bind(uuid));
		}
	}

	if (statements.length > 0) {
		await db.batch(statements);
	}
}

export async function upsertStoresWithNames(
	db: D1Database,
	stores: Array<{ uuid: string; name?: string | null }>,
): Promise<void> {
	if (stores.length === 0) return;
	const stmt = db.prepare(
		"INSERT INTO stores (store_uuid, name, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(store_uuid) DO UPDATE SET name = excluded.name, updated_at = datetime('now')",
	);
	const statements = stores
		.filter((store) => store.uuid && store.name)
		.map((store) => stmt.bind(store.uuid, store.name));

	if (statements.length > 0) {
		await db.batch(statements);
	}
}

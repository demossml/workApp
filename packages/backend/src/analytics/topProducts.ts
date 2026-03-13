import type { D1Database } from "@cloudflare/workers-types";

type ShopDate = { shopId: string; date: string };

export async function recomputeTopProducts(
	db: D1Database,
	shopDates: ShopDate[],
): Promise<void> {
	if (shopDates.length === 0) return;

	await db
		.prepare(
			"CREATE TABLE IF NOT EXISTS top_products (shop_id TEXT NOT NULL, date TEXT NOT NULL, commodity_uuid TEXT NOT NULL, commodity_name TEXT, quantity REAL NOT NULL DEFAULT 0, revenue REAL NOT NULL DEFAULT 0, PRIMARY KEY (shop_id, date, commodity_uuid))",
		)
		.run();
	await db
		.prepare(
			"CREATE INDEX IF NOT EXISTS idx_top_products_shop_date ON top_products (shop_id, date)",
		)
		.run();

	const deleteStmt = db.prepare(
		"DELETE FROM top_products WHERE shop_id = ? AND date = ?",
	);
	const insertStmt = db.prepare(
		`INSERT INTO top_products (shop_id, date, commodity_uuid, commodity_name, quantity, revenue)
     SELECT shop_id, substr(close_date,1,10) as date, commodity_uuid, MAX(commodity_name) as commodity_name,
            SUM(quantity) as quantity, SUM(sum) as revenue
     FROM receipt_positions
     WHERE shop_id = ? AND substr(close_date,1,10) = ?
     GROUP BY commodity_uuid`,
	);

	for (const { shopId, date } of shopDates) {
		await deleteStmt.bind(shopId, date).run();
		await insertStmt.bind(shopId, date).run();
	}
}

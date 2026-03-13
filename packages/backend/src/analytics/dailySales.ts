import type { D1Database } from "@cloudflare/workers-types";

type ShopDate = { shopId: string; date: string };

export async function recomputeDailySales(
	db: D1Database,
	shopDates: ShopDate[],
): Promise<void> {
	if (shopDates.length === 0) return;

	await db
		.prepare(
			"CREATE TABLE IF NOT EXISTS daily_sales (shop_id TEXT NOT NULL, date TEXT NOT NULL, revenue REAL NOT NULL DEFAULT 0, checks INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (shop_id, date))",
		)
		.run();

	const selectStmt = db.prepare(
		"SELECT SUM(total) as revenue, SUM(CASE WHEN type = 'SELL' THEN 1 ELSE 0 END) as checks FROM receipts WHERE shop_id = ? AND substr(close_date,1,10) = ?",
	);
	const upsertStmt = db.prepare(
		"INSERT INTO daily_sales (shop_id, date, revenue, checks) VALUES (?, ?, ?, ?) ON CONFLICT(shop_id, date) DO UPDATE SET revenue = excluded.revenue, checks = excluded.checks",
	);

	for (const { shopId, date } of shopDates) {
		const row = await selectStmt
			.bind(shopId, date)
			.first<{ revenue: number | null; checks: number | null }>();
		const revenue = Number(row?.revenue || 0);
		const checks = Number(row?.checks || 0);
		await upsertStmt.bind(shopId, date, revenue, checks).run();
	}
}
